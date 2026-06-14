import * as fs from 'fs';
import { getAccessToken } from './youtubeClient';
import { VideoMetadata } from './metadata';

// YouTube videos.insert via the RESUMABLE upload protocol over fetch (no googleapis dep).
// Videos here are small (~10-25MB) so a single PUT of the whole file is fine. Also supports
// thumbnails.set. All calls are authenticated with the channel's refreshed access token.

const RESUMABLE_INIT = 'https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status';
const THUMBNAIL_SET = (videoId: string) =>
  `https://www.googleapis.com/upload/youtube/v3/thumbnails/set?videoId=${encodeURIComponent(videoId)}&uploadType=media`;

export interface UploadStatus {
  privacyStatus: 'private' | 'unlisted' | 'public';
  publishAt?: string; // RFC3339; when set, privacyStatus MUST be 'private' (YouTube flips it at this time)
}

export interface UploadResult {
  videoId: string;
  url: string;
  privacyStatus: string;
  publishAt?: string;
}

/** Upload a rendered video file to YouTube. Returns the new video id + watch URL. */
export async function uploadVideo(
  channelId: string,
  videoPath: string,
  meta: VideoMetadata,
  status: UploadStatus
): Promise<UploadResult> {
  if (!fs.existsSync(videoPath)) throw new Error(`Video file not found: ${videoPath}`);
  const bytes = fs.readFileSync(videoPath);
  const token = await getAccessToken(channelId);

  const snippet: Record<string, unknown> = {
    title: meta.title,
    description: meta.description,
    tags: meta.tags,
    categoryId: meta.categoryId,
  };
  const statusBlock: Record<string, unknown> = {
    privacyStatus: status.publishAt ? 'private' : status.privacyStatus,
    selfDeclaredMadeForKids: false,
  };
  if (status.publishAt) statusBlock.publishAt = status.publishAt;

  // 1) Initiate resumable session.
  const initResp = await fetch(RESUMABLE_INIT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json; charset=UTF-8',
      'X-Upload-Content-Type': 'video/*',
      'X-Upload-Content-Length': String(bytes.length),
    },
    body: JSON.stringify({ snippet, status: statusBlock }),
  });
  if (!initResp.ok) {
    const detail = await initResp.text().catch(() => '');
    throw new Error(`Upload init failed (${initResp.status}): ${detail.slice(0, 400)}`);
  }
  const uploadUrl = initResp.headers.get('location');
  if (!uploadUrl) throw new Error('Upload init succeeded but no resumable session URL was returned.');

  // 2) Upload the bytes in a single PUT.
  const putResp = await fetch(uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': 'video/*', 'Content-Length': String(bytes.length) },
    body: bytes,
  });
  if (!putResp.ok) {
    const detail = await putResp.text().catch(() => '');
    throw new Error(`Upload PUT failed (${putResp.status}): ${detail.slice(0, 400)}`);
  }
  const video = (await putResp.json()) as { id: string; status?: { privacyStatus?: string; publishAt?: string } };
  if (!video.id) throw new Error('Upload completed but no video id was returned.');

  return {
    videoId: video.id,
    url: `https://www.youtube.com/watch?v=${video.id}`,
    privacyStatus: video.status?.privacyStatus ?? statusBlock.privacyStatus as string,
    publishAt: video.status?.publishAt ?? status.publishAt,
  };
}

/** Set a custom thumbnail on an uploaded video (best-effort; requires a verified channel). */
export async function setThumbnail(channelId: string, videoId: string, thumbnailPath: string): Promise<void> {
  if (!fs.existsSync(thumbnailPath)) return;
  const bytes = fs.readFileSync(thumbnailPath);
  const token = await getAccessToken(channelId);
  const contentType = thumbnailPath.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg';
  const resp = await fetch(THUMBNAIL_SET(videoId), {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': contentType, 'Content-Length': String(bytes.length) },
    body: bytes,
  });
  if (!resp.ok) {
    const detail = await resp.text().catch(() => '');
    throw new Error(`Thumbnail set failed (${resp.status}): ${detail.slice(0, 300)}`);
  }
}
