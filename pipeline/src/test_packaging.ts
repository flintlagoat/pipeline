import './config/env';
import { packageForTopic, designPackages, listChannelAssets } from './autopilot/packaging';
import { loadChannelSpec, toChannelConfig } from './channelSpec';

// Smoke test for the packaging engine (session 6). Live Opus calls — needs ANTHROPIC_API_KEY.
//   npx ts-node src/test_packaging.ts <channelId> ["topic"]
// With a topic: tests packageForTopic. Without: tests designPackages (5 scored candidates).

async function main(): Promise<void> {
  const [, , channelId = 'how_industries_work', ...topicParts] = process.argv;
  const topic = topicParts.join(' ').trim();
  const cfg = toChannelConfig(loadChannelSpec(channelId));

  console.log(`assets available for thumbnails: ${listChannelAssets(channelId).join(', ') || '(none)'}\n`);

  if (topic) {
    const pkg = await packageForTopic(channelId, cfg, topic);
    console.log(JSON.stringify(pkg, null, 2));
  } else {
    const packages = await designPackages(channelId, cfg, 5);
    for (const p of packages) {
      console.log(`\n[${p.score}] ${p.title}`);
      console.log(`   thumb: "${p.thumbnail.bigText}" (emph: ${p.thumbnail.emphasisWord ?? '-'}, asset: ${p.thumbnail.assetName ?? '-'})`);
      console.log(`   hook:  ${p.hookPromise}`);
      console.log(`   loops: ${p.openLoops.join(' | ')}`);
      console.log(`   payoff: ${p.payoff}`);
    }
  }
}

main().catch((e: unknown) => {
  console.error('test_packaging failed:', (e as Error).message);
  process.exit(1);
});
