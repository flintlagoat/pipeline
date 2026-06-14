import { createCanvas, loadImage, Image, SKRSContext2D } from '@napi-rs/canvas';
import { Resvg } from '@resvg/resvg-js';
import { readFileSync, writeFileSync, existsSync } from 'fs';

// Thumbnail renderer (session 6). Renders a 1280×720 thumbnail in the channel's visual
// language: huge display-font text (≤4 words) with one emphasized accent word, an optional
// hero SVG asset from the channel library with a glow, and a focus vignette — all driven by
// the channel palette so every channel's thumbnails are recognizably its own. The composition
// is deterministic; the CREATIVE choices (bigText, emphasisWord, asset) come from the
// packaging engine upstream.

export type ThumbnailLayout = 'hero_right' | 'hero_left' | 'text_only';

export interface ThumbnailSpec {
  out: string;            // absolute output .png path
  background: string;     // channel palette background (#hex)
  textPrimary: string;    // channel text color (#hex)
  accent: string;         // channel accent for the emphasis word + underline (#hex)
  fontDisplay: string;    // registered display family
  fontBody?: string;      // (loaded for fallback; not drawn)
  textCase?: 'upper' | 'title' | 'none';
  bigText: string;        // ≤4 words of thumbnail text (NOT the title)
  emphasisWord?: string;  // word within bigText to render in the accent color
  assetSvgPath?: string;  // optional absolute path to the hero SVG
  layout?: ThumbnailLayout; // composition variant (default hero_right; text_only ignores the asset)
}

interface TextRegion { x: number; maxWidth: number; align: 'left' | 'center'; }

const W = 1280;
const H = 720;

function hexLuminance(hex: string): number {
  const m = hex.trim().match(/^#?([0-9a-f]{6})$/i);
  if (!m) return 0; // unknown formats treated as dark
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

function applyCase(text: string, mode: ThumbnailSpec['textCase']): string {
  if (mode === 'upper') return text.toUpperCase();
  return text;
}

/** Group ≤5 words into stacked lines: pair short words, give long words their own line. */
function buildLines(words: string[]): string[] {
  const lines: string[][] = [];
  for (const w of words) {
    const last = lines[lines.length - 1];
    if (last && last.length < 2 && last.join(' ').length + 1 + w.length <= 12) last.push(w);
    else lines.push([w]);
  }
  return lines.map((l) => l.join(' '));
}

function drawTextBlock(ctx: SKRSContext2D, spec: ThumbnailSpec, region: TextRegion, light: boolean): void {
  const text = applyCase(spec.bigText.trim(), spec.textCase).replace(/\s+/g, ' ');
  const words = text.split(' ').filter(Boolean).slice(0, 5);
  if (words.length === 0) return;
  const lines = buildLines(words);
  const { maxWidth, align } = region;

  // Auto-size: largest font where every line fits the column and the block fits the height.
  let fontSize = 250;
  const fits = (fs: number): boolean => {
    ctx.font = `${fs}px "${spec.fontDisplay}"`;
    if (fs * 1.06 * lines.length > H * 0.84) return false;
    return lines.every((t) => ctx.measureText(t).width <= maxWidth);
  };
  while (fontSize > 50 && !fits(fontSize)) fontSize -= 6;
  ctx.font = `${fontSize}px "${spec.fontDisplay}"`;
  const lineHeight = fontSize * 1.06;
  const blockH = lineHeight * lines.length;
  const top = (H - blockH) / 2;

  // Separation from the background: a soft dark drop shadow (strong on dark/busy, subtle on paper).
  ctx.save();
  ctx.textBaseline = 'top';
  ctx.shadowColor = light ? 'rgba(0,0,0,0.28)' : 'rgba(0,0,0,0.85)';
  ctx.shadowBlur = light ? 10 : 26;
  ctx.shadowOffsetY = light ? 3 : 6;

  const emphasis = spec.emphasisWord ? applyCase(spec.emphasisWord.trim(), spec.textCase) : '';
  const spaceW = ctx.measureText(' ').width;
  let widestLine = 0;
  let underlineX = region.x;

  lines.forEach((line, i) => {
    const y = top + i * lineHeight;
    const lineW = ctx.measureText(line).width;
    let x = align === 'center' ? region.x + (maxWidth - lineW) / 2 : region.x;
    if (i === 0) underlineX = x;
    for (const word of line.split(' ')) {
      ctx.fillStyle = emphasis && word.replace(/[^\w$%]/g, '') === emphasis.replace(/[^\w$%]/g, '')
        ? spec.accent
        : spec.textPrimary;
      ctx.fillText(word, x, y);
      x += ctx.measureText(word).width + spaceW;
    }
    widestLine = Math.max(widestLine, lineW);
  });

  // Accent underline bar grounds the block and adds a brand-colored anchor.
  ctx.shadowColor = 'transparent';
  ctx.fillStyle = spec.accent;
  const underlineW = Math.min(widestLine, maxWidth) * 0.55;
  const ux = align === 'center' ? region.x + (maxWidth - underlineW) / 2 : underlineX;
  ctx.fillRect(ux, top + blockH + 18, underlineW, Math.max(10, fontSize * 0.07));
  ctx.restore();
}

export async function renderThumbnail(spec: ThumbnailSpec): Promise<void> {
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');
  const light = hexLuminance(spec.background) > 0.5;

  // Background + focus vignette (darker edges pull the eye to the subject).
  ctx.fillStyle = spec.background;
  ctx.fillRect(0, 0, W, H);
  const vg = ctx.createRadialGradient(W * 0.42, H * 0.5, H * 0.25, W * 0.5, H * 0.5, W * 0.72);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, light ? 'rgba(60,40,20,0.14)' : 'rgba(0,0,0,0.55)');
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, W, H);

  const layout: ThumbnailLayout = spec.layout ?? 'hero_right';

  // Hero asset (contain-fit, glow). text_only ignores it. Failure to rasterize ⇒ text-only.
  let asset: Image | null = null;
  if (layout !== 'text_only' && spec.assetSvgPath && existsSync(spec.assetSvgPath)) {
    try {
      const resvg = new Resvg(readFileSync(spec.assetSvgPath, 'utf8'), {
        fitTo: { mode: 'width', value: 900 },
      });
      asset = await loadImage(resvg.render().asPng());
    } catch (e) {
      console.warn(`  [thumbnail] could not rasterize asset (${(e as Error).message}) — text-only thumbnail.`);
    }
  }
  if (asset) {
    // hero_left → asset on the left half; hero_right → right half.
    const bx = layout === 'hero_left' ? W * 0.04 : W * 0.56;
    const by = H * 0.10, bw = W * 0.40, bh = H * 0.80;
    const s = Math.min(bw / asset.width, bh / asset.height);
    const dw = asset.width * s, dh = asset.height * s;
    const dx = bx + (bw - dw) / 2, dy = by + (bh - dh) / 2;
    ctx.save();
    ctx.shadowColor = light ? 'rgba(0,0,0,0.30)' : 'rgba(255,255,255,0.55)';
    ctx.shadowBlur = 46;
    ctx.drawImage(asset, dx, dy, dw, dh);
    ctx.drawImage(asset, dx, dy, dw, dh); // second pass strengthens the glow
    ctx.restore();
  }

  // Text region depends on layout (and whether the asset actually rendered).
  const marginX = 72;
  let region: TextRegion;
  if (!asset) {
    region = { x: marginX, maxWidth: W - marginX * 2, align: 'center' };
  } else if (layout === 'hero_left') {
    region = { x: W * 0.46, maxWidth: W * 0.54 - marginX, align: 'left' };
  } else {
    region = { x: marginX, maxWidth: W * 0.55 - marginX - 24, align: 'left' };
  }
  drawTextBlock(ctx, spec, region, light);

  writeFileSync(spec.out, canvas.toBuffer('image/png'));
}
