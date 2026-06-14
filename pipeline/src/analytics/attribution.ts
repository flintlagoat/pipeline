import * as fs from 'fs';
import * as path from 'path';
import { outputDir } from '../config/paths';
import { RetentionPoint } from './learnings';

// Retention → beat attribution (session 6). The retention curve alone says "viewers left at
// 23%"; this module says "viewers left at 1:32, during the section headlined 'THE $3,000
// MACHINE' (comparison)". Mapping drops to the EXACT script beat on screen turns the analysis
// step's dropoffNotes from guesses into structural evidence the script generator can act on.

interface SpecElement { type?: string; reveal_at_seconds?: number; content?: string; lines?: string[]; }
interface SpecSection { id?: string; section_type?: string; elements?: SpecElement[]; }
interface BoardSpecLite { duration_seconds?: number; board?: { sections?: SpecSection[] }; }

interface BeatWindow { start: number; label: string; sectionType: string; }

function fmt(t: number): string {
  const s = Math.max(0, Math.round(t));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function sectionLabel(sec: SpecSection): string {
  for (const type of ['headline', 'eyebrow']) {
    const el = (sec.elements ?? []).find((e) => e.type === type && (e.content || e.lines?.length));
    if (el) {
      const raw = (el.content ?? el.lines?.join(' ') ?? '').replace(/\s+/g, ' ').trim();
      if (raw) return raw.slice(0, 60);
    }
  }
  return sec.id ?? sec.section_type ?? 'section';
}

function beatWindows(spec: BoardSpecLite): BeatWindow[] {
  const windows: BeatWindow[] = [];
  for (const sec of spec.board?.sections ?? []) {
    const reveals = (sec.elements ?? [])
      .map((e) => e.reveal_at_seconds)
      .filter((t): t is number => typeof t === 'number' && Number.isFinite(t));
    if (reveals.length === 0) continue;
    windows.push({ start: Math.min(...reveals), label: sectionLabel(sec), sectionType: sec.section_type ?? '?' });
  }
  return windows.sort((a, b) => a.start - b.start);
}

function beatAt(windows: BeatWindow[], t: number): BeatWindow | undefined {
  let current: BeatWindow | undefined;
  for (const w of windows) {
    if (w.start <= t) current = w;
    else break;
  }
  return current;
}

/**
 * Map a video's retention curve onto the script beats that were on screen. Returns human-readable
 * evidence lines for the analysis prompt: the largest drops (where + during which beat) plus the
 * 30-second checkpoint. Empty when the job's board_spec.json is missing (e.g. hand-made videos).
 */
export function retentionBeatLines(
  channelId: string,
  jobId: string,
  curve: RetentionPoint[]
): string[] {
  if (!curve || curve.length < 3) return [];
  const specPath = path.join(outputDir(channelId, jobId), 'board_spec.json');
  if (!fs.existsSync(specPath)) return [];

  let spec: BoardSpecLite;
  try { spec = JSON.parse(fs.readFileSync(specPath, 'utf8')) as BoardSpecLite; } catch { return []; }
  const duration = spec.duration_seconds;
  if (!duration || !Number.isFinite(duration)) return [];
  const windows = beatWindows(spec);
  if (windows.length === 0) return [];

  // Prefer the absolute audience share when present; fall back to relative retention.
  const value = (p: RetentionPoint) => p.audienceWatchRatio ?? p.relativeRetention;
  const sorted = [...curve].sort((a, b) => a.elapsedRatio - b.elapsedRatio);

  // The steepest drops between consecutive samples, attributed to the beat on screen.
  const drops: { t: number; delta: number; beat: BeatWindow | undefined }[] = [];
  for (let i = 1; i < sorted.length; i++) {
    const delta = value(sorted[i]) - value(sorted[i - 1]);
    if (delta < -0.02) {
      const t = sorted[i].elapsedRatio * duration;
      drops.push({ t, delta, beat: beatAt(windows, t) });
    }
  }
  drops.sort((a, b) => a.delta - b.delta);

  const lines = drops.slice(0, 3).map((d) =>
    `drop of ${(Math.abs(d.delta) * 100).toFixed(0)}pp at ${fmt(d.t)}${
      d.beat ? ` during "${d.beat.label}" [${d.beat.sectionType}]` : ''
    }`
  );

  // 30-second checkpoint — the hook's report card.
  const at30 = sorted.find((p) => p.elapsedRatio * duration >= 30);
  if (at30) {
    const beat = beatAt(windows, 30);
    lines.push(
      `retention at 0:30 = ${(value(at30) * 100).toFixed(0)}%${beat ? ` (on screen: "${beat.label}")` : ''}`
    );
  }
  return lines;
}
