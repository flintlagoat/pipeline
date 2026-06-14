import * as fs from 'fs';
import * as path from 'path';
import { jobDir, outputDir } from '../config/paths';
import { ScheduleConfig } from './schedule';
import { VideoPackage } from '../autopilot/packaging';

// Build the YouTube video metadata for a job from whatever the pipeline already has, with an
// optional per-job override file. Generic — no topic/niche hardcoding.
//
// Session 6 upgrade: the description is now a real SEO asset — packaging's keyword-rich opener,
// auto-generated CHAPTERS derived from the actual board sections + reveal timestamps (chapters
// add search surface and a retention-friendly map of the video), and the channel's boilerplate
// (credits/attribution — e.g. the required Kevin MacLeod CC-BY line — lives in schedule.json).
//
// Sources (first present wins):
//   • jobs/<ch>/<job>/publish.json   — explicit overrides { title, description, tags, categoryId }
//   • jobs/<ch>/<job>/meta.json      — { topic, packaging } written at script-gen time
//   • output/<ch>/<job>/board_spec.json — sections + reveal times → chapters
//   • jobs/<ch>/<job>/script.txt     — first beat → description fallback
//   • channel schedule.json          — defaultTags, categoryId, descriptionBoilerplate

export interface VideoMetadata {
  title: string;
  description: string;
  tags: string[];
  categoryId: string;
}

export interface PublishOverride {
  title?: string;
  description?: string;
  tags?: string[];
  categoryId?: string;
  privacyStatus?: 'private' | 'unlisted' | 'public'; // per-job privacy (overrides the channel default)
  publishAt?: string;                                 // explicit RFC3339 go-live time (overrides cadence)
}

function readJson<T>(p: string): T | undefined {
  if (!fs.existsSync(p)) return undefined;
  try { return JSON.parse(fs.readFileSync(p, 'utf8')) as T; } catch { return undefined; }
}

/** Per-job publish override (jobs/<ch>/<job>/publish.json), if present. */
export function readPublishOverride(channelId: string, jobId: string): PublishOverride {
  return readJson<PublishOverride>(path.join(jobDir(channelId, jobId), 'publish.json')) ?? {};
}

function firstBeat(script: string): string {
  const beat = script.trim().split(/\n\s*\n/)[0] ?? '';
  return beat.trim();
}

/** Locate a thumbnail image for the job (jpg/jpeg/png) in the job or output dir, if any. */
export function findThumbnail(channelId: string, jobId: string): string | undefined {
  for (const dir of [jobDir(channelId, jobId), outputDir(channelId, jobId)]) {
    for (const name of ['thumbnail.jpg', 'thumbnail.jpeg', 'thumbnail.png']) {
      const p = path.join(dir, name);
      if (fs.existsSync(p)) return p;
    }
  }
  return undefined;
}

// ── Chapters (session 6) ──────────────────────────────────────────────────────

interface SpecElement {
  type?: string;
  reveal_at_seconds?: number;
  content?: string;
  lines?: string[];
}
interface SpecSection { section_type?: string; elements?: SpecElement[]; }

function formatTimestamp(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  const mm = h > 0 ? String(m).padStart(2, '0') : String(m);
  return `${h > 0 ? `${h}:` : ''}${mm}:${String(sec).padStart(2, '0')}`;
}

function sectionLabel(sec: SpecSection): string {
  // Prefer the section's first headline (the spec generator writes real, punchy ones), then an
  // eyebrow, then a prettified section_type.
  for (const type of ['headline', 'eyebrow']) {
    const el = (sec.elements ?? []).find((e) => e.type === type && (e.content || e.lines?.length));
    if (el) {
      const raw = (el.content ?? el.lines?.join(' ') ?? '').replace(/\s+/g, ' ').trim();
      if (raw) return raw.slice(0, 80);
    }
  }
  const t = (sec.section_type ?? 'chapter').replace(/_/g, ' ');
  return t.charAt(0).toUpperCase() + t.slice(1);
}

/**
 * Build a YouTube chapters block from the job's rendered board spec: one chapter per section,
 * starting at the section's first reveal. Returns '' unless YouTube's rules are satisfiable
 * (first chapter at 0:00, ≥3 chapters, each ≥10s long).
 */
export function buildChapters(channelId: string, jobId: string): string {
  const spec = readJson<{ duration_seconds?: number; board?: { sections?: SpecSection[] } }>(
    path.join(outputDir(channelId, jobId), 'board_spec.json')
  );
  const sections = spec?.board?.sections ?? [];
  if (sections.length < 3) return '';

  const chapters: { at: number; label: string }[] = [];
  for (const sec of sections) {
    const reveals = (sec.elements ?? [])
      .map((e) => e.reveal_at_seconds)
      .filter((t): t is number => typeof t === 'number' && Number.isFinite(t));
    if (reveals.length === 0) continue;
    chapters.push({ at: Math.min(...reveals), label: sectionLabel(sec) });
  }
  if (chapters.length < 3) return '';

  chapters.sort((a, b) => a.at - b.at);
  chapters[0].at = 0; // YouTube requires the list to start at 0:00
  // Enforce ≥10s per chapter by dropping any chapter that starts too soon after the previous.
  const spaced: { at: number; label: string }[] = [];
  for (const c of chapters) {
    if (spaced.length === 0 || c.at - spaced[spaced.length - 1].at >= 10) spaced.push(c);
  }
  if (spaced.length < 3) return '';

  return spaced.map((c) => `${formatTimestamp(c.at)} ${c.label}`).join('\n');
}

// ── Metadata assembly ─────────────────────────────────────────────────────────

export function buildVideoMetadata(
  channelId: string,
  jobId: string,
  schedule: ScheduleConfig
): VideoMetadata {
  const override = readJson<PublishOverride>(path.join(jobDir(channelId, jobId), 'publish.json')) ?? {};
  const meta = readJson<{ topic?: string; packaging?: VideoPackage }>(path.join(jobDir(channelId, jobId), 'meta.json')) ?? {};
  const pkg = meta.packaging;

  const scriptPath = path.join(jobDir(channelId, jobId), 'script.txt');
  const script = fs.existsSync(scriptPath) ? fs.readFileSync(scriptPath, 'utf8') : '';

  // Title: explicit override → packaging's designed title → topic → jobId. YouTube cap 100.
  const title = (override.title ?? pkg?.title ?? meta.topic ?? jobId).toString().slice(0, 100);

  // Description: opener (override → packaging's keyword-rich description → first script beat),
  // then chapters, then channel boilerplate (credits/attribution/links from schedule.json).
  const opener = (override.description ?? pkg?.description ?? firstBeat(script)).trim();
  const chapters = override.description ? '' : buildChapters(channelId, jobId);
  const parts = [opener];
  if (chapters) parts.push(`Chapters:\n${chapters}`);
  if (schedule.descriptionBoilerplate?.trim()) parts.push(schedule.descriptionBoilerplate.trim());
  const description = parts.filter(Boolean).join('\n\n').slice(0, 4900); // YouTube cap is 5000

  const tags = override.tags ?? schedule.defaultTags ?? [];
  const categoryId = override.categoryId ?? schedule.categoryId ?? '27';

  return { title, description, tags, categoryId };
}
