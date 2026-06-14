import { BoardSpec } from './types/specTypes';

// Visual pacing audit (session 7). Retention-editing research says attention drifts when nothing
// changes on screen for a stretch; a spec that front-loads all its reveals leaves a static tail.
// This is a DIAGNOSTIC (it never mutates the spec — that would risk desyncing reveals from the
// voice) that measures the longest "no new visual event" window so generateBoardSpec can warn when
// a spec is poorly paced. Pure + unit-tested.

export interface PacingReport {
  totalEvents: number;        // count of distinct reveal moments
  longestGapSeconds: number;  // longest stretch with no NEW reveal
  longestGapStart: number;    // when that stretch begins
  durationSeconds: number;
  ok: boolean;                // longestGap within the healthy threshold
}

// A window longer than this with nothing new appearing is flagged. Camera drift keeps the frame
// from freezing, but ~14s+ with no new information is a real attention risk for explainer content.
export const DEAD_WINDOW_THRESHOLD = 14;

export function auditPacing(spec: BoardSpec, threshold = DEAD_WINDOW_THRESHOLD): PacingReport {
  const duration = spec.duration_seconds || 0;

  // Distinct reveal moments across the whole video (each is a "something new appears" event).
  const times = new Set<number>();
  for (const section of spec.board.sections) {
    for (const el of section.elements) {
      if (typeof el.reveal_at_seconds === 'number' && Number.isFinite(el.reveal_at_seconds)) {
        times.add(Math.round(el.reveal_at_seconds * 10) / 10);
      }
    }
  }
  const sorted = [...times].sort((a, b) => a - b);

  // Gaps: from t=0 to the first reveal, between consecutive reveals, and from the last reveal to
  // the end of the video (a long static outro is the most common failure mode).
  let longestGap = 0;
  let longestGapStart = 0;
  const boundaries = [0, ...sorted, duration];
  for (let i = 1; i < boundaries.length; i++) {
    const gap = boundaries[i] - boundaries[i - 1];
    if (gap > longestGap) { longestGap = gap; longestGapStart = boundaries[i - 1]; }
  }

  return {
    totalEvents: sorted.length,
    longestGapSeconds: Math.round(longestGap * 10) / 10,
    longestGapStart: Math.round(longestGapStart * 10) / 10,
    durationSeconds: duration,
    ok: longestGap <= threshold,
  };
}

function fmt(t: number): string {
  const s = Math.max(0, Math.round(t));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** One-line summary for the spec-gen log. */
export function formatPacing(r: PacingReport): string {
  const rate = r.durationSeconds > 0 ? (r.totalEvents / (r.durationSeconds / 10)).toFixed(1) : '0';
  const warn = r.ok ? '' : `  ⚠ DEAD WINDOW ${r.longestGapSeconds}s @ ${fmt(r.longestGapStart)} (front-loaded — spread reveals later)`;
  return `${r.totalEvents} reveals (~${rate}/10s), longest still-window ${r.longestGapSeconds}s${warn}`;
}
