import { loadChannelSpec } from './channelSpec';
import { applyDistinctness, fingerprintSpec } from './channelDistinct';
import { ARCHETYPE_IDS, ArchetypeId, ChannelSpec } from './types/channelSpec';

// Offline test for the per-channel skin/distinctness pass — no API calls. Verifies: determinism per
// id, that a curated skin is stamped, STRONG within-archetype spread (so two same-archetype channels
// look clearly different), validity/range across ALL 8 archetypes, and that the collision guard
// escapes a near-duplicate.

let failures = 0;
function check(name: string, cond: boolean, extra = ''): void {
  console.log(`  ${cond ? 'PASS' : 'FAIL'} — ${name}${extra ? `  (${extra})` : ''}`);
  if (!cond) failures++;
}

const base = loadChannelSpec('how_industries_work'); // blueprint_board baseline
const mk = (id: string, archetype?: ArchetypeId): ChannelSpec => ({ ...base, id, archetype: archetype ?? base.archetype });

// 1 — deterministic for a given id
const a = applyDistinctness(mk('test_ch_a'), new Set());
const a2 = applyDistinctness(mk('test_ch_a'), new Set());
check('deterministic for same id', JSON.stringify(a) === JSON.stringify(a2));

// 2 — a curated skin is actually stamped (fonts come from the archetype's pool, palette is set)
check('stamps a palette + display font', !!a.palette.background && !!a.typography.display, `${a.palette.background} / ${a.typography.display}`);

// 3 — STRONG within-archetype spread across all 8 archetypes (8 channels each)
const letters = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
for (const arch of ARCHETYPE_IDS) {
  const specs = letters.map((l) => applyDistinctness(mk(`t_${arch}_${l}`, arch), new Set()));
  const bgs = new Set(specs.map((s) => s.palette.background.toLowerCase()));
  const fonts = new Set(specs.map((s) => s.typography.display.toLowerCase()));
  const combos = new Set(specs.map((s) => `${s.palette.background.toLowerCase()}|${s.typography.display.toLowerCase()}`));
  check(`${arch}: >=3 distinct backgrounds of 8`, bgs.size >= 3, `${bgs.size}`);
  check(`${arch}: >=3 distinct display fonts of 8`, fonts.size >= 3, `${fonts.size}`);
  check(`${arch}: >=5 distinct look combos of 8`, combos.size >= 5, `${combos.size}`);
  check(`${arch}: archetype preserved`, specs.every((s) => s.archetype === arch));
  check(`${arch}: pushZoom/grain in range`, specs.every((s) => s.cameraProfile.pushZoom >= 0.8 && s.cameraProfile.pushZoom <= 1 && s.background.grain >= 0 && s.background.grain <= 1));
}

// 4 — collision guard escapes a near-identical existing channel
const existing = new Set([fingerprintSpec(a)]);
const c = applyDistinctness(mk('test_ch_a'), existing);
check('collision re-roll escapes the existing fingerprint', fingerprintSpec(c) !== fingerprintSpec(a), `${fingerprintSpec(a)} -> ${fingerprintSpec(c)}`);

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
