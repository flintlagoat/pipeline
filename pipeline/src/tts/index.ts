import { execFileSync } from 'child_process';
import { writeFileSync, rmSync, existsSync } from 'fs';
import * as os from 'os';
import * as path from 'path';
import { fishSynthesize, fishApiKey } from './backends/fish';
import { sapiSynthesize, sapiAvailable } from './backends/sapi';

// Swappable TTS adapter (Phase 0.5, PART 2). DEFAULT backend = Fish Audio S1 (hosted API) when
// FISH_API_KEY is set; otherwise it transparently falls back to the Windows SAPI stand-in and
// prints a clear message. The backend is overridable by config/arg (TTS_BACKEND env, or opts).
// All backends produce the pipeline's canonical voiceover.wav (mono 16-bit PCM via ffmpeg).

export type TtsBackendId = 'fish' | 'sapi';

export interface TtsOptions {
  backend?: TtsBackendId;   // explicit override; default resolves from env/availability
  voice?: string;           // backend voice id (Fish reference_id); from channel audioIdentity.voice
  model?: string;           // Fish model: "s1" (default) | "s1-mini" | "speech-1.5"
  speed?: number;           // playback rate (Fish prosody.speed); 1 = normal
  volume?: number;          // loudness dB (Fish prosody.volume); 0 = normal
  temperature?: number;     // 0–1 expressiveness (Fish temperature)
  topP?: number;            // 0–1 variation (Fish top_p)
}

export interface TtsResult {
  wavPath: string;
  backendUsed: TtsBackendId;
  requestedBackend: TtsBackendId;
  fellBack: boolean;
  note?: string;
}

/** Which backend will run, given an optional explicit choice, env, and availability. */
export function resolveBackend(explicit?: TtsBackendId): TtsBackendId {
  const choice = explicit || (process.env.TTS_BACKEND as TtsBackendId | undefined) || 'fish';
  return choice === 'sapi' ? 'sapi' : 'fish';
}

function toCanonicalWav(srcPath: string, outWavPath: string): void {
  // Mono 16-bit PCM @ 48k — matches what the rest of the pipeline expects.
  execFileSync('ffmpeg', ['-y', '-i', srcPath, '-vn', '-ac', '1', '-ar', '48000', '-acodec', 'pcm_s16le', outWavPath], { stdio: 'ignore' });
  if (!existsSync(outWavPath)) throw new Error(`TTS produced no output at ${outWavPath}`);
}

/**
 * Synthesize `text` → `outWavPath`. Resolves the backend (default Fish S1), falling back to the
 * SAPI stand-in with a clear message if Fish is unavailable (no key) or fails. Throws only if no
 * backend can run at all.
 */
export async function synthesizeVoiceover(
  text: string,
  outWavPath: string,
  opts: TtsOptions = {}
): Promise<TtsResult> {
  if (!text.trim()) throw new Error('TTS needs non-empty text.');
  const requested = resolveBackend(opts.backend);
  let fellBack = false;
  let note: string | undefined;

  // Fish path (default).
  if (requested === 'fish') {
    if (fishApiKey()) {
      try {
        const mp3 = await fishSynthesize(text, {
          voice: opts.voice, format: 'mp3', model: opts.model,
          speed: opts.speed, volume: opts.volume, temperature: opts.temperature, topP: opts.topP,
        });
        const tmp = path.join(os.tmpdir(), `fish_${Date.now()}.mp3`);
        writeFileSync(tmp, mp3);
        try { toCanonicalWav(tmp, outWavPath); } finally { rmSync(tmp, { force: true }); }
        return { wavPath: outWavPath, backendUsed: 'fish', requestedBackend: 'fish', fellBack: false };
      } catch (e) {
        note = `Fish S1 failed (${(e as Error).message}); falling back to the SAPI stand-in.`;
        console.warn(`  [tts] ${note}`);
        fellBack = true;
      }
    } else {
      note = 'FISH_API_KEY not set — using the SAPI stand-in. Set FISH_API_KEY to use Fish S1.';
      console.warn(`  [tts] ${note}`);
      fellBack = true;
    }
  }

  // SAPI stand-in (explicit, or fallback).
  if (!sapiAvailable()) {
    throw new Error(
      (note ? note + ' ' : '') +
      'SAPI stand-in is Windows-only and unavailable here. Set FISH_API_KEY (Fish S1) or run on Windows.'
    );
  }
  const tmpWav = path.join(os.tmpdir(), `sapi_${Date.now()}.wav`);
  try {
    sapiSynthesize(text, tmpWav);
    toCanonicalWav(tmpWav, outWavPath);
  } finally {
    rmSync(tmpWav, { force: true });
  }
  return { wavPath: outWavPath, backendUsed: 'sapi', requestedBackend: requested, fellBack, note };
}
