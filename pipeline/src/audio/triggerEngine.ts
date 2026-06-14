import { BoardSpec, WordTimestamp } from '../types/specTypes';
import { ResolvedSfxConfig } from './audioConfig';
import { SoundLibrary, categoryHasSound } from './soundLibrary';

// Trigger-analysis engine (PART C). The SINGLE place that decides which sound category fires
// at which time. It reads board-spec events + script semantics + word timestamps and emits a
// sparse, prioritized, well-spaced list of cues. Fully generic across topics — it keys off
// event SHAPE (scene establishment, money magnitude, the revelation beat), never off any
// specific noun/brand. Categories with no sound files are simply never scheduled.

export interface SfxCue {
  time: number;
  category: string;
}

// Priority when two candidate cues are closer than min spacing — the higher number wins the
// slot. money/impact are meaningful and rare, so they outrank ambient motion/ui.
const PRIORITY: Record<string, number> = { money: 3, impact: 2, motion: 1, ui: 0 };

// Per-category hard caps (independent of the global cap) — keeps the rarest cues rare.
const CATEGORY_CAP: Record<string, number> = { money: 2, impact: 1, motion: Infinity, ui: 3 };
const MONEY_DEDUP_WINDOW = 1.0;

// ── Money magnitude (generalized from the old sfx.ts) ──────────────────────────
// Largest dollar magnitude implied by a string, or 0 if none/qualitative.
// "$1.50" → 1.5 ; "$2,400" → 2400 ; "$3 million" → 3,000,000 ; "doubled" → 0.
export function moneyMagnitude(text: string): number {
  let max = 0;
  const re = /\$\s?([\d,]+(?:\.\d+)?)\s*(k|m|bn|b|thousand|million|billion)?/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    let val = parseFloat(m[1].replace(/,/g, ''));
    if (!Number.isFinite(val)) continue;
    const suf = (m[2] || '').toLowerCase();
    if (suf === 'k' || suf === 'thousand') val *= 1e3;
    else if (suf === 'm' || suf === 'million') val *= 1e6;
    else if (suf === 'b' || suf === 'bn' || suf === 'billion') val *= 1e9;
    if (val > max) max = val;
  }
  if (/\b(thousand|million|billion|trillion)\b/i.test(text) && /\b(dollar|dollars|bucks)\b|\$/i.test(text)) {
    max = Math.max(max, 1e6);
  }
  return max;
}

function dedup(sorted: number[], window: number): number[] {
  const out: number[] = [];
  for (const t of sorted) {
    if (out.length === 0 || t - out[out.length - 1] >= window) out.push(t);
  }
  return out;
}

// ── Candidate generators (each generic, by event shape) ────────────────────────

// motion: each section's establishment = its earliest element reveal. This coincides with the
// camera arriving at the section (a board travel) — exactly what a whoosh should punctuate.
function motionCues(spec: BoardSpec): number[] {
  const times: number[] = [];
  for (const section of spec.board.sections) {
    const first = section.elements.reduce((m, e) => Math.min(m, e.reveal_at_seconds), Infinity);
    if (Number.isFinite(first)) times.push(first);
  }
  return times.sort((a, b) => a - b);
}

// money: spec elements whose visible text is a BIG money statement, plus big spoken figures.
function moneyCues(spec: BoardSpec, timestamps: WordTimestamp[], threshold: number): number[] {
  const times: number[] = [];
  for (const section of spec.board.sections) {
    for (const el of section.elements) {
      const text = el.content ?? (el.lines ? el.lines.join(' ') : '');
      if (text && moneyMagnitude(text) >= threshold) times.push(el.reveal_at_seconds);
    }
  }
  for (const w of timestamps) {
    if (moneyMagnitude(w.word) >= threshold) times.push(w.start);
  }
  return dedup(times.sort((a, b) => a - b), MONEY_DEDUP_WINDOW);
}

// impact: the SINGLE biggest revelation beat — a blur_reveal, else the largest headline inside
// a "revelation"/"conclusion" section, else the largest headline overall. One cue, the payoff.
function impactCues(spec: BoardSpec): number[] {
  let best: { time: number; score: number } | null = null;
  for (const section of spec.board.sections) {
    const sectionBoost = section.section_type === 'revelation' ? 1e6
      : section.section_type === 'conclusion' ? 5e5 : 0;
    for (const el of section.elements) {
      if (el.type !== 'blur_reveal' && el.type !== 'headline') continue;
      const score = sectionBoost + (el.type === 'blur_reveal' ? 2e5 : 0) + (el.font_size ?? 0);
      if (!best || score > best.score) best = { time: el.reveal_at_seconds, score };
    }
  }
  return best ? [best.time] : [];
}

// ui: list reveals — one tick per list_reveal element (not per item, to stay sparse).
function uiCues(spec: BoardSpec): number[] {
  const times: number[] = [];
  for (const section of spec.board.sections) {
    for (const el of section.elements) {
      if (el.type === 'list_reveal') times.push(el.reveal_at_seconds);
    }
  }
  return times.sort((a, b) => a - b);
}

/**
 * Produce the final, sparse, prioritized cue list. Only schedules categories that actually
 * have sound files in the library. Honors intensity (scales the global cap), min spacing, the
 * cue floor, and per-category caps. Returns cues sorted by time.
 */
export function analyzeTriggers(
  spec: BoardSpec,
  timestamps: WordTimestamp[],
  lib: SoundLibrary,
  cfg: ResolvedSfxConfig
): SfxCue[] {
  if (!cfg.enabled || cfg.intensity <= 0) return [];

  const duration = spec.duration_seconds;
  const candidates: SfxCue[] = [];
  const add = (cat: string, times: number[]) => {
    if (!categoryHasSound(lib, cat)) return;
    const cap = CATEGORY_CAP[cat] ?? Infinity;
    times.slice(0, cap === Infinity ? times.length : cap).forEach((time) => candidates.push({ time, category: cat }));
  };

  add('money', moneyCues(spec, timestamps, cfg.bigMoneyMin));
  add('impact', impactCues(spec));
  add('motion', motionCues(spec));
  add('ui', uiCues(spec));

  // Clamp into the audible window.
  const windowed = candidates.filter((c) => c.time >= cfg.cueFloor && c.time <= duration - 0.2);

  // Greedy slot allocation in PRIORITY order: a cue is accepted only if it is ≥ minSpacing from
  // every already-accepted cue. High-priority categories claim their slots first; ambient
  // motion/ui fill the gaps. This generalizes the old "money wins, drop nearby swoosh" rule.
  const byPriority = [...windowed].sort(
    (a, b) => (PRIORITY[b.category] ?? 0) - (PRIORITY[a.category] ?? 0) || a.time - b.time
  );
  const accepted: SfxCue[] = [];
  for (const c of byPriority) {
    if (accepted.every((k) => Math.abs(k.time - c.time) >= cfg.minSpacing)) accepted.push(c);
  }

  // Global cap scaled by intensity. Drop lowest-priority first when over the cap.
  const effectiveMax = Math.max(0, Math.round(cfg.maxCues * cfg.intensity));
  let kept = accepted;
  if (accepted.length > effectiveMax) {
    kept = [...accepted]
      .sort((a, b) => (PRIORITY[b.category] ?? 0) - (PRIORITY[a.category] ?? 0) || a.time - b.time)
      .slice(0, effectiveMax);
  }

  return kept.sort((a, b) => a.time - b.time);
}
