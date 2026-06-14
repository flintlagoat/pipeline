import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import * as path from 'path';
import { BoardSpec } from './schema';
import { computeSettings, prepareContext } from './renderSetup';
import { renderFramePng } from './frameRenderer';

// Channel-look PREVIEW renderer. Renders a few STILL frames from a (synthetic) board spec — no
// audio, no ffmpeg, no chunking — so the product's "design your channel vibe" step can show a user
// their unique look before committing. Reuses the exact render path (prepareContext + frame
// renderer) so the preview is pixel-faithful to real output. Invoked like index.ts:
//   npx ts-node --transpile-only src/preview.ts <specPath> <outDir> [t1,t2,...seconds]
async function main(): Promise<void> {
  const [specPath, outDir, timesArg] = process.argv.slice(2);
  if (!specPath || !outDir) {
    console.error('usage: preview <specPath> <outDir> [t1,t2,...seconds]');
    process.exit(1);
  }

  const resolved = path.resolve(specPath);
  const spec0: BoardSpec = JSON.parse(readFileSync(resolved, 'utf8'));
  const settings = computeSettings(spec0, false); // full res + grain → an accurate "vibe" preview
  mkdirSync(path.resolve(outDir), { recursive: true });

  const { spec, rctx } = await prepareContext({ specPath: resolved, settings, quiet: true });

  const times = (timesArg ? timesArg.split(',') : ['2.8', '3.8', '4.8'])
    .map((t) => parseFloat(t.trim()))
    .filter((t) => Number.isFinite(t) && t >= 0);

  let n = 0;
  for (let i = 0; i < times.length; i++) {
    const frame = Math.round(times[i] * settings.fps);
    const png = renderFramePng(spec, frame, rctx);
    const outPath = path.join(path.resolve(outDir), `preview_${i + 1}.png`);
    writeFileSync(outPath, png);
    n++;
    console.log(`PREVIEW wrote ${outPath} (t=${times[i]}s frame=${frame})`);
  }
  console.log(`PREVIEW done: ${n} frame(s)`);
}

main().catch((e) => {
  console.error('preview failed:', e);
  process.exit(1);
});
