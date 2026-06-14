import * as fs from 'fs';
import * as path from 'path';
import { applyVideoFeel } from './videoFeel';
import { loadChannelSpec, toChannelConfig } from './channelSpec';
import { BoardSpec } from './types/specTypes';

// Proves the video-feel pass VARIES per video_id (viewers catch fixed patterns). Same spec, three
// different video_ids → the set of elements that type_on should differ.
const specPath = process.argv[2] ?? path.resolve(__dirname, '../../output/how_industries_work/e2e_001/board_spec.json');
const cfg = toChannelConfig(loadChannelSpec('how_industries_work'));
const raw = JSON.parse(fs.readFileSync(specPath, 'utf8')) as BoardSpec;

function typedSignature(videoId: string): string {
  const s = JSON.parse(JSON.stringify(raw)) as BoardSpec;
  s.video_id = videoId;
  applyVideoFeel(s, cfg);
  const typed: string[] = [];
  for (const sec of s.board.sections)
    for (const el of sec.elements)
      if (el.reveal_type === 'type_on' && (el.content ?? '').trim()) typed.push((el.content ?? '').slice(0, 18));
  return typed.join(' | ');
}

for (const id of ['video_alpha', 'video_bravo', 'video_charlie']) {
  console.log(`${id.padEnd(14)} → ${typedSignature(id)}`);
}
