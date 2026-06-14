import Anthropic from '@anthropic-ai/sdk';
import {
  loadLearnings, saveLearnings, learningsPath, Learnings,
  Hypothesis, AppliedRule, DropoffNote,
} from './learnings';
import { buildAnalysisSystemPrompt, buildAnalysisUserPrompt } from '../prompts/analysisPrompt';
import { retentionBeatLines } from './attribution';

// analytics:analyze (Part 2). Opus reads raw metrics + current learnings, proposes evidence-gated
// updates, and writes them back to learnings.json with an APPENDED changelog entry (never a silent
// overwrite). The sample-size gate is enforced HERE in code too (defense in depth) so a model that
// over-promotes still can't push an under-supported rule into the active set.

const client = new Anthropic();

interface ModelHypothesis { id?: string; pattern: string; evidenceVideoIds?: string[]; sampleSize?: number; confidence?: number; }
interface ModelRule { rule: string; rationale?: string; evidenceVideoIds?: string[]; sampleSize?: number; confidence?: number; }
interface ModelOutput {
  reasoning?: string;
  noChange?: boolean;
  noChangeReason?: string;
  hypotheses?: ModelHypothesis[];
  promote?: string[];
  newRules?: ModelRule[];
  demoteRules?: string[];
  dropoffNotes?: { zone: string; pattern: string; mappedTo?: string; evidenceVideoIds?: string[] }[];
  changelog?: { change: string; why: string; evidence: string }[];
}

export interface AnalyzeSummary { summary: string; learningsPath: string; changed: boolean; }

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40) || 'item';
}

function extractJson(text: string): ModelOutput {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = fenced ? fenced[1] : text;
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start === -1 || end === -1) throw new Error('Analysis returned no JSON object.');
  return JSON.parse(raw.slice(start, end + 1)) as ModelOutput;
}

/** Apply the model's proposed updates to `learnings` in place, enforcing the promotion gate. */
function applyUpdates(learnings: Learnings, out: ModelOutput): { changes: string[] } {
  const now = new Date().toISOString();
  const { promoteSampleSize, minConfidence } = learnings.thresholds;
  const changes: string[] = [];

  // 1. Upsert hypotheses (by id, else by pattern slug).
  for (const h of out.hypotheses ?? []) {
    const id = h.id || `h_${slug(h.pattern)}`;
    const existing = learnings.hypotheses.find((x) => x.id === id);
    const merged: Hypothesis = {
      id,
      pattern: h.pattern,
      evidenceVideoIds: h.evidenceVideoIds ?? existing?.evidenceVideoIds ?? [],
      sampleSize: h.sampleSize ?? existing?.sampleSize ?? (h.evidenceVideoIds?.length ?? 0),
      confidence: h.confidence ?? existing?.confidence ?? 0,
      status: existing?.status ?? 'open',
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    if (existing) Object.assign(existing, merged);
    else { learnings.hypotheses.push(merged); changes.push(`+hypothesis ${id}`); }
  }

  const gateOk = (sample: number, conf: number) => sample >= promoteSampleSize && conf >= minConfidence;

  const promoteHypothesis = (h: Hypothesis) => {
    if (learnings.appliedRules.some((r) => r.id === `r_${h.id}`)) return;
    learnings.appliedRules.push({
      id: `r_${h.id}`, rule: h.pattern, rationale: 'Promoted from hypothesis on sufficient evidence.',
      sampleSize: h.sampleSize, confidence: h.confidence, evidenceVideoIds: h.evidenceVideoIds,
      promotedAt: now, status: 'active',
    });
    h.status = 'promoted';
    changes.push(`promoted ${h.id} → rule (n=${h.sampleSize}, conf=${h.confidence})`);
  };

  // 2. Promote requested hypotheses (only if they pass the gate).
  for (const id of out.promote ?? []) {
    const h = learnings.hypotheses.find((x) => x.id === id || x.id === `h_${slug(id)}`);
    if (!h) continue;
    if (gateOk(h.sampleSize, h.confidence)) promoteHypothesis(h);
    else changes.push(`held ${h.id} (gate: n=${h.sampleSize}/${promoteSampleSize}, conf=${h.confidence}/${minConfidence})`);
  }

  // 3. Direct new rules — still gated; under-supported ones are recorded as hypotheses instead.
  for (const r of out.newRules ?? []) {
    const sample = r.sampleSize ?? (r.evidenceVideoIds?.length ?? 0);
    const conf = r.confidence ?? 0;
    const id = `r_${slug(r.rule)}`;
    if (learnings.appliedRules.some((x) => x.id === id)) continue;
    if (gateOk(sample, conf)) {
      learnings.appliedRules.push({
        id, rule: r.rule, rationale: r.rationale ?? '', sampleSize: sample, confidence: conf,
        evidenceVideoIds: r.evidenceVideoIds ?? [], promotedAt: now, status: 'active',
      });
      changes.push(`+rule ${id} (n=${sample}, conf=${conf})`);
    } else {
      const hid = `h_${slug(r.rule)}`;
      if (!learnings.hypotheses.some((x) => x.id === hid)) {
        learnings.hypotheses.push({
          id: hid, pattern: r.rule, evidenceVideoIds: r.evidenceVideoIds ?? [], sampleSize: sample,
          confidence: conf, status: 'open', createdAt: now, updatedAt: now,
        });
        changes.push(`held rule "${r.rule.slice(0, 40)}…" as hypothesis (under gate)`);
      }
    }
  }

  // 4. Demote rules the data now contradicts.
  for (const id of out.demoteRules ?? []) {
    const rule = learnings.appliedRules.find((x) => x.id === id || x.id === `r_${slug(id)}`);
    if (rule && rule.status === 'active') { rule.status = 'demoted'; changes.push(`demoted ${rule.id}`); }
  }

  // 5. Merge dropoff notes (by zone+pattern).
  for (const d of out.dropoffNotes ?? []) {
    const note: DropoffNote = { zone: d.zone, pattern: d.pattern, mappedTo: d.mappedTo ?? '', evidenceVideoIds: d.evidenceVideoIds ?? [] };
    const existing = learnings.dropoffNotes.find((x) => x.zone === d.zone && x.pattern === d.pattern);
    if (existing) Object.assign(existing, note);
    else { learnings.dropoffNotes.push(note); changes.push(`+dropoff ${d.zone}`); }
  }

  // 6. Append changelog (NEVER overwrite). Always record at least one entry.
  const today = now.slice(0, 10);
  const entries = (out.changelog ?? []).map((c) => ({ date: today, change: c.change, why: c.why, evidence: c.evidence }));
  if (entries.length === 0) {
    entries.push({
      date: today,
      change: out.noChange ? 'No change' : (changes.length ? changes.join('; ') : 'No structural change'),
      why: out.noChangeReason || out.reasoning || 'Insufficient evidence to change rules.',
      evidence: `${learnings.videoLog.length} videos in log`,
    });
  }
  learnings.changelog.push(...entries);

  return { changes };
}

export async function analyzeChannel(channelId: string): Promise<AnalyzeSummary> {
  const learnings = loadLearnings(channelId);

  // Guardrail at the code layer: with no data, don't even call the model — record no-change.
  if (learnings.videoLog.length === 0) {
    learnings.changelog.push({
      date: new Date().toISOString().slice(0, 10),
      change: 'No change',
      why: 'No published videos in the log yet — nothing to learn from (default to no change).',
      evidence: '0 videos',
    });
    saveLearnings(learnings);
    return { summary: 'No videos to analyze yet — recorded a no-change entry.', learningsPath: learningsPath(channelId), changed: false };
  }

  // Retention → beat attribution (session 6): map each video's retention drops to the exact
  // script beat on screen so dropoffNotes become structural evidence, not curve-shape guesses.
  const beatEvidence = new Map<string, string[]>();
  for (const v of learnings.videoLog) {
    try {
      const lines = retentionBeatLines(channelId, v.jobId, v.retentionCurve);
      if (lines.length) beatEvidence.set(v.videoId, lines);
    } catch { /* attribution is best-effort evidence */ }
  }

  console.log(`  [analytics:analyze] ${learnings.videoLog.length} videos → asking Opus for evidence-gated updates...`);
  const response = await client.messages.create({
    model: 'claude-opus-4-8',
    max_tokens: 4000,
    system: [{ type: 'text', text: buildAnalysisSystemPrompt(learnings.thresholds.promoteSampleSize, learnings.thresholds.minConfidence) }],
    messages: [{ role: 'user', content: buildAnalysisUserPrompt(learnings, beatEvidence) }],
  });
  const block = response.content[0];
  if (block.type !== 'text') throw new Error(`Unexpected content block: ${block.type}`);
  const out = extractJson(block.text);

  const { changes } = applyUpdates(learnings, out);
  saveLearnings(learnings);

  const summary = out.noChange
    ? `No change (${out.noChangeReason || 'thin data'}). ${learnings.appliedRules.filter((r) => r.status === 'active').length} active rules.`
    : `${changes.length} update(s): ${changes.join('; ') || 'recorded reasoning'}. ` +
      `${learnings.appliedRules.filter((r) => r.status === 'active').length} active rules, ${learnings.hypotheses.length} hypotheses.`;
  return { summary, learningsPath: learningsPath(channelId), changed: changes.length > 0 };
}
