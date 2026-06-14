import {
  scoreOutliers, clusterTitlePatterns, formatDemandForPrompt, NicheVideo, OutlierResearch,
} from './research/outliers';

// Offline unit test for the outlier scoring + clustering (no network/API key needed). Verifies the
// pure logic that converts raw niche videos into proven-demand evidence for the packaging engine.

let failures = 0;
function assert(cond: boolean, msg: string): void {
  console.log(`  ${cond ? '✓' : '✗ FAIL'} ${msg}`);
  if (!cond) failures++;
}

// Synthetic niche videos: small channels with breakout views (outliers) + a mega-channel hit
// (NOT an outlier — it's expected for its size) + a low-view dud (ignored).
const videos: NicheVideo[] = [
  { videoId: 'a', title: 'Why Costco Hot Dogs Are Still $1.50', channelId: 'c1', channelTitle: 'SmallBiz', views: 480_000, channelSubs: 6_000, publishedAt: '2026-05-01' },
  { videoId: 'b', title: 'The Real Reason Printer Ink Costs So Much', channelId: 'c2', channelTitle: 'Tinkerer', views: 320_000, channelSubs: 12_000, publishedAt: '2026-05-10' },
  { videoId: 'c', title: 'The Real Truth About Why Gyms Want You to Quit', channelId: 'c3', channelTitle: 'MoneyMechanics', views: 210_000, channelSubs: 9_000, publishedAt: '2026-05-15' },
  { videoId: 'd', title: 'Why Movie Theaters Charge $9 for Popcorn', channelId: 'c4', channelTitle: 'BizDecoded', views: 150_000, channelSubs: 20_000, publishedAt: '2026-05-20' },
  { videoId: 'e', title: 'My Vacation Vlog', channelId: 'c5', channelTitle: 'Megastar', views: 2_000_000, channelSubs: 8_000_000, publishedAt: '2026-05-22' }, // mega, NOT outlier
  { videoId: 'f', title: 'Boring Update Video', channelId: 'c6', channelTitle: 'Nobody', views: 3_000, channelSubs: 100, publishedAt: '2026-05-25' }, // below MIN_VIEWS
];

console.log('scoreOutliers:');
const scored = scoreOutliers(videos);
assert(scored.length === 4, `4 outliers detected (got ${scored.length})`);
assert(scored[0].videoId === 'a', `top outlier is the 80× one (got ${scored[0]?.videoId})`);
assert(!scored.some((s) => s.videoId === 'e'), 'mega-channel hit is NOT an outlier');
assert(!scored.some((s) => s.videoId === 'f'), 'low-view dud is filtered out');
assert(scored[0].multiplier >= 4, `multiplier computed (${scored[0]?.multiplier.toFixed(0)}×)`);

console.log('\nclusterTitlePatterns:');
const patterns = clusterTitlePatterns(scored.map((s) => s.title));
const ids = patterns.map((p) => p.pattern);
assert(ids.some((p) => p.includes('question hook')), 'detects question-hook format ("Why/How")');
assert(ids.some((p) => p.includes('money figure')), 'detects money-figure format ($1.50/$9)');
assert(ids.some((p) => /real reason|truth/.test(p)), 'detects "the real reason" format');
console.log('   patterns:', ids.join(' | '));

console.log('\nformatDemandForPrompt:');
const research: OutlierResearch = { query: 'test', sampled: 6, outliers: scored, patterns };
const block = formatDemandForPrompt(research);
assert(block.includes('PROVEN DEMAND'), 'renders a PROVEN DEMAND block');
assert(block.includes('×'), 'includes the outlier multipliers');
console.log('\n──── demand block ────\n' + block);

console.log(`\n${failures === 0 ? '✅ all outlier-logic tests passed' : `❌ ${failures} test(s) failed`}`);
process.exit(failures === 0 ? 0 : 1);
