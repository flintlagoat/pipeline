import * as fs from 'fs';
import * as path from 'path';
import { outputDir } from '../config/paths';
import { hasAuth } from './youtubeClient';
import { loadSchedule, computeNextSlot, recordScheduledSlot, ScheduleConfig } from './schedule';
import { buildVideoMetadata, findThumbnail, readPublishOverride } from './metadata';
import { uploadVideo, setThumbnail, UploadStatus } from './upload';
import {
  COST_UPLOAD, COST_THUMBNAIL, wouldExceed, chargeUnits, dailyCeiling, unitsUsedToday, quotaSummary,
} from './quota';

// Publish orchestration (Part 1). Confirmation gate: actual uploads are public-ish + hard to undo,
// so the DEFAULT is to upload PRIVATE (or scheduled-private) and print the URL for the operator.
//   • --schedule (or channel autoPublish:true) ⇒ schedule live at the next open cadence slot
//     (privacyStatus:private + status.publishAt; YouTube flips it public at that time).
//   • otherwise ⇒ upload private and wait for the operator to publish manually.
// Quota-aware: refuses (does not silently drop) uploads that would exceed the daily ceiling.

export interface PublishOptions {
  schedule?: boolean;   // force scheduling regardless of autoPublish
  dryRun?: boolean;     // build everything, skip the live API calls (used for self-test / no-auth)
}

export interface PublishResult {
  message: string;
  videoId?: string;
  videoUrl?: string;
  publishAt?: string;
  scheduled: boolean;
  skipped?: 'quota' | 'no-auth';
}

function videoPathFor(channelId: string, jobId: string): string {
  const p = path.join(outputDir(channelId, jobId), 'video.mp4');
  if (!fs.existsSync(p)) throw new Error(`No rendered video at ${p}. Run npm run process ${channelId} ${jobId} first.`);
  return p;
}

function writeResult(channelId: string, jobId: string, result: Record<string, unknown>): void {
  const p = path.join(outputDir(channelId, jobId), 'publish.result.json');
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify({ ...result, at: new Date().toISOString() }, null, 2), 'utf8');
}

export async function publishJob(
  channelId: string,
  jobId: string,
  opts: PublishOptions = {}
): Promise<PublishResult> {
  const schedule: ScheduleConfig = loadSchedule(channelId);
  const videoPath = videoPathFor(channelId, jobId);
  const meta = buildVideoMetadata(channelId, jobId, schedule);
  const thumbnail = findThumbnail(channelId, jobId);
  const override = readPublishOverride(channelId, jobId);

  // An explicit per-job publishAt wins; otherwise scheduling (flag or channel autoPublish) picks
  // the next open cadence slot. Any publishAt forces private (YouTube flips it live at that time).
  const willSchedule = opts.schedule === true || schedule.autoPublish === true || !!override.publishAt;
  const publishAt = override.publishAt ?? (willSchedule ? computeNextSlot(channelId, schedule) : undefined);

  const uploadStatus: UploadStatus = {
    privacyStatus: publishAt ? 'private' : (override.privacyStatus ?? schedule.privacyStatus),
    publishAt,
  };

  console.log(`\n[publish] ${channelId}/${jobId}`);
  console.log(`  title:    ${meta.title}`);
  console.log(`  privacy:  ${uploadStatus.privacyStatus}${publishAt ? ` (goes live ${publishAt})` : ' (manual publish)'}`);
  console.log(`  thumbnail: ${thumbnail ? path.basename(thumbnail) : 'none'}`);
  console.log(`  quota:    ${quotaSummary()}`);

  // ── Quota gate ──
  const cost = COST_UPLOAD + (thumbnail ? COST_THUMBNAIL : 0);
  const ceiling = schedule.dailyQuota ?? dailyCeiling();
  if (unitsUsedToday() + cost > ceiling) {
    const msg = `Upload would exceed today's quota ceiling (${unitsUsedToday()} + ${cost} > ${ceiling}). ` +
      `Queued — retry tomorrow or raise YT_DAILY_QUOTA / schedule.dailyQuota.`;
    console.warn(`  [publish] REFUSED: ${msg}`);
    writeResult(channelId, jobId, { skipped: 'quota', message: msg, plannedPublishAt: publishAt });
    return { message: msg, scheduled: false, skipped: 'quota' };
  }

  // ── Dry run (no auth / self-test): report the plan, touch nothing live ──
  if (opts.dryRun || !hasAuth(channelId)) {
    const reason = opts.dryRun ? 'dry-run' : 'no YouTube auth';
    const msg = `[${reason}] Would upload "${meta.title}" as ${uploadStatus.privacyStatus}` +
      `${publishAt ? ` scheduled for ${publishAt}` : ''}. ` +
      (hasAuth(channelId) ? '' : `Run npm run youtube:auth ${channelId} to enable live uploads.`);
    console.log(`  [publish] ${msg}`);
    writeResult(channelId, jobId, { dryRun: true, plan: { meta, uploadStatus }, message: msg });
    return { message: msg, scheduled: willSchedule, publishAt, skipped: hasAuth(channelId) ? undefined : 'no-auth' };
  }

  // ── Live upload ──
  const result = await uploadVideo(channelId, videoPath, meta, uploadStatus);
  chargeUnits(COST_UPLOAD);

  if (thumbnail) {
    try {
      await setThumbnail(channelId, result.videoId, thumbnail);
      chargeUnits(COST_THUMBNAIL);
    } catch (e) {
      console.warn(`  [publish] thumbnail not set: ${(e as Error).message}`);
    }
  }

  if (willSchedule && publishAt) recordScheduledSlot(channelId, publishAt, jobId, result.videoId);

  const message = willSchedule
    ? `Uploaded (private) and scheduled to go live ${publishAt}.`
    : `Uploaded as ${result.privacyStatus}. Publish manually when ready.`;
  writeResult(channelId, jobId, { ...result, message, scheduled: willSchedule });
  console.log(`  [publish] ${message} (${quotaSummary()})`);

  return { message, videoId: result.videoId, videoUrl: result.url, publishAt, scheduled: willSchedule };
}
