import { ChannelConfig } from '../types/specTypes';
import { designPackages, VideoPackage } from './packaging';

// Idea generator for the UI ("give me topics to pick from") — session 6: now a thin wrapper
// over the packaging engine, so every idea arrives as a complete scored VIDEO PACKAGE (title +
// thumbnail concept + hook contract) instead of a bare topic. The legacy VideoIdea shape
// (title/summary/rundown) is preserved so the existing UI keeps working; the full package rides
// along in `packaging` for clients that want it.

export interface VideoIdea {
  title: string;     // the video title / topic
  summary: string;   // one sentence on the angle / why it's interesting
  rundown: string;   // short beat-by-beat outline (hook → loops → payoff)
  packaging?: VideoPackage; // the full package (session 6) — saved to meta.json at script time
}

export async function generateIdeas(
  channelId: string,
  cfg: ChannelConfig,
  count = 5
): Promise<VideoIdea[]> {
  const packages = await designPackages(channelId, cfg, count);
  return packages.map((p) => ({
    title: p.title,
    summary: p.whyItWorks || p.description,
    rundown: [
      `Hook: ${p.hookPromise}`,
      ...(p.openLoops.length ? [`Loops: ${p.openLoops.join(' / ')}`] : []),
      `Payoff: ${p.payoff}`,
      `Thumbnail: "${p.thumbnail.bigText}" — ${p.thumbnail.visualIdea}`,
    ].join('  •  ').slice(0, 800),
    packaging: p,
  }));
}
