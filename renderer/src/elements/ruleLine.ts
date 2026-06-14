import type { SKRSContext2D } from '@napi-rs/canvas';
import { Element, CameraState } from '../schema';
import { getRevealProgress, applyReveal } from '../reveal';
import { toScreen } from '../camera';

export function drawRuleLine(
  ctx: SKRSContext2D,
  element: Element,
  camera: CameraState,
  outputWidth: number,
  currentTime: number
): void {
  const progress = getRevealProgress(element.reveal_at_seconds, currentTime);
  if (progress === 0) return;

  const start = toScreen(element.x, element.y, camera, outputWidth);
  const end = toScreen(element.x2 ?? element.x, element.y2 ?? element.y, camera, outputWidth);
  const strokeWidth = (element.stroke_width ?? 1) * start.scale;

  if (element.reveal_type === 'draw_on') {
    const endX = start.x + (end.x - start.x) * progress;
    const endY = start.y + (end.y - start.y) * progress;

    ctx.save();
    ctx.beginPath();
    ctx.moveTo(start.x, start.y);
    ctx.lineTo(endX, endY);
    ctx.strokeStyle = element.stroke_color ?? '#FFFFFF';
    ctx.lineWidth = strokeWidth;
    if (element.dashed) ctx.setLineDash([4 * start.scale, 4 * start.scale]);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  } else {
    applyReveal(ctx, element.reveal_type, progress, () => {
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(start.x, start.y);
      ctx.lineTo(end.x, end.y);
      ctx.strokeStyle = element.stroke_color ?? '#FFFFFF';
      ctx.lineWidth = strokeWidth;
      if (element.dashed) ctx.setLineDash([4 * start.scale, 4 * start.scale]);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
    });
  }
}
