// Camera-path verification (FIX 3 variety + s8 visible-motion). Pure local, no render.
// Run: npx ts-node src/test_camerapath.ts <board_spec.json>
import * as fs from 'fs';
import * as path from 'path';
import { buildCameraPath, getCameraAtTime } from './camera';
import { resolveStyle } from './style';
import { BoardSpec, Section } from './schema';

const specPath = process.argv[2]
  || path.resolve(__dirname, '../../output/how_industries_work/feeltest_s7/board_spec.json');
if (!fs.existsSync(specPath)) { console.log('spec not found:', specPath, '— skipping'); process.exit(0); }
const spec = JSON.parse(fs.readFileSync(specPath, 'utf8')) as BoardSpec;
const profile = resolveStyle(spec);
const sections = spec.board.sections;
const duration = spec.duration_seconds;
const kfs = buildCameraPath(sections, duration, profile.camera, spec.video_id);

let failures = 0;
function assert(c: boolean, m: string): void { console.log(`  ${c ? '✓' : '✗ FAIL'} ${m}`); if (!c) failures++; }

function dirOf(a: typeof kfs[number], b: typeof kfs[number]): string {
  const dx = (b.viewport_x + b.viewport_width / 2) - (a.viewport_x + a.viewport_width / 2);
  const dy = (b.viewport_y + b.viewport_height / 2) - (a.viewport_y + a.viewport_height / 2);
  if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return 'none';
  return Math.abs(dx) >= Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up');
}

console.log(`spec: ${path.basename(path.dirname(specPath))} | ${sections.length} sections | ${duration.toFixed(0)}s | keyframes=${kfs.length}\n`);

// ── Direction/easing variety (FIX 3) ──
const dirs = new Set<string>();
const combos: string[] = [];
for (let i = 1; i < kfs.length; i++) {
  const d = dirOf(kfs[i - 1], kfs[i]);
  if (d !== 'none') { dirs.add(d); combos.push(`${d}:${kfs[i].easing}`); }
}
let consecCombo = 0;
for (let i = 1; i < combos.length; i++) if (combos[i] === combos[i - 1]) consecCombo++;
console.log(`directions: ${[...dirs].join(', ') || '(none)'} | consecutive identical dir+easing: ${consecCombo}`);

// ── s8 visible-motion: sample the path, bucket by on-screen section, measure intra-hold motion ──
function sectionAt(cx: number, cy: number): Section | null {
  return sections.find((s) => cx >= s.x_offset && cx < s.x_offset + s.width && cy >= s.y_offset && cy < s.y_offset + s.height) ?? null;
}
const dt = 0.25;
const per = new Map<string, { zMin: number; zMax: number; cxMin: number; cxMax: number; cyMin: number; cyMax: number }>();
let maxStatic = 0, curStatic = 0, outOfBounds = 0;
let prev: { z: number; cx: number; cy: number } | null = null;
for (let t = 0; t <= duration; t += dt) {
  const c = getCameraAtTime(kfs, sections, t);
  const z = 1920 / c.viewport_width;
  const cx = c.viewport_x + c.viewport_width / 2;
  const cy = c.viewport_y + c.viewport_height / 2;
  const s = sectionAt(cx, cy);
  if (s) {
    const e = per.get(s.id) ?? { zMin: Infinity, zMax: -Infinity, cxMin: Infinity, cxMax: -Infinity, cyMin: Infinity, cyMax: -Infinity };
    e.zMin = Math.min(e.zMin, z); e.zMax = Math.max(e.zMax, z);
    e.cxMin = Math.min(e.cxMin, cx); e.cxMax = Math.max(e.cxMax, cx);
    e.cyMin = Math.min(e.cyMin, cy); e.cyMax = Math.max(e.cyMax, cy);
    per.set(s.id, e);
    const eps = 2;
    const inB = c.viewport_x >= s.x_offset - eps && c.viewport_x + c.viewport_width <= s.x_offset + s.width + eps
      && c.viewport_y >= s.y_offset - eps && c.viewport_y + c.viewport_height <= s.y_offset + s.height + eps;
    // bounds only enforced when the frame is fully inside SOME section (i.e. not mid-transition)
    if (!inB) {
      const crossing = !sections.some((q) => c.viewport_x >= q.x_offset - eps && c.viewport_x + c.viewport_width <= q.x_offset + q.width + eps
        && c.viewport_y >= q.y_offset - eps && c.viewport_y + c.viewport_height <= q.y_offset + q.height + eps);
      if (!crossing) outOfBounds++;
    }
  }
  if (prev) {
    const moved = Math.abs(z - prev.z) > 0.0008 || Math.hypot(cx - prev.cx, cy - prev.cy) > 0.6;
    if (moved) { maxStatic = Math.max(maxStatic, curStatic); curStatic = 0; } else curStatic += dt;
  }
  prev = { z, cx, cy };
}
maxStatic = Math.max(maxStatic, curStatic);

console.log('\nper-section intra-hold motion:');
let movingSections = 0;
const zooms: number[] = [];
for (const s of sections) {
  const e = per.get(s.id);
  if (!e) { console.log(`  [${s.id}] (not sampled)`); continue; }
  const zoomPct = ((e.zMax / e.zMin) - 1) * 100;
  const travel = Math.round(Math.hypot(e.cxMax - e.cxMin, e.cyMax - e.cyMin));
  // A section "moves" if it zooms ≥7% OR pans ≥250px (a wide-text section pans more than it zooms).
  if (zoomPct >= 7 || travel >= 250) movingSections++;
  zooms.push(zoomPct);
  console.log(`  [${s.id.padEnd(12)}] zoom +${zoomPct.toFixed(1)}%  center travel ${travel}px  ${zoomPct >= 7 || travel >= 250 ? '✓moves' : '✗flat'}`);
}
const medianZoom = [...zooms].sort((a, b) => a - b)[Math.floor(zooms.length / 2)] ?? 0;

console.log('');
assert(consecCombo === 0, 'no two consecutive transitions share direction+easing');
assert(movingSections === sections.length, `every section has real motion (zoom ≥7% OR pan ≥250px); ${movingSections}/${sections.length} move`);
assert(medianZoom >= 12, `the median section has a strong push (≥12% zoom); median +${medianZoom.toFixed(1)}%`);
// A text-DENSE section can sit calm while the viewer reads (camera moves over text distract); that's
// fine and intended. We only guard against the long DEAD holds of the old model (which held 36s on a
// sparse beat). ≤14s keeps it in check while allowing legitimate reading time.
assert(maxStatic <= 14, `no static stretch >14s (the old single-push held 36s); longest ${maxStatic.toFixed(2)}s`);
assert(outOfBounds === 0, `no held frame outside its section (off-bounds samples: ${outOfBounds})`);

console.log(`\n${failures === 0 ? '✅ camera-path test passed' : `❌ ${failures} check(s) failed`}`);
process.exit(failures === 0 ? 0 : 1);
