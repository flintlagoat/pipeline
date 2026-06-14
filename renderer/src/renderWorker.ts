import { parentPort, workerData } from 'worker_threads';
import { RenderSettings } from './schema';
import { prepareContext, renderRangeToEncoder } from './renderSetup';
import { FrameEncoder } from './encoder';

// One render worker. Receives a frame range + the shared spec/settings/grain via workerData,
// builds its OWN drawing context (fonts, SVG raster, grain — none can cross threads), and
// streams its frames as raw RGBA into its OWN ffmpeg encoder producing one chunk .mp4
// (session 7 — replaces writing PNGs to a shared frames dir). x264 runs single-threaded per
// chunk (`threads: 1`) so N workers ≈ N busy cores with no oversubscription. It posts progress
// as it goes and a single 'done' (or 'error') when finished. Fully self-contained.
interface WorkerInput {
  workerId: number;
  startFrame: number;
  endFrame: number;
  specPath: string;
  chunkPath: string;   // this worker's output chunk .mp4
  settings: RenderSettings;
  grainPath?: string;
  preset?: string;     // x264 preset ('medium' full / 'veryfast' draft)
}

async function run(): Promise<void> {
  const { startFrame, endFrame, specPath, chunkPath, settings, grainPath, preset } =
    workerData as WorkerInput;

  const { spec, rctx } = await prepareContext({ specPath, settings, grainPath, quiet: true });

  const encoder = new FrameEncoder({
    width: settings.outputWidth,
    height: settings.outputHeight,
    fps: settings.fps,
    crf: settings.crf,
    outPath: chunkPath,
    preset,
    threads: 1,
  });

  await renderRangeToEncoder(spec, rctx, encoder, startFrame, endFrame, (rendered) => {
    parentPort?.postMessage({ type: 'progress', rendered });
  });
  await encoder.close();

  parentPort?.postMessage({ type: 'done' });
}

run().catch((err: unknown) => {
  const e = err as Error;
  parentPort?.postMessage({ type: 'error', error: e.stack ?? String(e) });
  process.exit(1);
});
