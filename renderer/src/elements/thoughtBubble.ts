import type { SKRSContext2D } from '@napi-rs/canvas';
import { Element, CameraState } from '../schema';
import { getRevealProgress, applyReveal } from '../reveal';
import { toScreen } from '../camera';
import { fontSpec } from '../utils';

export function drawThoughtBubble(
  ctx: SKRSContext2D,
  element: Element,
  camera: CameraState,
  outputWidth: number,
  currentTime: number
): void {
  const progress = getRevealProgress(element.reveal_at_seconds, currentTime);
  if (progress === 0) return;

  const { x, y, scale } = toScreen(element.x, element.y, camera, outputWidth);
  // Target is 200px right, 100px up by default
  const tx = x + 200 * scale;
  const ty = y - 100 * scale;

  if (element.reveal_type === 'draw_on') {
    // Draw bezier curve up to progress
    const cp1x = x + (tx - x) * 0.2;
    const cp1y = y;
    const cp2x = tx - (tx - x) * 0.2;
    const cp2y = ty;

    // Approximate bezier at t=progress
    const t = progress;
    const endX = Math.pow(1 - t, 3) * x + 3 * Math.pow(1 - t, 2) * t * cp1x + 3 * (1 - t) * t * t * cp2x + t * t * t * tx;
    const endY = Math.pow(1 - t, 3) * y + 3 * Math.pow(1 - t, 2) * t * cp1y + 3 * (1 - t) * t * t * cp2y + t * t * t * ty;

    ctx.save();
    ctx.strokeStyle = element.color ?? '#FFFFFF';
    ctx.lineWidth = (element.stroke_width ?? 1) * scale;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, endX, endY);
    ctx.stroke();
    ctx.restore();
  }

  // Text appears with fade_up after curve finishes
  if (progress > 0.7) {
    const textProgress = (progress - 0.7) / 0.3;
    applyReveal(ctx, 'fade_up', textProgress, () => {
      const fontSize = (element.font_size ?? 16) * scale;
      ctx.font = fontSpec(element.font_family, fontSize);
      ctx.fillStyle = element.color ?? '#FFFFFF';
      ctx.textBaseline = 'bottom';
      ctx.fillText(element.content ?? '', tx, ty);
    });
  }
}
