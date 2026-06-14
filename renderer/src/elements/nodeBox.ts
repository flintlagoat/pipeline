import type { SKRSContext2D } from '@napi-rs/canvas';
import { Element, CameraState } from '../schema';
import { getRevealProgress, applyReveal } from '../reveal';
import { toScreen } from '../camera';
import { fontSpec } from '../utils';

function roundedRect(ctx: SKRSContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}

export function drawNodeBox(
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
  const r = (element.border_radius ?? 4) * scale;
  const strokeWidth = (element.stroke_width ?? 1.5) * scale;
  const color = element.color ?? '#FFFFFF';
  const cx = x + w / 2;
  const cy = y + h / 2;

  const draw = () => {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = strokeWidth;
    roundedRect(ctx, x, y, w, h, r);
    ctx.stroke();

    if (element.content) {
      const fontSize = (element.font_size ?? 14) * scale;
      ctx.font = fontSpec('mono', fontSize);
      ctx.fillStyle = color;
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'center';
      ctx.fillText(element.content, cx, cy);
      ctx.textAlign = 'left';
    }
    ctx.restore();
  };

  if (element.reveal_type === 'scale_in') {
    applyReveal(ctx, 'scale_in', progress, draw, cx, cy);
  } else if (element.reveal_type === 'draw_on') {
    // Animate border as 4 segments
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = strokeWidth;

    const perimeter = 2 * (w + h);
    const drawn = perimeter * progress;

    ctx.beginPath();
    // top edge
    const topEnd = Math.min(drawn, w);
    ctx.moveTo(x, y);
    ctx.lineTo(x + topEnd, y);
    // right edge
    if (drawn > w) {
      const rightEnd = Math.min(drawn - w, h);
      ctx.moveTo(x + w, y);
      ctx.lineTo(x + w, y + rightEnd);
    }
    // bottom edge (right to left)
    if (drawn > w + h) {
      const botEnd = Math.min(drawn - w - h, w);
      ctx.moveTo(x + w, y + h);
      ctx.lineTo(x + w - botEnd, y + h);
    }
    // left edge (bottom to top)
    if (drawn > 2 * w + h) {
      const leftEnd = Math.min(drawn - 2 * w - h, h);
      ctx.moveTo(x, y + h);
      ctx.lineTo(x, y + h - leftEnd);
    }
    ctx.stroke();
    ctx.restore();
  } else {
    applyReveal(ctx, element.reveal_type, progress, draw);
  }
}
