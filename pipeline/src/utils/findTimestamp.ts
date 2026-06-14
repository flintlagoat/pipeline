import { WordTimestamp } from '../types/specTypes';

export function findNearestTimestamp(timestamps: WordTimestamp[], targetTime: number): number {
  if (timestamps.length === 0) return targetTime;
  let best = timestamps[0];
  let bestDist = Math.abs(timestamps[0].start - targetTime);
  for (const wt of timestamps) {
    const dist = Math.abs(wt.start - targetTime);
    if (dist < bestDist) { bestDist = dist; best = wt; }
  }
  return best.start;
}

export function getTimestampAtWordIndex(timestamps: WordTimestamp[], index: number): number {
  const clamped = Math.max(0, Math.min(index, timestamps.length - 1));
  return timestamps[clamped]?.start ?? 0;
}

export function estimateDuration(timestamps: WordTimestamp[]): number {
  if (timestamps.length === 0) return 0;
  return timestamps[timestamps.length - 1].end;
}

export function generateFakeTimestamps(script: string, wordsPerSecond = 2.3): WordTimestamp[] {
  const words = script.split(/\s+/).filter((w) => w.length > 0);
  const secPerWord = 1 / wordsPerSecond;
  const timestamps: WordTimestamp[] = [];
  let t = 0;
  for (const word of words) {
    timestamps.push({ word, start: t, end: t + secPerWord });
    t += secPerWord;
  }
  return timestamps;
}

export function formatTimestampSample(timestamps: WordTimestamp[], maxWords = 25): string {
  const sample = timestamps.slice(0, maxWords);
  const lines = sample.map((wt, i) => `[${i}] "${wt.word}" @${wt.start.toFixed(2)}s`);
  if (timestamps.length > maxWords) lines.push(`... (${timestamps.length - maxWords} more words)`);
  return lines.join('\n');
}

// Compact listing of EVERY word with its start AND end time. The spec generator must
// see the whole timeline to anchor reveals to the exact introducing word — a truncated
// sample leaves the later sections un-timed and forces it to guess (front-loading/clusters).
export function formatFullTimestamps(timestamps: WordTimestamp[]): string {
  return timestamps
    .map((wt, i) => `[${i}] "${wt.word}" ${wt.start.toFixed(2)}-${wt.end.toFixed(2)}s`)
    .join('\n');
}
