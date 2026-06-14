// Outlier research (session 7) — turns topic selection from taste into data. The biggest lever on
// YouTube is the video IDEA; the cleanest demand signal is an "outlier": a video that vastly
// overperformed its OWN channel's subscriber baseline (a 4k-sub channel pulling 400k views is a
// far cleaner signal than a mega-channel getting another hit). This module searches the niche via
// the YouTube Data API (public, API-key only — NO OAuth needed), scores outliers, clusters the
// title/format patterns, and feeds "PROVEN DEMAND" into the packaging engine.
//
// It NO-OPS gracefully without YOUTUBE_API_KEY (returns an empty result) so the rest of the
// pipeline is unaffected — exactly like the analytics pull self-skips without auth. The scoring +
// clustering are pure functions, unit-tested offline (test_outliers.ts).

const API = 'https://www.googleapis.com/youtube/v3';

export interface NicheVideo {
  videoId: string;
  title: string;
  channelId: string;
  channelTitle: string;
  views: number;
  channelSubs: number;
  publishedAt: string;
}

export interface ScoredOutlier extends NicheVideo {
  multiplier: number; // views ÷ subscriber baseline — how far it beat its own channel's size
}

export interface TitlePattern {
  pattern: string;    // a recurring format marker or keyword
  count: number;
  examples: string[];
}

export interface OutlierResearch {
  query: string;
  sampled: number;
  outliers: ScoredOutlier[];
  patterns: TitlePattern[];
  note?: string;      // set when the API key is missing (no-op explanation)
}

export function youtubeApiKey(): string | undefined {
  const k = process.env.YOUTUBE_API_KEY;
  return k && k.trim() ? k.trim() : undefined;
}

// ── Pure logic (unit-tested offline) ──────────────────────────────────────────

const SUB_FLOOR = 500;      // treat tiny/zero sub counts as this so the ratio stays meaningful
const MIN_VIEWS = 20000;    // ignore low-view noise
const OUTLIER_MULT = 4;     // views ≥ 4× the channel's subscriber baseline = an outlier

/** Score + rank niche videos by how far they beat their own channel's subscriber baseline. */
export function scoreOutliers(videos: NicheVideo[]): ScoredOutlier[] {
  return videos
    .filter((v) => v.views >= MIN_VIEWS)
    .map((v) => ({ ...v, multiplier: v.views / Math.max(v.channelSubs, SUB_FLOOR) }))
    .filter((v) => v.multiplier >= OUTLIER_MULT)
    .sort((a, b) => b.multiplier - a.multiplier);
}

const STOP = new Set([
  'the', 'a', 'an', 'of', 'to', 'in', 'on', 'for', 'and', 'or', 'is', 'are', 'was', 'how', 'why',
  'what', 'this', 'that', 'with', 'you', 'your', 'it', 'its', 'i', 'we', 'they', 'do', 'does',
  'did', 'so', 'but', 'at', 'by', 'from', 'as', 'be', 'my', 'me', 'not',
]);

// Recurring FORMAT markers worth surfacing (these are the repeatable shapes, not topics).
const FORMAT_RULES: { id: string; test: (t: string) => boolean }[] = [
  { id: 'question hook ("why/how …")', test: (t) => /^\s*(why|how|what|when)\b/i.test(t) },
  { id: 'money figure in title', test: (t) => /[$£€]\s?\d|\d+\s?(k|million|billion|dollars)/i.test(t) },
  { id: '"the real reason / truth"', test: (t) => /\bthe real (reason|truth|story)\b|\bwhat nobody\b|\bthe truth about\b/i.test(t) },
  { id: 'number-led / listicle', test: (t) => /^\s*\d+\b/.test(t) },
  { id: 'contrarian ("not what you think")', test: (t) => /\bisn'?t\b|\bnot what\b|\bwrong\b|\bmyth\b|\bactually\b/i.test(t) },
  { id: 'curiosity gap ("secretly / hidden")', test: (t) => /\bsecret(ly)?\b|\bhidden\b|\bbehind\b|\binside\b/i.test(t) },
];

/** Cluster titles into recurring FORMAT patterns + frequent content keywords. */
export function clusterTitlePatterns(titles: string[]): TitlePattern[] {
  const out: TitlePattern[] = [];

  // Format markers.
  for (const rule of FORMAT_RULES) {
    const hits = titles.filter((t) => rule.test(t));
    if (hits.length >= 2) out.push({ pattern: rule.id, count: hits.length, examples: hits.slice(0, 3) });
  }

  // Frequent content keywords (single words, sans stopwords).
  const freq = new Map<string, { count: number; examples: Set<string> }>();
  for (const t of titles) {
    const seen = new Set<string>();
    for (const raw of t.toLowerCase().split(/[^\p{L}\p{N}]+/u)) {
      const w = raw.trim();
      if (w.length < 4 || STOP.has(w) || seen.has(w)) continue;
      seen.add(w);
      const e = freq.get(w) ?? { count: 0, examples: new Set<string>() };
      e.count++; if (e.examples.size < 3) e.examples.add(t);
      freq.set(w, e);
    }
  }
  for (const [w, e] of [...freq.entries()].sort((a, b) => b[1].count - a[1].count)) {
    if (e.count >= 3) out.push({ pattern: `keyword: "${w}"`, count: e.count, examples: [...e.examples] });
    if (out.length >= 12) break;
  }
  return out;
}

/** Render the research as a compact PROVEN-DEMAND block for the packaging prompt (or '' if empty). */
export function formatDemandForPrompt(r: OutlierResearch): string {
  if (r.outliers.length === 0 && r.patterns.length === 0) return '';
  const lines: string[] = [];
  if (r.outliers.length) {
    lines.push('PROVEN DEMAND — videos in this niche that vastly beat their channel\'s size recently');
    lines.push('(these subjects/angles have demonstrated pull; design for the SAME demand, fresh topic):');
    for (const o of r.outliers.slice(0, 10)) {
      lines.push(`  • "${o.title}" — ${o.multiplier.toFixed(0)}× its subs (${formatNum(o.views)} views, ${formatNum(o.channelSubs)} subs)`);
    }
  }
  if (r.patterns.length) {
    lines.push('RECURRING WINNING PATTERNS in this niche (lean into these shapes):');
    for (const p of r.patterns.slice(0, 8)) lines.push(`  • ${p.pattern} (${p.count}×)`);
  }
  return lines.join('\n');
}

function formatNum(n: number): string {
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(0)}k`;
  return String(n);
}

// ── Network (no-ops without YOUTUBE_API_KEY) ──────────────────────────────────

async function apiGet(endpoint: string, params: Record<string, string>): Promise<Record<string, unknown>> {
  const key = youtubeApiKey();
  if (!key) throw new Error('no api key');
  const qs = new URLSearchParams({ ...params, key }).toString();
  const resp = await fetch(`${API}/${endpoint}?${qs}`);
  if (!resp.ok) throw new Error(`YouTube Data API ${endpoint} ${resp.status}: ${(await resp.text()).slice(0, 200)}`);
  return (await resp.json()) as Record<string, unknown>;
}

/** Fetch + enrich up to ~50 niche videos (search → video stats → channel subs). Empty w/o key. */
export async function fetchNicheVideos(query: string, maxResults = 50): Promise<NicheVideo[]> {
  if (!youtubeApiKey()) return [];
  // Broader window (365 days) so niche searches with lower posting frequency still surface data.
  const publishedAfter = new Date(Date.now() - 365 * 24 * 3600 * 1000).toISOString();
  const search = await apiGet('search', {
    part: 'snippet', q: query, type: 'video', order: 'viewCount',
    maxResults: String(Math.min(50, maxResults)), publishedAfter, relevanceLanguage: 'en',
  });
  const items = (search.items as { id: { videoId: string }; snippet: { channelId: string; channelTitle: string; title: string; publishedAt: string } }[]) ?? [];
  if (items.length === 0) return [];

  const videoIds = items.map((i) => i.id.videoId).filter(Boolean);
  const stats = await apiGet('videos', { part: 'statistics', id: videoIds.join(',') });
  const viewById = new Map<string, number>();
  for (const v of (stats.items as { id: string; statistics?: { viewCount?: string } }[]) ?? []) {
    viewById.set(v.id, Number(v.statistics?.viewCount ?? 0));
  }

  const channelIds = [...new Set(items.map((i) => i.snippet.channelId))];
  const subsById = new Map<string, number>();
  // channels.list accepts up to 50 ids per call.
  for (let i = 0; i < channelIds.length; i += 50) {
    const chunk = channelIds.slice(i, i + 50);
    const ch = await apiGet('channels', { part: 'statistics', id: chunk.join(',') });
    for (const c of (ch.items as { id: string; statistics?: { subscriberCount?: string } }[]) ?? []) {
      subsById.set(c.id, Number(c.statistics?.subscriberCount ?? 0));
    }
  }

  return items
    .filter((i) => {
      // Filter out Shorts and music lyric videos — different engagement patterns, misleading metrics.
      const t = i.snippet.title.toLowerCase();
      return !/#shorts?\b/.test(t) && !/\blyricslyric\b/.test(t) && !/\blyrics\b/.test(t);
    })
    .map((i) => ({
      videoId: i.id.videoId,
      title: i.snippet.title,
      channelId: i.snippet.channelId,
      channelTitle: i.snippet.channelTitle,
      views: viewById.get(i.id.videoId) ?? 0,
      channelSubs: subsById.get(i.snippet.channelId) ?? 0,
      publishedAt: i.snippet.publishedAt,
    }));
}

// Niche descriptions are long and specific; YouTube search works best with 2-5 word punchy queries.
// Derive 2-3 short search queries from the description to maximise coverage.
function nicheToSearchQueries(niche: string): string[] {
  // Stopwords for the purpose of query shortening (broader list than the clustering STOP set).
  const skipWords = new Set([
    'the','a','an','of','to','in','on','for','and','or','is','are','was','how','why',
    'what','this','that','with','you','your','it','its','i','we','they','do','does',
    'did','so','but','at','by','from','as','be','my','me','not','hidden','real','true',
    'business','systems','mechanics','basics','explained','about','inside','behind',
  ]);
  const words = niche.toLowerCase()
    .split(/[^a-z]+/)
    .filter((w) => w.length >= 4 && !skipWords.has(w));

  // Primary: up to 3 most distinctive words from the niche
  const primary = words.slice(0, 3).join(' ');

  // Broadening variants — append "explained" and "how it works" to catch more formats
  const queries: string[] = [];
  if (primary) queries.push(primary);
  if (words.length >= 2) {
    const pair = words.slice(0, 2).join(' ');
    if (pair !== primary) queries.push(pair + ' explained');
  }
  queries.push(words.slice(0, 2).join(' ') + ' how it works');

  // Deduplicate and fall back to the raw niche if nothing extracted
  const unique = [...new Set(queries.filter(Boolean))];
  return unique.length ? unique : [niche];
}

/** Full research: search the niche → score outliers → cluster patterns. Safe no-op without a key. */
export async function researchOutliers(query: string): Promise<OutlierResearch> {
  if (!youtubeApiKey()) {
    return { query, sampled: 0, outliers: [], patterns: [], note: 'YOUTUBE_API_KEY not set — research skipped (taste-based topics).' };
  }

  // Expand the niche description into multiple short queries and merge results (dedupe by videoId).
  const searchQueries = nicheToSearchQueries(query);
  const seen = new Set<string>();
  const allVideos: NicheVideo[] = [];
  for (const q of searchQueries) {
    const batch = await fetchNicheVideos(q, 50);
    for (const v of batch) {
      if (!seen.has(v.videoId)) { seen.add(v.videoId); allVideos.push(v); }
    }
  }

  const outliers = scoreOutliers(allVideos);
  const patterns = clusterTitlePatterns(outliers.length >= 4 ? outliers.map((o) => o.title) : allVideos.map((v) => v.title));
  return { query, sampled: allVideos.length, outliers, patterns };
}
