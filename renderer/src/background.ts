import type { SKRSContext2D } from '@napi-rs/canvas';
import { CameraState, RenderProfile } from './schema';

// Per-archetype background. The base fill always paints first; some modes add a texture on top.
// `board_grid` paints only the base here — its grid lines come from the blueprint filler layer
// (so the grid pans with the board). `gradient` is a screen-space vignette; `dotted` is a
// board-space dot grid (moves with the camera) for the notebook look; `paper` is a flat warm
// fill (its tooth comes from the grain layer).
export function drawBackground(
  ctx: SKRSContext2D,
  profile: RenderProfile,
  camera: CameraState,
  outputWidth: number,
  outputHeight: number
): void {
  const bg = profile.background;

  // Base fill.
  ctx.fillStyle = bg.color;
  ctx.fillRect(0, 0, outputWidth, outputHeight);

  if (bg.mode === 'gradient') {
    // Radial vignette from center (color) to edges (color2) — cinematic depth.
    const g = ctx.createRadialGradient(
      outputWidth / 2, outputHeight / 2, outputWidth * 0.1,
      outputWidth / 2, outputHeight / 2, outputWidth * 0.62
    );
    g.addColorStop(0, bg.color);
    g.addColorStop(1, bg.color2 ?? bg.color);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, outputWidth, outputHeight);
  } else if (bg.mode === 'dotted') {
    // Board-space dot grid so it drifts with the camera like ink on paper.
    const scale = outputWidth / camera.viewport_width;
    const STEP = 46; // board px between dots
    const r = Math.max(1, 1.6 * scale);
    ctx.save();
    ctx.fillStyle = rgba(bg.color2 ?? '120,100,70', 0.5);
    const left = camera.viewport_x;
    const top = camera.viewport_y;
    const right = left + camera.viewport_width;
    const bottom = top + camera.viewport_height;
    for (let bx = Math.ceil(left / STEP) * STEP; bx <= right; bx += STEP) {
      for (let by = Math.ceil(top / STEP) * STEP; by <= bottom; by += STEP) {
        ctx.beginPath();
        ctx.arc((bx - left) * scale, (by - top) * scale, r, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  }
  // 'flat', 'board_grid', 'paper' → base fill only here.
}

// Accepts a hex (#rrggbb) or an "r,g,b" triple, returns an rgba() string.
function rgba(color: string, alpha: number): string {
  if (color.startsWith('#')) {
    const r = parseInt(color.slice(1, 3), 16);
    const g = parseInt(color.slice(3, 5), 16);
    const b = parseInt(color.slice(5, 7), 16);
    return `rgba(${r},${g},${b},${alpha})`;
  }
  return `rgba(${color},${alpha})`;
}
