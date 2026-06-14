import type { SKRSContext2D, Image } from '@napi-rs/canvas';
import { Element, CameraState } from '../schema';
import { getRevealProgress, applyReveal } from '../reveal';
import { toScreen } from '../camera';

export function drawPngAsset(
  ctx: SKRSContext2D,
  element: Element,
  camera: CameraState,
  outputWidth: number,
  currentTime: number,
  pngAssets: Map<string, Image>
): void {
  const progress = getRevealProgress(element.reveal_at_seconds, currentTime);
  if (progress === 0) return;

  const assetName = element.asset_name ?? '';
  const img = pngAssets.get(assetName);
  if (!img) return;

  const { x, y, scale } = toScreen(element.x, element.y, camera, outputWidth);
  const w = (element.asset_width ?? img.width) * scale;
  const h = (element.asset_height ?? img.height) * scale;

  applyReveal(ctx, element.reveal_type, progress, () => {
    // Subtle glow: draw blurred copy beneath at low opacity
    ctx.save();
    ctx.globalAlpha = 0.25;
    (ctx as unknown as { filter: string }).filter = 'blur(6px)';
    ctx.drawImage(img, x - 4, y - 4, w + 8, h + 8);
    (ctx as unknown as { filter: string }).filter = 'none';
    ctx.restore();

    ctx.drawImage(img, x, y, w, h);
  });
}
