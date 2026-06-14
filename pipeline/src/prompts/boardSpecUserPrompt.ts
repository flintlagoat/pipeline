import { WordTimestamp, ChannelConfig, StructuralAnalysis } from '../types/specTypes';
import { formatFullTimestamps, estimateDuration } from '../utils/findTimestamp';

export function buildBoardSpecUserPrompt(
  script: string,
  timestamps: WordTimestamp[],
  channelConfig: ChannelConfig,
  format: 'landscape_16x9' | 'portrait_9x16',
  analysis: StructuralAnalysis
): string {
  const duration = estimateDuration(timestamps);
  const videoId = channelConfig.channel_id + '_' + slugify(script.slice(0, 40));

  return `Generate a complete BoardSpec JSON for this narration.

SCRIPT:
${script}

WORD TIMESTAMPS — COMPLETE (${timestamps.length} words, total ~${duration.toFixed(1)}s).
These are on the SAME timeline as the audio (already silence-trimmed). Anchor every
reveal_at_seconds to the start time of the exact word that introduces that element:
${formatFullTimestamps(timestamps)}

STRUCTURAL ANALYSIS:
${JSON.stringify(analysis, null, 2)}

PARAMETERS:
  video_id:    "${videoId}"
  channel_id:  "${channelConfig.channel_id}"
  format:      "${format}"
  duration_seconds: ${Math.ceil(duration)}

INSTRUCTIONS:
1. Create one section per structural analysis section (or merge short ones)
2. Map every key beat to a visual element with accurate reveal_at_seconds
3. Use the word timestamps to set precise reveal_at_seconds values
4. Camera keyframes must cover the full duration
5. Every element id must be globally unique
6. Return raw JSON only — no markdown, no explanation`;
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .trim()
    .replace(/\s+/g, '_')
    .slice(0, 30);
}
