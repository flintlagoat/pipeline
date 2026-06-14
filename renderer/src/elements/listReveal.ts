import type { SKRSContext2D } from '@napi-rs/canvas';
import { Element, CameraState } from '../schema';
import { getRevealProgress } from '../reveal';
import { toScreen } from '../camera';
import { fontSpec } from '../utils';

export function drawListReveal(
  ctx: SKRSContext2D,
  element: Element,
  camera: CameraState,
  outputWidth: number,
  currentTime: number
): void {
  const lines = element.lines ?? [];
  if (lines.length === 0) return;

  const { x, y, scale } = toScreen(element.x, element.y, camera, outputWidth);
  const fontSize = (element.font_size ?? 20) * scale;
  const lineHeight = fontSize * 1.5;
  const delay = element.item_delay_seconds ?? 0.35;

  ctx.font = fontSpec(element.font_family, fontSize);
  ctx.fillStyle = element.color ?? 'rgba(255,255,255,0.85)';
  ctx.textBaseline = 'top';

  lines.forEach((line, i) => {
    const revealAt = element.reveal_at_seconds + i * delay;
    const progress = getRevealProgress(revealAt, currentTime);
    if (progress === 0) return;

    const lineY = y + i * lineHeight + (1 - progress) * 10;
    ctx.save();
    ctx.globalAlpha = progress;
    ctx.fillText(line, x, lineY);
    ctx.restore();
  });
}
