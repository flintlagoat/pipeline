import { Learnings } from '../analytics/learnings';

// Analysis prompt for analytics:analyze (Part 2). Opus reads the raw metrics + current learnings
// and proposes EVIDENCE-GATED updates. The guardrail is explicit and central: avoid overfitting,
// require a stated sample size + confidence for any new rule, prefer structural/repeatable
// insights over topic-specific flukes, and DEFAULT TO NO CHANGE when data is too thin.

export function buildAnalysisSystemPrompt(threshold: number, minConfidence: number): string {
  return `You are a YouTube growth analyst for a single channel. You turn performance data into a
small set of DURABLE, STRUCTURAL rules the channel's script generator will follow. You are
deliberately conservative: a wrong rule poisons every future script, so the cost of a false
pattern is high and the cost of "not enough data yet" is low.

━━━ YOUR JOB ━━━
Given the channel's published videos (metrics + audience-retention curves + the hook each used)
and the current learnings (hypotheses, applied rules, dropoff notes), output a JSON object that
UPDATES the learnings: refine hypotheses, promote well-supported ones to rules, demote rules the
data now contradicts, and record recurring retention-drop zones.

━━━ ANTI-OVERFITTING GUARDRAIL (this is the most important instruction) ━━━
1. SAMPLE SIZE GATES EVERYTHING. A pattern may only be PROMOTED to an applied rule when at least
   ${threshold} videos support it AND your confidence is ≥ ${minConfidence}. Below that, keep it as
   an open hypothesis with its current sampleSize — do NOT promote it.
2. PREFER STRUCTURAL, REPEATABLE INSIGHTS (hook shape, pacing, where payoff lands, segment order,
   retention-curve shape, and the NARRATIVE ARC each video used) over TOPIC-SPECIFIC flukes ("the
   casino video did well"). One viral or one flop is NOISE, not a pattern. If a narrative arc
   (e.g. "follow_money" vs "myth_bust") consistently retains better across ≥${threshold} videos,
   that is a high-value structural rule worth promoting.
3. If the data is too thin to conclude anything, SET "noChange": true with a short reason. This is
   the correct, expected answer for a channel with few videos. Do not invent patterns to seem useful.
4. Every hypothesis and rule MUST carry an honest sampleSize (count of supporting videos) and a
   confidence in [0,1]. Never inflate either.
5. Map retention craters to SCRIPT STRUCTURE (e.g. "drop at 15-25s → hook resolves too slowly"),
   not to topic. These become dropoffNotes the generator avoids.

━━━ OUTPUT — STRICT JSON ONLY (no prose, no markdown fences) ━━━
{
  "reasoning": "2-5 sentences: what the data shows and why your changes (or non-changes) follow.",
  "noChange": false,
  "noChangeReason": "",
  "hypotheses": [
    { "id": "optional-existing-id", "pattern": "structural pattern statement",
      "evidenceVideoIds": ["..."], "sampleSize": 0, "confidence": 0.0 }
  ],
  "promote": ["hypothesisId to promote to an applied rule (only if it meets the gate)"],
  "newRules": [
    { "rule": "imperative guidance for the script generator", "rationale": "why",
      "evidenceVideoIds": ["..."], "sampleSize": 0, "confidence": 0.0 }
  ],
  "demoteRules": ["ruleId the latest data contradicts"],
  "dropoffNotes": [
    { "zone": "15-25s", "pattern": "what happens", "mappedTo": "script-structure fix",
      "evidenceVideoIds": ["..."] }
  ],
  "changelog": [
    { "change": "what changed", "why": "evidence-based reason", "evidence": "videos/metrics cited" }
  ]
}
Return ONLY that JSON object. If nothing meets the bar, return it with "noChange": true and empty arrays.`;
}

export function buildAnalysisUserPrompt(
  learnings: Learnings,
  beatEvidence?: Map<string, string[]> // videoId → retention→beat attribution lines (session 6)
): string {
  const videoLines = learnings.videoLog.map((v) => {
    const m = v.metrics;
    const ret = v.retentionCurve.length
      ? v.retentionCurve.map((p) => `${(p.elapsedRatio * 100).toFixed(0)}%:${p.relativeRetention.toFixed(2)}`).join(' ')
      : '(no retention data)';
    const beats = beatEvidence?.get(v.videoId) ?? [];
    const arc = (v.specChoices?.scriptArc as string | undefined);
    return [
      `- ${v.videoId} "${v.title}" (published ${v.publishedAt.slice(0, 10)})`,
      `    hook: ${JSON.stringify(v.hookText.slice(0, 220))}`,
      ...(arc ? [`    narrative arc: ${arc}`] : []),
      `    metrics: views=${m.views} ctr=${m.ctr ?? 'n/a'} avgViewPct=${m.averageViewPercentage} avgViewDur=${m.averageViewDuration}s subs+=${m.subscribersGained}`,
      `    retention(elapsed:relative): ${ret}`,
      ...(beats.length ? [`    WHERE viewers left (mapped to the exact script beat on screen):\n${beats.map((b) => `      • ${b}`).join('\n')}`] : []),
      `    rules applied to this script: ${v.injectedRuleIds.join(', ') || 'none'}`,
    ].join('\n');
  }).join('\n');

  const current = {
    thresholds: learnings.thresholds,
    hypotheses: learnings.hypotheses,
    appliedRules: learnings.appliedRules,
    dropoffNotes: learnings.dropoffNotes,
  };

  return `CHANNEL: ${learnings.channelId}
PUBLISHED VIDEOS (${learnings.videoLog.length}):
${videoLines || '(none yet)'}

CURRENT LEARNINGS (refine these; do not discard evidence):
${JSON.stringify(current, null, 2)}

Analyze and return the JSON update object per your instructions. Remember: promotion requires
≥ ${learnings.thresholds.promoteSampleSize} supporting videos and confidence ≥ ${learnings.thresholds.minConfidence};
otherwise keep it an open hypothesis. If the data is too thin, return noChange:true.`;
}
