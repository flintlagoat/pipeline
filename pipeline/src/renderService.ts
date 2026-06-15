import './config/env'; // load .env if present (on Render, real env vars win)
import express, { Request, Response } from 'express';
import { readFileSync, existsSync } from 'fs';
import * as path from 'path';
import { ChannelSpecSchema } from './types/channelSpec';
import { saveChannelSpec } from './channelSpec';
import { generateScriptForJob, generateVoiceoverForJob, processJob } from './orchestrator';

// ── Inkwell render worker ───────────────────────────────────────────────────────────────────────
// A small HTTP service that runs the FULL pipeline for one video and uploads the result to Supabase
// Storage. Deployed as a Docker service (Render) because the pipeline (canvas + ffmpeg + worker
// threads) can't run in Vercel serverless. The website calls POST /render (Bearer RENDER_SECRET);
// the job runs in the background and updates the `videos` row (queued → rendering → ready/failed).
// Transcription uses the CLOUD backend (TRANSCRIBE_BACKEND=cloud) so the image needs no Python.

const ROOT = path.resolve(__dirname, '..', '..');
const PORT = Number(process.env.PORT) || 8080;
const SECRET = process.env.RENDER_SECRET || '';
const SB_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

function sb(p: string, init?: RequestInit) {
  return fetch(`${SB_URL}${p}`, {
    ...init,
    headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, ...(init?.headers || {}) },
  });
}

async function updateVideo(id: string, fields: Record<string, unknown>): Promise<void> {
  await sb(`/rest/v1/videos?id=eq.${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' },
    body: JSON.stringify({ ...fields, updated_at: new Date().toISOString() }),
  });
}

interface RenderJob {
  videoId: string;
  userId: string;
  channelId: string; // channels.id (uuid) in Supabase
  topic: string;
  minutes?: number;
}

async function runJob(job: RenderJob): Promise<void> {
  const { videoId, userId, channelId, topic } = job;
  try {
    await updateVideo(videoId, { status: 'rendering' });

    // 1) Fetch the saved channel spec from Supabase and materialize it on disk.
    const r = await sb(`/rest/v1/channels?id=eq.${channelId}&select=spec`, { method: 'GET' });
    const rows = (await r.json()) as Array<{ spec: unknown }>;
    if (!rows?.[0]?.spec) throw new Error('channel not found');
    const spec = ChannelSpecSchema.parse(rows[0].spec);
    saveChannelSpec(spec);

    const ch = spec.id;
    const jobId = videoId;
    const minutes = job.minutes || spec.format.minutes || 8;

    // 2) Full pipeline: script → voiceover → audio/spec/assets/render.
    await generateScriptForJob(ch, jobId, topic, minutes);
    await generateVoiceoverForJob(ch, jobId, { voice: spec.audioIdentity.voice });
    await processJob(ch, jobId);

    // 3) Upload the rendered video to Supabase Storage and mark ready.
    const mp4 = path.join(ROOT, 'output', ch, jobId, 'video.mp4');
    if (!existsSync(mp4)) throw new Error('render produced no video.mp4');
    const bytes = readFileSync(mp4);
    const storagePath = `${userId}/${videoId}.mp4`;
    const up = await sb(`/storage/v1/object/videos/${storagePath}`, {
      method: 'POST',
      headers: { 'Content-Type': 'video/mp4', 'x-upsert': 'true' },
      body: new Uint8Array(bytes),
    });
    if (!up.ok) throw new Error(`storage upload failed: ${up.status} ${await up.text().catch(() => '')}`);

    await updateVideo(videoId, { status: 'ready', storage_path: storagePath, error: null });
    console.log(`[render] ${videoId} ready (${storagePath})`);
  } catch (e) {
    console.error(`[render] ${videoId} failed:`, e);
    await updateVideo(videoId, { status: 'failed', error: String((e as Error).message).slice(0, 500) });
  }
}

const app = express();
app.use(express.json());

app.get('/health', (_req: Request, res: Response) => res.json({ ok: true, service: 'inkwell-render' }));

app.post('/render', (req: Request, res: Response) => {
  if (!SECRET || req.headers.authorization !== `Bearer ${SECRET}`) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  const { videoId, userId, channelId, topic, minutes } = req.body || {};
  if (!videoId || !userId || !channelId || !topic) {
    return res.status(400).json({ error: 'videoId, userId, channelId, topic are required' });
  }
  res.status(202).json({ ok: true, accepted: videoId });
  // fire-and-forget: the render runs for minutes; the row is polled by the client for status.
  void runJob({ videoId, userId, channelId, topic, minutes });
});

app.listen(PORT, () => console.log(`Inkwell render worker listening on :${PORT}`));
