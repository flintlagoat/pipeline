// Verification harness for the render-variety + contrast fixes (FIX 1/2/3). Pure local — no API.
// Run: npx ts-node src/test_renderfixes.ts
import * as fs from 'fs';
import * as path from 'path';
import { relayoutBoard, SECTION_W, SECTION_H } from './relayout';
import { normalizeSvgContrast, contrastRatio } from './assetContrast';
import { BoardSpec } from './types/specTypes';

const ROOT = path.resolve(__dirname, '..', '..');

function ratioVsBg(hex: string, bgHex: string): number {
  const p = (h: string) => ({ r: parseInt(h.slice(1, 3), 16), g: parseInt(h.slice(3, 5), 16), b: parseInt(h.slice(5, 7), 16) });
  return contrastRatio(p(hex), p(bgHex));
}

// ── FIX 1: contrast guard over a known white-on-cream asset ──
function testContrast(): void {
  console.log('\n━━━ FIX 1 — contrast guard ━━━');
  const bg = '#FBF3E2', ink = '#3B2A1E';
  const rules = { background: bg, ink, minContrastRatio: 3.0, forbidNearBackground: true };
  console.log(`white(#FFFFFF) vs paper contrast = ${ratioVsBg('#FFFFFF', bg).toFixed(2)} (needs ≥3.0)`);

  const dir = path.join(ROOT, 'channels', 'tiny_kitchens', 'assets', 'svg');
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.svg'));
  let totalRemapped = 0, filesFixed = 0;
  for (const f of files) {
    const p = path.join(dir, f);
    const src = fs.readFileSync(p, 'utf8');
    const { svg, remapped } = normalizeSvgContrast(src, rules);
    if (remapped.length > 0) {
      filesFixed++; totalRemapped += remapped.length;
      fs.writeFileSync(p, svg, 'utf8'); // fix in place, like the pipeline does
      console.log(`  ${f}: remapped ${remapped.length} color(s) [${[...new Set(remapped)].join(', ')}]`);
    }
  }
  console.log(`→ ${filesFixed}/${files.length} files fixed, ${totalRemapped} colors remapped.`);
  // Re-scan: nothing should remain failing.
  let remaining = 0;
  for (const f of files) {
    const { remapped } = normalizeSvgContrast(fs.readFileSync(path.join(dir, f), 'utf8'), rules);
    remaining += remapped.length;
  }
  console.log(`→ idempotency re-scan: ${remaining} colors still failing (expect 0).`);
}

// ── FIX 2 + 3: relayout one spec ──
function testRelayout(specPath: string, label: string): void {
  console.log(`\n━━━ FIX 2+3 — relayout ${label} ━━━`);
  const raw = fs.readFileSync(specPath, 'utf8');
  const spec = JSON.parse(raw) as BoardSpec;
  const n = spec.board.sections.length;

  // Determinism: relayout two independent clones, compare.
  const a = JSON.parse(raw) as BoardSpec;
  const b = JSON.parse(raw) as BoardSpec;
  const ra = relayoutBoard(a);
  const rb = relayoutBoard(b);
  const deterministic = JSON.stringify(a.board.sections) === JSON.stringify(b.board.sections)
    && JSON.stringify(ra.templates) === JSON.stringify(rb.templates);
  console.log(`sections=${n}  grid=${ra.cols}×${ra.rows}  deterministic=${deterministic}`);
  console.log(`templates: ${ra.templates.join(' | ')}`);

  // No two consecutive sections share a layout.
  let consecDup = 0;
  for (let i = 1; i < ra.templates.length; i++) if (ra.templates[i] === ra.templates[i - 1]) consecDup++;
  const distinct = new Set(ra.templates).size;
  console.log(`distinct layouts=${distinct}  consecutive-duplicate layouts=${consecDup} (expect 0)`);

  // No back-to-back "full" beats.
  const FULL = new Set(['text_full_emphasis', 'visual_full_bleed']);
  let consecFull = 0;
  for (let i = 1; i < ra.templates.length; i++) if (FULL.has(ra.templates[i]) && FULL.has(ra.templates[i - 1])) consecFull++;
  console.log(`back-to-back full beats=${consecFull} (expect 0)`);

  // Snake geometry + every element inside its section frame.
  let outOfFrame = 0, rowsSeen = new Set<number>(), colsSeen = new Set<number>();
  a.board.sections.forEach((s, i) => {
    rowsSeen.add(Math.round(s.y_offset / SECTION_H));
    colsSeen.add(Math.round(s.x_offset / SECTION_W));
    for (const el of s.elements) {
      const lx = el.x - s.x_offset, ly = el.y - s.y_offset;
      if (lx < 0 || lx > SECTION_W || ly < 0 || ly > SECTION_H) outOfFrame++;
    }
  });
  console.log(`rows used=${[...rowsSeen].sort().join(',')}  cols used=${[...colsSeen].sort().join(',')}  elements-out-of-frame=${outOfFrame} (expect 0)`);

  // Write the relayouted spec next to the original so the renderer can be pointed at it.
  const outPath = specPath.replace(/board_spec\.json$/, 'board_spec_relayout.json');
  fs.writeFileSync(outPath, JSON.stringify(a, null, 2), 'utf8');
  console.log(`→ wrote ${path.relative(ROOT, outPath)}`);
}

testContrast();
testRelayout(path.join(ROOT, 'output', 'tiny_kitchens', 'tk_001', 'board_spec.json'), 'tiny_kitchens');
testRelayout(path.join(ROOT, 'output', 'how_industries_work', 'e2e_001', 'board_spec.json'), 'how_industries_work');
console.log('\nDone.');
