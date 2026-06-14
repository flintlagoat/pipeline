// Fish Audio S1 backend (hosted API). Commercial use is covered by Fish's paid plan — we use
// the HOSTED API and never self-host S1/S2 (avoids the Fish Research License commercial
// restriction). API key from FISH_API_KEY. Returns the synthesized audio bytes (mp3); the
// adapter converts to the pipeline's wav.

const FISH_TTS_ENDPOINT = 'https://api.fish.audio/v1/tts';

export function fishApiKey(): string | undefined {
  const k = process.env.FISH_API_KEY || process.env.FISH_AUDIO_API_KEY;
  return k && k.trim() ? k.trim() : undefined;
}

export interface FishOptions {
  voice?: string;     // Fish reference/voice model id (from the playground). Empty = default voice.
  model?: string;     // Fish model: "s1" (default) | "s1-mini" | "speech-1.5"
  format?: 'mp3' | 'wav';
  // ── Voice shaping (all optional; omitted ⇒ Fish defaults) ──
  speed?: number;       // prosody.speed — playback rate (≈0.5–2.0; 1 = normal)
  volume?: number;      // prosody.volume — loudness in dB (≈ -20..+20; 0 = normal)
  temperature?: number; // 0–1 — higher = more varied/expressive delivery
  topP?: number;        // 0–1 — nucleus sampling; higher = more variation
}

const clampNum = (n: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, n));

/** Synthesize `text` via Fish's hosted TTS API. Throws if no key or the request fails. */
export async function fishSynthesize(text: string, opts: FishOptions = {}): Promise<Buffer> {
  const key = fishApiKey();
  if (!key) throw new Error('FISH_API_KEY is not set');

  const model = opts.model && opts.model.trim() ? opts.model.trim() : 's1';
  const format = opts.format || 'mp3';

  const body: Record<string, unknown> = {
    text,
    format,
    normalize: true,
    latency: 'normal',
  };
  if (opts.voice && opts.voice.trim()) body.reference_id = opts.voice.trim();

  // prosody.speed / prosody.volume — only send the keys the operator actually set.
  const prosody: Record<string, number> = {};
  if (typeof opts.speed === 'number' && Number.isFinite(opts.speed)) prosody.speed = clampNum(opts.speed, 0.5, 2.0);
  if (typeof opts.volume === 'number' && Number.isFinite(opts.volume)) prosody.volume = clampNum(opts.volume, -20, 20);
  if (Object.keys(prosody).length) body.prosody = prosody;

  if (typeof opts.temperature === 'number' && Number.isFinite(opts.temperature)) body.temperature = clampNum(opts.temperature, 0, 1);
  if (typeof opts.topP === 'number' && Number.isFinite(opts.topP)) body.top_p = clampNum(opts.topP, 0, 1);

  const resp = await fetch(FISH_TTS_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      model, // Fish selects the TTS model via this header
    },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const detail = await resp.text().catch(() => '');
    throw new Error(`Fish TTS API ${resp.status} ${resp.statusText}${detail ? ` — ${detail.slice(0, 200)}` : ''}`);
  }
  const buf = Buffer.from(await resp.arrayBuffer());
  if (buf.length < 256) throw new Error(`Fish TTS returned suspiciously small audio (${buf.length} bytes)`);
  return buf;
}
