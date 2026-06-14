import Anthropic from '@anthropic-ai/sdk';
import { ChannelConfig } from './types/specTypes';
import {
  buildScriptSystemPrompt,
  buildScriptUserPrompt,
  buildScriptCriticSystemPrompt,
  buildScriptCriticUserPrompt,
} from './prompts/scriptPrompt';
import { VideoPackage } from './autopilot/packaging';
import { ScriptArc } from './autopilot/scriptArcs';
import { factCheckScript, FactCheckResult } from './factCheck';

// Phase 0 — automated script generation (session 6: retention architecture + critic pass).
// Takes a topic + a target length in MINUTES (+ optionally the video PACKAGE the script must
// pay off) and writes a narration script in the channel's voice, structured into clear beats
// so the rest of the pipeline produces good board sections. Fully generic across topics/channels.
//
// NOTE ON LENGTH: the FINAL video length is set by the actual voiceover (the render is driven
// by Whisper timestamps of the real audio). The minutes selector only controls how much script
// is generated.

const client = new Anthropic();

// Words spoken per minute. Tunable: documentary/explainer narration is a deliberate ~140-160
// wpm; 150 is a good center. Raising it generates a longer script for the same minute count.
export const WORDS_PER_MINUTE = 150;

export interface ScriptResult {
  script: string;
  wordCount: number;
  targetWords: number;
  critiqued: boolean; // whether the critic pass ran and its revision was accepted
  factCheck?: FactCheckResult; // fact-check audit (paper trail); orchestrator persists it
}

function countWords(text: string): number {
  const m = text.trim().match(/\S+/g);
  return m ? m.length : 0;
}

/**
 * Critic pass: a second Opus call grades the draft against the retention architecture
 * (hook ≤15s, open loops, re-hooks, packaging match, filler, bridge ending) and rewrites it
 * once. Disable with SCRIPT_CRITIC=off. Falls back to the draft on any failure or on a
 * suspicious rewrite (too short / empty) — the critic can only improve, never lose, a script.
 */
async function critiqueScript(
  draft: string,
  topic: string,
  targetWords: number,
  channelConfig: ChannelConfig,
  packaging?: VideoPackage
): Promise<string | null> {
  try {
    const response = await client.messages.create({
      model: 'claude-opus-4-8',
      max_tokens: Math.min(16000, Math.max(1024, Math.ceil(targetWords * 2.2))),
      system: [{ type: 'text', text: buildScriptCriticSystemPrompt(channelConfig) }],
      messages: [{ role: 'user', content: buildScriptCriticUserPrompt(draft, topic, targetWords, packaging) }],
    });
    const block = response.content[0];
    if (block.type !== 'text') return null;
    const revised = block.text.trim();
    // Sanity gates: a usable revision is non-empty prose in a sane range. The floor is 0.5 (not
    // 0.6) so the critic CAN remove a large recap / repeated last quarter — its job is to cut
    // padding, and a 40–50% trim of a bloated draft is a win, not a red flag. It may never grow it.
    const draftWords = countWords(draft);
    const revisedWords = countWords(revised);
    if (!revised || revisedWords < draftWords * 0.5 || revisedWords > draftWords * 1.25) return null;
    return revised;
  } catch (e) {
    console.warn(`  [Phase 0] Critic pass skipped (${(e as Error).message}) — keeping draft.`);
    return null;
  }
}

/**
 * Generates a narration script for `topic` at roughly `minutes` minutes of spoken length,
 * in the channel's configured voice, paying off `packaging` when provided. Returns the script
 * text plus word counts.
 */
export async function generateScript(
  topic: string,
  minutes: number,
  channelConfig: ChannelConfig,
  learningsBlock = '', // closed loop (Part 2): proven rules + dropoff notes for this channel
  packaging?: VideoPackage, // packaging-first contract (session 6): title/thumbnail/hook to pay off
  arc?: ScriptArc // seeded narrative arc (session 7): varies the body shape per video
): Promise<ScriptResult> {
  if (!topic.trim()) throw new Error('Script generation needs a non-empty topic/title.');
  if (!(minutes > 0)) throw new Error(`Script generation needs minutes > 0 (got ${minutes}).`);

  const targetWords = Math.round(minutes * WORDS_PER_MINUTE);

  // Generous token budget: ~1.4 tokens/word for English, plus headroom. Cap so a huge
  // minutes value can't run away.
  const maxTokens = Math.min(16000, Math.max(1024, Math.ceil(targetWords * 2.2)));

  console.log(`  [Phase 0] Generating ~${minutes}min script (~${targetWords} words) on: "${topic}"`);

  const response = await client.messages.create({
    model: 'claude-opus-4-8',
    max_tokens: maxTokens,
    system: [
      { type: 'text', text: buildScriptSystemPrompt(channelConfig), cache_control: { type: 'ephemeral' } },
    ],
    messages: [{ role: 'user', content: buildScriptUserPrompt(topic, targetWords, minutes, learningsBlock, packaging, arc) }],
  });

  const block = response.content[0];
  if (block.type !== 'text') throw new Error(`Unexpected content block type: ${block.type}`);

  let script = block.text.trim();
  if (!script) throw new Error('Script generation returned empty text.');

  // Critic pass (default ON — the highest-leverage quality gate in the pipeline).
  let critiqued = false;
  if ((process.env.SCRIPT_CRITIC ?? 'on').toLowerCase() !== 'off') {
    console.log('  [Phase 0] Critic pass: grading hook/loops/payoff alignment...');
    const revised = await critiqueScript(script, topic, targetWords, channelConfig, packaging);
    if (revised) {
      script = revised;
      critiqued = true;
      console.log('  [Phase 0] Critic revision accepted.');
    } else {
      console.log('  [Phase 0] Critic produced no usable revision — keeping draft.');
    }
  }

  // Fact-check pass (default ON — trust + policy protection). Hedges only low-confidence
  // over-precise figures; saves an audit. Disable with FACT_CHECK=off.
  let factCheck: FactCheckResult | undefined;
  if ((process.env.FACT_CHECK ?? 'on').toLowerCase() !== 'off') {
    console.log('  [Phase 0] Fact-check pass: auditing stated figures...');
    factCheck = await factCheckScript(script, channelConfig);
    const flagged = factCheck.claims.length;
    if (factCheck.changed) {
      script = factCheck.script;
      console.log(`  [Phase 0] Fact-check hedged ${factCheck.lowCount} low-confidence claim(s) of ${flagged} checked.`);
    } else {
      console.log(`  [Phase 0] Fact-check: ${flagged} claim(s) checked, ${factCheck.lowCount} low-confidence (no rewrite needed).`);
    }
  }

  const wordCount = countWords(script);
  console.log(`  [Phase 0] Script ready: ${wordCount} words (target ${targetWords})${critiqued ? ', critic-revised' : ''}${factCheck?.changed ? ', fact-hedged' : ''}.`);

  return { script, wordCount, targetWords, critiqued, factCheck };
}
