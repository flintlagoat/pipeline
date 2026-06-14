import { loadChannelSpec } from './channelSpec';
import { applyDistinctness, fingerprintSpec } from './channelDistinct';
import { ChannelSpec } from './types/channelSpec';

// Offline test for the per-channel distinctness pass — no API calls. Verifies: determinism per id,
// that a signature is actually stamped, variety across channels, validity/range, and that the
// low-sensitivity collision guard escapes a near-duplicate (and only then swaps the display font).

let failures = 0;
function check(name: string, cond: boolean, extra = ''): void {
  console.log(`  ${cond ? 'PASS' : 'FAIL'} — ${name}${extra ? `  (${extra})` : ''}`);
  if (!cond) failures++;
}

const base = loadChannelSpec('how_industries_work');
const mk = (id: string): ChannelSpec => ({ ...base, id });

// 1 — deterministic for a given id
const a = applyDistinctness(mk('test_ch_a'), new Set());
const a2 = applyDistinctness(mk('test_ch_a'), new Set());
check('deterministic for same id', JSON.stringify(a) === JSON.stringify(a2));

// 2 — a signature is actually stamped (accent hue shifted off the base)
check(
  'stamps a per-channel signature',
  a.palette.accent1.toLowerCase() !== base.palette.accent1.toLowerCase(),
  `${base.palette.accent1} -> ${a.palette.accent1}`
);

// 3 — variety across many channels (seeded, so different ids diverge)
const ids = ['alpha', 'bravo', 'charlie', 'delta', 'echo', 'foxtrot'].map((s) => `test_${s}`);
const accents = ids.map((id) => applyDistinctness(mk(id), new Set()).palette.accent1.toLowerCase());
const distinct = new Set(accents);
check('variety across channels (>=4 distinct accents of 6)', distinct.size >= 4, `${distinct.size} distinct`);

// 4 — output stays valid + in range, archetype preserved
check('archetype preserved', a.archetype === base.archetype);
check('pushZoom in range', a.cameraProfile.pushZoom >= 0.8 && a.cameraProfile.pushZoom <= 1);
check('grain in range', a.background.grain >= 0 && a.background.grain <= 1);

// 5 — no collision ⇒ the model's display font is kept (we don't fight a deliberate choice)
check('no collision keeps display font', a.typography.display.toLowerCase() === base.typography.display.toLowerCase(), a.typography.display);

// 6 — collision guard escapes a near-identical existing channel (and only then swaps the font)
const existing = new Set([fingerprintSpec(a)]);
const c = applyDistinctness(mk('test_ch_a'), existing);
check('collision re-roll escapes the existing fingerprint', fingerprintSpec(c) !== fingerprintSpec(a), `${fingerprintSpec(a)} -> ${fingerprintSpec(c)}`);
check('collision re-roll swaps display font', c.typography.display.toLowerCase() !== a.typography.display.toLowerCase(), `${a.typography.display} -> ${c.typography.display}`);

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
