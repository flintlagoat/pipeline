import * as fs from 'fs';
import * as path from 'path';
import { ROOT } from '../config/paths';

// Approximate YouTube Data API quota tracker (Part 1). The default daily quota is 10,000 units;
// a videos.insert upload costs ~1,600. We keep a per-DAY tally in a local file and refuse uploads
// that would push the day over the ceiling. Quota is per Google-CLOUD-PROJECT (not per channel),
// so the tally is GLOBAL across channels that share one OAuth client. Ceiling is configurable.

// Documented unit costs (YouTube Data API v3). These are the official approximations.
export const COST_UPLOAD = 1600;     // videos.insert
export const COST_THUMBNAIL = 50;    // thumbnails.set
export const COST_LIST = 1;          // *.list reads (channels/videos/etc.)

const QUOTA_DIR = path.join(ROOT, '.quota');

function today(): string {
  return new Date().toISOString().slice(0, 10); // UTC date; quota resets ~midnight Pacific but UTC is a safe approximation
}

function tallyPath(date = today()): string {
  return path.join(QUOTA_DIR, `${date}.json`);
}

export function dailyCeiling(): number {
  const n = Number(process.env.YT_DAILY_QUOTA);
  return Number.isFinite(n) && n > 0 ? n : 10_000;
}

export function unitsUsedToday(): number {
  const p = tallyPath();
  if (!fs.existsSync(p)) return 0;
  try {
    const j = JSON.parse(fs.readFileSync(p, 'utf8')) as { date: string; units: number };
    return j.date === today() ? j.units : 0;
  } catch {
    return 0;
  }
}

/** True if charging `cost` units now would exceed today's ceiling. */
export function wouldExceed(cost: number): boolean {
  return unitsUsedToday() + cost > dailyCeiling();
}

/** Record `cost` units against today's tally. Returns the new total. */
export function chargeUnits(cost: number): number {
  fs.mkdirSync(QUOTA_DIR, { recursive: true });
  const next = unitsUsedToday() + cost;
  fs.writeFileSync(tallyPath(), JSON.stringify({ date: today(), units: next }, null, 2), 'utf8');
  return next;
}

export function quotaSummary(): string {
  return `${unitsUsedToday()}/${dailyCeiling()} units used today`;
}
