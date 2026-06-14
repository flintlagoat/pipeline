import { readFileSync, writeFileSync, existsSync } from 'fs';
import * as path from 'path';
import { loadImage } from '@napi-rs/canvas';
import type { Image } from '@napi-rs/canvas';
import { Resvg } from '@resvg/resvg-js';
import { BoardSpec, RenderSettings, RendererContext } from './schema';
import { resolveStyle } from './style';
import { buildCameraPath } from './camera';
import { loadFonts } from './fonts';
import { setFontMap } from './utils';
import { generateGrainOverlay } from './grain';
import { renderFrame, renderFramePng } from './frameRenderer';
import { FrameEncoder } from './encoder';
import { DEBUG } from './debug';

// ── Output settings (full vs draft) ────────────────────────────────────────────
// Full = native resolution, spec fps, grain on, CRF 18 (unchanged from before).
// Draft (--draft) = half resolution, 15 fps, grain off, higher CRF — ~8× faster for
// iteration. Draft is a deliberately lower-quality preview; it does not affect the
// pixel-identity of full renders.
export function computeSettings(spec: BoardSpec, draft: boolean): RenderSettings {
  const fullW = spec.format === 'landscape_16x9' ? 1920 : 1080;
  const fullH = spec.format === 'landscape_16x9' ? 1080 : 1920;
  if (draft) {
    return {
      outputWidth: Math.round(fullW / 2),  // 960 / 540 — both even (yuv420p needs even dims)
      outputHeight: Math.round(fullH / 2),
      fps: 15,
      grain: false,
      crf: 30,
    };
  }
  return { outputWidth: fullW, outputHeight: fullH, fps: spec.fps, grain: true, crf: 18 };
}

// Walk up from the spec's directory to find channels/<id>/assets/svg. The spec can live at
// output/<channel>/<job>/ (real jobs) or test/fixtures/ (acceptance test); a fixed "../../"
// only worked for the latter. Searching upward handles both.
export function resolveChannelSvgDir(startDir: string, channelId: string): string {
  let dir = startDir;
  for (let i = 0; i < 8; i++) {
    const candidate = path.join(dir, 'channels', channelId, 'assets/svg');
    if (existsSync(candidate)) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  // Fallback: project root is three levels above output/<channel>/<job>/
  return path.join(startDir, '../../../channels', channelId, 'assets/svg');
}

// Pre-rasterize every SVG asset referenced by the spec. Each asset is an ARRAY of frames:
// frame 1 = "<name>.svg", additional frames = "<name>__2.svg", "<name>__3.svg", … (a flipbook
// animation). A normal static asset is just a 1-element array.
export async function loadSvgAssets(
  svgDir: string,
  spec: BoardSpec,
  quiet = false
): Promise<Map<string, Image[]>> {
  const svgAssets = new Map<string, Image[]>();

  // Union asset_needs with every asset actually referenced by an svg_asset element
  // (asset_needs is sometimes under-declared by the spec generator).
  const referenced = new Set<string>(spec.asset_needs);
  for (const sec of spec.board.sections) {
    for (const el of sec.elements) {
      if (el.type !== 'svg_asset') continue;
      const name = el.asset_name ?? el.content;
      if (name) referenced.add(name);
    }
  }
  if (referenced.size === 0) return svgAssets;

  if (!quiet) console.log(`Loading ${referenced.size} SVG asset(s)...`);
  for (const assetName of referenced) {
    const frames: Image[] = [];
    for (let fi = 1; ; fi++) {
      const fname = fi === 1 ? `${assetName}.svg` : `${assetName}__${fi}.svg`;
      const svgPath = path.join(svgDir, fname);
      if (!existsSync(svgPath)) break;
      try {
        const resvg = new Resvg(readFileSync(svgPath, 'utf8'));
        frames.push(await loadImage(resvg.render().asPng()));
      } catch (err) {
        if (!quiet) console.warn(`  Failed to rasterize SVG ${fname}:`, err);
        break;
      }
    }
    if (frames.length > 0) {
      svgAssets.set(assetName, frames);
      if (!quiet) {
        const anim = frames.length > 1 ? ` (${frames.length} frames — animated)` : '';
        if (DEBUG) console.log(`  [SVG] loaded "${assetName}" frames=${frames.length} rasterized=${frames[0].width}x${frames[0].height}`);
        else console.log(`  Loaded SVG: ${assetName}${anim}`);
      }
    } else if (!quiet) {
      console.warn(`  [SVG] NOT FOUND: "${assetName}" expected at ${path.join(svgDir, `${assetName}.svg`)}`);
    }
  }
  return svgAssets;
}

export interface PrepareOpts {
  specPath: string;        // absolute path to board_spec.json
  settings: RenderSettings;
  grainPath?: string;      // shared grain PNG (workers load it so grain is identical across chunks)
  quiet?: boolean;         // workers suppress the verbose per-asset/font logs
}

export interface PreparedRender {
  spec: BoardSpec;
  rctx: RendererContext;
  svgDir: string;
}

// Build the per-render drawing context. Called once per process — by the single-thread path
// AND independently by each worker (canvases/Images can't cross threads). It is fully
// deterministic given the spec: buildCameraPath is seeded off spec.video_id, so every worker
// derives an identical camera path, and the grain overlay is shared via grainPath so the
// (static-by-design) grain is identical across all chunks — no boundary "pop".
export async function prepareContext(opts: PrepareOpts): Promise<PreparedRender> {
  const { settings, grainPath, quiet = false } = opts;
  const resolvedSpec = path.resolve(opts.specPath);
  const spec: BoardSpec = JSON.parse(readFileSync(resolvedSpec, 'utf8'));

  const profile = resolveStyle(spec);
  spec.board.camera_keyframes = buildCameraPath(
    spec.board.sections,
    spec.duration_seconds,
    profile.camera,
    spec.video_id
  );

  await loadFonts(profile);          // files are pre-warmed by the main thread, so this just registers
  setFontMap(profile.fonts);

  const svgDir = resolveChannelSvgDir(path.dirname(resolvedSpec), spec.channel_id);
  const svgAssets = await loadSvgAssets(svgDir, spec, quiet);

  let grainImage: Image | null = null;
  if (settings.grain) {
    if (grainPath && existsSync(grainPath)) {
      grainImage = await loadImage(grainPath);
    } else {
      grainImage = await loadImage(generateGrainOverlay(settings.outputWidth, settings.outputHeight));
    }
  }

  const rctx: RendererContext = {
    grainImage,
    svgAssets,
    pngAssets: new Map(),
    profile,
    settings,
  };
  return { spec, rctx, svgDir };
}

// Render a contiguous half-open frame range [startFrame, endFrame) into framesDir, naming each
// PNG by its GLOBAL frame index (so parallel chunks reassemble in order). onProgress reports the
// count rendered SO FAR within this range. DEBUG path only — normal renders stream raw frames.
export function renderRange(
  spec: BoardSpec,
  rctx: RendererContext,
  framesDir: string,
  startFrame: number,
  endFrame: number,
  onProgress?: (rendered: number) => void
): void {
  for (let frame = startFrame; frame < endFrame; frame++) {
    const buffer = renderFramePng(spec, frame, rctx);
    const frameName = `frame_${String(frame).padStart(6, '0')}.png`;
    writeFileSync(path.join(framesDir, frameName), buffer);
    if (onProgress && (frame - startFrame) % 30 === 0) onProgress(frame - startFrame + 1);
  }
  if (onProgress) onProgress(endFrame - startFrame);
}

// Render a contiguous half-open frame range [startFrame, endFrame) straight into a streaming
// ffmpeg encoder as raw RGBA — no PNG encode, no disk. The session-7 fast path used by every
// normal render (single-thread and workers alike). The Buffer copy is required: the canvas is
// reused across frames, and the pipe may still hold a reference to the previous write.
export async function renderRangeToEncoder(
  spec: BoardSpec,
  rctx: RendererContext,
  encoder: FrameEncoder,
  startFrame: number,
  endFrame: number,
  onProgress?: (rendered: number) => void
): Promise<void> {
  for (let frame = startFrame; frame < endFrame; frame++) {
    const canvas = renderFrame(spec, frame, rctx);
    await encoder.write(Buffer.from(canvas.data()));
    if (onProgress && (frame - startFrame) % 30 === 0) onProgress(frame - startFrame + 1);
  }
  if (onProgress) onProgress(endFrame - startFrame);
}
