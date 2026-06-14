import type { SKRSContext2D } from '@napi-rs/canvas';
import { Element, CameraState } from '../schema';
import { getRevealProgress, applyReveal } from '../reveal';
import { toScreen } from '../camera';
import { fontSpec } from '../utils';

export function drawNodeCircle(
  ctx: SKRSContext2D,
  element: Element,
  camera: CameraState,
  outputWidth: number,
  currentTime: number
): void {
  const progress = getRevealProgress(element.reveal_at_seconds, currentTime);
  if (progress === 0) return;

  const { x, y, scale } = toScreen(element.x, element.y, camera, outputWidth);
  const r = (element.radius ?? 40) * scale;
  const strokeWidth = (element.stroke_width ?? 1.5) * scale;
  const color = element.color ?? '#FFFFFF';

  const draw = () => {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = strokeWidth;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.stroke();

    if (element.content) {
      const fontSize = (element.font_size ?? 14) * scale;
      ctx.font = fontSpec('mono', fontSize);
      ctx.fillStyle = color;
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'center';
      ctx.fillText(element.content, x, y);
      ctx.textAlign = 'left';
    }
    ctx.restore();
  };

  if (element.reveal_type === 'draw_on') {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = strokeWidth;
    ctx.beginPath();
    ctx.arc(x, y, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * progress);
    ctx.stroke();
    ctx.restore();
  } else if (element.reveal_type === 'scale_in') {
    applyReveal(ctx, 'scale_in', progress, draw, x, y);
  } else {
    applyReveal(ctx, element.reveal_type, progress, draw);
  }
}
