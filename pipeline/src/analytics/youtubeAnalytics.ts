import { apiGet } from '../publish/youtubeClient';
import { VideoMetrics, RetentionPoint } from './learnings';

// YouTube Analytics + Data API pull layer (Part 2), over fetch. Per published video we retrieve
// views, average view duration / percentage, subscribers gained, and the audience-retention curve.
// NOTE: impressions + impression CTR are frequently STUDIO-ONLY and not exposed by the public
// Analytics API; we attempt them and gracefully record null when the API rejects the metric.

const ANALYTICS = 'https://youtubeanalytics.googleapis.com/v2/reports';
const DATA_VIDEOS = 'https://www.googleapis.com/youtube/v3/videos';

interface AnalyticsRows {
  columnHeaders?: { name: string }[];
  rows?: (string | number)[][];
}

function today(): string { return new Date().toISOString().slice(0, 10); }

function buildReportUrl(params: Record<string, string>): string {
  const qs = new URLSearchParams({ ids: 'channel==MINE', ...params });
  return `${ANALYTICS}?${qs.toString()}`;
}

/** Video snippet: title + publishedAt (1 unit Data API read). */
export async function getVideoSnippet(channelId: string, videoId: string): Promise<{ title: string; publishedAt: string }> {
  const data = await apiGet<{ items?: { snippet: { title: string; publishedAt: string } }[] }>(
    channelId,
    `${DATA_VIDEOS}?part=snippet&id=${encodeURIComponent(videoId)}`
  );
  const s = data.items?.[0]?.snippet;
  if (!s) throw new Error(`Video ${videoId} not found (snippet).`);
  return { title: s.title, publishedAt: s.publishedAt };
}

/** Core scalar metrics for a video over [startDate, today]. */
async function fetchCoreMetrics(channelId: string, videoId: string, startDate: string): Promise<Omit<VideoMetrics, 'impressions' | 'ctr'>> {
  const url = buildReportUrl({
    startDate,
    endDate: today(),
    metrics: 'views,estimatedMinutesWatched,averageViewDuration,averageViewPercentage,subscribersGained',
    filters: `video==${videoId}`,
  });
  const data = await apiGet<AnalyticsRows>(channelId, url);
  const row = data.rows?.[0] ?? [];
  const col = (name: string) => {
    const idx = data.columnHeaders?.findIndex((h) => h.name === name) ?? -1;
    return idx >= 0 ? Number(row[idx]) : 0;
  };
  return {
    views: col('views'),
    estimatedMinutesWatched: col('estimatedMinutesWatched'),
    averageViewDuration: col('averageViewDuration'),
    averageViewPercentage: col('averageViewPercentage'),
    subscribersGained: col('subscribersGained'),
  };
}

/** Impressions + CTR — best-effort (often Studio-only). Returns nulls if the API rejects them. */
async function fetchImpressions(channelId: string, videoId: string, startDate: string): Promise<{ impressions: number | null; ctr: number | null }> {
  try {
    const url = buildReportUrl({
      startDate,
      endDate: today(),
      metrics: 'impressions,impressionClickThroughRate',
      filters: `video==${videoId}`,
    });
    const data = await apiGet<AnalyticsRows>(channelId, url);
    const row = data.rows?.[0] ?? [];
    const col = (name: string) => {
      const idx = data.columnHeaders?.findIndex((h) => h.name === name) ?? -1;
      return idx >= 0 ? Number(row[idx]) : null;
    };
    const ctrRaw = col('impressionClickThroughRate');
    return { impressions: col('impressions'), ctr: ctrRaw == null ? null : ctrRaw / 100 };
  } catch {
    return { impressions: null, ctr: null };
  }
}

/** Audience-retention curve: relative retention by elapsed-time bucket (the hook/drop-off signal). */
async function fetchRetention(channelId: string, videoId: string, startDate: string): Promise<RetentionPoint[]> {
  try {
    const url = buildReportUrl({
      startDate,
      endDate: today(),
      metrics: 'audienceWatchRatio,relativeRetentionPerformance',
      dimensions: 'elapsedVideoTimeRatio',
      filters: `video==${videoId}`,
      sort: 'elapsedVideoTimeRatio',
    });
    const data = await apiGet<AnalyticsRows>(channelId, url);
    const headers = data.columnHeaders?.map((h) => h.name) ?? [];
    const iElapsed = headers.indexOf('elapsedVideoTimeRatio');
    const iWatch = headers.indexOf('audienceWatchRatio');
    const iRel = headers.indexOf('relativeRetentionPerformance');
    return (data.rows ?? []).map((r) => ({
      elapsedRatio: Number(r[iElapsed]),
      audienceWatchRatio: iWatch >= 0 ? Number(r[iWatch]) : undefined,
      relativeRetention: iRel >= 0 ? Number(r[iRel]) : (iWatch >= 0 ? Number(r[iWatch]) : 0),
    }));
  } catch {
    return [];
  }
}

export interface PulledVideo {
  videoId: string;
  title: string;
  publishedAt: string;
  metrics: VideoMetrics;
  retentionCurve: RetentionPoint[];
}

/** Pull everything for one video. `startDate` defaults to the video's publish date. */
export async function pullVideo(channelId: string, videoId: string): Promise<PulledVideo> {
  const snippet = await getVideoSnippet(channelId, videoId);
  const startDate = snippet.publishedAt.slice(0, 10);
  const [core, imp, retention] = await Promise.all([
    fetchCoreMetrics(channelId, videoId, startDate),
    fetchImpressions(channelId, videoId, startDate),
    fetchRetention(channelId, videoId, startDate),
  ]);
  return {
    videoId,
    title: snippet.title,
    publishedAt: snippet.publishedAt,
    metrics: { ...core, impressions: imp.impressions, ctr: imp.ctr },
    retentionCurve: retention,
  };
}
