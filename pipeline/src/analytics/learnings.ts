import * as fs from 'fs';
import * as path from 'path';
import { channelDir } from '../config/paths';

// Per-channel learnings.json — the PERSISTENT MEMORY the script generator reads every generation
// (Part 2). Structured as ACCUMULATED EVIDENCE, not per-video reactions:
//   • videoLog[]     — every published video + final metrics + the approach/hook used
//   • hypotheses[]   — candidate patterns, each gated by sample size before promotion
//   • appliedRules[] — promoted patterns the script generator actively follows (revisitable)
//   • dropoffNotes[] — recurring retention-crater zones mapped to script structure
//   • changelog[]    — append-only record of every change the analysis step made (never silent)
// Human-readable + version-stamped. learnings.json IS committed (it's the memory); raw pulls are not.

export const LEARNINGS_VERSION = 1;

export interface RetentionPoint { elapsedRatio: number; relativeRetention: number; audienceWatchRatio?: number; }

export interface VideoMetrics {
  views: number;
  impressions: number | null;            // null when Studio-only (Analytics API may not expose it)
  ctr: number | null;                    // impression click-through rate (0..1), null if unavailable
  averageViewDuration: number;           // seconds
  averageViewPercentage: number;         // 0..100
  estimatedMinutesWatched?: number;
  subscribersGained: number;
}

export interface VideoLogEntry {
  jobId: string;
  videoId: string;
  title: string;
  publishedAt: string;
  hookText: string;                      // first beat of the script — the hook, for approach analysis
  injectedRuleIds: string[];             // appliedRules that conditioned this script (closed-loop trace)
  specChoices?: Record<string, unknown>; // optional key spec/format choices used
  metrics: VideoMetrics;
  retentionCurve: RetentionPoint[];
  pulledAt: string;
}

export interface Hypothesis {
  id: string;
  pattern: string;                       // e.g. "cold-open question hooks retain better than definition hooks"
  evidenceVideoIds: string[];
  sampleSize: number;
  confidence: number;                    // 0..1
  status: 'open' | 'promoted' | 'rejected';
  createdAt: string;
  updatedAt: string;
}

export interface AppliedRule {
  id: string;
  rule: string;                          // imperative guidance the script generator follows
  rationale: string;
  sampleSize: number;
  confidence: number;
  evidenceVideoIds: string[];
  promotedAt: string;
  status: 'active' | 'demoted';
}

export interface DropoffNote {
  zone: string;                          // e.g. "15-25s"
  pattern: string;                       // e.g. "hook-to-payoff gap"
  mappedTo: string;                      // script-structure mapping / fix
  evidenceVideoIds: string[];
}

export interface ChangelogEntry { date: string; change: string; why: string; evidence: string; }

export interface Learnings {
  version: number;
  channelId: string;
  updatedAt: string;
  thresholds: { promoteSampleSize: number; minConfidence: number };
  videoLog: VideoLogEntry[];
  hypotheses: Hypothesis[];
  appliedRules: AppliedRule[];
  dropoffNotes: DropoffNote[];
  changelog: ChangelogEntry[];
}

export function learningsPath(channelId: string): string {
  return path.join(channelDir(channelId), 'learnings.json');
}

export function defaultLearnings(channelId: string): Learnings {
  return {
    version: LEARNINGS_VERSION,
    channelId,
    updatedAt: new Date().toISOString(),
    thresholds: {
      promoteSampleSize: Number(process.env.LEARNINGS_PROMOTE_N) || 3, // N≥3 before hypothesis → rule
      minConfidence: 0.6,
    },
    videoLog: [],
    hypotheses: [],
    appliedRules: [],
    dropoffNotes: [],
    changelog: [],
  };
}

export function loadLearnings(channelId: string): Learnings {
  const p = learningsPath(channelId);
  if (!fs.existsSync(p)) return defaultLearnings(channelId);
  const raw = JSON.parse(fs.readFileSync(p, 'utf8')) as Partial<Learnings>;
  const base = defaultLearnings(channelId);
  return {
    ...base,
    ...raw,
    thresholds: { ...base.thresholds, ...(raw.thresholds ?? {}) },
    videoLog: raw.videoLog ?? [],
    hypotheses: raw.hypotheses ?? [],
    appliedRules: raw.appliedRules ?? [],
    dropoffNotes: raw.dropoffNotes ?? [],
    changelog: raw.changelog ?? [],
  };
}

export function saveLearnings(learnings: Learnings): void {
  const p = learningsPath(learnings.channelId);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  learnings.updatedAt = new Date().toISOString();
  fs.writeFileSync(p, JSON.stringify(learnings, null, 2), 'utf8');
}

/** Upsert a video log entry by videoId (preserves prior approach fields if a re-pull omits them). */
export function upsertVideoLog(learnings: Learnings, entry: VideoLogEntry): void {
  const i = learnings.videoLog.findIndex((v) => v.videoId === entry.videoId);
  if (i === -1) learnings.videoLog.push(entry);
  else learnings.videoLog[i] = { ...learnings.videoLog[i], ...entry };
}

/**
 * Render the ACTIVE applied rules + dropoff notes as a compact prompt block for the script
 * generator (the closed loop). Returns '' when there's nothing learned yet (no conditioning).
 */
export function formatLearningsForPrompt(learnings: Learnings): { text: string; ruleIds: string[] } {
  const rules = learnings.appliedRules.filter((r) => r.status === 'active');
  const drops = learnings.dropoffNotes;
  if (rules.length === 0 && drops.length === 0) return { text: '', ruleIds: [] };

  const lines: string[] = [];
  if (rules.length) {
    lines.push('PROVEN RULES FOR THIS CHANNEL (follow these — each is backed by real performance data):');
    for (const r of rules) lines.push(`  • ${r.rule}  [${r.sampleSize} videos, conf ${(r.confidence * 100).toFixed(0)}%]`);
  }
  if (drops.length) {
    lines.push('RETENTION PITFALLS TO AVOID (viewers consistently dropped here):');
    for (const d of drops) lines.push(`  • Around ${d.zone}: ${d.pattern} → ${d.mappedTo}`);
  }
  return { text: lines.join('\n'), ruleIds: rules.map((r) => r.id) };
}

/** Persist, into the job folder, which rules conditioned this script (closed-loop trace). */
export function logInjectedRules(jobDirPath: string, ruleIds: string[], text: string): void {
  try {
    fs.mkdirSync(jobDirPath, { recursive: true });
    fs.writeFileSync(
      path.join(jobDirPath, 'learnings_applied.json'),
      JSON.stringify({ ruleIds, promptBlock: text, at: new Date().toISOString() }, null, 2),
      'utf8'
    );
  } catch { /* trace is best-effort */ }
}
