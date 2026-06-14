import { auditPacing } from './pacingAudit';
import { BoardSpec } from './types/specTypes';

// Offline unit test for the pacing audit (no API). Verifies dead-window detection on a well-paced
// spec vs a front-loaded one.

let failures = 0;
function assert(cond: boolean, msg: string): void {
  console.log(`  ${cond ? '✓' : '✗ FAIL'} ${msg}`);
  if (!cond) failures++;
}

function specWithReveals(times: number[], duration: number): BoardSpec {
  return {
    video_id: 't', channel_id: 'c', format: 'landscape_16x9', duration_seconds: duration, fps: 30,
    audio_file: '', asset_needs: [],
    board: {
      width: 1920, height: 1080, background_color: '#08090f',
      sections: [{
        id: 's', section_type: 'hook', x_offset: 0, y_offset: 0, width: 1920, height: 1080,
        elements: times.map((t, i) => ({
          id: `e${i}`, type: 'headline' as const, reveal_at_seconds: t, reveal_type: 'fade_up' as const,
          x: 100, y: 100, content: `beat ${i}`,
        })),
      }],
      camera_keyframes: [],
    },
  };
}

console.log('well-paced spec (reveals every ~6s across 60s):');
const good = auditPacing(specWithReveals([2, 8, 14, 20, 26, 32, 38, 44, 50, 56], 60));
assert(good.totalEvents === 10, `10 events (got ${good.totalEvents})`);
assert(good.ok === true, `passes (longest gap ${good.longestGapSeconds}s ≤ 14s)`);

console.log('\nfront-loaded spec (all reveals in first 12s of a 60s video):');
const bad = auditPacing(specWithReveals([1, 3, 5, 7, 9, 11], 60));
assert(bad.ok === false, `flagged (longest gap ${bad.longestGapSeconds}s > 14s)`);
assert(bad.longestGapSeconds >= 48, `dead window ≈ 49s detected (got ${bad.longestGapSeconds}s)`);
assert(bad.longestGapStart >= 10, `dead window starts after the last reveal (${bad.longestGapStart}s)`);

console.log('\nlong intro gap (first reveal at 18s):');
const introGap = auditPacing(specWithReveals([18, 24, 30, 36, 42, 48, 54], 60));
assert(introGap.ok === false, `flagged (intro gap ${introGap.longestGapSeconds}s)`);
assert(introGap.longestGapStart === 0, 'dead window is the slow open (starts at 0)');

console.log(`\n${failures === 0 ? '✅ all pacing tests passed' : `❌ ${failures} test(s) failed`}`);
process.exit(failures === 0 ? 0 : 1);
