import * as fs from 'fs';
import * as path from 'path';
import { applyVideoFeel } from './videoFeel';
import { loadChannelSpec, toChannelConfig } from './channelSpec';
import { BoardSpec } from './types/specTypes';

// Local check for the video-feel pass (no API). Loads a cached board_spec, applies the pass, and
// reports what it changed + confirms determinism. Usage: npx ts-node src/test_videofeel.ts <specPath> <channelId>

const specPath = process.argv[2] ?? path.resolve(__dirname, '../../output/how_industries_work/e2e_001/board_spec.json');
const channelId = process.argv[3] ?? 'how_industries_work';

const cfg = toChannelConfig(loadChannelSpec(channelId));
const raw = JSON.parse(fs.readFileSync(specPath, 'utf8')) as BoardSpec;

const a = JSON.parse(JSON.stringify(raw)) as BoardSpec;
const b = JSON.parse(JSON.stringify(raw)) as BoardSpec;

const r1 = applyVideoFeel(a, cfg);
const r2 = applyVideoFeel(b, cfg);

console.log('Result:', r1);
console.log('Deterministic:', JSON.stringify(a) === JSON.stringify(b) ? 'YES' : 'NO (BUG)');

// Show the transformed text elements.
let shown = 0;
for (const sec of a.board.sections) {
  for (const el of sec.elements) {
    if (['headline', 'eyebrow', 'body_text'].includes(el.type) && (el.content ?? '').trim()) {
      const tag = [
        el.type.padEnd(9),
        `@${el.reveal_at_seconds}s`,
        el.reveal_type,
        `dur=${el.reveal_duration_seconds ?? '-'}`,
        el.emphasis_words ? `emph=[${el.emphasis_words.join(',')}]` : '',
      ].join('  ');
      console.log(`  ${tag}  "${(el.content ?? '').slice(0, 42)}"`);
      if (++shown >= 14) { console.log('  ...'); break; }
    }
  }
  if (shown >= 14) break;
}
void r2;
