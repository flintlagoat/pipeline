import { execSync } from 'child_process';
import { existsSync } from 'fs';
import { WordTimestamp } from '../types/specTypes';
import { KeptRange } from './types';

const LEAD_PAD = 0.3; // seconds of audio kept before the first word
const TAIL_PAD = 0.5; // seconds of audio kept after the last word

// Compute the keep window (in ORIGINAL audio time) from the word timestamps.
// Whisper runs on the untrimmed audio, so the first word's start IS the leading
// silence we want to strip. Driving the trim from the timestamps (instead of an
// opaque FFmpeg silence detector) guarantees audio and timestamps stay aligned.
export function computeKeepWindow(
  timestamps: WordTimestamp[],
  audioDuration: number
): KeptRange {
  if (timestamps.length === 0) {
    return { start: 0, end: audioDuration };
  }
  const firstStart = timestamps[0].start;
  const lastEnd = timestamps[timestamps.length - 1].end;
  const start = Math.max(0, firstStart - LEAD_PAD);
  const end = Math.min(audioDuration, lastEnd + TAIL_PAD);
  return { start, end };
}

// Shift every word back by the amount of leading audio we cut, so timestamps
// align with clean_audio.wav (where the first word now begins at ~LEAD_PAD).
export function adjustTimestamps(
  originals: WordTimestamp[],
  keep: KeptRange
): WordTimestamp[] {
  const shift = keep.start;
  return originals.map((w) => ({
    word: w.word,
    start: Math.max(0, w.start - shift),
    end: Math.max(0, w.end - shift),
  }));
}

function probeDuration(audioPath: string): number {
  const out = execSync(
    `ffprobe -v quiet -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${audioPath}"`,
    { encoding: 'utf8' }
  ).trim();
  return parseFloat(out);
}

// Trim the audio to the given keep window using sample-accurate seeking.
// Returns the actual clean-audio duration.
export function trimToWindow(
  inputPath: string,
  outputAudioPath: string,
  keep: KeptRange
): number {
  console.log(`  [3/3] Trimming to [${keep.start.toFixed(2)}s, ${keep.end.toFixed(2)}s] (timestamp-driven)...`);
  const dur = keep.end - keep.start;

  // -ss/-t AFTER -i = decode-then-discard = sample accurate. Re-encode to PCM.
  execSync(
    `ffmpeg -y -i "${inputPath}" -ss ${keep.start.toFixed(3)} -t ${dur.toFixed(3)} -c:a pcm_s16le "${outputAudioPath}"`,
    { stdio: 'inherit' }
  );

  if (!existsSync(outputAudioPath)) {
    throw new Error(`FFmpeg did not produce trimmed audio at: ${outputAudioPath}`);
  }

  const actual = probeDuration(outputAudioPath);
  console.log(`  Trimmed audio: ${actual.toFixed(2)}s`);
  return actual;
}

export { probeDuration };
