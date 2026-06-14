import type { SKRSContext2D } from '@napi-rs/canvas';
import { Element, CameraState } from '../schema';
import { getRevealProgress, applyReveal, typeOnState } from '../reveal';
import { toScreen } from '../camera';
import { fontSpec, drawRichLine } from '../utils';

export function drawEyebrowLabel(
  ctx: SKRSContext2D,
  element: Element,
  camera: CameraState,
  outputWidth: number,
  currentTime: number
): void {
  const progress = getRevealProgress(element.reveal_at_seconds, currentTime, element.reveal_duration_seconds);
  if (progress === 0) return;

  const { x, y, scale } = toScreen(element.x, element.y, camera, outputWidth);
  const text = element.content ?? '';
  const typing = element.reveal_type === 'type_on';
  const { visible, leadAlpha } = typing ? typeOnState(text, progress) : { visible: text.length, leadAlpha: 1 };

  applyReveal(ctx, element.reveal_type, progress, () => {
    const fontSize = (element.font_size ?? 14) * scale;
    ctx.font = fontSpec('mono', fontSize);
    ctx.textBaseline = 'top';
    drawRichLine(ctx, text, x, y, {
      letterSpacing: (element.letter_spacing ?? 4) * scale,
      baseColor: element.color ?? '#00D8FF',
      emphasisColor: element.emphasis_color,
      visibleChars: typing ? visible : undefined,
      leadAlpha,
    });
  });
}
