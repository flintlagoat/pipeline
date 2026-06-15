import './config/env'; // load .env into process.env FIRST, before anything reads a key
import express, { Request, Response } from 'express';
import cors from 'cors';
import multer from 'multer';
import * as path from 'path';
import * as fs from 'fs';
import { spawn, ChildProcess, execFileSync } from 'child_process';
import { generateScriptForJob, generateVoiceoverForJob } from './orchestrator';
import { generateThumbnailForJob, listThumbnailVariants, setPrimaryVariant, VARIANT_FILES } from './thumbnailGenerator';
import { listMusicStems } from './audio/music';
import { AudioConfig } from './types/specTypes';
import { generateChannelSpec } from './channelGenerator';
import { saveChannelSpec, loadChannelSpec, channelSpecExists, toChannelConfig } from './channelSpec';
import { generateChannelPreview } from './channelPreview';
import { ChannelSpecSchema } from './types/channelSpec';
import { resolveBackend, TtsBackendId, TtsOptions } from './tts';
import { fishApiKey } from './tts/backends/fish';
import { sapiAvailable } from './tts/backends/sapi';
import { generateIdeas } from './autopilot/ideas';
import { publishJob } from './publish';
import { buildVideoMetadata, readPublishOverride } from './publish/metadata';
import { hasAuth } from './publish/youtubeClient';
import { loadSchedule, saveSchedule, ScheduleConfig } from './publish/schedule';
import { quotaSummary } from './publish/quota';
import { pullAnalytics } from './analytics/pull';
import { analyzeChannel } from './analytics/analyze';
import { loadLearnings } from './analytics/learnings';

// Local web UI server (Issue 8). Thin wrapper around the EXISTING pipeline: it drives the
// very same orchestrator the CLI uses by spawning `cli.ts process <channel> <job>` as a
// child process and streaming its stdout/stderr to the browser over SSE — no pipeline logic
// is duplicated here. Also serves the built React UI and a few read endpoints (channels,
// jobs, assets, video).

const ROOT = path.resolve(__dirname, '..', '..');     // project root
const PIPELINE_DIR = path.resolve(__dirname, '..');   // pipeline/
const UI_DIST = path.join(ROOT, 'ui', 'dist');
const PORT = Number(process.env.UI_PORT) || 5050;

const app = express();
app.use(cors());
app.use(express.json());

// ── path helpers (mirror orchestrator.ts) ──
const channelsDir = () => path.join(ROOT, 'channels');
const jobDir = (c: string, j: string) => path.join(ROOT, 'jobs', c, j);
const outputDir = (c: string, j: string) => path.join(ROOT, 'output', c, j);
const svgDir = (c: string) => path.join(ROOT, 'channels', c, 'assets', 'svg');
const safe = (s: string) => /^[A-Za-z0-9._-]+$/.test(s);

function readStatus(c: string, j: string): { status: string; error: string | null } | null {
  const p = path.join(outputDir(c, j), 'status.json');
  if (!fs.existsSync(p)) return null;
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; }
}

// ── live run registry (one in-flight pipeline per job) ──
interface RunState {
  proc: ChildProcess | null;
  lines: string[];
  clients: Set<Response>;
  running: boolean;
  exitCode: number | null;
  lastStatus: string | null;
}
const runs = new Map<string, RunState>();
const keyOf = (c: string, j: string) => `${c}/${j}`;
const MAX_LINES = 4000;

function getRun(c: string, j: string): RunState {
  const k = keyOf(c, j);
  let r = runs.get(k);
  if (!r) { r = { proc: null, lines: [], clients: new Set(), running: false, exitCode: null, lastStatus: null }; runs.set(k, r); }
  return r;
}

function broadcast(r: RunState, event: string, data: unknown): void {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of r.clients) res.write(payload);
}

function pushLines(r: RunState, chunk: string): void {
  // Split on CR as well as LF: the renderer reports frame progress with `\r` (no newline),
  // so each "Frame X/Y" update becomes its own line the UI can parse for a progress bar.
  const parts = chunk.split(/[\r\n]+/);
  for (const line of parts) {
    if (line.length === 0) continue;
    r.lines.push(line);
    if (r.lines.length > MAX_LINES) r.lines.shift();
    broadcast(r, 'log', { line });
  }
}

function emitStatusIfChanged(c: string, j: string, r: RunState): void {
  const s = readStatus(c, j);
  if (s && s.status !== r.lastStatus) {
    r.lastStatus = s.status;
    broadcast(r, 'status', { status: s.status, error: s.error });
  }
}

// Merge a patch into a job's options.json (preserves untouched keys like audio/voice).
function patchJobOptions(c: string, j: string, patch: Record<string, unknown>): void {
  const dir = jobDir(c, j);
  fs.mkdirSync(dir, { recursive: true });
  const p = path.join(dir, 'options.json');
  let existing: Record<string, unknown> = {};
  try { if (fs.existsSync(p)) existing = JSON.parse(fs.readFileSync(p, 'utf8')); } catch { /* ignore */ }
  fs.writeFileSync(p, JSON.stringify({ ...existing, ...patch }, null, 2), 'utf8');
}

// ── Job run + in-process queue/scheduler ───────────────────────────────────────
// ONE render at a time across the whole studio (a render saturates every core via worker
// threads, so concurrent renders would just thrash). A persistent queue (jobs/_queue.json) holds
// waiting/scheduled items; a timer drains it — scheduled items fire at/after their runAt, the rest
// run FIFO. The manual "Run pipeline" button uses the same path (it enqueues an immediate item).
// autoPublish items are uploaded (scheduled to the channel cadence) when their render finishes.
// The scheduler only runs while this server process is alive (it cannot render while the PC is off).

const QUEUE_PATH = path.join(ROOT, 'jobs', '_queue.json');
type QueueStatus = 'waiting' | 'running' | 'done' | 'failed';
interface QueueItem {
  id: string;
  channel: string;
  job: string;
  runAt: string | null;   // ISO; null = as soon as possible
  draft: boolean;
  autoPublish: boolean;
  status: QueueStatus;
  addedAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  error: string | null;
}

function loadQueue(): QueueItem[] {
  try {
    if (fs.existsSync(QUEUE_PATH)) {
      const items = JSON.parse(fs.readFileSync(QUEUE_PATH, 'utf8')) as QueueItem[];
      // An item left 'running' from a prior server process never finished — requeue it.
      for (const it of items) if (it.status === 'running') { it.status = 'waiting'; it.startedAt = null; }
      return items;
    }
  } catch { /* fall through */ }
  return [];
}

let queue: QueueItem[] = loadQueue();
let activeKey: string | null = null;

function saveQueue(): void {
  try {
    fs.mkdirSync(path.dirname(QUEUE_PATH), { recursive: true });
    fs.writeFileSync(QUEUE_PATH, JSON.stringify(queue, null, 2), 'utf8');
  } catch { /* best-effort */ }
}

function broadcastQueue(): void {
  const payload = `event: queue\ndata: ${JSON.stringify({ active: activeKey, items: queue })}\n\n`;
  for (const r of runs.values()) for (const res of r.clients) res.write(payload);
}

// Spawn the pipeline for one job (same entrypoint as the CLI), streaming to the job's SSE clients.
function spawnJob(cid: string, jid: string, draft: boolean, onExit: (code: number) => void): void {
  const r = getRun(cid, jid);
  r.lines = [];
  r.running = true;
  r.exitCode = null;
  r.lastStatus = null;
  broadcast(r, 'started', { at: new Date().toISOString() });

  const args = ['ts-node', 'src/cli.ts', 'process', cid, jid];
  if (draft) args.push('--draft');
  const proc = spawn('npx', args, { cwd: PIPELINE_DIR, env: process.env, shell: true });
  r.proc = proc;

  const onData = (buf: Buffer) => { pushLines(r, buf.toString()); emitStatusIfChanged(cid, jid, r); };
  proc.stdout?.on('data', onData);
  proc.stderr?.on('data', onData);
  proc.on('exit', (code) => {
    r.running = false;
    r.exitCode = code ?? -1;
    r.proc = null;
    emitStatusIfChanged(cid, jid, r);
    const st = readStatus(cid, jid);
    broadcast(r, 'done', { exitCode: code, status: st?.status ?? null, error: st?.error ?? null });
    onExit(code ?? -1);
  });
}

function beginRun(item: QueueItem): void {
  activeKey = keyOf(item.channel, item.job);
  item.status = 'running';
  item.startedAt = new Date().toISOString();
  saveQueue();
  broadcastQueue();

  spawnJob(item.channel, item.job, item.draft, async (code) => {
    item.status = code === 0 ? 'done' : 'failed';
    item.finishedAt = new Date().toISOString();
    if (code !== 0) item.error = readStatus(item.channel, item.job)?.error ?? `exit ${code}`;
    activeKey = null;

    // autoPublish: upload + schedule to the channel cadence once the render succeeds.
    if (code === 0 && item.autoPublish) {
      const r = getRun(item.channel, item.job);
      try {
        const result = await publishJob(item.channel, item.job, { schedule: true });
        pushLines(r, `[auto-publish] ${result.message}${result.videoUrl ? ` — ${result.videoUrl}` : ''}`);
      } catch (e) {
        pushLines(r, `[auto-publish] failed: ${(e as Error).message}`);
      }
    }

    saveQueue();
    broadcastQueue();
    tryStartNext();
  });
}

function tryStartNext(): void {
  if (activeKey) return;
  const now = Date.now();
  const due = queue
    .filter((it) => it.status === 'waiting' && (it.runAt === null || new Date(it.runAt).getTime() <= now))
    .sort((a, b) => {
      const ta = a.runAt ? new Date(a.runAt).getTime() : 0;
      const tb = b.runAt ? new Date(b.runAt).getTime() : 0;
      return ta - tb || new Date(a.addedAt).getTime() - new Date(b.addedAt).getTime();
    });
  if (due.length) beginRun(due[0]);
}

function enqueue(
  channel: string,
  job: string,
  opts: { runAt?: string | null; draft?: boolean; autoPublish?: boolean }
): QueueItem {
  const item: QueueItem = {
    id: `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
    channel, job,
    runAt: opts.runAt ?? null,
    draft: !!opts.draft,
    autoPublish: !!opts.autoPublish,
    status: 'waiting',
    addedAt: new Date().toISOString(),
    startedAt: null, finishedAt: null, error: null,
  };
  queue.push(item);
  saveQueue();
  broadcastQueue();
  return item;
}

const alreadyQueuedOrRunning = (c: string, j: string): boolean =>
  activeKey === keyOf(c, j) || queue.some((it) => it.channel === c && it.job === j && (it.status === 'waiting' || it.status === 'running'));

// Drain the queue on a timer (scheduled items fire when due; FIFO otherwise).
setInterval(tryStartNext, 4000);

// ── API ────────────────────────────────────────────────────────────────────────

app.get('/api/channels', (_req: Request, res: Response) => {
  const dir = channelsDir();
  if (!fs.existsSync(dir)) return res.json([]);
  const channels = fs.readdirSync(dir).filter((d) => fs.statSync(path.join(dir, d)).isDirectory());
  res.json(channels.map((id) => {
    // Include a light summary (archetype + key palette) for the UI when a spec exists.
    try {
      const s = loadChannelSpec(id);
      return { id, title: s.title, archetype: s.archetype, background: s.palette.background, accent1: s.palette.accent1 };
    } catch {
      return { id };
    }
  }));
});

// Full ChannelSpec for a channel (palette swatches, fonts, archetype, voice, etc.).
app.get('/api/channels/:cid/spec', (req: Request, res: Response) => {
  const { cid } = req.params;
  if (!safe(cid)) return res.status(400).json({ error: 'bad channel' });
  try {
    res.json(loadChannelSpec(cid));
  } catch (e) {
    res.status(404).json({ error: (e as Error).message });
  }
});

// Generate a ChannelSpec from title + description (PART 1d). Does NOT save — returns it for an
// editable preview; the UI then POSTs to /api/channels/save.
app.post('/api/channels/generate', async (req: Request, res: Response) => {
  const title = String(req.body?.title ?? '').trim();
  const description = String(req.body?.description ?? '').trim();
  if (!title || !description) return res.status(400).json({ error: 'title and description are required' });
  try {
    const spec = await generateChannelSpec(title, description, {
      niche: req.body?.niche, audience: req.body?.audience, tone: req.body?.tone, save: false,
    });
    res.json({ ok: true, spec });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

// Save a (possibly edited) ChannelSpec → creates the channel.
app.post('/api/channels/save', (req: Request, res: Response) => {
  const parsed = ChannelSpecSchema.safeParse(req.body?.spec);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues.slice(0, 6).map((i) => `${i.path.join('.')}: ${i.message}`).join('; ') });
  }
  const spec = parsed.data;
  if (channelSpecExists(spec.id)) return res.status(409).json({ error: `Channel "${spec.id}" already exists.` });
  try {
    saveChannelSpec(spec);
    res.json({ ok: true, id: spec.id });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

// Render a few still preview frames of a (draft) channel's LOOK — no save, no audio, no API. Returns
// the frames as base64 data URLs so an UNSAVED draft can be previewed in the browser before saving.
app.post('/api/channels/preview', (req: Request, res: Response) => {
  const parsed = ChannelSpecSchema.safeParse(req.body?.spec);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues.slice(0, 6).map((i) => `${i.path.join('.')}: ${i.message}`).join('; ') });
  }
  try {
    const outDir = path.join(ROOT, 'output', '_preview_tmp', parsed.data.id);
    const pngs = generateChannelPreview(parsed.data, outDir);
    const images = pngs.map((p) => 'data:image/png;base64,' + fs.readFileSync(p).toString('base64'));
    res.json({ ok: true, images });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

// Update an EXISTING channel's spec (the editor). Overwrites channel.spec.json + config.json.
app.post('/api/channels/:cid/spec', (req: Request, res: Response) => {
  const { cid } = req.params;
  if (!safe(cid)) return res.status(400).json({ error: 'bad channel' });
  const parsed = ChannelSpecSchema.safeParse(req.body?.spec);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues.slice(0, 6).map((i) => `${i.path.join('.')}: ${i.message}`).join('; ') });
  }
  if (parsed.data.id !== cid) return res.status(400).json({ error: `spec id "${parsed.data.id}" doesn't match channel "${cid}"` });
  try {
    saveChannelSpec(parsed.data);
    res.json({ ok: true, id: parsed.data.id });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

// Generate a batch of video ideas (title + summary + rundown) for the operator to pick from.
app.post('/api/channels/:cid/ideas', async (req: Request, res: Response) => {
  const { cid } = req.params;
  if (!safe(cid)) return res.status(400).json({ error: 'bad channel' });
  const count = Number(req.body?.count);
  try {
    const cfg = toChannelConfig(loadChannelSpec(cid));
    const ideas = await generateIdeas(cid, cfg, Number.isFinite(count) ? count : 5);
    res.json({ ok: true, ideas });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

// TTS backend status for the UI (which backend will run, and whether Fish is configured).
app.get('/api/tts/status', (_req: Request, res: Response) => {
  const active = resolveBackend();
  res.json({ active, fishConfigured: !!fishApiKey(), sapiAvailable: sapiAvailable() });
});

app.get('/api/channels/:cid/jobs', (req: Request, res: Response) => {
  const { cid } = req.params;
  if (!safe(cid)) return res.status(400).json({ error: 'bad channel' });
  const seen = new Set<string>();
  for (const base of [path.join(ROOT, 'jobs', cid), path.join(ROOT, 'output', cid)]) {
    if (fs.existsSync(base)) for (const j of fs.readdirSync(base)) {
      if (fs.statSync(path.join(base, j)).isDirectory()) seen.add(j);
    }
  }
  const jobs = [...seen].sort().map((jobId) => {
    const st = readStatus(cid, jobId);
    const k = keyOf(cid, jobId);
    return {
      jobId,
      status: runs.get(k)?.running ? (st?.status ?? 'processing') : (st?.status ?? 'new'),
      running: !!runs.get(k)?.running,
      hasAudio: fs.existsSync(path.join(jobDir(cid, jobId), 'voiceover.wav')),
      hasScript: fs.existsSync(path.join(jobDir(cid, jobId), 'script.txt')),
      hasVideo: fs.existsSync(path.join(outputDir(cid, jobId), 'video.mp4')),
    };
  });
  res.json(jobs);
});

app.post('/api/channels/:cid/jobs', (req: Request, res: Response) => {
  const { cid } = req.params;
  const jobId = String(req.body?.jobId ?? '').trim();
  if (!safe(cid) || !safe(jobId)) return res.status(400).json({ error: 'jobId must be letters, numbers, . _ -' });
  fs.mkdirSync(jobDir(cid, jobId), { recursive: true });
  res.json({ ok: true, jobId });
});

// Save inputs: multipart audio file (field "audio") + script text (field "script") and/or a
// "scriptFile" upload.
const upload = multer({ dest: path.join(ROOT, 'jobs', '_tmp_uploads') });
app.post(
  '/api/channels/:cid/jobs/:jid/inputs',
  upload.fields([{ name: 'audio', maxCount: 1 }, { name: 'scriptFile', maxCount: 1 }]),
  (req: Request, res: Response) => {
    const { cid, jid } = req.params;
    if (!safe(cid) || !safe(jid)) return res.status(400).json({ error: 'bad ids' });
    const dir = jobDir(cid, jid);
    fs.mkdirSync(dir, { recursive: true });
    const files = req.files as Record<string, Express.Multer.File[]> | undefined;

    // The uploaded media may be a recorded MP4 (or any audio/video). Extract/transcode its
    // audio track to voiceover.wav with ffmpeg so the existing Whisper + audio pipeline gets a
    // clean PCM WAV regardless of the source container/codec.
    const audio = files?.audio?.[0];
    if (audio) {
      const outWav = path.join(dir, 'voiceover.wav');
      try {
        execFileSync('ffmpeg', ['-y', '-i', audio.path, '-vn', '-ac', '1', '-acodec', 'pcm_s16le', outWav], { stdio: 'ignore' });
      } catch {
        fs.rmSync(audio.path, { force: true });
        return res.status(400).json({ error: 'could not extract audio from the uploaded file (ffmpeg failed)' });
      }
      fs.rmSync(audio.path, { force: true });
    }

    const scriptFile = files?.scriptFile?.[0];
    if (scriptFile) {
      fs.copyFileSync(scriptFile.path, path.join(dir, 'script.txt'));
      fs.rmSync(scriptFile.path, { force: true });
    } else if (typeof req.body?.script === 'string' && req.body.script.trim().length > 0) {
      fs.writeFileSync(path.join(dir, 'script.txt'), req.body.script, 'utf8');
    }

    res.json({
      ok: true,
      hasAudio: fs.existsSync(path.join(dir, 'voiceover.wav')),
      hasScript: fs.existsSync(path.join(dir, 'script.txt')),
    });
  }
);

// Run a job now. Needs only a script (the voiceover is auto-generated by the pipeline if absent).
// Goes through the same single-render queue: starts immediately if idle, otherwise waits its turn.
app.post('/api/channels/:cid/jobs/:jid/process', (req: Request, res: Response) => {
  const { cid, jid } = req.params;
  if (!safe(cid) || !safe(jid)) return res.status(400).json({ error: 'bad ids' });
  const hasScript = fs.existsSync(path.join(jobDir(cid, jid), 'script.txt'));
  const hasAudio = fs.existsSync(path.join(jobDir(cid, jid), 'voiceover.wav'));
  if (!hasScript && !hasAudio) return res.status(400).json({ error: 'job needs a script.txt or a recorded voiceover.wav' });
  if (alreadyQueuedOrRunning(cid, jid)) return res.status(409).json({ error: 'job already running or queued' });

  const item = enqueue(cid, jid, { runAt: null, draft: !!req.body?.draft, autoPublish: !!req.body?.autoPublish });
  tryStartNext();
  res.json({ ok: true, queued: true, startedNow: activeKey === keyOf(cid, jid), item });
});

// SSE stream: replays buffered log + current status, then live events.
app.get('/api/channels/:cid/jobs/:jid/events', (req: Request, res: Response) => {
  const { cid, jid } = req.params;
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  const r = getRun(cid, jid);
  r.clients.add(res);
  for (const line of r.lines) res.write(`event: log\ndata: ${JSON.stringify({ line })}\n\n`);
  const st = readStatus(cid, jid);
  res.write(`event: status\ndata: ${JSON.stringify({ status: r.running ? (st?.status ?? 'processing') : (st?.status ?? 'idle'), running: r.running })}\n\n`);

  const heartbeat = setInterval(() => res.write(': ping\n\n'), 15000);
  req.on('close', () => { clearInterval(heartbeat); r.clients.delete(res); });
});

app.get('/api/channels/:cid/jobs/:jid/status', (req: Request, res: Response) => {
  const { cid, jid } = req.params;
  res.json(readStatus(cid, jid) ?? { status: 'new', error: null });
});

app.get('/api/channels/:cid/jobs/:jid/video', (req: Request, res: Response) => {
  const { cid, jid } = req.params;
  if (!safe(cid) || !safe(jid)) return res.status(400).end();
  const p = path.join(outputDir(cid, jid), 'video.mp4');
  if (!fs.existsSync(p)) return res.status(404).json({ error: 'no video yet' });
  if (req.query.download) res.setHeader('Content-Disposition', `attachment; filename="${cid}_${jid}.mp4"`);
  res.sendFile(p); // sendFile supports range requests for inline <video> seeking
});

// Job meta (topic, packaging, scriptArc) — so the UI can show the designed title/thumbnail/hook.
app.get('/api/channels/:cid/jobs/:jid/meta', (req: Request, res: Response) => {
  const { cid, jid } = req.params;
  if (!safe(cid) || !safe(jid)) return res.status(400).end();
  const p = path.join(jobDir(cid, jid), 'meta.json');
  if (!fs.existsSync(p)) return res.json({});
  try { res.json(JSON.parse(fs.readFileSync(p, 'utf8'))); }
  catch { res.json({}); }
});

// Serve a thumbnail image (primary thumbnail.png, or a ?variant=thumbnail_v2.png A/B variant).
app.get('/api/channels/:cid/jobs/:jid/thumbnail', (req: Request, res: Response) => {
  const { cid, jid } = req.params;
  if (!safe(cid) || !safe(jid)) return res.status(400).end();
  const variant = String(req.query.variant ?? 'thumbnail.png');
  const file = VARIANT_FILES.includes(variant) ? variant : 'thumbnail.png';
  const p = path.join(outputDir(cid, jid), file);
  if (!fs.existsSync(p)) return res.status(404).json({ error: 'no thumbnail yet' });
  res.setHeader('Content-Type', 'image/png');
  res.setHeader('Cache-Control', 'no-cache'); // it can be regenerated in place
  res.sendFile(p);
});

// List which thumbnail variants exist (for the A/B gallery).
app.get('/api/channels/:cid/jobs/:jid/thumbnails', (req: Request, res: Response) => {
  const { cid, jid } = req.params;
  if (!safe(cid) || !safe(jid)) return res.status(400).end();
  res.json({ variants: listThumbnailVariants(cid, jid) });
});

// (Re)generate the thumbnail(s) from the job's package (in-process; fast, no API call).
app.post('/api/channels/:cid/jobs/:jid/thumbnail', (req: Request, res: Response) => {
  const { cid, jid } = req.params;
  if (!safe(cid) || !safe(jid)) return res.status(400).json({ error: 'bad ids' });
  try {
    generateThumbnailForJob(cid, jid);
    res.json({ ok: true, variants: listThumbnailVariants(cid, jid) });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

// Promote a chosen variant to the primary thumbnail used at upload.
app.post('/api/channels/:cid/jobs/:jid/thumbnail/primary', (req: Request, res: Response) => {
  const { cid, jid } = req.params;
  if (!safe(cid) || !safe(jid)) return res.status(400).json({ error: 'bad ids' });
  const variant = String(req.body?.variant ?? '');
  try {
    setPrimaryVariant(cid, jid, variant);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

app.get('/api/channels/:cid/assets', (req: Request, res: Response) => {
  const { cid } = req.params;
  if (!safe(cid)) return res.status(400).end();
  const dir = svgDir(cid);
  if (!fs.existsSync(dir)) return res.json([]);
  res.json(fs.readdirSync(dir).filter((f) => f.endsWith('.svg')).map((f) => f.replace(/\.svg$/, '')));
});

app.get('/api/channels/:cid/assets/:name', (req: Request, res: Response) => {
  const { cid, name } = req.params;
  const base = name.replace(/\.svg$/, '');
  if (!safe(cid) || !safe(base)) return res.status(400).end();
  const p = path.join(svgDir(cid), `${base}.svg`);
  if (!fs.existsSync(p)) return res.status(404).end();
  res.setHeader('Content-Type', 'image/svg+xml');
  res.send(fs.readFileSync(p, 'utf8'));
});

// ── Phase 0: generate a script for a job (in-process; needs ANTHROPIC_API_KEY) ──
app.post('/api/channels/:cid/jobs/:jid/script', async (req: Request, res: Response) => {
  const { cid, jid } = req.params;
  if (!safe(cid) || !safe(jid)) return res.status(400).json({ error: 'bad ids' });
  const topic = String(req.body?.topic ?? '').trim();
  const minutes = Number(req.body?.minutes);
  if (!topic) return res.status(400).json({ error: 'topic is required' });
  if (!Number.isFinite(minutes) || minutes <= 0) return res.status(400).json({ error: 'minutes must be > 0' });
  // Optional full video package (rides along from the ideas endpoint). When absent,
  // generateScriptForJob designs one for the topic itself (packaging-first, session 6).
  const packaging = req.body?.packaging && typeof req.body.packaging === 'object' && req.body.packaging.title
    ? req.body.packaging
    : undefined;
  try {
    const { script, wordCount, targetWords } = await generateScriptForJob(cid, jid, topic, minutes, packaging);
    res.json({ ok: true, script, wordCount, targetWords });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

// Existing script text (so the UI can show it after reload).
app.get('/api/channels/:cid/jobs/:jid/script', (req: Request, res: Response) => {
  const { cid, jid } = req.params;
  if (!safe(cid) || !safe(jid)) return res.status(400).end();
  const p = path.join(jobDir(cid, jid), 'script.txt');
  if (!fs.existsSync(p)) return res.json({ script: '' });
  res.json({ script: fs.readFileSync(p, 'utf8') });
});

// Available background-music beds for the picker ("none"/"auto" added by the UI).
app.get('/api/music', (_req: Request, res: Response) => {
  res.json(listMusicStems(path.join(ROOT, 'assets', 'music')));
});

// Generate the job's voiceover.wav from its script via the TTS adapter (default Fish S1, SAPI
// stand-in fallback). Lets the operator produce audio without recording.
app.post('/api/channels/:cid/jobs/:jid/voiceover', async (req: Request, res: Response) => {
  const { cid, jid } = req.params;
  if (!safe(cid) || !safe(jid)) return res.status(400).json({ error: 'bad ids' });
  const v = parseVoiceOpts(req.body ?? {});
  // Persist the voice settings so a later Run (auto-voiceover) reuses them.
  if (Object.keys(v).length) patchJobOptions(cid, jid, { voice: v });
  try {
    const result = await generateVoiceoverForJob(cid, jid, v);
    res.json({ ok: true, ...result });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

// Pull a clean TtsOptions object from a request body (only the keys the operator set).
function parseVoiceOpts(b: Record<string, unknown>): TtsOptions {
  const v: TtsOptions = {};
  if (b.backend === 'fish' || b.backend === 'sapi') v.backend = b.backend;
  if (typeof b.voice === 'string' && b.voice.trim()) v.voice = b.voice.trim();
  if (typeof b.model === 'string' && b.model.trim()) v.model = b.model.trim();
  for (const k of ['speed', 'volume', 'temperature', 'topP'] as const) {
    const n = Number(b[k]);
    if (b[k] !== undefined && b[k] !== '' && Number.isFinite(n)) v[k] = n;
  }
  return v;
}

// Save per-job audio options (music track, SFX intensity/on-off) → options.json, which the
// orchestrator reads and merges over the channel audio config when processing.
app.post('/api/channels/:cid/jobs/:jid/options', (req: Request, res: Response) => {
  const { cid, jid } = req.params;
  if (!safe(cid) || !safe(jid)) return res.status(400).json({ error: 'bad ids' });
  const body = (req.body ?? {}) as { audio?: AudioConfig; voice?: Record<string, unknown> };
  const patch: Record<string, unknown> = {};
  patch.audio = body.audio ?? {};
  if (body.voice !== undefined) patch.voice = parseVoiceOpts(body.voice);
  patchJobOptions(cid, jid, patch);
  res.json({ ok: true });
});

// ── Part 1: YouTube publishing ──────────────────────────────────────────────

// Per-channel publish status: is the channel authorized, and what's the schedule + quota.
app.get('/api/channels/:cid/publish/status', (req: Request, res: Response) => {
  const { cid } = req.params;
  if (!safe(cid)) return res.status(400).json({ error: 'bad channel' });
  res.json({ authorized: hasAuth(cid), schedule: loadSchedule(cid), quota: quotaSummary() });
});

// Save the per-channel schedule.json (cadence, autoPublish, privacy, category, tags).
app.post('/api/channels/:cid/schedule', (req: Request, res: Response) => {
  const { cid } = req.params;
  if (!safe(cid)) return res.status(400).json({ error: 'bad channel' });
  try {
    const current = loadSchedule(cid);
    const next: ScheduleConfig = { ...current, ...(req.body ?? {}) };
    saveSchedule(cid, next);
    res.json({ ok: true, schedule: next });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

// Upload a rendered job to YouTube. Default = private/scheduled (confirmation gate). Body
// { schedule?: boolean } forces scheduling regardless of the channel autoPublish flag. When the
// channel has no OAuth token, this returns a dry-run plan instead of touching YouTube.
app.post('/api/channels/:cid/jobs/:jid/publish', async (req: Request, res: Response) => {
  const { cid, jid } = req.params;
  if (!safe(cid) || !safe(jid)) return res.status(400).json({ error: 'bad ids' });
  try {
    const result = await publishJob(cid, jid, { schedule: !!req.body?.schedule });
    res.json({ ok: true, ...result });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

// Per-job publish metadata (title, description, tags, category, privacy, explicit publishAt).
// GET returns the effective values (overrides applied over the channel defaults). POST writes the
// per-job publish.json that publishJob reads.
app.get('/api/channels/:cid/jobs/:jid/publish-meta', (req: Request, res: Response) => {
  const { cid, jid } = req.params;
  if (!safe(cid) || !safe(jid)) return res.status(400).json({ error: 'bad ids' });
  const schedule = loadSchedule(cid);
  const meta = buildVideoMetadata(cid, jid, schedule);
  const override = readPublishOverride(cid, jid);
  res.json({
    title: meta.title,
    description: meta.description,
    tags: meta.tags,
    categoryId: meta.categoryId,
    privacyStatus: override.privacyStatus ?? schedule.privacyStatus,
    publishAt: override.publishAt ?? '',
  });
});

app.post('/api/channels/:cid/jobs/:jid/publish-meta', (req: Request, res: Response) => {
  const { cid, jid } = req.params;
  if (!safe(cid) || !safe(jid)) return res.status(400).json({ error: 'bad ids' });
  const b = (req.body ?? {}) as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  if (typeof b.title === 'string') out.title = b.title.slice(0, 100);
  if (typeof b.description === 'string') out.description = b.description.slice(0, 4900);
  if (Array.isArray(b.tags)) out.tags = (b.tags as unknown[]).map(String).filter(Boolean).slice(0, 40);
  if (typeof b.categoryId === 'string' && b.categoryId.trim()) out.categoryId = b.categoryId.trim();
  if (b.privacyStatus === 'private' || b.privacyStatus === 'unlisted' || b.privacyStatus === 'public') out.privacyStatus = b.privacyStatus;
  if (typeof b.publishAt === 'string' && b.publishAt.trim()) {
    const d = new Date(b.publishAt);
    if (!isNaN(d.getTime())) out.publishAt = d.toISOString();
  }
  const dir = jobDir(cid, jid);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'publish.json'), JSON.stringify(out, null, 2), 'utf8');
  res.json({ ok: true, publish: out });
});

// ── Queue / scheduler ────────────────────────────────────────────────────────
app.get('/api/queue', (_req: Request, res: Response) => {
  res.json({ active: activeKey, items: queue });
});

app.post('/api/queue', (req: Request, res: Response) => {
  const b = (req.body ?? {}) as { channel?: string; job?: string; runAt?: string; draft?: boolean; autoPublish?: boolean };
  const channel = String(b.channel ?? '');
  const job = String(b.job ?? '');
  if (!safe(channel) || !safe(job)) return res.status(400).json({ error: 'bad channel/job' });
  if (!fs.existsSync(path.join(jobDir(channel, job), 'script.txt')) && !fs.existsSync(path.join(jobDir(channel, job), 'voiceover.wav'))) {
    return res.status(400).json({ error: 'job needs a script.txt or voiceover.wav before queueing' });
  }
  if (alreadyQueuedOrRunning(channel, job)) return res.status(409).json({ error: 'job already running or queued' });
  let runAt: string | null = null;
  if (typeof b.runAt === 'string' && b.runAt.trim()) {
    const d = new Date(b.runAt);
    if (!isNaN(d.getTime())) runAt = d.toISOString();
  }
  const item = enqueue(channel, job, { runAt, draft: b.draft, autoPublish: b.autoPublish });
  tryStartNext();
  res.json({ ok: true, item });
});

app.delete('/api/queue/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  const it = queue.find((q) => q.id === id);
  if (!it) return res.status(404).json({ error: 'not found' });
  if (it.status === 'running') return res.status(409).json({ error: 'cannot remove a running item' });
  queue = queue.filter((q) => q.id !== id);
  saveQueue();
  broadcastQueue();
  res.json({ ok: true });
});

// ── Part 2: analytics + learnings ───────────────────────────────────────────

// Compact learnings view for the UI (active rules, hypotheses, dropoff notes, recent changelog).
app.get('/api/channels/:cid/learnings', (req: Request, res: Response) => {
  const { cid } = req.params;
  if (!safe(cid)) return res.status(400).json({ error: 'bad channel' });
  const l = loadLearnings(cid);
  res.json({
    videos: l.videoLog.length,
    activeRules: l.appliedRules.filter((r) => r.status === 'active'),
    hypotheses: l.hypotheses,
    dropoffNotes: l.dropoffNotes,
    changelog: l.changelog.slice(-10).reverse(),
    thresholds: l.thresholds,
  });
});

app.post('/api/channels/:cid/analytics/pull', async (req: Request, res: Response) => {
  const { cid } = req.params;
  if (!safe(cid)) return res.status(400).json({ error: 'bad channel' });
  try { res.json({ ok: true, ...(await pullAnalytics(cid)) }); }
  catch (e) { res.status(500).json({ error: (e as Error).message }); }
});

app.post('/api/channels/:cid/analytics/analyze', async (req: Request, res: Response) => {
  const { cid } = req.params;
  if (!safe(cid)) return res.status(400).json({ error: 'bad channel' });
  try { res.json({ ok: true, ...(await analyzeChannel(cid)) }); }
  catch (e) { res.status(500).json({ error: (e as Error).message }); }
});

// ── static UI ──
if (fs.existsSync(UI_DIST)) {
  app.use(express.static(UI_DIST));
  app.get('*', (_req: Request, res: Response) => res.sendFile(path.join(UI_DIST, 'index.html')));
} else {
  app.get('/', (_req: Request, res: Response) =>
    res.send('<h2>UI not built.</h2><p>Run <code>cd ui && npm install && npm run build</code>, or use <code>npm run ui</code> from the pipeline folder.</p>')
  );
}

app.listen(PORT, () => {
  const url = `http://localhost:${PORT}`;
  console.log('\n  ────────────────────────────────────────────');
  console.log(`   ▸ Pipeline Studio is running. Open:`);
  console.log(`\n        ${url}\n`);
  console.log(`     (backend + UI on one server — this is the only URL)`);
  if (!fs.existsSync(UI_DIST)) console.log('     ⚠ UI not built yet — run `npm run ui` (not ui:server) to build + serve.');
  console.log('  ────────────────────────────────────────────\n');
});
