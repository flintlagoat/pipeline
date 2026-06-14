import type { SKRSContext2D } from '@napi-rs/canvas';
import { Element, CameraState } from '../schema';
import { getRevealProgress, applyReveal, typeOnState } from '../reveal';
import { toScreen } from '../camera';
import { fontSpec, wrapText, drawRichLine } from '../utils';

export function drawBodyText(
  ctx: SKRSContext2D,
  element: Element,
  camera: CameraState,
  outputWidth: number,
  currentTime: number
): void {
  const progress = getRevealProgress(element.reveal_at_seconds, currentTime, element.reveal_duration_seconds);
  if (progress === 0) return;

  const { x, y, scale } = toScreen(element.x, element.y, camera, outputWidth);
  const emphasisSet = element.emphasis_words?.length
    ? new Set(element.emphasis_words.map((w) => w.toLowerCase()))
    : undefined;

  applyReveal(ctx, element.reveal_type, progress, () => {
    const fontSize = (element.font_size ?? 20) * scale;
    ctx.font = fontSpec('body', fontSize);
    ctx.textBaseline = 'top';

    const baseColor = element.color ?? 'rgba(255,255,255,0.85)';
    const lineHeight = fontSize * 1.45;
    const rawLines = (element.content ?? '').split('\n');
    const allLines: string[] = [];
    const wrapChars = element.wrap_chars ?? 52;
    for (const raw of rawLines) {
      const wrapped = wrapText(raw, wrapChars);
      if (wrapped.length === 0) allLines.push('');
      else allLines.push(...wrapped);
    }

    // type_on across the WHOLE block: distribute the visible-char budget across wrapped lines so
    // body copy types in line-by-line in sync with the narration, not all at once.
    const typing = element.reveal_type === 'type_on';
    const totalChars = allLines.reduce((a, l) => a + l.length, 0);
    const budget = typing ? typeOnState('x'.repeat(totalChars), progress) : null;
    let consumed = 0;

    allLines.forEach((line, i) => {
      const opts = {
        baseColor,
        emphasisColor: element.emphasis_color,
        emphasisSet,
        visibleChars: undefined as number | undefined,
        leadAlpha: 1,
      };
      if (budget) {
        const remaining = budget.visible - consumed;
        if (remaining <= 0) { consumed += line.length; return; } // not yet typed
        opts.visibleChars = Math.min(line.length, remaining);
        opts.leadAlpha = opts.visibleChars >= line.length ? 1 : budget.leadAlpha;
      }
      drawRichLine(ctx, line, x, y + i * lineHeight, opts);
      consumed += line.length;
    });
  });
}
