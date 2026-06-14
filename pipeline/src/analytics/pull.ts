import * as fs from 'fs';
import * as path from 'path';
import { ROOT, channelDir, jobDir, outputDir } from '../config/paths';
import { hasAuth } from '../publish/youtubeClient';
import { pullVideo } from './youtubeAnalytics';
import { loadLearnings, saveLearnings, upsertVideoLog, VideoLogEntry } from './learnings';

// analytics:pull (Part 2). Discovers this channel's PUBLISHED videos (from publish.result.json
// written by the publish step), pulls per-video metrics + retention from the YouTube Analytics
// API, archives the raw pull at channels/<id>/analytics/raw/<date>.json, and refreshes the
// videoLog in learnings.json. Runs standalone AND as a pre-step before each new generation.

export interface PublishedRef { jobId: string; videoId: string; }

/** Scan each output/<channel>/<job>/publish.result.json for uploaded videos (with a real videoId). */
export function discoverPublishedVideos(channelId: string): PublishedRef[] {
  const chOut = path.join(ROOT, 'output', channelId);
  if (!fs.existsSync(chOut)) return [];
  const refs: PublishedRef[] = [];
  for (const jobId of fs.readdirSync(chOut)) {
    const p = path.join(chOut, jobId, 'publish.result.json');
    if (!fs.existsSync(p)) continue;
    try {
      const r = JSON.parse(fs.readFileSync(p, 'utf8')) as { videoId?: string };
      if (r.videoId) refs.push({ jobId, videoId: r.videoId });
    } catch { /* skip malformed */ }
  }
  return refs;
}

function firstBeatOfJob(channelId: string, jobId: string): string {
  const p = path.join(jobDir(channelId, jobId), 'script.txt');
  if (!fs.existsSync(p)) return '';
  return (fs.readFileSync(p, 'utf8').trim().split(/\n\s*\n/)[0] ?? '').trim();
}

function injectedRuleIdsOfJob(channelId: string, jobId: string): string[] {
  const p = path.join(jobDir(channelId, jobId), 'learnings_applied.json');
  if (!fs.existsSync(p)) return [];
  try { return (JSON.parse(fs.readFileSync(p, 'utf8')).ruleIds as string[]) ?? []; } catch { return []; }
}

// Key generation choices to attribute performance to (session 7): the narrative arc + packaging
// title. Lets the analysis step learn which STRUCTURES (not just scripts) retain viewers.
function specChoicesOfJob(channelId: string, jobId: string): Record<string, unknown> {
  const p = path.join(jobDir(channelId, jobId), 'meta.json');
  if (!fs.existsSync(p)) return {};
  try {
    const m = JSON.parse(fs.readFileSync(p, 'utf8')) as { scriptArc?: string; packaging?: { title?: string } };
    const out: Record<string, unknown> = {};
    if (m.scriptArc) out.scriptArc = m.scriptArc;
    if (m.packaging?.title) out.packagingTitle = m.packaging.title;
    return out;
  } catch { return {}; }
}

export interface PullSummary { videos: number; rawPath: string; skipped: boolean; }

export async function pullAnalytics(channelId: string): Promise<PullSummary> {
  const refs = discoverPublishedVideos(channelId);
  const rawDir = path.join(channelDir(channelId), 'analytics', 'raw');
  fs.mkdirSync(rawDir, { recursive: true });
  const rawPath = path.join(rawDir, `${new Date().toISOString().slice(0, 10)}.json`);

  if (!hasAuth(channelId)) {
    console.warn(`  [analytics:pull] No YouTube auth for "${channelId}" — cannot pull live metrics. ` +
      `Run npm run youtube:auth ${channelId}. (Analyze will run on existing learnings/fixtures.)`);
    return { videos: 0, rawPath, skipped: true };
  }
  if (refs.length === 0) {
    console.log(`  [analytics:pull] No published videos found for "${channelId}" yet (nothing to pull).`);
    fs.writeFileSync(rawPath, JSON.stringify({ channelId, pulledAt: new Date().toISOString(), videos: [] }, null, 2), 'utf8');
    return { videos: 0, rawPath, skipped: false };
  }

  const learnings = loadLearnings(channelId);
  const rawVideos: unknown[] = [];

  for (const ref of refs) {
    try {
      console.log(`  [analytics:pull] ${ref.videoId} (job ${ref.jobId})...`);
      const pulled = await pullVideo(channelId, ref.videoId);
      rawVideos.push(pulled);

      const entry: VideoLogEntry = {
        jobId: ref.jobId,
        videoId: ref.videoId,
        title: pulled.title,
        publishedAt: pulled.publishedAt,
        hookText: firstBeatOfJob(channelId, ref.jobId),
        injectedRuleIds: injectedRuleIdsOfJob(channelId, ref.jobId),
        specChoices: specChoicesOfJob(channelId, ref.jobId),
        metrics: pulled.metrics,
        retentionCurve: pulled.retentionCurve,
        pulledAt: new Date().toISOString(),
      };
      upsertVideoLog(learnings, entry);
    } catch (e) {
      console.warn(`  [analytics:pull] failed for ${ref.videoId}: ${(e as Error).message}`);
    }
  }

  fs.writeFileSync(rawPath, JSON.stringify({ channelId, pulledAt: new Date().toISOString(), videos: rawVideos }, null, 2), 'utf8');
  saveLearnings(learnings);
  console.log(`  [analytics:pull] archived raw → ${rawPath}; videoLog now ${learnings.videoLog.length} entries.`);
  return { videos: rawVideos.length, rawPath, skipped: false };
}
