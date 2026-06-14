import { WordTimestamp } from '../../types/specTypes';
import { transcribeLocalWhisper, isLocalWhisperAvailable } from './backends/localWhisper';
import { transcribeCloud, isCloudConfigured } from './backends/cloud';

// Pluggable transcription dispatcher (mirrors tts/index.ts). The product lets the user CHOOSE a
// backend at setup; that choice flows in via opts.backend or the TRANSCRIBE_BACKEND env var:
//   'cloud' → zero-install hosted Whisper (default for non-technical users)
//   'local' → Python openai-whisper (free/offline, advanced users)
//   'auto'  → local if installed, else cloud if a key is set (keeps existing dev machines working)
// DeepFilterNet denoise was removed entirely — AI/clean voiceover needs no denoise step.

export type TranscribeBackend = 'local' | 'cloud' | 'auto';

export interface TranscribeOptions {
  backend?: TranscribeBackend;
  model?: string; // local whisper model name OR cloud model id
}

export async function transcribeAudio(
  audioPath: string,
  outputDir: string,
  opts: TranscribeOptions = {}
): Promise<WordTimestamp[]> {
  const requested: TranscribeBackend =
    opts.backend ?? (process.env.TRANSCRIBE_BACKEND as TranscribeBackend) ?? 'auto';
  const backend = resolveBackend(requested);

  if (backend === 'cloud') {
    return transcribeCloud(audioPath, opts.model);
  }
  return transcribeLocalWhisper(audioPath, outputDir, opts.model);
}

function resolveBackend(requested: TranscribeBackend): 'local' | 'cloud' {
  if (requested === 'local') {
    if (!isLocalWhisperAvailable()) {
      throw new Error(
        'Local transcription selected but Whisper is not installed. Run `pip install openai-whisper`, ' +
        'or switch to the cloud backend (set TRANSCRIBE_BACKEND=cloud and a TRANSCRIBE_API_KEY).'
      );
    }
    return 'local';
  }
  if (requested === 'cloud') {
    if (!isCloudConfigured()) {
      throw new Error(
        'Cloud transcription selected but no API key is set (TRANSCRIBE_API_KEY / GROQ_API_KEY / OPENAI_API_KEY).'
      );
    }
    return 'cloud';
  }
  // auto — prefer the free local path when available, else cloud.
  if (isLocalWhisperAvailable()) return 'local';
  if (isCloudConfigured()) return 'cloud';
  throw new Error(
    'No transcription backend available. Install Whisper (`pip install openai-whisper`) for local, ' +
    'or set TRANSCRIBE_API_KEY and TRANSCRIBE_BACKEND=cloud for the zero-install cloud path.'
  );
}
