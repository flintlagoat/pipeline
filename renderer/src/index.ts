import { readFileSync, writeFileSync, mkdirSync, existsSync, rmSync } from 'fs';
import * as path from 'path';
import * as os from 'os';
import { Worker } from 'worker_threads';
import { BoardSpec, RenderSettings } from './schema';
import { loadFonts } from './fonts';
import { resolveStyle } from './style';
import { generateGrainOverlay } from './grain';
import { assembleVideo, concatChunks } from './ffmpeg';
import { renderFramePng } from './frameRenderer';
import { computeSettings, prepareContext, renderRangeToEncoder } from './renderSetup';
import { FrameEncoder } from './encoder';
import { DEBUG, dumpCameraDebug, dumpSvgDebug, dumpDurationDebug } from './debug';

export interface RenderOptions {
  draft?: boolean;        // half-res / 15fps / no grain fast preview
  workers?: number;       // override worker count (default: cores - 1)
}

export async function renderVideo(
  specPath: string,
  outputPath: string,
  options: RenderOptions = {}
): Promise<void> {
  const resolvedSpec = path.resolve(specPath);
  const resolvedOutput = path.resolve(outputPath);

  console.log('Loading spec...');
  const spec: BoardSpec = JSON.parse(readFileSync(resolvedSpec, 'utf8'));

  const draft = !!options.draft;
  const settings = computeSettings(spec, draft);
  const totalFrames = Math.ceil(spec.duration_seconds * settings.fps);
  // x264 preset: 'medium' matches the quality of the old PNG→assemble pass; drafts trade
  // compression for speed.
  const preset = draft ? 'veryfast' : 'medium';

  // Resolve style just for the startup log + to pre-warm fonts (the workers/single path each
  // resolve it again inside prepareContext — cheap and keeps them self-contained).
  const profile = resolveStyle(spec);
  console.log(`Style: bg=${profile.background.mode} grain=${settings.grain ? profile.grain : 'OFF (draft)'} filler=${profile.filler.enabled} fonts=[${profile.fonts.display}/${profile.fonts.body}/${profile.fonts.mono}] push=${profile.camera.pushZoom}`);
  console.log(`Video: ${spec.video_id} | ${settings.outputWidth}x${settings.outputHeight} | ${totalFrames} frames @ ${settings.fps}fps${draft ? ' | DRAFT' : ''}`);

  // Pre-warm fonts ONCE in the main thread so parallel workers don't race to download the same
  // files (after this they exist on disk and each worker just registers them).
  console.log('Loading fonts...');
  await loadFonts(profile);

  // Temp working directory: chunk .mp4s + the shared grain PNG (and, on the DEBUG paths only,
  // PNG frames). Session 7: normal renders stream raw RGBA into per-worker ffmpeg encoders, so
  // no frames ever touch disk — the old PNG path cost ~50-150ms/frame of encode plus tens of GB
  // of temp disk on an 8-minute video.
  const workDir = path.join(os.tmpdir(), `render_${spec.video_id}_${Date.now()}`);
  if (existsSync(workDir)) rmSync(workDir, { recursive: true });
  mkdirSync(workDir, { recursive: true });

  // Generate the grain overlay ONCE and share it with every worker via a file, so the
  // (static-by-design) grain is byte-identical across all chunks — no seam at chunk boundaries.
  let grainPath: string | undefined;
  if (settings.grain) {
    console.log('Generating grain overlay...');
    grainPath = path.join(workDir, '__grain.png');
    writeFileSync(grainPath, generateGrainOverlay(settings.outputWidth, settings.outputHeight));
  }

  // Worker count: leave one core for the OS + the encoders. The DEBUG dumps and the
  // DEBUG_START_FRAME window stay single-threaded on the PNG path (frame files are the point).
  // Each worker pays a one-time `prepareContext` cost (rasterize every SVG, register fonts,
  // ts-node boot), so over-parallelizing a SHORT video wastes that setup N times for a handful
  // of frames each. MIN_FRAMES_PER_WORKER keeps each worker busy enough to amortize its setup;
  // long real videos still saturate every core.
  const debugWindow = !!(process.env.DEBUG_START_FRAME || process.env.DEBUG_MAX_FRAMES);
  const envWorkers = process.env.RENDER_WORKERS ? parseInt(process.env.RENDER_WORKERS, 10) : undefined;
  const MIN_FRAMES_PER_WORKER = draft ? 120 : 240;
  const coreCap = Math.max(1, os.cpus().length - 1);
  let nWorkers = options.workers ?? (envWorkers && envWorkers > 0 ? envWorkers : coreCap);
  // Don't spin up more workers than there's meaningful work for (unless explicitly forced).
  if (options.workers === undefined && (!envWorkers || envWorkers <= 0)) {
    nWorkers = Math.min(nWorkers, Math.max(1, Math.ceil(totalFrames / MIN_FRAMES_PER_WORKER)));
  }
  nWorkers = Math.max(1, Math.min(nWorkers, totalFrames));

  const audioPath = spec.audio_file
    ? path.resolve(path.dirname(resolvedSpec), spec.audio_file)
    : null;
  const outputDir = path.dirname(resolvedOutput);
  if (!existsSync(outputDir)) mkdirSync(outputDir, { recursive: true });

  const startTime = Date.now();
  try {
    if (DEBUG || debugWindow) {
      // DEBUG path: PNG frames on disk (inspectable) + the classic assemble pass.
      const framesDir = path.join(workDir, 'frames');
      mkdirSync(framesDir, { recursive: true });
      await renderDebugPngPath(resolvedSpec, settings, grainPath, framesDir, totalFrames);
      logElapsed(startTime, totalFrames);
      console.log('Assembling video with FFmpeg...');
      await assembleVideo(framesDir, audioPath, resolvedOutput, settings.fps, settings.crf);
    } else {
      // Fast path: render straight into per-chunk encoders, then concat (stream copy) + audio.
      const chunkPaths =
        nWorkers <= 1
          ? [await renderSingleEncoder(resolvedSpec, settings, grainPath, workDir, totalFrames, preset)]
          : await renderWithWorkers(resolvedSpec, settings, grainPath, workDir, totalFrames, nWorkers, preset);
      logElapsed(startTime, totalFrames);
      console.log('Joining chunks + muxing audio (stream copy)...');
      await concatChunks(chunkPaths, audioPath, resolvedOutput);
    }
  } finally {
    rmSync(workDir, { recursive: true, force: true });
  }

  console.log(`\nDone! Output: ${resolvedOutput}`);
}

function logElapsed(startTime: number, totalFrames: number): void {
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\n  Rendered ${totalFrames} frames in ${elapsed}s (${(totalFrames / Number(elapsed)).toFixed(1)} fps)`);
}

// ── DEBUG path (PNG frames on disk: DEBUG_RENDER dumps + DEBUG_START_FRAME window) ──
async function renderDebugPngPath(
  specPath: string,
  settings: RenderSettings,
  grainPath: string | undefined,
  framesDir: string,
  totalFrames: number
): Promise<void> {
  const { spec, rctx, svgDir } = await prepareContext({ specPath, settings, grainPath });

  if (DEBUG) {
    dumpDurationDebug(spec, totalFrames);
    dumpCameraDebug(spec);
    dumpSvgDebug(spec, svgDir, rctx.svgAssets);
  }

  // DEBUG_START_FRAME + DEBUG_MAX_FRAMES render a contiguous window (renumbered from 0 so the
  // clip assembles) — handy for eyeballing an animation without rendering the whole video.
  const startFrame = process.env.DEBUG_START_FRAME ? parseInt(process.env.DEBUG_START_FRAME, 10) : 0;
  const maxFrames = process.env.DEBUG_MAX_FRAMES ? parseInt(process.env.DEBUG_MAX_FRAMES, 10) : 0;
  const isWindow = startFrame > 0 || maxFrames > 0;
  const framesToRender = maxFrames > 0 ? Math.min(totalFrames - startFrame, maxFrames) : totalFrames - startFrame;
  if (isWindow) console.log(`DEBUG window — rendering ${framesToRender} frames from frame ${startFrame}/${totalFrames}`);

  console.log(`Rendering ${framesToRender} frames (single-threaded, PNG debug path)...`);
  for (let i = 0; i < framesToRender; i++) {
    const frame = startFrame + i;
    if (frame >= totalFrames) break;
    if (i % 30 === 0) {
      const pct = ((i / framesToRender) * 100).toFixed(0);
      process.stdout.write(`\r  Frame ${i}/${framesToRender} (${pct}%)`);
    }
    const buffer = renderFramePng(spec, frame, rctx);
    // A debug window renumbers from 0; a full single-thread render keeps the global index.
    const outIdx = isWindow ? i : frame;
    writeFileSync(path.join(framesDir, `frame_${String(outIdx).padStart(6, '0')}.png`), buffer);
  }
}

// ── Fast path, single process (RENDER_WORKERS=1) ────────────────────────────────
async function renderSingleEncoder(
  specPath: string,
  settings: RenderSettings,
  grainPath: string | undefined,
  workDir: string,
  totalFrames: number,
  preset: string
): Promise<string> {
  const { spec, rctx } = await prepareContext({ specPath, settings, grainPath });
  const chunkPath = path.join(workDir, 'chunk_000.mp4');
  // Single render thread is the bottleneck — let x264 use its own threading (threads: 0 = auto).
  const encoder = new FrameEncoder({
    width: settings.outputWidth, height: settings.outputHeight,
    fps: settings.fps, crf: settings.crf, outPath: chunkPath, preset, threads: 0,
  });
  console.log(`Rendering ${totalFrames} frames (single render thread → streaming encoder)...`);
  await renderRangeToEncoder(spec, rctx, encoder, 0, totalFrames, (rendered) => {
    process.stdout.write(`\r  Rendered ${rendered}/${totalFrames} (${((rendered / totalFrames) * 100).toFixed(0)}%)`);
  });
  await encoder.close();
  return chunkPath;
}

// ── Fast path, parallel (worker_threads, one streaming encoder per worker) ──────
function renderWithWorkers(
  specPath: string,
  settings: RenderSettings,
  grainPath: string | undefined,
  workDir: string,
  totalFrames: number,
  nWorkers: number,
  preset: string
): Promise<string[]> {
  // Divide frames evenly; the remainder goes to the last worker.
  const per = Math.floor(totalFrames / nWorkers);
  const ranges: Array<[number, number]> = [];
  for (let i = 0; i < nWorkers; i++) {
    const start = i * per;
    const end = i === nWorkers - 1 ? totalFrames : (i + 1) * per;
    ranges.push([start, end]);
  }
  const chunkPaths = ranges.map((_, i) => path.join(workDir, `chunk_${String(i).padStart(3, '0')}.mp4`));
  console.log(`Rendering ${totalFrames} frames across ${nWorkers} workers (~${per}/worker, streaming encoders)...`);

  // Under ts-node the worker is a .ts file needing the ts-node loader; a compiled build runs .js.
  const isTs = __filename.endsWith('.ts');
  const workerPath = path.join(__dirname, isTs ? 'renderWorker.ts' : 'renderWorker.js');
  const execArgv = isTs ? ['-r', 'ts-node/register/transpile-only'] : [];

  const progress = new Array<number>(nWorkers).fill(0);
  const workers: Worker[] = [];

  return new Promise<string[]>((resolve, reject) => {
    let settled = false;
    let doneCount = 0;

    const fail = (err: Error): void => {
      if (settled) return;
      settled = true;
      for (const w of workers) void w.terminate();
      reject(err);
    };

    const reportProgress = (): void => {
      const tot = progress.reduce((a, b) => a + b, 0);
      process.stdout.write(`\r  Rendered ${tot}/${totalFrames} (${((tot / totalFrames) * 100).toFixed(0)}%)`);
    };

    for (let i = 0; i < nWorkers; i++) {
      const [startFrame, endFrame] = ranges[i];
      const worker = new Worker(workerPath, {
        workerData: {
          workerId: i, startFrame, endFrame, specPath,
          chunkPath: chunkPaths[i], settings, grainPath, preset,
        },
        execArgv,
      });
      workers.push(worker);

      worker.on('message', (msg: { type: string; rendered?: number; error?: string }) => {
        if (msg.type === 'progress') {
          progress[i] = msg.rendered ?? progress[i];
          reportProgress();
        } else if (msg.type === 'done') {
          progress[i] = endFrame - startFrame;
          reportProgress();
          doneCount++;
          if (doneCount === nWorkers && !settled) {
            settled = true;
            resolve(chunkPaths);
          }
        } else if (msg.type === 'error') {
          fail(new Error(`worker ${i} failed: ${msg.error}`));
        }
      });
      worker.on('error', (err) => fail(err));
      worker.on('exit', (code) => {
        if (code !== 0 && !settled) fail(new Error(`worker ${i} exited with code ${code}`));
      });
    }
  });
}

if (require.main === module) {
  const argv = process.argv.slice(2);
  const draft = argv.includes('--draft');
  const positional = argv.filter((a) => !a.startsWith('--'));
  const [specArg, outputArg] = positional;
  if (!specArg || !outputArg) {
    console.error('Usage: ts-node src/index.ts <spec.json> <output.mp4> [--draft]');
    process.exit(1);
  }
  renderVideo(specArg, outputArg, { draft }).catch((err: unknown) => {
    console.error('Render failed:', err);
    process.exit(1);
  });
}
