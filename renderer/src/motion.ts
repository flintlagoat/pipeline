// Subtle, continuous "alive" motion for decorative elements (Issue 6). Kept tiny and
// slow so nothing reads as twitchy and the big text cadence is untouched. Each element
// gets a stable phase from its id so multiple assets bob out of sync (a little life,
// not a synchronized wobble).

function hashPhase(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) % 1000;
  return (h / 1000) * Math.PI * 2;
}

const BOB_AMP_BOARD = 6;   // board px of vertical float at scale 1
const BOB_FREQ_HZ = 0.16;  // ~6s period — a slow breath, not a bounce
const SWAY_AMP_BOARD = 2.5; // tiny horizontal sway for a hand-drawn-on-a-board feel

// Gentle float/bob (+ a hair of sway) for an asset, in SCREEN pixels. `amp` scales the whole
// motion per the channel's motionProfile (0 = perfectly still, 1 = default, >1 = livelier).
export function assetBob(id: string, currentTime: number, scale: number, amp = 1): { dx: number; dy: number } {
  const phase = hashPhase(id);
  const dy = Math.sin(currentTime * Math.PI * 2 * BOB_FREQ_HZ + phase) * BOB_AMP_BOARD * scale * amp;
  const dx = Math.cos(currentTime * Math.PI * 2 * (BOB_FREQ_HZ * 0.7) + phase) * SWAY_AMP_BOARD * scale * amp;
  return { dx, dy };
}

// A slow breathing factor in [lo, hi] for pulsing accents (grid marks, ticks).
export function breathe(currentTime: number, lo: number, hi: number, periodSec = 5, phase = 0): number {
  const s = (Math.sin((currentTime / periodSec) * Math.PI * 2 + phase) + 1) / 2;
  return lo + (hi - lo) * s;
}

// Multi-frame SVG animation (Issue: "have 3 frames … door opens … then a dude waves").
// A multi-frame asset plays its frames as a flipbook: hold each frame, then a quick
// cross-dissolve to the next. It runs through 0→N-1 ONCE (the progression — e.g. door
// closed → half → open), then ping-pongs the last two frames forever (the idle action —
// e.g. arm down ↔ arm up = waving). Returns the two frames to blend and the blend amount.
const FRAME_HOLD = 0.5;   // seconds a frame is held, crisp
const FRAME_XFADE = 0.32; // seconds to cross-dissolve to the next frame

function frameIndexAtStep(step: number, n: number): number {
  if (step <= n - 1) return step;            // progression 0..n-1
  const q = step - (n - 1);                  // 1,2,3,… into the idle loop
  return q % 2 === 1 ? n - 2 : n - 1;        // ping-pong the last two frames
}

export function multiFrameState(elapsed: number, n: number): { a: number; b: number; blend: number } {
  if (n <= 1) return { a: 0, b: 0, blend: 0 };
  const stepDur = FRAME_HOLD + FRAME_XFADE;
  const t = Math.max(0, elapsed);
  const k = Math.floor(t / stepDur);
  const into = t - k * stepDur;
  const blend = into <= FRAME_HOLD ? 0 : (into - FRAME_HOLD) / FRAME_XFADE; // hold, then dissolve
  return { a: frameIndexAtStep(k, n), b: frameIndexAtStep(k + 1, n), blend };
}
