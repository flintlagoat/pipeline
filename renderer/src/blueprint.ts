import type { SKRSContext2D } from '@napi-rs/canvas';
import { CameraState, Section, RenderProfile } from './schema';
import { breathe } from './motion';

// Quiet "blueprint" filler layer (Issue 6). Fills negative space and guides the eye in
// the wireframe/schematic aesthetic WITHOUT competing with the big text: a faint board
// grid, per-section corner registration brackets, and a baseline of measurement ticks —
// all at very low alpha, a couple of them slowly breathing. Drawn UNDER the content and
// UNDER the film grain. Everything is in board coordinates mapped through the camera, so
// it pans/pushes with the board like ink on the whiteboard.

const GRID = 120;              // board px between grid lines
const GRID_ALPHA = 0.07;       // faint, but present enough to read as a "board" during pans
const CONTENT_INSET = 60;      // section content band starts ~here

function line(ctx: SKRSContext2D, x1: number, y1: number, x2: number, y2: number): void {
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
}

export function drawBlueprint(
  ctx: SKRSContext2D,
  camera: CameraState,
  outputWidth: number,
  outputHeight: number,
  sections: Section[],
  currentTime: number,
  filler: RenderProfile['filler']
): void {
  const scale = outputWidth / camera.viewport_width;
  const sx = (bx: number): number => (bx - camera.viewport_x) * scale;
  const sy = (by: number): number => (by - camera.viewport_y) * scale;

  const left = camera.viewport_x;
  const right = camera.viewport_x + camera.viewport_width;
  const top = camera.viewport_y;
  const bottom = camera.viewport_y + camera.viewport_height;
  const accent = filler.accentColor;

  // ── Faint board grid ──
  if (filler.grid) {
    ctx.save();
    ctx.strokeStyle = `rgba(${filler.gridColor},${filler.gridAlpha})`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let gx = Math.ceil(left / GRID) * GRID; gx <= right; gx += GRID) {
      line(ctx, sx(gx), 0, sx(gx), outputHeight);
    }
    for (let gy = Math.ceil(top / GRID) * GRID; gy <= bottom; gy += GRID) {
      line(ctx, 0, sy(gy), outputWidth, sy(gy));
    }
    ctx.stroke();
    ctx.restore();
  }

  // ── Per-section registration brackets + measurement ticks ──
  if (!filler.enabled) return;
  for (const s of sections) {
    // Only decorate sections that intersect the viewport.
    if (s.x_offset + s.width < left || s.x_offset > right) continue;

    const bx0 = s.x_offset + CONTENT_INSET;
    const bx1 = s.x_offset + s.width - CONTENT_INSET;
    const by0 = s.y_offset + 40;
    const by1 = s.y_offset + s.height - 40;
    const arm = 26 * scale; // bracket arm length on screen

    const cornerAlpha = breathe(currentTime, 0.07, 0.14, 6);
    ctx.save();
    ctx.strokeStyle = `rgba(${accent},${cornerAlpha})`;
    ctx.lineWidth = 1.4 * scale;
    ctx.beginPath();
    // top-left
    line(ctx, sx(bx0), sy(by0), sx(bx0) + arm, sy(by0));
    line(ctx, sx(bx0), sy(by0), sx(bx0), sy(by0) + arm);
    // top-right
    line(ctx, sx(bx1), sy(by0), sx(bx1) - arm, sy(by0));
    line(ctx, sx(bx1), sy(by0), sx(bx1), sy(by0) + arm);
    // bottom-left
    line(ctx, sx(bx0), sy(by1), sx(bx0) + arm, sy(by1));
    line(ctx, sx(bx0), sy(by1), sx(bx0), sy(by1) - arm);
    // bottom-right
    line(ctx, sx(bx1), sy(by1), sx(bx1) - arm, sy(by1));
    line(ctx, sx(bx1), sy(by1), sx(bx1), sy(by1) - arm);
    ctx.stroke();
    ctx.restore();

    // Dimension/measurement ticks along a faint baseline near the section bottom.
    const baseY = s.y_offset + s.height - 70;
    const tickAlpha = breathe(currentTime, 0.04, 0.08, 7, s.x_offset);
    ctx.save();
    ctx.strokeStyle = `rgba(${accent},${tickAlpha})`;
    ctx.lineWidth = 1 * scale;
    ctx.beginPath();
    line(ctx, sx(bx0), sy(baseY), sx(bx1), sy(baseY));
    let n = 0;
    for (let tx = bx0; tx <= bx1 + 1; tx += GRID, n++) {
      const len = (n % 5 === 0 ? 12 : 6) * scale; // longer tick every 5
      line(ctx, sx(tx), sy(baseY), sx(tx), sy(baseY) - len);
    }
    ctx.stroke();
    ctx.restore();
  }
}
