import * as fs from 'fs';
import * as path from 'path';
import { channelDir } from '../config/paths';

// Per-channel publishing schedule + cadence (Part 1). Defines WHEN videos go live and the
// per-channel autoPublish flag. The orchestrator computes the next open slot (status.publishAt,
// RFC3339) and never double-books a slot already assigned to a scheduled-but-unpublished video
// (tracked in a local ledger). Generic across channels.

// A cadence rule: these times (channel-local "HH:mm") on these weekdays. Multiple rules let a
// channel post at different times on different day-types (e.g. 14:00 on weekdays, 10:00 on weekends).
export interface CadenceRule { days: string[]; times: string[]; }

export interface ScheduleConfig {
  timezone: string;                 // IANA tz, e.g. "America/New_York"
  cadence: { days: string[]; times: string[] }; // days: mon..sun; times: "HH:mm" (24h, channel tz)
  cadenceRules?: CadenceRule[];     // optional per-day-type override; when present it supersedes
                                    // `cadence` (which stays as a back-compat single-group fallback)
  autoPublish: boolean;             // false ⇒ upload private and wait for the operator;
                                    // true ⇒ schedule live at the next open slot per cadence
  privacyStatus: 'private' | 'unlisted' | 'public'; // privacy used when NOT scheduling
  categoryId: string;               // YouTube category id (e.g. "27" Education, "22" People & Blogs)
  defaultTags: string[];
  dailyQuota?: number;              // optional per-channel override of the global ceiling
  descriptionBoilerplate?: string;  // appended to every description (credits/attribution — e.g.
                                    // the required Kevin MacLeod CC-BY music credit — and links)
}

// Default cadence: post EVERY day, at 14:00 (2 PM) on weekdays and 10:00 (10 AM) on weekends.
export const DEFAULT_SCHEDULE: ScheduleConfig = {
  timezone: 'America/New_York',
  cadence: { days: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'], times: ['14:00'] },
  cadenceRules: [
    { days: ['mon', 'tue', 'wed', 'thu', 'fri'], times: ['14:00'] },
    { days: ['sat', 'sun'], times: ['10:00'] },
  ],
  autoPublish: false,
  privacyStatus: 'private',
  categoryId: '27',
  defaultTags: [],
};

const DAY_INDEX: Record<string, number> = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };

function schedulePath(channelId: string): string {
  return path.join(channelDir(channelId), 'schedule.json');
}

function ledgerPath(channelId: string): string {
  return path.join(channelDir(channelId), '.schedule.state.json');
}

export function loadSchedule(channelId: string): ScheduleConfig {
  const p = schedulePath(channelId);
  if (!fs.existsSync(p)) return { ...DEFAULT_SCHEDULE };
  const raw = JSON.parse(fs.readFileSync(p, 'utf8')) as Partial<ScheduleConfig>;
  // Back-compat: if a config sets an explicit `cadence` but no `cadenceRules`, honor that single
  // group and do NOT inject the default per-day-type rules (which would silently override it).
  const cadenceRules = raw.cadenceRules ?? (raw.cadence ? undefined : DEFAULT_SCHEDULE.cadenceRules);
  return {
    ...DEFAULT_SCHEDULE,
    ...raw,
    cadence: { ...DEFAULT_SCHEDULE.cadence, ...(raw.cadence ?? {}) },
    cadenceRules,
  };
}

export function saveSchedule(channelId: string, cfg: ScheduleConfig): void {
  fs.mkdirSync(channelDir(channelId), { recursive: true });
  fs.writeFileSync(schedulePath(channelId), JSON.stringify(cfg, null, 2), 'utf8');
}

// ── Local ledger of assigned (scheduled-but-unpublished) slots ──
interface LedgerEntry { publishAt: string; jobId: string; videoId?: string; assignedAt: string; }

function loadLedger(channelId: string): LedgerEntry[] {
  const p = ledgerPath(channelId);
  if (!fs.existsSync(p)) return [];
  try { return JSON.parse(fs.readFileSync(p, 'utf8')) as LedgerEntry[]; } catch { return []; }
}

function saveLedger(channelId: string, entries: LedgerEntry[]): void {
  fs.writeFileSync(ledgerPath(channelId), JSON.stringify(entries, null, 2), 'utf8');
}

export function recordScheduledSlot(channelId: string, publishAt: string, jobId: string, videoId?: string): void {
  const entries = loadLedger(channelId).filter((e) => new Date(e.publishAt).getTime() > Date.now() - 86_400_000);
  entries.push({ publishAt, jobId, videoId, assignedAt: new Date().toISOString() });
  saveLedger(channelId, entries);
}

function takenSlots(channelId: string): Set<number> {
  return new Set(loadLedger(channelId).map((e) => new Date(e.publishAt).getTime()));
}

// ── Timezone math (no external dep) ──
// Returns the offset (ms) such that: localWallClock = utcInstant + offset, at `date`, in `tz`.
function tzOffsetMs(date: Date, tz: string): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
  const parts = dtf.formatToParts(date);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const asUTC = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
  return asUTC - date.getTime();
}

/** Convert a wall-clock time in `tz` to the corresponding UTC Date. DST-aware (offset measured at the instant). */
export function zonedTimeToUtc(y: number, mo: number, d: number, h: number, mi: number, tz: string): Date {
  const guess = Date.UTC(y, mo - 1, d, h, mi);
  // Measure offset at the guessed instant, then correct once (sufficient outside the ~1h DST seam).
  const offset = tzOffsetMs(new Date(guess), tz);
  return new Date(guess - offset);
}

/** Which weekday (in `tz`) is `date`? 0=Sun..6=Sat. */
function weekdayInTz(date: Date, tz: string): number {
  const name = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short' }).format(date).toLowerCase().slice(0, 3);
  return DAY_INDEX[name] ?? date.getUTCDay();
}

/** The calendar Y-M-D in `tz` for `date`. */
function ymdInTz(date: Date, tz: string): { y: number; mo: number; d: number } {
  const dtf = new Intl.DateTimeFormat('en-US', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' });
  const parts = dtf.formatToParts(date);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  return { y: get('year'), mo: get('month'), d: get('day') };
}

/**
 * Compute the next open publish slot at/after `from` per the channel's cadence, skipping any
 * slot already taken (assigned to a scheduled-but-unpublished video). Returns an RFC3339 string
 * (UTC, e.g. "2026-06-15T13:00:00.000Z"). Looks ahead up to `horizonDays`.
 */
export function computeNextSlot(
  channelId: string,
  schedule: ScheduleConfig,
  from: Date = new Date(),
  horizonDays = 90
): string {
  // Normalize to a list of (weekdayIndex → times) rules. Per-day-type `cadenceRules` (e.g. weekday
  // vs weekend times) take precedence; otherwise the single `cadence` group applies to all its days.
  const rules: CadenceRule[] = (schedule.cadenceRules && schedule.cadenceRules.length)
    ? schedule.cadenceRules
    : [schedule.cadence.days.length ? schedule.cadence : DEFAULT_SCHEDULE.cadence];

  // Map each weekday index to the times scheduled for it (a day may appear in only one rule).
  const timesByWeekday = new Map<number, string[]>();
  for (const rule of rules) {
    const times = rule.times.length ? rule.times : DEFAULT_SCHEDULE.cadence.times;
    for (const d of rule.days) {
      const idx = DAY_INDEX[d.toLowerCase().slice(0, 3)];
      if (idx === undefined) continue;
      const existing = timesByWeekday.get(idx) ?? [];
      timesByWeekday.set(idx, [...existing, ...times]);
    }
  }

  const taken = takenSlots(channelId);
  const tz = schedule.timezone;

  for (let i = 0; i <= horizonDays; i++) {
    const probe = new Date(from.getTime() + i * 86_400_000);
    const wd = weekdayInTz(probe, tz);
    const times = timesByWeekday.get(wd);
    if (!times || times.length === 0) continue;
    const { y, mo, d } = ymdInTz(probe, tz);
    for (const t of [...new Set(times)].sort()) {
      const [hh, mm] = t.split(':').map(Number);
      const slot = zonedTimeToUtc(y, mo, d, hh || 0, mm || 0, tz);
      if (slot.getTime() <= from.getTime() + 60_000) continue; // must be in the future (60s buffer)
      if (taken.has(slot.getTime())) continue;                  // already booked
      return slot.toISOString();
    }
  }
  throw new Error(`No open publish slot found within ${horizonDays} days for "${channelId}". Check schedule.json cadence.`);
}
