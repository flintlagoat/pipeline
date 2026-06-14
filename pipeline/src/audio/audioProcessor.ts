import { mkdirSync, existsSync, writeFileSync } from 'fs';
import * as path from 'path';
import { WordTimestamp } from '../types/specTypes';
import { AudioProcessResult } from './types';
import { transcribeAudio, TranscribeOptions } from './transcribe';
import { probeDuration } from './trim';
import { computeKeepSegments, trimToSegments, remapTimestamps, totalRemoved } from './silence';

export interface ProcessAudioOptions {
  transcribe?: TranscribeOptions;
}

export async function processAudio(
  rawVoiceover: string,
  outputDir: string,
  opts: ProcessAudioOptions = {}
): Promise<AudioProcessResult> {
  if (!existsSync(outputDir)) mkdirSync(outputDir, { recursive: true });

  const workDir = path.join(outputDir, 'audio_work');
  if (!existsSync(workDir)) mkdirSync(workDir, { recursive: true });

  // The voiceover is already clean (AI TTS, or a decent mic). DeepFilterNet denoise was removed —
  // it added a Python/torch dependency for no benefit on clean input. We transcribe the raw
  // voiceover directly.
  const audioForProcessing = rawVoiceover;

  // Step 1 — Transcribe (pluggable backend: local Whisper or cloud).
  const rawTimestamps: WordTimestamp[] = await transcribeAudio(
    audioForProcessing,
    workDir,
    opts.transcribe
  );

  // Step 2 — Trim to the timestamp-driven keep segments, then remap timestamps to match.
  // Whisper transcribed the untrimmed audio, so word times live on the untrimmed timeline.
  // We cut leading/trailing silence AND long INTERNAL gaps (dead pauses mid-take), then
  // remap every word onto the new shorter timeline so audio + timestamps stay aligned.
  const cleanAudioPath = path.join(outputDir, 'clean_audio.wav');
  const sourceDuration = probeDuration(audioForProcessing);
  const segments = computeKeepSegments(rawTimestamps, sourceDuration);
  const removed = totalRemoved(segments, sourceDuration);
  if (segments.length > 1) {
    console.log(`  Removing ${(segments.length - 1)} internal gap(s) + lead/tail — ${removed.toFixed(2)}s of silence cut`);
  }
  const duration = trimToSegments(audioForProcessing, cleanAudioPath, segments);
  const timestamps = remapTimestamps(rawTimestamps, segments);

  // Write timestamps.json to output dir (now on the clean_audio timeline)
  const tsPath = path.join(outputDir, 'timestamps.json');
  writeFileSync(tsPath, JSON.stringify(timestamps, null, 2), 'utf8');
  console.log(`  Wrote ${timestamps.length} word timestamps (remapped onto trimmed timeline) → ${tsPath}`);

  return { cleanAudioPath, timestamps, duration };
}
