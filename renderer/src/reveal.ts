import type { SKRSContext2D } from '@napi-rs/canvas';
import { RevealType } from './schema';

// Default reveal animation length when an element doesn't specify reveal_duration_seconds.
export const ANIM_DURATION = 0.55;

// Progress 0..1 of an element's reveal at currentTime. `duration` (from the element's
// reveal_duration_seconds) overrides the default so reveals can be voice-paced — e.g. a long
// headline that the narrator reads over 2.5s types in across 2.5s, not a uniform 0.55s pop.
export function getRevealProgress(
  revealAtSeconds: number,
  currentTime: number,
  duration: number = ANIM_DURATION
): number {
  if (currentTime < revealAtSeconds) return 0;
  const span = duration > 0 ? duration : ANIM_DURATION;
  const elapsed = currentTime - revealAtSeconds;
  return Math.min(1, elapsed / span);
}

// How many characters of a `type_on` string are visible, plus the fractional alpha of the
// leading (just-appearing) character so the edge looks smooth instead of stepping. Typing runs
// across the reveal window; a tiny tail (TYPE_SETTLE) past full keeps the last char from
// popping at exactly progress=1.
export function typeOnState(text: string, progress: number): { visible: number; leadAlpha: number } {
  const n = text.length;
  if (n === 0) return { visible: 0, leadAlpha: 1 };
  const exact = progress * n;
  const visible = Math.floor(exact);
  const leadAlpha = visible >= n ? 1 : exact - visible;
  return { visible: Math.min(n, visible), leadAlpha };
}

// Overshoot easing (ease-out-back) for scale_in: a subtle 1.0→~1.04→1.0 settle that makes a
// reveal feel like it lands rather than fades. Kept gentle (s small) so it reads as alive, not
// bouncy/cheap.
function easeOutBack(t: number): number {
  const s = 1.1;
  const u = t - 1;
  return 1 + (s + 1) * u * u * u + s * u * u;
}

export function applyReveal(
  ctx: SKRSContext2D,
  revealType: RevealType,
  progress: number,
  drawFn: () => void,
  centerX?: number,
  centerY?: number
): void {
  if (progress === 0) return;

  switch (revealType) {
    case 'fade_up':
      ctx.save();
      ctx.globalAlpha = progress;
      ctx.translate(0, (1 - progress) * 12);
      drawFn();
      ctx.restore();
      break;

    case 'fade_only':
    case 'fade_only' as RevealType:
      ctx.save();
      ctx.globalAlpha = progress;
      drawFn();
      ctx.restore();
      break;

    case 'scale_in': {
      // Subtle overshoot-and-settle (was a plain 0.85→1.0 lerp). Alpha still ramps linearly so
      // the element doesn't flicker; only the scale carries the bounce.
      const eased = easeOutBack(progress);
      const scaleVal = 0.9 + eased * 0.1; // lands at ~1.0, peaks a touch above mid-reveal
      ctx.save();
      ctx.globalAlpha = Math.min(1, progress * 1.2);
      if (centerX !== undefined && centerY !== undefined) {
        ctx.translate(centerX, centerY);
        ctx.scale(scaleVal, scaleVal);
        ctx.translate(-centerX, -centerY);
      }
      drawFn();
      ctx.restore();
      break;
    }

    case 'blur_in': {
      const blurPx = (1 - progress) * 8;
      ctx.save();
      ctx.globalAlpha = 0.2 + progress * 0.8;
      if (blurPx > 0.1) (ctx as unknown as { filter: string }).filter = `blur(${blurPx.toFixed(1)}px)`;
      drawFn();
      (ctx as unknown as { filter: string }).filter = 'none';
      ctx.restore();
      break;
    }

    case 'instant':
      drawFn();
      break;

    case 'draw_on':
    case 'type_on':
    case 'count_up':
      // handled by element drawing functions directly (type_on uses typeOnState; count_up rolls
      // the figure via interpolateNumber) — fully visible, no fade/scale wrapper.
      drawFn();
      break;

    default:
      ctx.save();
      ctx.globalAlpha = progress;
      drawFn();
      ctx.restore();
  }
}
