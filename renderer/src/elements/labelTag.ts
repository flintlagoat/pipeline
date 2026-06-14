import type { SKRSContext2D } from '@napi-rs/canvas';
import { Element, CameraState } from '../schema';
import { getRevealProgress, applyReveal } from '../reveal';
import { toScreen } from '../camera';
import { fontSpec } from '../utils';

export function drawLabelTag(
  ctx: SKRSContext2D,
  element: Element,
  camera: CameraState,
  outputWidth: number,
  currentTime: number
): void {
  const progress = getRevealProgress(element.reveal_at_seconds, currentTime);
  if (progress === 0) return;

  const { x, y, scale } = toScreen(element.x, element.y, camera, outputWidth);
  const fontSize = (element.font_size ?? 12) * scale;
  const paddingX = 10 * scale;
  const paddingY = 5 * scale;
  const r = 12 * scale;
  const color = element.color ?? '#FFE500';

  ctx.save();
  ctx.font = fontSpec('mono', fontSize);
  const textWidth = ctx.measureText(element.content ?? '').width;
  ctx.restore();

  const tagW = textWidth + paddingX * 2;
  const tagH = fontSize + paddingY * 2;
  const cx = x + tagW / 2;
  const cy = y + tagH / 2;

  const draw = () => {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5 * scale;

    // Pill-shaped outline
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + tagW - r, y);
    ctx.arcTo(x + tagW, y, x + tagW, y + r, r);
    ctx.lineTo(x + tagW, y + tagH - r);
    ctx.arcTo(x + tagW, y + tagH, x + tagW - r, y + tagH, r);
    ctx.lineTo(x + r, y + tagH);
    ctx.arcTo(x, y + tagH, x, y + tagH - r, r);
    ctx.lineTo(x, y + r);
    ctx.arcTo(x, y, x + r, y, r);
    ctx.closePath();
    ctx.stroke();

    ctx.font = fontSpec('mono', fontSize);
    ctx.fillStyle = color;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';
    ctx.fillText(element.content ?? '', cx, cy);
    ctx.textAlign = 'left';
    ctx.restore();
  };

  applyReveal(ctx, element.reveal_type === 'scale_in' ? 'scale_in' : element.reveal_type, progress, draw, cx, cy);
}
