import Anthropic from '@anthropic-ai/sdk';
import {
  BoardSpec, WordTimestamp, ChannelConfig, StructuralAnalysis,
} from './types/specTypes';
import {
  STRUCTURAL_ANALYSIS_SYSTEM,
  buildStructuralAnalysisUserPrompt,
} from './prompts/structuralAnalysisPrompt';
import { buildBoardSpecSystemPrompt } from './prompts/boardSpecSystemPrompt';
import { buildBoardSpecUserPrompt } from './prompts/boardSpecUserPrompt';
import { validateSpec } from './validation/validateSpec';
import { ensureComboAssets } from './comboInsurance';
import { relayoutBoard } from './relayout';
import { applyVideoFeel } from './videoFeel';
import { auditPacing, formatPacing } from './pacingAudit';

const client = new Anthropic();

export async function generateBoardSpec(
  script: string,
  timestamps: WordTimestamp[],
  channelConfig: ChannelConfig,
  format: 'landscape_16x9' | 'portrait_9x16' = 'landscape_16x9'
): Promise<{ spec: BoardSpec; assetNeeds: string[] }> {

  // ── Call 1: Structural analysis (Haiku — fast, cheap) ──
  console.log('  [1/2] Structural analysis (Haiku)...');
  const analysisMsg = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 2000,
    system: STRUCTURAL_ANALYSIS_SYSTEM,
    messages: [{
      role: 'user',
      content: buildStructuralAnalysisUserPrompt(script, timestamps),
    }],
  });

  const analysisText = extractText(analysisMsg);
  let analysis: StructuralAnalysis;
  try {
    analysis = JSON.parse(stripFences(analysisText)) as StructuralAnalysis;
  } catch (e) {
    throw new Error(`Haiku returned non-JSON structural analysis.\nRaw: ${analysisText.slice(0, 300)}`);
  }

  console.log(`  Sections detected: ${analysis.sections.length}, key beats: ${analysis.key_beats.length}`);

  // ── Call 2: Full board spec (Sonnet, with retry) ──
  console.log('  [2/2] Generating board spec (Sonnet)...');
  const spec = await generateWithRetry(script, timestamps, channelConfig, format, analysis);

  // Deterministic combo insurance: guarantee paired-noun beats draw both objects even if the
  // model dropped one. Rules come from the channel config (generic — empty ⇒ no-op).
  ensureComboAssets(spec, channelConfig.combo_rules ?? []);

  // Deterministic legibility floor (PART A #5): no supporting/label/caption text smaller than
  // the readable floor, regardless of what the model emitted. Headlines keep their size.
  enforceFontFloor(spec);

  // Deterministic relayout (FIX 2 + FIX 3): assign a varied layout template per section and lay
  // the sections out on a 2-D snake grid (so the camera gets vertical AND horizontal moves).
  // Seeded off video_id ⇒ identical output for a fixed job. Runs LAST so combo-added assets and
  // font-floored text are placed too. Content and timing are untouched — only geometry changes.
  const relayout = relayoutBoard(spec);
  console.log(`  [relayout] ${relayout.cols}×${relayout.rows} snake grid; layouts: ${relayout.templates.join(', ')}`);

  // Video-feel pass (s7): voice-paced reveal durations + seeded type_on variety + accent emphasis.
  // Deterministic per video_id but seeded so no two videos animate the same beats identically.
  const feel = applyVideoFeel(spec, channelConfig, timestamps);
  console.log(`  [video-feel] type_on×${feel.typed}, count_up×${feel.counted}, emphasis×${feel.emphasized}, paced×${feel.paced} reveals`);

  // Visual pacing audit (s7): warn if the spec front-loads reveals, leaving a long static window
  // (a retention risk). Diagnostic only — never mutates the spec (that would desync from the voice).
  console.log(`  [pacing] ${formatPacing(auditPacing(spec))}`);

  return { spec, assetNeeds: spec.asset_needs };
}

// Minimum readable font sizes in output px (the render is 1080p at camera scale ≈ 1).
const SUPPORTING_FONT_FLOOR = 30;
const HEADLINE_FONT_FLOOR = 64;
const HEADLINE_TYPES = new Set(['headline', 'blur_reveal']);

// Bumps any below-floor font_size up to the floor so tiny labels can never ship. This is a
// generic, topic-agnostic safety net mirroring the prompt's legibility rule.
function enforceFontFloor(spec: BoardSpec): void {
  let bumped = 0;
  for (const section of spec.board.sections) {
    for (const el of section.elements) {
      if (typeof el.font_size !== 'number') continue;
      const floor = HEADLINE_TYPES.has(el.type) ? HEADLINE_FONT_FLOOR : SUPPORTING_FONT_FLOOR;
      if (el.font_size < floor) {
        el.font_size = floor;
        bumped++;
      }
    }
  }
  if (bumped > 0) console.log(`  [legibility] raised ${bumped} sub-floor font size(s) to the readable minimum`);
}

async function generateWithRetry(
  script: string,
  timestamps: WordTimestamp[],
  channelConfig: ChannelConfig,
  format: 'landscape_16x9' | 'portrait_9x16',
  analysis: StructuralAnalysis
): Promise<BoardSpec> {
  const systemPrompt = buildBoardSpecSystemPrompt(channelConfig);
  const userPrompt = buildBoardSpecUserPrompt(script, timestamps, channelConfig, format, analysis);

  let prevRaw = '';
  let prevError = '';

  for (let attempt = 0; attempt < 2; attempt++) {
    const messages: Anthropic.MessageParam[] = [{ role: 'user', content: userPrompt }];

    // On retry, show Claude what it returned and the specific error
    if (attempt === 1) {
      console.log(`  Retry (attempt 2) — error was: ${prevError.slice(0, 120)}`);
      messages.push({ role: 'assistant', content: prevRaw });
      messages.push({
        role: 'user',
        content: `The JSON you returned was invalid. Error:\n${prevError}\n\nReturn the corrected complete JSON only.`,
      });
    }

    const response = await client.messages.create({
      model: 'claude-opus-4-8',
      max_tokens: 16000,
      // Cache system prompt — reduces cost on retries and repeated calls
      system: [{ type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } }],
      messages,
    });

    const raw = extractText(response);
    prevRaw = raw;

    let parsed: unknown;
    try {
      parsed = JSON.parse(stripFences(raw));
    } catch (e) {
      prevError = `JSON.parse failed: ${(e as Error).message}`;
      continue;
    }

    const validation = validateSpec(parsed);
    if (validation.success) {
      console.log(`  ✅ Spec valid (attempt ${attempt + 1})`);
      return validation.spec;
    }
    prevError = validation.error;
  }

  throw new Error(`Spec generation failed after 2 attempts.\nLast error: ${prevError}\nLast raw (truncated): ${prevRaw.slice(0, 500)}`);
}

function extractText(msg: Anthropic.Message): string {
  const block = msg.content[0];
  if (block.type === 'text') return block.text;
  throw new Error(`Unexpected content block type: ${block.type}`);
}

function stripFences(text: string): string {
  return text.replace(/^```(?:json)?\r?\n?/, '').replace(/\r?\n?```$/, '').trim();
}
