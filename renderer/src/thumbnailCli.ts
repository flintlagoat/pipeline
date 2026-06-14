import { readFileSync } from 'fs';
import { loadFonts } from './fonts';
import { RenderProfile } from './schema';
import { renderThumbnail, ThumbnailSpec } from './thumbnail';

// CLI entry for the thumbnail renderer (session 6). The pipeline writes a ThumbnailSpec JSON
// (palette/fonts/text/asset already resolved per channel) and spawns this exactly like the
// video renderer:
//   npx ts-node src/thumbnailCli.ts <thumbnail.spec.json>

async function main(): Promise<void> {
  const specPath = process.argv[2];
  if (!specPath) {
    console.error('Usage: npx ts-node src/thumbnailCli.ts <thumbnail.spec.json>');
    process.exit(1);
  }
  // strip a UTF-8 BOM (hand-edited files on Windows often carry one). The file may hold one spec
  // or an ARRAY of specs (variant batch) — normalize to an array.
  const parsed = JSON.parse(readFileSync(specPath, 'utf8').replace(/^﻿/, '')) as ThumbnailSpec | ThumbnailSpec[];
  const specs = Array.isArray(parsed) ? parsed : [parsed];
  if (specs.length === 0) throw new Error('no thumbnail specs');

  // Fonts only need registering once; every variant shares the channel family.
  const first = specs[0];
  if (!first.out || !first.bigText || !first.fontDisplay) {
    throw new Error('thumbnail spec needs at least { out, bigText, fontDisplay }');
  }
  await loadFonts({ fonts: {
    display: first.fontDisplay,
    body: first.fontBody ?? first.fontDisplay,
    mono: first.fontDisplay,
  } } as unknown as RenderProfile);

  for (const spec of specs) {
    await renderThumbnail(spec);
    console.log(`Thumbnail written → ${spec.out}`);
  }
}

main().catch((e: unknown) => {
  console.error('Thumbnail render failed:', (e as Error).message);
  process.exit(1);
});
