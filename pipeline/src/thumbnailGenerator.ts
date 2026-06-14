import * as fs from 'fs';
import * as path from 'path';
import { spawnSync } from 'child_process';
import { ROOT, channelDir, jobDir, outputDir } from './config/paths';
import { loadChannelSpec } from './channelSpec';
import { VideoPackage } from './autopilot/packaging';

// Thumbnail generation (session 6) — Phase 1.5. Builds a ThumbnailSpec from the channel's
// palette/typography + the job's video PACKAGE (meta.json), then spawns the renderer's
// thumbnailCli (same subprocess pattern as the video render). Output lands at
// output/<ch>/<job>/thumbnail.png, which publish/metadata.findThumbnail already attaches
// at upload time. Generic across channels; deterministic fallbacks when no package exists.

const STOPWORDS = new Set([
  'the', 'a', 'an', 'of', 'to', 'in', 'on', 'for', 'and', 'or', 'is', 'are', 'was', 'were',
  'that', 'this', 'it', 'its', 'at', 'by', 'with', 'from', 'as', 'be', 'been', 'their',
  'they', 'you', 'your', 'we', 'our', 'how', 'why', 'what', 'when', 'really', 'actually',
]);

/** Fallback thumbnail text when no package exists: the title's 4 most meaningful words. */
function fallbackBigText(title: string): string {
  const words = title.replace(/[^\w$%.,'-]+/g, ' ').split(/\s+/).filter(Boolean);
  const meaningful = words.filter((w) => !STOPWORDS.has(w.toLowerCase()));
  return (meaningful.length >= 2 ? meaningful : words).slice(0, 4).join(' ');
}

/** The first svg_asset the video itself draws — a natural hero when the package names none. */
function heroAssetFromBoardSpec(channelId: string, jobId: string): string | undefined {
  const specPath = path.join(outputDir(channelId, jobId), 'board_spec.json');
  if (!fs.existsSync(specPath)) return undefined;
  try {
    const spec = JSON.parse(fs.readFileSync(specPath, 'utf8')) as {
      board?: { sections?: { elements?: { type?: string; asset_name?: string; content?: string }[] }[] };
    };
    for (const sec of spec.board?.sections ?? []) {
      for (const el of sec.elements ?? []) {
        if (el.type === 'svg_asset') {
          const name = el.asset_name ?? el.content;
          if (name) return name;
        }
      }
    }
  } catch { /* no hero asset */ }
  return undefined;
}

function resolveAssetSvg(channelId: string, assetName: string | undefined): string | undefined {
  if (!assetName) return undefined;
  const p = path.join(channelDir(channelId), 'assets', 'svg', `${assetName}.svg`);
  return fs.existsSync(p) ? p : undefined;
}

/**
 * Renders output/<ch>/<job>/thumbnail.png from the job's package + channel visual identity.
 * Returns the absolute primary thumbnail path. Throws on render failure (callers treat it as
 * non-critical).
 *
 * `variants: true` (default) also renders 2 alternative compositions (thumbnail_v2.png hero on
 * the opposite side, thumbnail_v3.png text-only) for the operator to A/B in YouTube Studio's
 * Test & Compare. CTR is the #1 ranking gate, so giving the operator real options is high
 * leverage. `setPrimaryVariant()` promotes a chosen variant to thumbnail.png.
 */
const LAYOUTS = ['hero_right', 'hero_left', 'text_only'] as const;
export const VARIANT_FILES = ['thumbnail.png', 'thumbnail_v2.png', 'thumbnail_v3.png'];

export function generateThumbnailForJob(channelId: string, jobId: string, variants = true): string {
  const channelSpec = loadChannelSpec(channelId);
  const oDir = outputDir(channelId, jobId);
  fs.mkdirSync(oDir, { recursive: true });

  // The package designed at script time (meta.json) carries the thumbnail concept.
  let pkg: VideoPackage | undefined;
  let topic: string | undefined;
  const metaPath = path.join(jobDir(channelId, jobId), 'meta.json');
  if (fs.existsSync(metaPath)) {
    try {
      const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8')) as { topic?: string; packaging?: VideoPackage };
      pkg = meta.packaging;
      topic = meta.topic;
    } catch { /* fall back below */ }
  }

  const bigText = pkg?.thumbnail?.bigText?.trim() || fallbackBigText(pkg?.title ?? topic ?? jobId);
  // Hero visual: the package's pick if it exists on disk, else the video's own first svg asset.
  const assetSvgPath =
    resolveAssetSvg(channelId, pkg?.thumbnail?.assetName) ??
    resolveAssetSvg(channelId, heroAssetFromBoardSpec(channelId, jobId));

  const base = {
    background: channelSpec.palette.background,
    textPrimary: channelSpec.palette.textPrimary,
    accent: channelSpec.palette.accent1,
    fontDisplay: channelSpec.typography.display,
    fontBody: channelSpec.typography.body,
    textCase: channelSpec.typography.case,
    bigText,
    emphasisWord: pkg?.thumbnail?.emphasisWord,
    assetSvgPath,
  };

  // One spec per variant; render all in a single renderer subprocess (batch) to avoid paying the
  // ts-node boot 3×. Each spec carries its own `out` + `layout`.
  const count = variants ? LAYOUTS.length : 1;
  const specs = [];
  for (let i = 0; i < count; i++) {
    specs.push({ ...base, out: path.join(oDir, VARIANT_FILES[i]), layout: LAYOUTS[i] });
  }
  const specJsonPath = path.join(oDir, 'thumbnail.spec.json');
  fs.writeFileSync(specJsonPath, JSON.stringify(specs.length === 1 ? specs[0] : specs, null, 2), 'utf8');

  const rendererDir = path.join(ROOT, 'renderer');
  const result = spawnSync('npx', ['ts-node', 'src/thumbnailCli.ts', `"${specJsonPath}"`], {
    cwd: rendererDir, stdio: 'inherit', shell: true,
  });
  if (result.status !== 0) throw new Error(`Thumbnail renderer exited with code ${result.status ?? 'unknown'}`);
  const primary = specs[0].out;
  if (!fs.existsSync(primary)) throw new Error('Thumbnail renderer produced no file.');
  return primary;
}

/** List which variant files actually exist for a job (for the UI gallery). */
export function listThumbnailVariants(channelId: string, jobId: string): string[] {
  const oDir = outputDir(channelId, jobId);
  return VARIANT_FILES.filter((f) => fs.existsSync(path.join(oDir, f)));
}

/** Promote a chosen variant (e.g. "thumbnail_v2.png") to the primary thumbnail.png used at upload. */
export function setPrimaryVariant(channelId: string, jobId: string, variantFile: string): void {
  if (!VARIANT_FILES.includes(variantFile)) throw new Error(`Unknown variant: ${variantFile}`);
  const oDir = outputDir(channelId, jobId);
  const src = path.join(oDir, variantFile);
  if (!fs.existsSync(src)) throw new Error(`Variant not found: ${variantFile}`);
  if (variantFile !== 'thumbnail.png') fs.copyFileSync(src, path.join(oDir, 'thumbnail.png'));
}
