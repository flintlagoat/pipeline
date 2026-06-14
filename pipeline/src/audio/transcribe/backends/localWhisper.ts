import { execSync } from 'child_process';
import { readFileSync, existsSync } from 'fs';
import * as path from 'path';
import { WordTimestamp } from '../../../types/specTypes';

// LOCAL transcription backend — Python `openai-whisper` CLI. Free and fully offline, but requires
// the user to have Python + whisper (+ torch) installed. This is the "advanced / no-cost" option;
// the cloud backend is the zero-install default for non-technical users. See ../index.ts.

interface WhisperWord { word: string; start: number; end: number; }
interface WhisperSegment { words?: WhisperWord[]; }
interface WhisperOutput { segments?: WhisperSegment[]; }

const DEFAULT_MODEL = 'small';

/** True if Python + the whisper module are importable on this machine. */
export function isLocalWhisperAvailable(): boolean {
  try {
    execSync('python -c "import whisper"', { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

export function transcribeLocalWhisper(
  audioPath: string,
  outputDir: string,
  model: string = DEFAULT_MODEL
): WordTimestamp[] {
  console.log(`  [transcribe] local Whisper (model=${model}) — this may take a minute...`);

  execSync(
    `whisper "${audioPath}" --model ${model} --output_format json --word_timestamps True --output_dir "${outputDir}"`,
    { stdio: 'inherit' }
  );

  const base = path.basename(audioPath, path.extname(audioPath));
  const jsonPath = path.join(outputDir, `${base}.json`);
  if (!existsSync(jsonPath)) {
    throw new Error(`Whisper output not found at: ${jsonPath}`);
  }

  const output: WhisperOutput = JSON.parse(readFileSync(jsonPath, 'utf8'));
  const words: WordTimestamp[] = [];
  for (const seg of output.segments ?? []) {
    for (const w of seg.words ?? []) {
      const trimmed = w.word.trim();
      if (trimmed) words.push({ word: trimmed, start: w.start, end: w.end });
    }
  }

  console.log(`  Transcribed ${words.length} words (local)`);
  return words;
}
