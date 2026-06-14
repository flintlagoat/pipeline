import type { SKRSContext2D } from '@napi-rs/canvas';
import { Element, CameraState } from '../schema';
import { getRevealProgress, applyReveal } from '../reveal';
import { toScreen } from '../camera';

function drawArrowhead(ctx: SKRSContext2D, toX: number, toY: number, fromX: number, fromY: number, size: number): void {
  const angle = Math.atan2(toY - fromY, toX - fromX);
  ctx.beginPath();
  ctx.moveTo(toX, toY);
  ctx.lineTo(toX - size * Math.cos(angle - Math.PI / 6), toY - size * Math.sin(angle - Math.PI / 6));
  ctx.lineTo(toX - size * Math.cos(angle + Math.PI / 6), toY - size * Math.sin(angle + Math.PI / 6));
  ctx.closePath();
  ctx.fill();
}

export function drawConnectorArrow(
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
  const strokeWidth = (element.stroke_width ?? 1.5) * start.scale;
  const color = element.stroke_color ?? '#FFFFFF';

  if (element.reveal_type === 'draw_on') {
    const curX = start.x + (end.x - start.x) * progress;
    const curY = start.y + (end.y - start.y) * progress;

    ctx.save();
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = strokeWidth;
    ctx.beginPath();
    ctx.moveTo(start.x, start.y);
    ctx.lineTo(curX, curY);
    ctx.stroke();

    if (progress > 0.8) {
      const arrowProgress = (progress - 0.8) / 0.2;
      ctx.globalAlpha = arrowProgress;
      drawArrowhead(ctx, end.x, end.y, start.x, start.y, 8 * start.scale);
    }
    ctx.restore();
  } else {
    applyReveal(ctx, element.reveal_type, progress, () => {
      ctx.save();
      ctx.strokeStyle = color;
      ctx.fillStyle = color;
      ctx.lineWidth = strokeWidth;
      ctx.beginPath();
      ctx.moveTo(start.x, start.y);
      ctx.lineTo(end.x, end.y);
      ctx.stroke();
      drawArrowhead(ctx, end.x, end.y, start.x, start.y, 8 * start.scale);
      ctx.restore();
    });
  }
}
