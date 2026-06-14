import type { SKRSContext2D } from '@napi-rs/canvas';
import { Element, CameraState } from '../schema';
import { getRevealProgress, applyReveal } from '../reveal';
import { toScreen } from '../camera';
import { fontSpec, wrapText } from '../utils';

export function drawBlurReveal(
  ctx: SKRSContext2D,
  element: Element,
  camera: CameraState,
  outputWidth: number,
  currentTime: number
): void {
  const progress = getRevealProgress(element.reveal_at_seconds, currentTime);
  if (progress === 0) return;

  const { x, y, scale } = toScreen(element.x, element.y, camera, outputWidth);

  // Force blur_in reveal type for this element
  applyReveal(ctx, 'blur_in', progress, () => {
    const fontSize = (element.font_size ?? 28) * scale;
    ctx.font = fontSpec(element.font_family ?? 'display', fontSize);
    ctx.fillStyle = element.color ?? '#FFE500';
    ctx.textBaseline = 'top';

    const lineHeight = fontSize * 1.3;
    const rawLines = (element.content ?? '').split('\n');
    const allLines: string[] = [];
    for (const raw of rawLines) {
      const wrapped = wrapText(raw, 48);
      if (wrapped.length === 0) allLines.push('');
      else allLines.push(...wrapped);
    }

    allLines.forEach((line, i) => {
      ctx.fillText(line, x, y + i * lineHeight);
    });
  });
}
