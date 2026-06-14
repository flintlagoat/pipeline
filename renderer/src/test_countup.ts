import { interpolateNumber, isCountable } from './countUp';

// Offline unit test for the count-up number interpolation (no render needed). Covers the formatting
// edge cases: thousands separators, decimals, currency/percent affixes, and landing exactly on the
// written value at progress ≥ 1.

let failures = 0;
function eq(actual: string, expected: string, msg: string): void {
  const ok = actual === expected;
  console.log(`  ${ok ? '✓' : '✗ FAIL'} ${msg}  (got "${actual}", want "${expected}")`);
  if (!ok) failures++;
}
function assert(cond: boolean, msg: string): void {
  console.log(`  ${cond ? '✓' : '✗ FAIL'} ${msg}`);
  if (!cond) failures++;
}

console.log('lands exactly on target at progress=1:');
eq(interpolateNumber('$3,000', 1), '$3,000', 'currency + comma');
eq(interpolateNumber('700%', 1), '700%', 'percent');
eq(interpolateNumber('$1.50', 1), '$1.50', 'decimals preserved');
eq(interpolateNumber('6,000 MEMBERS', 1), '6,000 MEMBERS', 'suffix word preserved');
eq(interpolateNumber('$75 / WEEK', 1), '$75 / WEEK', 'affix preserved');
eq(interpolateNumber('A 300-ROOM HOTEL', 1), 'A 300-ROOM HOTEL', 'mid-phrase number lands');

console.log('\nstarts near zero at progress=0:');
eq(interpolateNumber('$3,000', 0), '$0', 'currency starts at 0');
eq(interpolateNumber('$1.50', 0), '$0.00', 'decimals start at 0.00');

console.log('\nmid-roll keeps formatting (commas) and stays in range:');
const mid = interpolateNumber('$3,000', 0.5);
assert(/^\$[\d,]+$/.test(mid), `mid value is $-prefixed integer with commas ("${mid}")`);
const midN = Number(mid.replace(/[$,]/g, ''));
assert(midN > 0 && midN < 3000, `mid value between 0 and 3000 (${midN})`);

console.log('\nisCountable gating:');
assert(isCountable('$3,000') === true, '$3,000 is countable');
assert(isCountable('700%') === true, '700% is countable');
assert(isCountable('$8') === false, '$8 (small) is NOT countable');
assert(isCountable('THE SYSTEM') === false, 'non-number is NOT countable');
assert(isCountable('1,200') === true, 'comma number is countable');

console.log(`\n${failures === 0 ? '✅ all count-up tests passed' : `❌ ${failures} test(s) failed`}`);
process.exit(failures === 0 ? 0 : 1);
