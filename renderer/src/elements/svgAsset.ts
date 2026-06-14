import type { SKRSContext2D, Image } from '@napi-rs/canvas';
import { Element, CameraState } from '../schema';
import { getRevealProgress, applyReveal, ANIM_DURATION } from '../reveal';
import { toScreen } from '../camera';
import { multiFrameState } from '../motion';
import { DEBUG } from '../debug';

const loggedDraw = new Set<string>();

export function drawSvgAsset(
  ctx: SKRSContext2D,
  element: Element,
  camera: CameraState,
  outputWidth: number,
  currentTime: number,
  svgAssets: Map<string, Image[]>
): void {
  const progress = getRevealProgress(element.reveal_at_seconds, currentTime);
  if (progress === 0) return;

  // Spec generators have historically put the library name in either asset_name or content.
  const assetName = element.asset_name ?? element.content ?? '';
  const frames = svgAssets.get(assetName);
  if (!frames || frames.length === 0) {
    if (DEBUG && !loggedDraw.has(element.id)) {
      loggedDraw.add(element.id);
      console.log(`  [SVG DRAW] ${element.id}: svgAssets.get("${assetName}") → MISS. NOT DRAWN.`);
    }
    return;
  }

  const { x, y, scale } = toScreen(element.x, element.y, camera, outputWidth);
  const w = (element.asset_width ?? element.width ?? frames[0].width) * scale;
  const h = (element.asset_height ?? element.height ?? frames[0].height) * scale;

  // Frame 1 sketches in during the reveal window (draw-on clip-reveal, or the element's reveal).
  if (progress < 1) {
    if (element.reveal_type === 'draw_on') {
      ctx.save();
      ctx.beginPath();
      ctx.rect(x, y, w * progress, h);
      ctx.clip();
      ctx.drawImage(frames[0], x, y, w, h);
      ctx.restore();
    } else {
      applyReveal(ctx, element.reveal_type, progress, () => ctx.drawImage(frames[0], x, y, w, h));
    }
    return;
  }

  // Reveal complete. Static asset → just draw it; animated asset → flipbook the frames.
  if (frames.length === 1) {
    ctx.drawImage(frames[0], x, y, w, h);
    return;
  }

  const elapsed = currentTime - element.reveal_at_seconds - ANIM_DURATION;
  const { a, b, blend } = multiFrameState(elapsed, frames.length);
  if (blend <= 0 || a === b) {
    ctx.drawImage(frames[a], x, y, w, h);
  } else {
    // Cross-dissolve a→b. Frames share the same static outline, so only the changing parts
    // (doors, a figure, an arm) visibly animate.
    ctx.save();
    ctx.globalAlpha = 1 - blend;
    ctx.drawImage(frames[a], x, y, w, h);
    ctx.globalAlpha = blend;
    ctx.drawImage(frames[b], x, y, w, h);
    ctx.restore();
  }
}
