import { WordTimestamp } from '../types/specTypes';
import { formatTimestampSample } from '../utils/findTimestamp';

export const STRUCTURAL_ANALYSIS_SYSTEM = `You are a video production analyst. Given a narration script and word-level timestamps, analyze the content structure.

Return ONLY valid JSON — no markdown, no code fences, no explanation. Exact schema:
{
  "overall_structure": "<one sentence description>",
  "estimated_duration": <number, total seconds based on timestamps>,
  "sections": [
    {
      "id": "<hook|comparison|diagram|revelation|list_reveal|flow_chart|conclusion>",
      "start_time": <number, seconds>,
      "end_time": <number, seconds>,
      "title": "<short section title>",
      "content_summary": "<what happens in this section>"
    }
  ],
  "key_beats": [
    { "time": <number>, "description": "<moment description>", "type": "<hook|reveal|data|emotional>" }
  ],
  "asset_suggestions": ["<svg asset name>", ...]
}

Rules:
- sections must cover the full script duration with no gaps
- key_beats are the 3-7 most visually important moments
- asset_suggestions must be general schematic names (e.g. "warehouse_interior", "org_chart", "money_bag") — the renderer uses wireframe SVG drawings`;

export function buildStructuralAnalysisUserPrompt(
  script: string,
  timestamps: WordTimestamp[]
): string {
  const duration = timestamps.length > 0 ? timestamps[timestamps.length - 1].end.toFixed(1) : '?';
  return `SCRIPT (${timestamps.length} words, ~${duration}s):
${script}

WORD TIMESTAMPS (sample):
${formatTimestampSample(timestamps, 30)}`;
}
