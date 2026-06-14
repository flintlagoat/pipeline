import { computeNextSlot, ScheduleConfig, DEFAULT_SCHEDULE } from './publish/schedule';

// Offline unit test (no API, no fs) for per-day-type cadence (s8). Verifies the next-slot math
// picks 2 PM on weekdays and 10 AM on weekends in the channel timezone, rolls past elapsed times,
// and that a legacy single-`cadence` config (no cadenceRules) still works unchanged.

let failures = 0;
function assert(cond: boolean, msg: string): void {
  console.log(`  ${cond ? '✓' : '✗ FAIL'} ${msg}`);
  if (!cond) failures++;
}

const sched: ScheduleConfig = {
  ...DEFAULT_SCHEDULE,
  timezone: 'America/New_York',
  cadenceRules: [
    { days: ['mon', 'tue', 'wed', 'thu', 'fri'], times: ['14:00'] },
    { days: ['sat', 'sun'], times: ['10:00'] },
  ],
};

function etParts(iso: string): { wd: string; hm: string } {
  const d = new Date(iso);
  const wd = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', weekday: 'short' }).format(d);
  const hm = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', hour12: false }).format(d);
  return { wd, hm };
}

// NOTE: computeNextSlot reads a per-channel ledger by id; use a throwaway id so no ledger exists.
const CH = '__sched_test__';

console.log('weekday morning → same-day 2 PM ET:');
let s = etParts(computeNextSlot(CH, sched, new Date(Date.UTC(2026, 5, 15, 12, 0)))); // Mon 08:00 ET
assert(s.wd === 'Mon' && s.hm === '14:00', `Mon 08:00 → Mon 14:00 (got ${s.wd} ${s.hm})`);

console.log('\nweekday after 2 PM → next day:');
s = etParts(computeNextSlot(CH, sched, new Date(Date.UTC(2026, 5, 15, 20, 0)))); // Mon 16:00 ET
assert(s.wd === 'Tue' && s.hm === '14:00', `Mon 16:00 → Tue 14:00 (got ${s.wd} ${s.hm})`);

console.log('\nFriday after 2 PM → Saturday 10 AM ET (weekend time):');
s = etParts(computeNextSlot(CH, sched, new Date(Date.UTC(2026, 5, 19, 20, 0)))); // Fri 16:00 ET
assert(s.wd === 'Sat' && s.hm === '10:00', `Fri 16:00 → Sat 10:00 (got ${s.wd} ${s.hm})`);

console.log('\nSaturday early → same-day 10 AM ET:');
s = etParts(computeNextSlot(CH, sched, new Date(Date.UTC(2026, 5, 20, 10, 0)))); // Sat 06:00 ET
assert(s.wd === 'Sat' && s.hm === '10:00', `Sat 06:00 → Sat 10:00 (got ${s.wd} ${s.hm})`);

console.log('\nSunday after 10 AM → Monday 2 PM ET (weekday time):');
s = etParts(computeNextSlot(CH, sched, new Date(Date.UTC(2026, 5, 21, 15, 0)))); // Sun 11:00 ET
assert(s.wd === 'Mon' && s.hm === '14:00', `Sun 11:00 → Mon 14:00 (got ${s.wd} ${s.hm})`);

console.log('\nlegacy single-cadence config (no cadenceRules) still works:');
const legacy: ScheduleConfig = {
  ...DEFAULT_SCHEDULE, timezone: 'America/New_York', cadenceRules: undefined,
  cadence: { days: ['mon', 'wed', 'fri'], times: ['09:00'] },
};
s = etParts(computeNextSlot(CH, legacy, new Date(Date.UTC(2026, 5, 15, 12, 0)))); // Mon 08:00 ET
assert(s.wd === 'Mon' && s.hm === '09:00', `legacy Mon/Wed/Fri 09:00 honored (got ${s.wd} ${s.hm})`);

console.log(`\n${failures === 0 ? '✅ all schedule tests passed' : `❌ ${failures} test(s) failed`}`);
process.exit(failures === 0 ? 0 : 1);
