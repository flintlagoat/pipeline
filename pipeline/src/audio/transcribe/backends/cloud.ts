import { readFileSync } from 'fs';
import * as path from 'path';
import { WordTimestamp } from '../../../types/specTypes';

// CLOUD transcription backend — any OpenAI-compatible /audio/transcriptions endpoint that returns
// word-level timestamps (Groq whisper-large-v3 by default; OpenAI whisper-1 also works). Zero local
// install — this is the default for non-technical users. Uses global fetch/FormData/Blob (Node 18+),
// same dependency-free approach as the YouTube client. Config via env:
//   TRANSCRIBE_API_KEY  (falls back to GROQ_API_KEY, then OPENAI_API_KEY)
//   TRANSCRIBE_API_URL  (default Groq)         TRANSCRIBE_MODEL (default whisper-large-v3)

const DEFAULT_URL = 'https://api.groq.com/openai/v1/audio/transcriptions';
const DEFAULT_MODEL = 'whisper-large-v3';

interface CloudWord { word?: string; text?: string; start?: number; end?: number; }
interface CloudSegment { words?: CloudWord[]; }
interface CloudResponse { words?: CloudWord[]; segments?: CloudSegment[]; }

export function cloudApiKey(): string | undefined {
  return (
    process.env.TRANSCRIBE_API_KEY ||
    process.env.GROQ_API_KEY ||
    process.env.OPENAI_API_KEY ||
    undefined
  );
}

/** True if a cloud transcription key is configured. */
export function isCloudConfigured(): boolean {
  return !!cloudApiKey();
}

export async function transcribeCloud(
  audioPath: string,
  model?: string
): Promise<WordTimestamp[]> {
  const key = cloudApiKey();
  if (!key) {
    throw new Error(
      'Cloud transcription needs an API key — set TRANSCRIBE_API_KEY (or GROQ_API_KEY / OPENAI_API_KEY).'
    );
  }
  const url = process.env.TRANSCRIBE_API_URL || DEFAULT_URL;
  const mdl = model || process.env.TRANSCRIBE_MODEL || DEFAULT_MODEL;

  console.log(`  [transcribe] cloud (${mdl})...`);

  const buf = readFileSync(audioPath);
  const form = new FormData();
  const blob = new Blob([new Uint8Array(buf)], { type: 'audio/wav' });
  form.append('file', blob, path.basename(audioPath));
  form.append('model', mdl);
  form.append('response_format', 'verbose_json');
  form.append('timestamp_granularities[]', 'word');

  const resp = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}` },
    body: form,
  });

  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    throw new Error(
      `Cloud transcription failed: ${resp.status} ${resp.statusText} ${text.slice(0, 300)}`
    );
  }

  const json = (await resp.json()) as CloudResponse;
  const words: WordTimestamp[] = [];
  const push = (w: CloudWord) => {
    const word = String(w.word ?? w.text ?? '').trim();
    if (word && typeof w.start === 'number' && typeof w.end === 'number') {
      words.push({ word, start: w.start, end: w.end });
    }
  };

  if (Array.isArray(json.words)) {
    json.words.forEach(push);
  } else if (Array.isArray(json.segments)) {
    for (const seg of json.segments) (seg.words ?? []).forEach(push);
  }

  if (words.length === 0) {
    throw new Error(
      'Cloud transcription returned no word timestamps — the provider must support word-level granularity.'
    );
  }

  console.log(`  Transcribed ${words.length} words (cloud)`);
  return words;
}
