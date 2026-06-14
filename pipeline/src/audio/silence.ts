import { execSync } from 'child_process';
import { existsSync } from 'fs';
import { WordTimestamp } from '../types/specTypes';
import { probeDuration } from './trim';

// Internal-silence removal (2026-06-05). The old trim only stripped LEADING/TRAILING silence,
// so a long dead pause in the MIDDLE of a take (e.g. a 4.3s gap between two sentences) stayed
// in the audio — the video sat quiet/empty there. This cuts long INTERNAL gaps too: it builds
// a set of keep-segments from the word timestamps, concatenates them, and remaps every word
// time onto the new (shorter) timeline so audio + timestamps + spec stay in sync.

export interface KeepSegment { start: number; end: number; }

const LEAD_PAD = 0.3;   // audio kept before the first word
const TAIL_PAD = 0.5;   // audio kept after the last word
const GAP_MAX = 1.1;    // internal gaps longer than this are compressed (natural breaths stay)
const GAP_KEEP = 0.45;  // length a compressed gap is reduced to (a small, natural beat)

// Keep-segments in ORIGINAL audio time. Whisper runs on the untrimmed audio, so word times
// are on that timeline; we cut leading silence, every internal gap > GAP_MAX (down to
// GAP_KEEP), and trailing silence.
export function computeKeepSegments(timestamps: WordTimestamp[], audioDuration: number): KeepSegment[] {
  if (timestamps.length === 0) return [{ start: 0, end: audioDuration }];

  const segs: KeepSegment[] = [];
  let segStart = Math.max(0, timestamps[0].start - LEAD_PAD);

  for (let i = 0; i < timestamps.length - 1; i++) {
    const gapStart = timestamps[i].end;
    const gapEnd = timestamps[i + 1].start;
    if (gapEnd - gapStart > GAP_MAX) {
      // Close the current segment just after this word, reopen just before the next one —
      // leaving GAP_KEEP of "breath" total across the cut.
      const segEnd = Math.min(audioDuration, gapStart + GAP_KEEP / 2);
      if (segEnd > segStart) segs.push({ start: segStart, end: segEnd });
      segStart = Math.max(0, gapEnd - GAP_KEEP / 2);
    }
  }
  const lastEnd = Math.min(audioDuration, timestamps[timestamps.length - 1].end + TAIL_PAD);
  if (lastEnd > segStart) segs.push({ start: segStart, end: lastEnd });
  return segs;
}

export function totalRemoved(segments: KeepSegment[], audioDuration: number): number {
  const kept = segments.reduce((a, s) => a + (s.end - s.start), 0);
  return Math.max(0, audioDuration - kept);
}

// Map a time on the original timeline to the trimmed timeline. Words always sit inside a kept
// segment (we keep padding around them); a time that lands in a removed gap clamps to the cut.
function remapTime(t: number, segments: KeepSegment[]): number {
  let acc = 0;
  for (const s of segments) {
    if (t < s.start) return acc;          // t was in a removed gap → clamp to segment start
    if (t <= s.end) return acc + (t - s.start);
    acc += s.end - s.start;
  }
  return acc;
}

export function remapTimestamps(timestamps: WordTimestamp[], segments: KeepSegment[]): WordTimestamp[] {
  return timestamps.map((w) => ({
    word: w.word,
    start: remapTime(w.start, segments),
    end: remapTime(w.end, segments),
  }));
}

// Cut the audio down to the kept segments (sample-accurate atrim + concat) and return the new
// duration. One segment → a plain trim; many → concatenated with no gaps.
export function trimToSegments(inputPath: string, outputAudioPath: string, segments: KeepSegment[]): number {
  const removed = segments.length > 1;
  console.log(`  [3/3] Trimming to ${segments.length} kept segment(s)${removed ? ' (internal silence removed)' : ''}...`);

  const parts = segments.map(
    (s, i) => `[0:a]atrim=start=${s.start.toFixed(3)}:end=${s.end.toFixed(3)},asetpts=PTS-STARTPTS[a${i}]`
  );
  const labels = segments.map((_, i) => `[a${i}]`).join('');
  const filter = `${parts.join(';')};${labels}concat=n=${segments.length}:v=0:a=1[out]`;

  execSync(
    `ffmpeg -y -i "${inputPath}" -filter_complex "${filter}" -map "[out]" -c:a pcm_s16le "${outputAudioPath}"`,
    { stdio: 'inherit' }
  );
  if (!existsSync(outputAudioPath)) {
    throw new Error(`FFmpeg did not produce trimmed audio at: ${outputAudioPath}`);
  }

  const actual = probeDuration(outputAudioPath);
  console.log(`  Trimmed audio: ${actual.toFixed(2)}s`);
  return actual;
}
