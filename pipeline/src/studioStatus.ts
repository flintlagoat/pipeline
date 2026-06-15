import './config/env';
import * as fs from 'fs';
import * as path from 'path';

// Read-only "studio overview" — one clear picture of the whole operation: every channel, the render
// queue (what's rendering / waiting / done), and exactly WHEN each video goes live. Touches nothing;
// safe to run while the server is draining the queue. Run: `npm run studio`.

const ROOT = path.resolve(__dirname, '..', '..');
const ET = 'America/New_York';

function readJson<T>(p: string): T | undefined {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')) as T; } catch { return undefined; }
}
function exists(p: string): boolean { try { return fs.existsSync(p); } catch { return false; } }
function pad(s: string, n: number): string { s = s ?? ''; return s.length > n ? s.slice(0, n - 1) + '…' : s.padEnd(n); }

function fmtET(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  try {
    return new Intl.DateTimeFormat('en-US', {
      timeZone: ET, month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit',
    }).format(d);
  } catch { return iso; }
}

interface QueueItem {
  channel: string; job: string; runAt: string | null; autoPublish: boolean;
  status: string; startedAt: string | null; finishedAt: string | null; error: string | null;
}

function jobTitle(channel: string, job: string): string {
  const meta = readJson<{ topic?: string; packaging?: { title?: string } }>(path.join(ROOT, 'jobs', channel, job, 'meta.json'));
  return meta?.packaging?.title ?? meta?.topic ?? job;
}
function jobPublishAt(channel: string, job: string): string | null {
  const ov = readJson<{ publishAt?: string }>(path.join(ROOT, 'jobs', channel, job, 'publish.json'));
  return ov?.publishAt ?? null;
}
function statusIcon(s: string): string {
  return s === 'running' ? '▶ run ' : s === 'done' ? '✓ done' : s === 'failed' ? '✗ FAIL' : '· wait';
}

function listChannels(): string[] {
  const base = path.join(ROOT, 'channels');
  if (!exists(base)) return [];
  return fs.readdirSync(base).filter((id) => exists(path.join(base, id, 'channel.spec.json')) || exists(path.join(base, id, 'config.json')));
}
function countPublished(channel: string): number {
  const base = path.join(ROOT, 'output', channel);
  if (!exists(base)) return 0;
  let n = 0;
  for (const job of fs.readdirSync(base)) {
    const r = readJson<{ videoId?: string }>(path.join(base, job, 'publish.result.json'));
    if (r?.videoId) n++;
  }
  return n;
}

function main(): void {
  const queue = readJson<QueueItem[]>(path.join(ROOT, 'jobs', '_queue.json')) ?? [];
  const now = Date.now();

  console.log('\n══════════════════════════════════════════════════════════════════════════════');
  console.log('  INKWELL STUDIO — STATUS OVERVIEW');
  console.log(`  ${new Date().toISOString()}  (times below shown in ${ET})`);
  console.log('══════════════════════════════════════════════════════════════════════════════');

  // ── Channels ──
  const channels = listChannels();
  console.log('\nCHANNELS');
  for (const id of channels) {
    const spec = readJson<{ archetype?: string; title?: string }>(path.join(ROOT, 'channels', id, 'channel.spec.json'));
    const sched = readJson<{ cadence?: { times?: string[] }; timezone?: string; autoPublish?: boolean }>(path.join(ROOT, 'channels', id, 'schedule.json'));
    const look = spec?.archetype ?? 'blueprint_board (legacy)';
    const times = sched?.cadence?.times?.join(', ') ?? '—';
    const auto = sched ? (sched.autoPublish ? 'autoPublish ON' : 'autoPublish off') : 'no schedule.json';
    console.log(`  ${pad(id, 22)} look=${pad(look, 20)} published=${String(countPublished(id)).padStart(2)}  slots=[${times}] ${auto}`);
  }

  // ── Render queue ──
  const active = queue.filter((q) => q.status === 'running' || q.status === 'waiting');
  const finished = queue.filter((q) => q.status === 'done' || q.status === 'failed');
  console.log('\nRENDER QUEUE (upcoming + in-progress)');
  console.log('  ' + pad('STATUS', 7) + pad('CHANNEL / JOB', 34) + pad('TITLE', 30) + pad('RENDERS', 16) + 'GOES LIVE');
  console.log('  ' + '─'.repeat(104));
  if (!active.length) console.log('  (nothing waiting or running)');
  for (const it of active) {
    const renderWhen = it.status === 'running' ? 'now (rendering)'
      : it.runAt && new Date(it.runAt).getTime() > now ? fmtET(it.runAt) : 'as soon as free';
    const live = it.autoPublish ? fmtET(jobPublishAt(it.channel, it.job)) : 'private (no publish)';
    console.log('  ' + pad(statusIcon(it.status), 7) + pad(`${it.channel}/${it.job}`, 34) + pad(jobTitle(it.channel, it.job), 30) + pad(renderWhen, 16) + live);
  }

  if (finished.length) {
    console.log('\nRECENTLY FINISHED');
    for (const it of finished.slice(-6)) {
      const note = it.status === 'failed' ? `  ✗ ${it.error ?? 'failed'}` : '';
      console.log('  ' + pad(statusIcon(it.status), 7) + pad(`${it.channel}/${it.job}`, 34) + pad(jobTitle(it.channel, it.job), 30) + note);
    }
  }

  // ── Summary ──
  const waiting = queue.filter((q) => q.status === 'waiting').length;
  const running = queue.filter((q) => q.status === 'running').length;
  const nextLive = active
    .filter((q) => q.autoPublish)
    .map((q) => jobPublishAt(q.channel, q.job))
    .filter((x): x is string => !!x)
    .sort()[0];
  console.log('\nSUMMARY');
  console.log(`  ${running} rendering · ${waiting} waiting · ${finished.length} finished this run`);
  console.log(`  next video goes live: ${fmtET(nextLive)}`);
  console.log('  (the queue only advances while the Studio server is running: npm run ui:server)\n');
}

main();
