import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

// ── types ──
interface Job {
  jobId: string;
  status: string;
  running: boolean;
  hasAudio: boolean;
  hasScript: boolean;
  hasVideo: boolean;
}

// Light view of the channel format spec (only what the UI displays/edits).
interface ChannelSpec {
  id: string; title: string; description: string; niche: string; archetype: string;
  palette: { background: string; surface: string; textPrimary: string; textSecondary: string; accent1: string; accent2: string; money: string; up: string; down: string };
  typography: { display: string; body: string; mono: string; case: string; letterSpacing?: number };
  assetStyle: { style: string };
  background: { mode: string; grain: number };
  audioIdentity: { voice: string; musicMoods: string[]; sfxIntensity?: number };
  scriptStyle: { tone: string; hookStyle: string; sentenceStyle?: string; pacing?: string };
  format: { minutes: number };
  cameraProfile: { movement: string };
  [k: string]: unknown;
}

interface ThumbConcept { bigText: string; emphasisWord?: string; assetName?: string; visualIdea?: string }
interface VideoPackage {
  title: string; description?: string; thumbnail?: ThumbConcept;
  hookPromise?: string; openLoops?: string[]; payoff?: string; score?: number;
}
interface Idea { title: string; summary: string; rundown: string; packaging?: VideoPackage }

interface QueueItem {
  id: string; channel: string; job: string; runAt: string | null;
  draft: boolean; autoPublish: boolean; status: 'waiting' | 'running' | 'done' | 'failed';
  addedAt: string; startedAt: string | null; finishedAt: string | null; error: string | null;
}

interface ScheduleConfig {
  timezone: string;
  cadence: { days: string[]; times: string[] };
  autoPublish: boolean;
  privacyStatus: 'private' | 'unlisted' | 'public';
  categoryId: string;
  defaultTags: string[];
}

interface PublishMeta {
  title: string; description: string; tags: string[];
  categoryId: string; privacyStatus: 'private' | 'unlisted' | 'public'; publishAt: string;
}

interface VoiceOpts {
  backend: '' | 'fish' | 'sapi';
  voice: string;
  model: string;
  speed: number;
  volume: number;
  temperature: number;
  topP: number;
}
const DEFAULT_VOICE: VoiceOpts = { backend: '', voice: '', model: 's1', speed: 1, volume: 0, temperature: 0.7, topP: 0.7 };

// Pipeline phases in execution order, each tied to the orchestrator's status.json value.
const STATUS_ORDER = [
  'queued', 'processing_audio', 'generating_spec', 'generating_assets',
  'rendering', 'ready_for_review', 'approved', 'uploaded',
];
const PHASES = [
  { label: 'Audio', status: 'processing_audio' },
  { label: 'Spec', status: 'generating_spec' },
  { label: 'Assets', status: 'generating_assets' },
  { label: 'Render', status: 'rendering' },
];

function phaseState(current: string, failed: boolean, phaseStatus: string): 'done' | 'active' | 'error' | 'pending' {
  const ci = STATUS_ORDER.indexOf(current);
  const pi = STATUS_ORDER.indexOf(phaseStatus);
  if (failed && current === phaseStatus) return 'error';
  if (ci > pi) return 'done';
  if (ci === pi) return 'active';
  return 'pending';
}

async function jget<T>(url: string): Promise<T> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return r.json();
}
async function jpost<T>(url: string, body?: unknown): Promise<T> {
  const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body ?? {}) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((d as { error?: string }).error ?? `${r.status} ${url}`);
  return d as T;
}

// Coerce a free-text job name into a filesystem-/URL-safe id matching the server's `safe()` rule
// (^[A-Za-z0-9._-]+$). Spaces/apostrophes/etc. → hyphens. Without this, typing "minibar test"
// produced the id "minibar test", which every later request rejected with "bad ids".
function slugifyId(s: string): string {
  return s
    .trim()
    .replace(/[^A-Za-z0-9._-]+/g, '-') // illegal chars → hyphen
    .replace(/-{2,}/g, '-')            // collapse repeats
    .replace(/^[-_.]+|[-_.]+$/g, '');  // trim leading/trailing separators
}

const STATUS_LABEL: Record<string, string> = {
  new: 'new', queued: 'queued', processing_audio: 'audio',
  generating_spec: 'spec', generating_assets: 'assets', rendering: 'rendering',
  ready_for_review: 'ready', approved: 'approved', uploaded: 'uploaded', failed: 'failed',
};

function Badge({ status }: { status: string }) {
  const tone =
    status === 'ready_for_review' || status === 'approved' || status === 'uploaded' ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
    : status === 'failed' ? 'bg-red-500/15 text-red-300 border-red-500/30'
    : status === 'new' ? 'bg-white/5 text-zinc-400 border-white/10'
    : 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30';
  return <span className={`px-2 py-0.5 rounded-full text-[11px] border ${tone}`}>{STATUS_LABEL[status] ?? status}</span>;
}

const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

export default function App() {
  const [channels, setChannels] = useState<string[]>([]);
  const [channel, setChannel] = useState<string>('');
  const [jobs, setJobs] = useState<Job[]>([]);
  const [job, setJob] = useState<string>('');
  const [newJobId, setNewJobId] = useState('');

  const [script, setScript] = useState('');
  const [audioName, setAudioName] = useState('');
  const audioRef = useRef<HTMLInputElement>(null);

  // Phase 0 script-gen + audio options
  const [topic, setTopic] = useState('');
  const [minutes, setMinutes] = useState(2);
  const [genBusy, setGenBusy] = useState(false);
  const [musicStems, setMusicStems] = useState<string[]>([]);
  const [musicTrack, setMusicTrack] = useState('auto');
  const [sfxEnabled, setSfxEnabled] = useState(true);
  const [sfxIntensity, setSfxIntensity] = useState(1);

  // Voice controls (per job) + TTS status
  const [voice, setVoice] = useState<VoiceOpts>(DEFAULT_VOICE);
  const [tts, setTts] = useState<{ active: string; fishConfigured: boolean } | null>(null);
  const [voiceBusy, setVoiceBusy] = useState(false);

  // Ideas
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [ideasBusy, setIdeasBusy] = useState(false);
  const [showIdeas, setShowIdeas] = useState(false);

  // Channel modals
  const [showNewChannel, setShowNewChannel] = useState(false);
  const [showEditChannel, setShowEditChannel] = useState(false);
  const [showSchedule, setShowSchedule] = useState(false);
  const [activeSpec, setActiveSpec] = useState<ChannelSpec | null>(null);
  const [schedule, setSchedule] = useState<ScheduleConfig | null>(null);

  // Run / scheduling
  const [draft, setDraft] = useState(false);
  const [runAt, setRunAt] = useState('');
  const [queueAutoPublish, setQueueAutoPublish] = useState(false);
  const [queue, setQueue] = useState<QueueItem[]>([]);

  const [logs, setLogs] = useState<string[]>([]);
  const [status, setStatus] = useState('new');
  const [running, setRunning] = useState(false);
  const [renderPct, setRenderPct] = useState(0);
  const [assets, setAssets] = useState<string[]>([]);
  const [videoBust, setVideoBust] = useState(0);

  // Packaging + thumbnail (session 7)
  const [pkg, setPkg] = useState<VideoPackage | null>(null);
  const [thumbBust, setThumbBust] = useState(0);
  const [thumbExists, setThumbExists] = useState(false);
  const [thumbBusy, setThumbBusy] = useState(false);
  const [thumbVariants, setThumbVariants] = useState<string[]>([]);

  // Publish
  const [ytAuthed, setYtAuthed] = useState(false);
  const [autoPublish, setAutoPublish] = useState(false);
  const [publishBusy, setPublishBusy] = useState(false);
  const [publishMsg, setPublishMsg] = useState('');
  const [pubMeta, setPubMeta] = useState<PublishMeta | null>(null);
  const [learnings, setLearnings] = useState<{ videos: number; activeRules: { id: string; rule: string }[]; changelog: { date: string; change: string }[] } | null>(null);
  const [analyticsBusy, setAnalyticsBusy] = useState('');
  const logEndRef = useRef<HTMLDivElement>(null);

  const failed = status === 'failed';
  const selectedJob = jobs.find((j) => j.jobId === job);
  // Run only needs a script now — the voiceover is auto-generated if absent.
  const canRun = !!(selectedJob?.hasScript || selectedJob?.hasAudio) && !running;
  const hasVideo = (selectedJob?.hasVideo ?? false) || status === 'ready_for_review';

  // ── data loaders ──
  const loadJobs = useCallback(async (cid: string) => {
    const j = await jget<Job[]>(`/api/channels/${cid}/jobs`);
    setJobs(j);
    return j;
  }, []);

  const loadQueue = useCallback(async () => {
    try { const d = await jget<{ active: string | null; items: QueueItem[] }>('/api/queue'); setQueue(d.items); }
    catch { /* ignore */ }
  }, []);

  useEffect(() => {
    jget<{ id: string }[]>('/api/channels').then((cs) => {
      const ids = cs.map((c) => c.id);
      setChannels(ids);
      if (ids.length) setChannel(ids[0]);
    }).catch(() => setChannels([]));
    jget<string[]>('/api/music').then(setMusicStems).catch(() => setMusicStems([]));
    jget<{ active: string; fishConfigured: boolean }>('/api/tts/status').then(setTts).catch(() => setTts(null));
    loadQueue();
    const t = setInterval(loadQueue, 5000); // poll the queue so scheduled/auto runs surface
    return () => clearInterval(t);
  }, [loadQueue]);

  const reloadChannels = useCallback(async (selectId?: string) => {
    const cs = await jget<{ id: string }[]>('/api/channels');
    const ids = cs.map((c) => c.id);
    setChannels(ids);
    if (selectId) setChannel(selectId);
    return ids;
  }, []);

  useEffect(() => {
    if (!channel) return;
    loadJobs(channel);
    jget<string[]>(`/api/channels/${channel}/assets`).then(setAssets).catch(() => setAssets([]));
    jget<ChannelSpec>(`/api/channels/${channel}/spec`).then((s) => { setActiveSpec(s); setVoice((v) => ({ ...v, voice: v.voice || s.audioIdentity.voice || '' })); }).catch(() => setActiveSpec(null));
    jget<{ authorized: boolean; schedule: ScheduleConfig }>(`/api/channels/${channel}/publish/status`)
      .then((p) => { setYtAuthed(p.authorized); setAutoPublish(p.schedule.autoPublish); setSchedule(p.schedule); }).catch(() => { setYtAuthed(false); setSchedule(null); });
    jget<typeof learnings>(`/api/channels/${channel}/learnings`).then(setLearnings).catch(() => setLearnings(null));
  }, [channel, loadJobs]);

  // When a job is selected, hydrate status + stream its events.
  useEffect(() => {
    if (!channel || !job) return;
    setLogs([]); setRenderPct(0); setPubMeta(null); setPublishMsg('');
    setPkg(null); setThumbExists(false); setThumbBust(Date.now());
    jget<{ status: string }>(`/api/channels/${channel}/jobs/${job}/status`)
      .then((s) => setStatus(s.status)).catch(() => setStatus('new'));
    jget<{ script: string }>(`/api/channels/${channel}/jobs/${job}/script`)
      .then((s) => setScript(s.script ?? '')).catch(() => {});
    loadMeta();

    const es = new EventSource(`/api/channels/${channel}/jobs/${job}/events`);
    es.addEventListener('log', (e) => {
      const { line } = JSON.parse((e as MessageEvent).data);
      setLogs((prev) => [...prev.slice(-3000), line]);
      const m = /Frame\s+(\d+)\/(\d+)|Rendered\s+(\d+)\/(\d+)/.exec(line);
      if (m) { const a = +(m[1] ?? m[3]); const b = +(m[2] ?? m[4]); if (b) setRenderPct(Math.round((a / b) * 100)); }
    });
    es.addEventListener('status', (e) => {
      const d = JSON.parse((e as MessageEvent).data);
      setStatus(d.status);
      setRunning(!!d.running || (d.status && !['ready_for_review', 'failed', 'approved', 'uploaded', 'idle', 'new'].includes(d.status)));
    });
    es.addEventListener('started', () => { setRunning(true); setLogs([]); setRenderPct(0); });
    es.addEventListener('queue', (e) => { try { setQueue(JSON.parse((e as MessageEvent).data).items); } catch { /* ignore */ } });
    es.addEventListener('done', (e) => {
      const d = JSON.parse((e as MessageEvent).data);
      setRunning(false);
      if (d.status) setStatus(d.status);
      setVideoBust(Date.now());
      loadJobs(channel);
      loadQueue();
    });
    return () => es.close();
  }, [channel, job, loadJobs, loadQueue]);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  // ── actions ──
  async function createJob() {
    const id = slugifyId(newJobId);
    if (!id) { alert('Enter a job name using letters, numbers, . _ or -'); return; }
    try {
      // jpost throws on a non-2xx (e.g. the server's id validation), so we never select a job that
      // wasn't actually created — the root cause of the "bad ids" loop.
      await jpost(`/api/channels/${channel}/jobs`, { jobId: id });
    } catch (e) {
      alert(`Could not create job: ${(e as Error).message}`);
      return;
    }
    setNewJobId('');
    await loadJobs(channel);
    setJob(id);
  }

  async function generateScript(forTopic?: string, packaging?: VideoPackage) {
    const t = (forTopic ?? topic).trim();
    if (!t || !job) return;
    setGenBusy(true);
    try {
      const d = await jpost<{ script: string }>(`/api/channels/${channel}/jobs/${job}/script`, { topic: t, minutes, ...(packaging ? { packaging } : {}) });
      setScript(d.script);
      await loadJobs(channel);
      await loadMeta();
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setGenBusy(false);
    }
  }

  async function fetchIdeas() {
    setIdeasBusy(true);
    setShowIdeas(true);
    try {
      const d = await jpost<{ ideas: Idea[] }>(`/api/channels/${channel}/ideas`, { count: 6 });
      setIdeas(d.ideas);
    } catch (e) {
      alert((e as Error).message);
      setShowIdeas(false);
    } finally {
      setIdeasBusy(false);
    }
  }

  async function useIdea(idea: Idea, generate: boolean) {
    setTopic(idea.title);
    setShowIdeas(false);
    if (generate && job) await generateScript(idea.title, idea.packaging);
  }

  async function loadMeta() {
    if (!channel || !job) return;
    try {
      const m = await jget<{ topic?: string; packaging?: VideoPackage }>(`/api/channels/${channel}/jobs/${job}/meta`);
      setPkg(m.packaging ?? null);
      if (m.topic && !topic) setTopic(m.topic);
    } catch { setPkg(null); }
    // Probe for existing thumbnail variants (for the A/B gallery).
    try {
      const r = await jget<{ variants: string[] }>(`/api/channels/${channel}/jobs/${job}/thumbnails`);
      setThumbVariants(r.variants ?? []);
      setThumbExists((r.variants ?? []).length > 0);
    } catch { setThumbVariants([]); setThumbExists(false); }
  }

  async function regenThumbnail() {
    if (!channel || !job) return;
    setThumbBusy(true);
    try {
      const r = await jpost<{ variants: string[] }>(`/api/channels/${channel}/jobs/${job}/thumbnail`);
      setThumbVariants(r.variants ?? []);
      setThumbExists((r.variants ?? []).length > 0);
      setThumbBust(Date.now());
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setThumbBusy(false);
    }
  }

  async function setPrimaryThumb(variant: string) {
    if (!channel || !job) return;
    try {
      await jpost(`/api/channels/${channel}/jobs/${job}/thumbnail/primary`, { variant });
      setThumbBust(Date.now());
    } catch (e) {
      alert((e as Error).message);
    }
  }

  function voiceBody() {
    return {
      backend: voice.backend || undefined,
      voice: voice.voice || undefined,
      model: voice.model || undefined,
      speed: voice.speed, volume: voice.volume, temperature: voice.temperature, topP: voice.topP,
    };
  }

  async function generateVoiceover() {
    if (!job) return;
    setVoiceBusy(true);
    try {
      const d = await jpost<{ fellBack?: boolean; note?: string }>(`/api/channels/${channel}/jobs/${job}/voiceover`, voiceBody());
      if (d.fellBack && d.note) alert(`Voiceover created with the stand-in backend.\n${d.note}`);
      await loadJobs(channel);
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setVoiceBusy(false);
    }
  }

  function jobOptions() {
    return {
      audio: { sfx: { enabled: sfxEnabled, intensity: sfxIntensity }, music: { track: musicTrack } },
      voice: voiceBody(),
    };
  }

  async function saveOptions() {
    await fetch(`/api/channels/${channel}/jobs/${job}/options`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(jobOptions()),
    });
  }

  async function saveInputs() {
    const fd = new FormData();
    if (script.trim()) fd.append('script', script);
    const f = audioRef.current?.files?.[0];
    if (f) fd.append('audio', f);
    await fetch(`/api/channels/${channel}/jobs/${job}/inputs`, { method: 'POST', body: fd });
    await saveOptions();
    await loadJobs(channel);
  }

  async function runPipeline() {
    setLogs([]); setRenderPct(0);
    await saveOptions(); // persist audio + voice choices before the orchestrator reads them
    try {
      const d = await jpost<{ startedNow: boolean }>(`/api/channels/${channel}/jobs/${job}/process`, { draft });
      if (d.startedNow) setRunning(true);
      else setPublishMsg('Queued — will run when the current render finishes.');
      await loadQueue();
    } catch (e) {
      setRunning(false);
      alert((e as Error).message);
    }
  }

  async function scheduleRun() {
    await saveOptions();
    try {
      await jpost(`/api/queue`, { channel, job, runAt: runAt || null, draft, autoPublish: queueAutoPublish });
      setRunAt('');
      await loadQueue();
    } catch (e) {
      alert((e as Error).message);
    }
  }

  async function removeQueueItem(id: string) {
    try { await fetch(`/api/queue/${id}`, { method: 'DELETE' }); await loadQueue(); } catch { /* ignore */ }
  }

  // ── publish ──
  const loadPubMeta = useCallback(async () => {
    if (!channel || !job) return;
    try { setPubMeta(await jget<PublishMeta>(`/api/channels/${channel}/jobs/${job}/publish-meta`)); } catch { /* ignore */ }
  }, [channel, job]);

  useEffect(() => { if (hasVideo) loadPubMeta(); }, [hasVideo, loadPubMeta]);

  async function savePubMeta() {
    if (!pubMeta) return;
    setPublishBusy(true);
    try {
      await jpost(`/api/channels/${channel}/jobs/${job}/publish-meta`, pubMeta);
      setPublishMsg('✓ publish details saved');
    } catch (e) { setPublishMsg(`✗ ${(e as Error).message}`); } finally { setPublishBusy(false); }
  }

  async function publish(scheduleIt: boolean) {
    setPublishBusy(true);
    setPublishMsg('');
    try {
      if (pubMeta) await jpost(`/api/channels/${channel}/jobs/${job}/publish-meta`, pubMeta); // persist edits first
      const d = await jpost<{ message?: string; videoUrl?: string }>(`/api/channels/${channel}/jobs/${job}/publish`, { schedule: scheduleIt });
      setPublishMsg((d.message ?? 'done') + (d.videoUrl ? ` — ${d.videoUrl}` : ''));
    } catch (e) {
      setPublishMsg(`✗ ${(e as Error).message}`);
    } finally {
      setPublishBusy(false);
    }
  }

  async function runAnalytics(which: 'pull' | 'analyze') {
    setAnalyticsBusy(which);
    try {
      const d = await jpost<{ videos?: number; summary?: string }>(`/api/channels/${channel}/analytics/${which}`);
      jget<typeof learnings>(`/api/channels/${channel}/learnings`).then(setLearnings).catch(() => {});
      alert(which === 'pull' ? `Pulled ${d.videos ?? 0} video(s).` : (d.summary ?? 'analysis done'));
    } catch (e) {
      alert(`${which} failed: ${(e as Error).message}`);
    } finally {
      setAnalyticsBusy('');
    }
  }

  const videoUrl = useMemo(
    () => `/api/channels/${channel}/jobs/${job}/video?v=${videoBust}`,
    [channel, job, videoBust]
  );

  const channelQueue = queue.filter((q) => q.channel === channel && (q.status === 'waiting' || q.status === 'running'));

  return (
    <div className="min-h-screen flex flex-col">
      <header className="px-5 py-3 border-b border-white/10 flex items-center gap-3">
        <div className="text-lg font-semibold tracking-tight">Pipeline Studio</div>
        <span className="text-xs text-zinc-500">automated video pipeline</span>
        {activeSpec && (
          <span className="hidden sm:flex items-center gap-1.5 text-[11px] text-zinc-400 border border-white/10 rounded-full px-2 py-0.5">
            <span className="inline-block w-3 h-3 rounded-full border border-white/20" style={{ background: activeSpec.palette.background }} />
            <span className="inline-block w-3 h-3 rounded-full" style={{ background: activeSpec.palette.accent1 }} />
            {activeSpec.archetype}
          </span>
        )}
        <div className="ml-auto flex items-center gap-2 text-sm">
          <span className="text-zinc-500">channel</span>
          <select
            value={channel} onChange={(e) => { setChannel(e.target.value); setJob(''); }}
            className="bg-white/5 border border-white/10 rounded px-2 py-1 text-sm"
          >
            {channels.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <button onClick={() => setShowEditChannel(true)} disabled={!activeSpec} title="Edit channel format spec"
            className="px-2 py-1 rounded bg-white/5 border border-white/10 text-sm hover:bg-white/10 disabled:opacity-40">⚙ Edit</button>
          <button onClick={() => setShowSchedule(true)} disabled={!schedule} title="Channel upload schedule"
            className="px-2 py-1 rounded bg-white/5 border border-white/10 text-sm hover:bg-white/10 disabled:opacity-40">🗓 Schedule</button>
          <button
            onClick={() => setShowNewChannel(true)}
            className="px-2.5 py-1 rounded bg-cyan-500/20 text-cyan-200 border border-cyan-500/30 text-sm hover:bg-cyan-500/30 whitespace-nowrap"
          >+ New Channel</button>
        </div>
      </header>

      {showNewChannel && (
        <NewChannelModal
          onClose={() => setShowNewChannel(false)}
          onCreated={async (id) => { setShowNewChannel(false); await reloadChannels(id); setJob(''); }}
        />
      )}
      {showEditChannel && activeSpec && (
        <EditChannelModal
          initial={activeSpec}
          onClose={() => setShowEditChannel(false)}
          onSaved={async (s) => { setShowEditChannel(false); setActiveSpec(s); await loadJobs(channel); }}
        />
      )}
      {showSchedule && schedule && (
        <ScheduleModal
          channel={channel} initial={schedule}
          onClose={() => setShowSchedule(false)}
          onSaved={(s) => { setSchedule(s); setAutoPublish(s.autoPublish); setShowSchedule(false); }}
        />
      )}
      {showIdeas && (
        <IdeasModal busy={ideasBusy} ideas={ideas} onClose={() => setShowIdeas(false)} onPick={useIdea} hasJob={!!job} />
      )}

      <div className="flex-1 grid grid-cols-[260px_1fr_260px] max-[1100px]:grid-cols-1 gap-0">
        {/* ── left: jobs ── */}
        <aside className="border-r border-white/10 p-3 flex flex-col gap-3 min-h-0">
          <div className="flex gap-2">
            <input
              value={newJobId} onChange={(e) => setNewJobId(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && createJob()}
              placeholder="new job id…"
              className="flex-1 bg-white/5 border border-white/10 rounded px-2 py-1.5 text-sm min-w-0"
            />
            <button onClick={createJob} className="px-3 rounded bg-cyan-500/20 text-cyan-200 border border-cyan-500/30 text-sm hover:bg-cyan-500/30">+</button>
          </div>
          <div className="overflow-auto flex flex-col gap-1">
            {jobs.length === 0 && <div className="text-xs text-zinc-600 px-1">no jobs yet</div>}
            {jobs.map((j) => (
              <button
                key={j.jobId} onClick={() => setJob(j.jobId)}
                className={`text-left px-2.5 py-2 rounded border text-sm flex items-center justify-between gap-2 ${job === j.jobId ? 'bg-white/10 border-white/20' : 'bg-transparent border-transparent hover:bg-white/5'}`}
              >
                <span className="truncate">{j.jobId}</span>
                <Badge status={j.status} />
              </button>
            ))}
          </div>
        </aside>

        {/* ── center: job detail ── */}
        <main className="p-5 flex flex-col gap-5 min-w-0">
          {!job && <div className="text-zinc-500 text-sm">Select or create a job to begin.</div>}

          {job && (
            <>
              <div className="flex items-center gap-3">
                <h2 className="text-base font-medium">{channel} / <span className="text-cyan-300">{job}</span></h2>
                <Badge status={status} />
                {running && <span className="text-xs text-cyan-400 animate-pulse">running…</span>}
              </div>

              {/* 1. Phase 0 — generate script */}
              <section className="flex flex-col gap-2 rounded border border-white/10 bg-white/[0.02] p-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs uppercase tracking-wide text-zinc-500">1 · Generate script (Phase 0)</label>
                  <button onClick={fetchIdeas} disabled={ideasBusy}
                    className="text-[11px] px-2 py-1 rounded bg-amber-500/15 text-amber-200 border border-amber-500/25 hover:bg-amber-500/25 disabled:opacity-50">
                    {ideasBusy ? 'thinking…' : '💡 Ideas for me'}</button>
                </div>
                <div className="flex gap-2 max-[800px]:flex-col">
                  <input
                    value={topic} onChange={(e) => setTopic(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && generateScript()}
                    placeholder="topic / title — e.g. How vending machines really make money"
                    className="flex-1 bg-white/5 border border-white/10 rounded px-2.5 py-1.5 text-sm min-w-0"
                  />
                  <div className="flex items-center gap-2">
                    <input
                      type="number" min={0.5} step={0.5} value={minutes}
                      onChange={(e) => setMinutes(Number(e.target.value))}
                      className="w-20 bg-white/5 border border-white/10 rounded px-2 py-1.5 text-sm"
                    />
                    <span className="text-xs text-zinc-500">min</span>
                    <button
                      onClick={() => generateScript()} disabled={genBusy || !topic.trim()}
                      className="px-3 py-1.5 rounded bg-cyan-500/20 text-cyan-200 border border-cyan-500/30 text-sm hover:bg-cyan-500/30 disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
                    >{genBusy ? 'generating…' : 'Generate script'}</button>
                  </div>
                </div>
              </section>

              {/* 2. Script + voiceover inputs */}
              <section className="grid grid-cols-2 max-[800px]:grid-cols-1 gap-4">
                <div className="flex flex-col gap-2">
                  <label className="text-xs uppercase tracking-wide text-zinc-500">2 · Script (read this while recording)</label>
                  <textarea
                    value={script} onChange={(e) => setScript(e.target.value)}
                    placeholder={selectedJob?.hasScript ? 'script.txt saved — edit or regenerate above' : 'generate a script above, or paste your own…'}
                    className="h-56 bg-white/5 border border-white/10 rounded p-3 text-sm resize-none font-mono leading-relaxed"
                  />
                </div>
                <div className="flex flex-col gap-3">
                  {/* audio options */}
                  <div className="flex flex-col gap-2 rounded border border-white/10 bg-white/[0.02] p-3">
                    <label className="text-xs uppercase tracking-wide text-zinc-500">3 · Audio options</label>
                    <div className="flex items-center gap-2 text-sm">
                      <span className="text-zinc-500 w-16">Music</span>
                      <select
                        value={musicTrack} onChange={(e) => setMusicTrack(e.target.value)}
                        className="flex-1 bg-white/5 border border-white/10 rounded px-2 py-1 text-sm"
                      >
                        <option value="auto">Auto (mood-shifting)</option>
                        <option value="none">None</option>
                        {musicStems.map((s) => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <span className="text-zinc-500 w-16">SFX</span>
                      <label className="flex items-center gap-1.5 text-xs text-zinc-400">
                        <input type="checkbox" checked={sfxEnabled} onChange={(e) => setSfxEnabled(e.target.checked)} /> on
                      </label>
                      <input
                        type="range" min={0} max={1} step={0.1} value={sfxIntensity}
                        disabled={!sfxEnabled}
                        onChange={(e) => setSfxIntensity(Number(e.target.value))}
                        className="flex-1 disabled:opacity-40"
                      />
                      <span className="text-xs text-zinc-500 w-8 text-right">{Math.round(sfxIntensity * 100)}%</span>
                    </div>
                  </div>

                  {/* voice controls */}
                  <VoicePanel voice={voice} setVoice={setVoice} tts={tts} />
                </div>
              </section>

              {/* 4. voiceover upload + run */}
              <section className="flex flex-col gap-2 rounded border border-white/10 bg-white/[0.02] p-3">
                <label className="text-xs uppercase tracking-wide text-zinc-500">4 · Voiceover & run</label>
                <input
                  ref={audioRef} type="file" accept="video/*,audio/*,.mp4,.wav,.m4a,.mov"
                  onChange={(e) => setAudioName(e.target.files?.[0]?.name ?? '')}
                  className="text-sm file:mr-3 file:px-3 file:py-1.5 file:rounded file:border-0 file:bg-cyan-500/20 file:text-cyan-200 file:text-sm text-zinc-400"
                />
                <div className="text-xs text-zinc-500 flex gap-3">
                  <span>audio: {selectedJob?.hasAudio ? '✓ saved' : audioName || '— (will auto-generate with Fish on run)'}</span>
                  <span>script: {selectedJob?.hasScript ? '✓ saved' : '—'}</span>
                </div>
                <div className="flex flex-wrap gap-2 items-center">
                  <button onClick={saveInputs} className="px-3 py-1.5 rounded bg-white/10 border border-white/15 text-sm hover:bg-white/15">Save inputs</button>
                  <button
                    onClick={generateVoiceover} disabled={voiceBusy || !selectedJob?.hasScript}
                    title="Synthesize a voiceover now from the script via the TTS adapter"
                    className="px-3 py-1.5 rounded bg-white/10 border border-white/15 text-sm hover:bg-white/15 disabled:opacity-40 disabled:cursor-not-allowed"
                  >{voiceBusy ? 'synthesizing…' : `🔊 Generate voiceover${tts ? ` (${tts.active})` : ''}`}</button>
                  <label className="flex items-center gap-1.5 text-xs text-zinc-400 ml-1">
                    <input type="checkbox" checked={draft} onChange={(e) => setDraft(e.target.checked)} /> draft (fast preview)
                  </label>
                  <button
                    onClick={runPipeline} disabled={!canRun}
                    className="px-4 py-1.5 rounded text-sm font-medium border bg-cyan-500/25 border-cyan-400/40 text-cyan-100 hover:bg-cyan-500/35 disabled:opacity-40 disabled:cursor-not-allowed"
                  >▶ Run pipeline</button>
                </div>
                {/* schedule a run */}
                <div className="flex flex-wrap items-center gap-2 border-t border-white/10 pt-2 mt-1">
                  <span className="text-[11px] text-zinc-500">schedule:</span>
                  <input type="datetime-local" value={runAt} onChange={(e) => setRunAt(e.target.value)}
                    className="bg-white/5 border border-white/10 rounded px-2 py-1 text-xs text-zinc-200" />
                  <label className="flex items-center gap-1.5 text-xs text-zinc-400">
                    <input type="checkbox" checked={queueAutoPublish} onChange={(e) => setQueueAutoPublish(e.target.checked)} /> auto-publish when done
                  </label>
                  <button onClick={scheduleRun} disabled={!selectedJob?.hasScript && !selectedJob?.hasAudio}
                    className="px-3 py-1.5 rounded bg-indigo-500/20 text-indigo-200 border border-indigo-500/30 text-xs hover:bg-indigo-500/30 disabled:opacity-40">
                    {runAt ? 'Schedule' : 'Add to queue'}</button>
                </div>
                {tts && !tts.fishConfigured && (
                  <div className="text-[11px] text-amber-300/80">Fish S1 key not set — voiceover uses the SAPI stand-in. Set FISH_API_KEY for S1.</div>
                )}
              </section>

              {/* phases */}
              <section className="flex items-center gap-2">
                {PHASES.map((p, i) => {
                  const st = phaseState(status, failed, p.status);
                  const tone = st === 'done' ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-200'
                    : st === 'active' ? 'bg-cyan-500/20 border-cyan-400/50 text-cyan-100'
                    : st === 'error' ? 'bg-red-500/20 border-red-500/40 text-red-200'
                    : 'bg-white/5 border-white/10 text-zinc-500';
                  return (
                    <div key={p.label} className="flex items-center gap-2">
                      <div className={`px-3 py-1.5 rounded border text-xs ${tone}`}>
                        {p.label}
                        {p.status === 'rendering' && st === 'active' && renderPct > 0 ? ` ${renderPct}%` : ''}
                      </div>
                      {i < PHASES.length - 1 && <div className="w-5 h-px bg-white/15" />}
                    </div>
                  );
                })}
              </section>

              {/* render progress bar */}
              {status === 'rendering' && (
                <div className="h-1.5 bg-white/10 rounded overflow-hidden">
                  <div className="h-full bg-cyan-400 transition-all" style={{ width: `${renderPct}%` }} />
                </div>
              )}

              {/* logs */}
              <section className="flex flex-col gap-2 min-h-0">
                <label className="text-xs uppercase tracking-wide text-zinc-500">Live log</label>
                <div className="h-56 overflow-auto bg-black/40 border border-white/10 rounded p-3 font-mono text-[12px] leading-relaxed text-zinc-300 whitespace-pre-wrap">
                  {logs.length === 0 && <span className="text-zinc-600">no output yet — press Run pipeline</span>}
                  {logs.map((l, i) => (
                    <div key={i} className={l.includes('✗') || /error|failed/i.test(l) ? 'text-red-300' : l.includes('✅') || l.includes('▸') ? 'text-emerald-300' : ''}>{l}</div>
                  ))}
                  <div ref={logEndRef} />
                </div>
              </section>

              {/* video */}
              {hasVideo && (
                <section className="flex flex-col gap-2">
                  <div className="flex items-center gap-3">
                    <label className="text-xs uppercase tracking-wide text-zinc-500">Output</label>
                    <a href={`${videoUrl}&download=1`} className="text-xs text-cyan-300 hover:underline">download mp4 ↓</a>
                  </div>
                  <video key={videoUrl} controls className="w-full max-w-2xl rounded border border-white/10 bg-black" src={videoUrl} />

                  {/* Thumbnail A/B variants (session 7) — pick which becomes the upload primary */}
                  <div className="mt-2 rounded border border-white/10 bg-white/[0.03] p-3 max-w-2xl flex flex-col gap-2">
                    <div className="flex items-center gap-3">
                      <span className="text-xs uppercase tracking-wide text-zinc-500">Thumbnail (A/B)</span>
                      <button onClick={regenThumbnail} disabled={thumbBusy}
                        className="text-xs px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-200 hover:bg-cyan-500/30 disabled:opacity-50">
                        {thumbBusy ? 'rendering…' : '↻ regenerate'}
                      </button>
                      {pkg?.thumbnail?.bigText && (
                        <span className="text-[10px] text-zinc-500">concept: “{pkg.thumbnail.bigText}”</span>
                      )}
                    </div>
                    {thumbVariants.length ? (
                      <>
                        <div className="grid grid-cols-3 gap-2">
                          {thumbVariants.map((v) => (
                            <div key={v} className="flex flex-col gap-1">
                              <img key={`${v}-${thumbBust}`} src={`/api/channels/${channel}/jobs/${job}/thumbnail?variant=${v}&v=${thumbBust}`}
                                alt={v} className={`w-full rounded border ${v === 'thumbnail.png' ? 'border-cyan-400/60' : 'border-white/10'}`} />
                              {v === 'thumbnail.png'
                                ? <span className="text-[10px] text-cyan-300 text-center">primary (uploads)</span>
                                : <button onClick={() => setPrimaryThumb(v)} className="text-[10px] text-zinc-400 hover:text-cyan-300 text-center">use as primary</button>}
                            </div>
                          ))}
                        </div>
                        <span className="text-[10px] text-zinc-500">The cyan-bordered one uploads to YouTube. Test the others with Studio’s Test &amp; Compare.</span>
                      </>
                    ) : (
                      <span className="text-xs text-zinc-500">No thumbnail yet — click regenerate (renders 3 A/B variants from the job’s package).</span>
                    )}
                  </div>

                  {/* Packaging contract (session 7) — what the viewer clicked, what the script pays off */}
                  {pkg && (
                    <div className="mt-2 rounded border border-white/10 bg-white/[0.03] p-3 max-w-2xl flex flex-col gap-1.5 text-xs">
                      <div className="flex items-center gap-2">
                        <span className="uppercase tracking-wide text-zinc-500">Packaging</span>
                        {typeof pkg.score === 'number' && <span className="text-[10px] px-1.5 py-0.5 rounded bg-yellow-500/20 text-yellow-200">score {pkg.score}</span>}
                      </div>
                      <div className="text-zinc-200 font-medium">{pkg.title}</div>
                      {pkg.hookPromise && <div className="text-zinc-400"><span className="text-zinc-500">hook:</span> {pkg.hookPromise}</div>}
                      {pkg.payoff && <div className="text-zinc-400"><span className="text-zinc-500">payoff:</span> {pkg.payoff}</div>}
                      {!!pkg.openLoops?.length && (
                        <div className="text-zinc-400"><span className="text-zinc-500">loops:</span> {pkg.openLoops.join(' · ')}</div>
                      )}
                    </div>
                  )}

                  {/* Part 1 — publish to YouTube (with metadata editor) */}
                  <div className="mt-2 rounded border border-white/10 bg-white/[0.03] p-3 max-w-2xl flex flex-col gap-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs uppercase tracking-wide text-zinc-500">YouTube</span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded ${ytAuthed ? 'bg-green-500/20 text-green-300' : 'bg-amber-500/20 text-amber-300'}`}>
                        {ytAuthed ? 'authorized' : 'not authorized — dry run'}
                      </span>
                      <span className="text-[10px] text-zinc-500">autoPublish: {autoPublish ? 'on' : 'off'}</span>
                    </div>

                    {pubMeta && (
                      <div className="flex flex-col gap-2">
                        <input value={pubMeta.title} onChange={(e) => setPubMeta({ ...pubMeta, title: e.target.value })}
                          placeholder="video title" className="bg-white/5 border border-white/10 rounded px-2 py-1.5 text-sm" />
                        <textarea value={pubMeta.description} onChange={(e) => setPubMeta({ ...pubMeta, description: e.target.value })}
                          placeholder="description" className="h-20 bg-white/5 border border-white/10 rounded px-2 py-1.5 text-sm resize-none" />
                        <div className="flex flex-wrap gap-2 items-center text-xs">
                          <input value={pubMeta.tags.join(', ')} onChange={(e) => setPubMeta({ ...pubMeta, tags: e.target.value.split(',').map((t) => t.trim()).filter(Boolean) })}
                            placeholder="tags, comma, separated" className="flex-1 min-w-[140px] bg-white/5 border border-white/10 rounded px-2 py-1.5" />
                          <select value={pubMeta.privacyStatus} onChange={(e) => setPubMeta({ ...pubMeta, privacyStatus: e.target.value as PublishMeta['privacyStatus'] })}
                            className="bg-white/5 border border-white/10 rounded px-2 py-1.5">
                            <option value="private">private</option>
                            <option value="unlisted">unlisted</option>
                            <option value="public">public</option>
                          </select>
                        </div>
                        <div className="flex items-center gap-2 text-xs">
                          <span className="text-zinc-500">go live at</span>
                          <input type="datetime-local" value={toLocalInput(pubMeta.publishAt)} onChange={(e) => setPubMeta({ ...pubMeta, publishAt: e.target.value })}
                            className="bg-white/5 border border-white/10 rounded px-2 py-1" />
                          {pubMeta.publishAt && <button onClick={() => setPubMeta({ ...pubMeta, publishAt: '' })} className="text-zinc-500 hover:text-zinc-300">clear</button>}
                          <button onClick={savePubMeta} disabled={publishBusy} className="ml-auto px-2.5 py-1 rounded bg-white/10 border border-white/15 hover:bg-white/15 disabled:opacity-50">Save details</button>
                        </div>
                      </div>
                    )}

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => publish(false)} disabled={publishBusy}
                        className="text-xs px-3 py-1.5 rounded bg-cyan-500/20 text-cyan-200 hover:bg-cyan-500/30 disabled:opacity-50"
                      >{publishBusy ? '…' : 'Upload now'}</button>
                      <button
                        onClick={() => publish(true)} disabled={publishBusy}
                        className="text-xs px-3 py-1.5 rounded bg-indigo-500/20 text-indigo-200 hover:bg-indigo-500/30 disabled:opacity-50"
                      >{publishBusy ? '…' : 'Upload + schedule next slot'}</button>
                    </div>
                    {!ytAuthed && <div className="text-[10px] text-zinc-500">Run <code>npm run youtube:auth {channel}</code> once to enable live uploads.</div>}
                    {publishMsg && <div className="text-[11px] text-zinc-300 break-all">{publishMsg}</div>}
                  </div>
                </section>
              )}
            </>
          )}
        </main>

        {/* ── right: queue + learnings + asset library ── */}
        <aside className="border-l border-white/10 p-3 min-h-0 flex flex-col gap-3 overflow-auto">
          {/* Queue */}
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <span className="text-xs uppercase tracking-wide text-zinc-500">Queue</span>
              <span className="text-[10px] text-zinc-500">{channelQueue.length} pending</span>
            </div>
            {channelQueue.length === 0 && <div className="text-[10px] text-zinc-600">nothing queued</div>}
            {channelQueue.map((q) => (
              <div key={q.id} className="rounded border border-white/10 bg-white/[0.03] px-2 py-1.5 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-[12px] truncate flex items-center gap-1.5">
                    {q.status === 'running' && <span className="text-cyan-400 animate-pulse">▶</span>}
                    {q.job}{q.draft && <span className="text-[9px] text-amber-300">draft</span>}
                  </div>
                  <div className="text-[10px] text-zinc-500">
                    {q.status === 'running' ? 'running…' : q.runAt ? new Date(q.runAt).toLocaleString() : 'asap'}
                    {q.autoPublish && ' · auto-publish'}
                  </div>
                </div>
                {q.status !== 'running' && (
                  <button onClick={() => removeQueueItem(q.id)} className="text-zinc-500 hover:text-red-300 text-xs">✕</button>
                )}
              </div>
            ))}
          </div>

          {/* Part 2 — analytics feedback loop */}
          <div className="flex flex-col gap-1.5 border-t border-white/10 pt-2">
            <div className="flex items-center justify-between">
              <span className="text-xs uppercase tracking-wide text-zinc-500">Learnings</span>
              <span className="text-[10px] text-zinc-500">{learnings?.videos ?? 0} videos</span>
            </div>
            <div className="flex gap-1.5">
              <button onClick={() => runAnalytics('pull')} disabled={!!analyticsBusy}
                className="text-[11px] px-2 py-1 rounded bg-white/[0.06] hover:bg-white/[0.1] disabled:opacity-50">
                {analyticsBusy === 'pull' ? '…' : 'Pull'}</button>
              <button onClick={() => runAnalytics('analyze')} disabled={!!analyticsBusy}
                className="text-[11px] px-2 py-1 rounded bg-white/[0.06] hover:bg-white/[0.1] disabled:opacity-50">
                {analyticsBusy === 'analyze' ? '…' : 'Analyze'}</button>
            </div>
            {learnings && learnings.activeRules.length > 0 ? (
              <ul className="text-[10px] text-zinc-400 list-disc pl-4 flex flex-col gap-0.5">
                {learnings.activeRules.slice(0, 6).map((r) => <li key={r.id}>{r.rule}</li>)}
              </ul>
            ) : <div className="text-[10px] text-zinc-600">no promoted rules yet</div>}
            {learnings && learnings.changelog.length > 0 && (
              <div className="text-[10px] text-zinc-600">last: {learnings.changelog[0].date} — {learnings.changelog[0].change}</div>
            )}
          </div>

          <div className="text-xs uppercase tracking-wide text-zinc-500 border-t border-white/10 pt-2">Asset library ({assets.length})</div>
          <div className="overflow-auto grid grid-cols-2 gap-2">
            {assets.map((a) => (
              <div key={a} className="rounded border border-white/10 bg-white/[0.03] p-1.5 flex flex-col items-center gap-1">
                <img src={`/api/channels/${channel}/assets/${a}`} alt={a} className="w-full h-16 object-contain" />
                <div className="text-[10px] text-zinc-500 truncate w-full text-center">{a}</div>
              </div>
            ))}
          </div>
        </aside>
      </div>
    </div>
  );
}

// datetime-local expects "YYYY-MM-DDTHH:mm" in LOCAL time; convert a stored ISO/UTC string to that.
function toLocalInput(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// ── Voice controls panel ──
function VoicePanel({ voice, setVoice, tts }: { voice: VoiceOpts; setVoice: (v: VoiceOpts) => void; tts: { active: string } | null }) {
  const set = <K extends keyof VoiceOpts>(k: K, v: VoiceOpts[K]) => setVoice({ ...voice, [k]: v });
  return (
    <div className="flex flex-col gap-2 rounded border border-white/10 bg-white/[0.02] p-3">
      <label className="text-xs uppercase tracking-wide text-zinc-500">Voice {tts ? `· ${tts.active}` : ''}</label>
      <div className="grid grid-cols-2 gap-2 text-xs">
        <label className="flex flex-col gap-1 text-zinc-400">backend
          <select value={voice.backend} onChange={(e) => set('backend', e.target.value as VoiceOpts['backend'])}
            className="bg-white/5 border border-white/10 rounded px-2 py-1 text-zinc-200">
            <option value="">auto ({tts?.active ?? 'fish'})</option>
            <option value="fish">fish (S1)</option>
            <option value="sapi">sapi (stand-in)</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-zinc-400">model
          <select value={voice.model} onChange={(e) => set('model', e.target.value)}
            className="bg-white/5 border border-white/10 rounded px-2 py-1 text-zinc-200">
            <option value="s1">s1</option>
            <option value="s1-mini">s1-mini</option>
            <option value="speech-1.5">speech-1.5</option>
          </select>
        </label>
      </div>
      <label className="flex flex-col gap-1 text-xs text-zinc-400">voice id (Fish reference)
        <input value={voice.voice} onChange={(e) => set('voice', e.target.value)} placeholder="channel default"
          className="bg-white/5 border border-white/10 rounded px-2 py-1 text-zinc-200" />
      </label>
      <Slider label="Speed" min={0.5} max={2} step={0.05} value={voice.speed} onChange={(v) => set('speed', v)} fmt={(v) => `${v.toFixed(2)}×`} />
      <Slider label="Expressiveness" min={0} max={1} step={0.05} value={voice.temperature} onChange={(v) => { set('temperature', v); }} fmt={(v) => v.toFixed(2)} hint="low = flat/steady · high = dynamic" />
      <Slider label="Variation" min={0} max={1} step={0.05} value={voice.topP} onChange={(v) => set('topP', v)} fmt={(v) => v.toFixed(2)} />
      <Slider label="Volume" min={-20} max={20} step={1} value={voice.volume} onChange={(v) => set('volume', v)} fmt={(v) => `${v > 0 ? '+' : ''}${v} dB`} />
    </div>
  );
}

function Slider({ label, min, max, step, value, onChange, fmt, hint }: { label: string; min: number; max: number; step: number; value: number; onChange: (v: number) => void; fmt: (v: number) => string; hint?: string }) {
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="text-zinc-500 w-28 shrink-0">{label}{hint && <span className="block text-[9px] text-zinc-600 leading-tight">{hint}</span>}</span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="flex-1" />
      <span className="text-zinc-400 w-14 text-right tabular-nums">{fmt(value)}</span>
    </div>
  );
}

const ARCHETYPES = ['blueprint_board', 'flat_motion_explainer', 'documentary_slate', 'notebook_sketch'];

// ── shared spec field editor (used by New + Edit) ──
function SpecFields({ spec, patch }: { spec: ChannelSpec; patch: (path: string[], value: unknown) => void }) {
  const swatch = (label: string, key: keyof ChannelSpec['palette']) => (
    <label className="flex items-center gap-1.5 text-[11px] text-zinc-400">
      <input type="color" value={spec.palette[key]} onChange={(e) => patch(['palette', key], e.target.value)} className="w-6 h-6 rounded bg-transparent border border-white/10" />
      {label}
    </label>
  );
  return (
    <>
      <div className="rounded-lg border border-white/10 p-3 flex flex-col gap-2" style={{ background: spec.palette.background }}>
        <div className="flex items-center justify-between">
          <div style={{ color: spec.palette.textPrimary, fontWeight: 700 }} className="text-lg">{spec.title}</div>
          <span className="text-[11px] px-2 py-0.5 rounded-full border" style={{ color: spec.palette.accent1, borderColor: spec.palette.accent1 }}>{spec.archetype}</span>
        </div>
        <div style={{ color: spec.palette.textSecondary }} className="text-xs">{spec.assetStyle.style} · {spec.background.mode} · grain {spec.background.grain} · {spec.cameraProfile.movement} camera</div>
        <div style={{ color: spec.palette.accent2 }} className="text-sm">{spec.typography.display} / {spec.typography.body}</div>
      </div>

      <div className="grid grid-cols-2 gap-3 max-[640px]:grid-cols-1 text-sm">
        <label className="flex flex-col gap-1 text-[11px] text-zinc-400">title
          <input value={spec.title} onChange={(e) => patch(['title'], e.target.value)} className="bg-white/5 border border-white/10 rounded px-2 py-1 text-sm text-zinc-200" />
        </label>
        <label className="flex flex-col gap-1 text-[11px] text-zinc-400">archetype
          <select value={spec.archetype} onChange={(e) => patch(['archetype'], e.target.value)} className="bg-white/5 border border-white/10 rounded px-2 py-1 text-sm text-zinc-200">
            {ARCHETYPES.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-[11px] text-zinc-400">niche
          <input value={spec.niche} onChange={(e) => patch(['niche'], e.target.value)} className="bg-white/5 border border-white/10 rounded px-2 py-1 text-sm text-zinc-200" />
        </label>
        <label className="flex flex-col gap-1 text-[11px] text-zinc-400">length (minutes)
          <input type="number" min={0.5} step={0.5} value={spec.format.minutes} onChange={(e) => patch(['format', 'minutes'], Number(e.target.value))} className="bg-white/5 border border-white/10 rounded px-2 py-1 text-sm text-zinc-200" />
        </label>
        <label className="flex flex-col gap-1 text-[11px] text-zinc-400">display font
          <input value={spec.typography.display} onChange={(e) => patch(['typography', 'display'], e.target.value)} className="bg-white/5 border border-white/10 rounded px-2 py-1 text-sm text-zinc-200" />
        </label>
        <label className="flex flex-col gap-1 text-[11px] text-zinc-400">body font
          <input value={spec.typography.body} onChange={(e) => patch(['typography', 'body'], e.target.value)} className="bg-white/5 border border-white/10 rounded px-2 py-1 text-sm text-zinc-200" />
        </label>
        <label className="flex flex-col gap-1 text-[11px] text-zinc-400">camera movement
          <select value={spec.cameraProfile.movement} onChange={(e) => patch(['cameraProfile', 'movement'], e.target.value)} className="bg-white/5 border border-white/10 rounded px-2 py-1 text-sm text-zinc-200">
            {['minimal', 'gentle', 'cinematic'].map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-[11px] text-zinc-400">grain ({spec.background.grain})
          <input type="range" min={0} max={1} step={0.01} value={spec.background.grain} onChange={(e) => patch(['background', 'grain'], Number(e.target.value))} />
        </label>
        <label className="flex flex-col gap-1 text-[11px] text-zinc-400">TTS voice id
          <input value={spec.audioIdentity.voice} onChange={(e) => patch(['audioIdentity', 'voice'], e.target.value)} placeholder="Fish S1 reference id" className="bg-white/5 border border-white/10 rounded px-2 py-1 text-sm text-zinc-200" />
        </label>
        <label className="flex flex-col gap-1 text-[11px] text-zinc-400">script tone
          <input value={spec.scriptStyle.tone} onChange={(e) => patch(['scriptStyle', 'tone'], e.target.value)} className="bg-white/5 border border-white/10 rounded px-2 py-1 text-sm text-zinc-200" />
        </label>
        <label className="flex flex-col gap-1 text-[11px] text-zinc-400">hook style
          <input value={spec.scriptStyle.hookStyle} onChange={(e) => patch(['scriptStyle', 'hookStyle'], e.target.value)} className="bg-white/5 border border-white/10 rounded px-2 py-1 text-sm text-zinc-200" />
        </label>
      </div>

      <div className="flex flex-wrap gap-3 items-center">
        <span className="text-[11px] text-zinc-500">palette:</span>
        {swatch('bg', 'background')}{swatch('text', 'textPrimary')}{swatch('a1', 'accent1')}{swatch('a2', 'accent2')}{swatch('money', 'money')}
      </div>
    </>
  );
}

function patchSpec(setSpec: React.Dispatch<React.SetStateAction<ChannelSpec | null>>) {
  return (path: string[], value: unknown) => setSpec((s) => {
    if (!s) return s;
    const next: ChannelSpec = JSON.parse(JSON.stringify(s));
    let o: Record<string, unknown> = next as unknown as Record<string, unknown>;
    for (let i = 0; i < path.length - 1; i++) o = o[path[i]] as Record<string, unknown>;
    o[path[path.length - 1]] = value;
    return next;
  });
}

function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={onClose}>
      <div className={`bg-[#0d0f17] border border-white/15 rounded-xl w-full ${wide ? 'max-w-3xl' : 'max-w-2xl'} max-h-[88vh] overflow-auto p-5 flex flex-col gap-4`} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold">{title}</h2>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-200 text-sm">✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

// ── Edit existing channel ──
function EditChannelModal({ initial, onClose, onSaved }: { initial: ChannelSpec; onClose: () => void; onSaved: (s: ChannelSpec) => void }) {
  const [spec, setSpec] = useState<ChannelSpec | null>(initial);
  const [saving, setSaving] = useState(false);
  const patch = patchSpec(setSpec);

  async function save() {
    if (!spec) return;
    setSaving(true);
    try {
      await jpost(`/api/channels/${spec.id}/spec`, { spec });
      onSaved(spec);
    } catch (e) { alert((e as Error).message); } finally { setSaving(false); }
  }

  if (!spec) return null;
  return (
    <Modal title={`Edit channel — ${spec.id}`} onClose={onClose}>
      <SpecFields spec={spec} patch={patch} />
      <div className="flex justify-end gap-2">
        <button onClick={onClose} className="px-3 py-1.5 rounded bg-white/5 border border-white/10 text-sm">Cancel</button>
        <button onClick={save} disabled={saving} className="px-4 py-1.5 rounded bg-emerald-500/25 border border-emerald-400/40 text-emerald-100 text-sm hover:bg-emerald-500/35 disabled:opacity-40">{saving ? 'saving…' : 'Save changes'}</button>
      </div>
    </Modal>
  );
}

// ── Channel upload schedule ──
function ScheduleModal({ channel, initial, onClose, onSaved }: { channel: string; initial: ScheduleConfig; onClose: () => void; onSaved: (s: ScheduleConfig) => void }) {
  const [cfg, setCfg] = useState<ScheduleConfig>(initial);
  const [saving, setSaving] = useState(false);
  const toggleDay = (d: string) => setCfg({ ...cfg, cadence: { ...cfg.cadence, days: cfg.cadence.days.includes(d) ? cfg.cadence.days.filter((x) => x !== d) : [...cfg.cadence.days, d] } });

  async function save() {
    setSaving(true);
    try { const d = await jpost<{ schedule: ScheduleConfig }>(`/api/channels/${channel}/schedule`, cfg); onSaved(d.schedule); }
    catch (e) { alert((e as Error).message); } finally { setSaving(false); }
  }

  return (
    <Modal title={`Upload schedule — ${channel}`} onClose={onClose}>
      <div className="grid grid-cols-2 gap-3 max-[640px]:grid-cols-1 text-sm">
        <label className="flex flex-col gap-1 text-[11px] text-zinc-400">timezone (IANA)
          <input value={cfg.timezone} onChange={(e) => setCfg({ ...cfg, timezone: e.target.value })} className="bg-white/5 border border-white/10 rounded px-2 py-1 text-sm text-zinc-200" />
        </label>
        <label className="flex flex-col gap-1 text-[11px] text-zinc-400">default privacy
          <select value={cfg.privacyStatus} onChange={(e) => setCfg({ ...cfg, privacyStatus: e.target.value as ScheduleConfig['privacyStatus'] })} className="bg-white/5 border border-white/10 rounded px-2 py-1 text-sm text-zinc-200">
            <option value="private">private</option><option value="unlisted">unlisted</option><option value="public">public</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-[11px] text-zinc-400">publish times (comma, HH:mm)
          <input value={cfg.cadence.times.join(', ')} onChange={(e) => setCfg({ ...cfg, cadence: { ...cfg.cadence, times: e.target.value.split(',').map((t) => t.trim()).filter(Boolean) } })} className="bg-white/5 border border-white/10 rounded px-2 py-1 text-sm text-zinc-200" />
        </label>
        <label className="flex flex-col gap-1 text-[11px] text-zinc-400">YouTube category id
          <input value={cfg.categoryId} onChange={(e) => setCfg({ ...cfg, categoryId: e.target.value })} className="bg-white/5 border border-white/10 rounded px-2 py-1 text-sm text-zinc-200" />
        </label>
        <label className="flex flex-col gap-1 text-[11px] text-zinc-400 col-span-2">default tags (comma separated)
          <input value={cfg.defaultTags.join(', ')} onChange={(e) => setCfg({ ...cfg, defaultTags: e.target.value.split(',').map((t) => t.trim()).filter(Boolean) })} className="bg-white/5 border border-white/10 rounded px-2 py-1 text-sm text-zinc-200" />
        </label>
      </div>
      <div className="flex flex-col gap-1.5">
        <span className="text-[11px] text-zinc-400">publish days</span>
        <div className="flex flex-wrap gap-1.5">
          {DAYS.map((d) => (
            <button key={d} onClick={() => toggleDay(d)} className={`px-2.5 py-1 rounded text-xs border ${cfg.cadence.days.includes(d) ? 'bg-cyan-500/20 border-cyan-400/40 text-cyan-100' : 'bg-white/5 border-white/10 text-zinc-400'}`}>{d}</button>
          ))}
        </div>
      </div>
      <label className="flex items-center gap-2 text-sm text-zinc-300">
        <input type="checkbox" checked={cfg.autoPublish} onChange={(e) => setCfg({ ...cfg, autoPublish: e.target.checked })} />
        auto-publish (schedule live at the next slot when a video is uploaded)
      </label>
      <div className="flex justify-end gap-2">
        <button onClick={onClose} className="px-3 py-1.5 rounded bg-white/5 border border-white/10 text-sm">Cancel</button>
        <button onClick={save} disabled={saving} className="px-4 py-1.5 rounded bg-emerald-500/25 border border-emerald-400/40 text-emerald-100 text-sm hover:bg-emerald-500/35 disabled:opacity-40">{saving ? 'saving…' : 'Save schedule'}</button>
      </div>
    </Modal>
  );
}

// ── Ideas picker ──
function IdeasModal({ busy, ideas, onClose, onPick, hasJob }: { busy: boolean; ideas: Idea[]; onClose: () => void; onPick: (i: Idea, generate: boolean) => void; hasJob: boolean }) {
  return (
    <Modal title="Pick a video idea" onClose={onClose} wide>
      {busy && <div className="text-sm text-zinc-400">Generating fresh on-brand ideas…</div>}
      {!busy && ideas.length === 0 && <div className="text-sm text-zinc-500">No ideas returned.</div>}
      <div className="flex flex-col gap-3">
        {ideas.map((idea, i) => (
          <div key={i} className="rounded-lg border border-white/10 bg-white/[0.03] p-3 flex flex-col gap-1.5">
            <div className="text-sm font-medium text-zinc-100">{idea.title}</div>
            {idea.summary && <div className="text-xs text-zinc-400">{idea.summary}</div>}
            {idea.rundown && <div className="text-[11px] text-zinc-500 leading-relaxed">{idea.rundown}</div>}
            <div className="flex gap-2 mt-1">
              <button onClick={() => onPick(idea, false)} className="text-xs px-2.5 py-1 rounded bg-white/10 border border-white/15 hover:bg-white/15">Use topic</button>
              <button onClick={() => onPick(idea, true)} disabled={!hasJob} title={hasJob ? '' : 'select a job first'}
                className="text-xs px-2.5 py-1 rounded bg-cyan-500/20 text-cyan-200 border border-cyan-500/30 hover:bg-cyan-500/30 disabled:opacity-40">Use & generate script</button>
            </div>
          </div>
        ))}
      </div>
    </Modal>
  );
}

// ── New channel (generate → editable preview → save) ──
function NewChannelModal({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [niche, setNiche] = useState('');
  const [audience, setAudience] = useState('');
  const [tone, setTone] = useState('');
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [spec, setSpec] = useState<ChannelSpec | null>(null);
  const [previewBusy, setPreviewBusy] = useState(false);
  const [previewImgs, setPreviewImgs] = useState<string[]>([]);
  const patch = patchSpec(setSpec);

  async function generate() {
    if (!title.trim() || !description.trim()) return;
    setBusy(true);
    setPreviewImgs([]);
    try {
      const d = await jpost<{ spec: ChannelSpec }>('/api/channels/generate', { title, description, niche, audience, tone });
      setSpec(d.spec);
    } catch (e) { alert((e as Error).message); } finally { setBusy(false); }
  }

  async function save() {
    if (!spec) return;
    setSaving(true);
    try {
      const d = await jpost<{ id: string }>('/api/channels/save', { spec });
      onCreated(d.id);
    } catch (e) { alert((e as Error).message); } finally { setSaving(false); }
  }

  async function previewLook() {
    if (!spec) return;
    setPreviewBusy(true);
    try {
      const d = await jpost<{ images: string[] }>('/api/channels/preview', { spec });
      setPreviewImgs(d.images);
    } catch (e) { alert((e as Error).message); } finally { setPreviewBusy(false); }
  }

  return (
    <Modal title="New Channel" onClose={onClose}>
      {!spec ? (
        <>
          <p className="text-xs text-zinc-500">Describe the channel. The generator designs a complete format spec — palette, fonts, asset style, camera/motion, voice — and picks a fitting archetype.</p>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title — e.g. Ancient Engineering" className="bg-white/5 border border-white/10 rounded px-3 py-2 text-sm" />
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Description — what the channel is about, the vibe, the audience…" className="h-24 bg-white/5 border border-white/10 rounded px-3 py-2 text-sm resize-none" />
          <div className="grid grid-cols-3 gap-2 max-[640px]:grid-cols-1">
            <input value={niche} onChange={(e) => setNiche(e.target.value)} placeholder="niche (optional)" className="bg-white/5 border border-white/10 rounded px-2 py-1.5 text-sm" />
            <input value={audience} onChange={(e) => setAudience(e.target.value)} placeholder="audience (optional)" className="bg-white/5 border border-white/10 rounded px-2 py-1.5 text-sm" />
            <input value={tone} onChange={(e) => setTone(e.target.value)} placeholder="tone (optional)" className="bg-white/5 border border-white/10 rounded px-2 py-1.5 text-sm" />
          </div>
          <div className="flex justify-end gap-2">
            <button onClick={onClose} className="px-3 py-1.5 rounded bg-white/5 border border-white/10 text-sm">Cancel</button>
            <button onClick={generate} disabled={busy || !title.trim() || !description.trim()} className="px-4 py-1.5 rounded bg-cyan-500/25 border border-cyan-400/40 text-cyan-100 text-sm hover:bg-cyan-500/35 disabled:opacity-40">{busy ? 'designing…' : 'Generate spec'}</button>
          </div>
        </>
      ) : (
        <>
          <SpecFields spec={spec} patch={patch} />
          {previewImgs.length > 0 && (
            <div className="grid grid-cols-3 gap-2 max-[640px]:grid-cols-1">
              {previewImgs.map((src, i) => (
                <img key={i} src={src} alt={`look preview ${i + 1}`} className="w-full rounded border border-white/10" />
              ))}
            </div>
          )}
          <div className="text-[11px] text-zinc-500">voice: {spec.scriptStyle.tone} · hook: {spec.scriptStyle.hookStyle}</div>
          <div className="flex justify-end gap-2">
            <button onClick={() => { setSpec(null); setPreviewImgs([]); }} className="px-3 py-1.5 rounded bg-white/5 border border-white/10 text-sm">← Back</button>
            <button onClick={previewLook} disabled={previewBusy} className="px-3 py-1.5 rounded bg-white/5 border border-white/10 text-sm disabled:opacity-40">{previewBusy ? 'rendering…' : previewImgs.length ? 'Re-preview' : 'Preview look'}</button>
            <button onClick={save} disabled={saving} className="px-4 py-1.5 rounded bg-emerald-500/25 border border-emerald-400/40 text-emerald-100 text-sm hover:bg-emerald-500/35 disabled:opacity-40">{saving ? 'saving…' : `Save & create (${spec.id})`}</button>
          </div>
        </>
      )}
    </Modal>
  );
}
