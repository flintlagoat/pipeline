import type { SKRSContext2D } from '@napi-rs/canvas';
import { Element, CameraState } from '../schema';
import { getRevealProgress, applyReveal, typeOnState } from '../reveal';
import { toScreen } from '../camera';
import { fontSpec, drawRichLine } from '../utils';
import { interpolateNumber } from '../countUp';

export function drawHeadline(
  ctx: SKRSContext2D,
  element: Element,
  camera: CameraState,
  outputWidth: number,
  currentTime: number
): void {
  const progress = getRevealProgress(element.reveal_at_seconds, currentTime, element.reveal_duration_seconds);
  if (progress === 0) return;

  const { x, y, scale } = toScreen(element.x, element.y, camera, outputWidth);
  const counting = element.reveal_type === 'count_up';
  // count_up rolls the figure from 0 → target; everything else uses the literal content.
  const text = counting ? interpolateNumber(element.content ?? '', progress) : (element.content ?? '');
  const emphasisSet = element.emphasis_words?.length
    ? new Set(element.emphasis_words.map((w) => w.toLowerCase()))
    : undefined;
  const typing = element.reveal_type === 'type_on';
  const { visible, leadAlpha } = typing ? typeOnState(text, progress) : { visible: text.length, leadAlpha: 1 };

  applyReveal(ctx, element.reveal_type, progress, () => {
    const fontSize = (element.font_size ?? 72) * scale;
    ctx.font = fontSpec(element.font_family, fontSize);
    ctx.textBaseline = 'top';
    drawRichLine(ctx, text, x, y, {
      letterSpacing: (element.letter_spacing ?? 0) * scale,
      baseColor: element.color ?? '#FFFFFF',
      emphasisColor: element.emphasis_color,
      // While counting, the digits change each frame so per-word emphasis would flicker — the
      // number IS the focal point, so draw it whole in its own color.
      emphasisSet: counting ? undefined : emphasisSet,
      visibleChars: typing ? visible : undefined,
      leadAlpha,
    });
  });
}
