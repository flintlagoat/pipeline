import type { SKRSContext2D } from '@napi-rs/canvas';
import { Element, CameraState } from '../schema';
import { getRevealProgress, applyReveal } from '../reveal';
import { toScreen } from '../camera';

export function drawHighlightBox(
  ctx: SKRSContext2D,
  element: Element,
  camera: CameraState,
  outputWidth: number,
  currentTime: number
): void {
  const progress = getRevealProgress(element.reveal_at_seconds, currentTime);
  if (progress === 0) return;

  const { x, y, scale } = toScreen(element.x, element.y, camera, outputWidth);
  const w = (element.width ?? 200) * scale;
  const h = (element.height ?? 60) * scale;
  const strokeWidth = (element.stroke_width ?? 1.5) * scale;
  const color = element.stroke_color ?? element.color ?? '#FFE500';

  if (element.reveal_type === 'draw_on') {
    // Animate outline drawing
    const perimeter = 2 * (w + h);
    const drawn = perimeter * progress;

    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = strokeWidth;
    ctx.beginPath();
    const topEnd = Math.min(drawn, w);
    ctx.moveTo(x, y);
    ctx.lineTo(x + topEnd, y);
    if (drawn > w) {
      const rightEnd = Math.min(drawn - w, h);
      ctx.moveTo(x + w, y);
      ctx.lineTo(x + w, y + rightEnd);
    }
    if (drawn > w + h) {
      const botEnd = Math.min(drawn - w - h, w);
      ctx.moveTo(x + w, y + h);
      ctx.lineTo(x + w - botEnd, y + h);
    }
    if (drawn > 2 * w + h) {
      const leftEnd = Math.min(drawn - 2 * w - h, h);
      ctx.moveTo(x, y + h);
      ctx.lineTo(x, y + h - leftEnd);
    }
    ctx.stroke();
    ctx.restore();
  } else {
    applyReveal(ctx, element.reveal_type, progress, () => {
      ctx.save();
      ctx.strokeStyle = color;
      ctx.lineWidth = strokeWidth;
      ctx.strokeRect(x, y, w, h);
      ctx.restore();
    });
  }
}
