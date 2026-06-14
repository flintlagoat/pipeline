import { ChannelConfig } from '../types/specTypes';
import { designPackages } from './packaging';

// Next-topic picker — kept for API compatibility (session 6). The real brain is now the
// packaging engine (packaging.ts): topics arrive as complete, scored video packages
// (title + thumbnail concept + hook contract), and this helper just returns the best title.
// Prefer designPackages()/packageForTopic() directly in new code so the full package flows
// through to the script, thumbnail, and publish metadata.

export async function nextTopic(channelId: string, cfg: ChannelConfig): Promise<string> {
  const packages = await designPackages(channelId, cfg, 5);
  return packages[0].title;
}
