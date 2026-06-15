// Deterministic post-LLM board relayout (FIX 2 + FIX 3 spec side).
//
// The board spec generator emits content section-by-section in a fixed text-left/visual-right
// strip (x_offset = 1920×index, y_offset = 0). That made every section look identical and every
// camera move a horizontal pan. This pass rewrites placement — WITHOUT touching content or
// timing — to (a) assign a varied LAYOUT TEMPLATE per section (FIX 2) and (b) lay the sections
// out on a 2-D boustrophedon (snake) grid (FIX 3) so the camera gets left/right AND up/down moves.
//
// Everything is seeded off the job's video_id, so a given job always produces identical output.
//
// Strategy for the template remap: elements are partitioned into a TEXT cluster (headlines, body,
// lists, nodes, connectors, tags) and a VISUAL cluster (svg/png assets), then each cluster is
// translated AS A RIGID GROUP into the template's region (and the visual cluster optionally scaled
// for "full"/"center" beats). Moving clusters rigidly preserves intra-cluster relationships —
// stacked text, rule lines, connector arrows between node boxes stay aligned — so no diagram breaks.

import { BoardSpec, Section, Element } from './types/specTypes';

export const SECTION_W = 1920;
export const SECTION_H = 1080;
const COLS = 3; // snake columns (tuned for 16:9; yields 2-D grids from ~4 sections up)

// ── Seeded RNG (mulberry32) ────────────────────────────────────────────────────
function hashSeed(s: string): number {
  let h = 1779033703 ^ s.length;
  for (let i = 0; i < s.length; i++) {
    h = Math.imul(h ^ s.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return h >>> 0;
}
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ── Layout template registry (regions are LOCAL to a 1920×1080 section) ─────────
interface Rect { x: number; y: number; w: number; h: number; }
export type TemplateId =
  | 'text_left_visual_right'
  | 'visual_left_text_right'
  | 'text_top_visual_bottom'
  | 'visual_top_text_bottom'
  | 'visual_center_text_caption'
  | 'text_full_emphasis'
  | 'visual_full_bleed';

interface Template {
  id: TemplateId;
  text: Rect;
  visual: Rect | null;     // null ⇒ template is text-only
  textAnchor: 'left' | 'center';
  visualScaleMax: number;  // cap on uniform upscale of the visual cluster
  isFull: boolean;         // a "full" beat (capped + never back-to-back)
  requiresVisual: boolean; // only assignable to sections that contain a visual
  maxText: number;         // max flow-text elements this template's text region can hold cleanly
}

const TEMPLATES: Record<TemplateId, Template> = {
  text_left_visual_right: {
    id: 'text_left_visual_right',
    text: { x: 80, y: 150, w: 780, h: 800 }, visual: { x: 1000, y: 180, w: 840, h: 720 },
    textAnchor: 'left', visualScaleMax: 1.15, isFull: false, requiresVisual: false, maxText: 99,
  },
  visual_left_text_right: {
    id: 'visual_left_text_right',
    text: { x: 1060, y: 150, w: 780, h: 800 }, visual: { x: 80, y: 180, w: 840, h: 720 },
    textAnchor: 'left', visualScaleMax: 1.15, isFull: false, requiresVisual: false, maxText: 99,
  },
  text_top_visual_bottom: {
    id: 'text_top_visual_bottom',
    text: { x: 160, y: 90, w: 1600, h: 320 }, visual: { x: 360, y: 450, w: 1200, h: 560 },
    textAnchor: 'center', visualScaleMax: 1.2, isFull: false, requiresVisual: true, maxText: 5,
  },
  visual_top_text_bottom: {
    id: 'visual_top_text_bottom',
    text: { x: 160, y: 720, w: 1600, h: 300 }, visual: { x: 360, y: 80, w: 1200, h: 580 },
    textAnchor: 'center', visualScaleMax: 1.2, isFull: false, requiresVisual: true, maxText: 4,
  },
  visual_center_text_caption: {
    id: 'visual_center_text_caption',
    text: { x: 360, y: 60, w: 1200, h: 150 }, visual: { x: 540, y: 230, w: 840, h: 760 },
    textAnchor: 'center', visualScaleMax: 1.45, isFull: false, requiresVisual: true, maxText: 3,
  },
  text_full_emphasis: {
    id: 'text_full_emphasis',
    text: { x: 180, y: 260, w: 1560, h: 560 }, visual: null,
    textAnchor: 'center', visualScaleMax: 1, isFull: true, requiresVisual: false, maxText: 99,
  },
  visual_full_bleed: {
    id: 'visual_full_bleed',
    text: { x: 100, y: 880, w: 1100, h: 150 }, visual: { x: 120, y: 70, w: 1680, h: 940 },
    textAnchor: 'left', visualScaleMax: 1.8, isFull: true, requiresVisual: true, maxText: 3,
  },
};

const SPLIT_TEMPLATES: TemplateId[] = [
  'text_left_visual_right', 'visual_left_text_right',
  'text_top_visual_bottom', 'visual_top_text_bottom', 'visual_center_text_caption',
];

// section_type → bias toward a template family (intro→full text, reveal→full visual, else split).
function biasFor(sectionType: string): { prefer: TemplateId[]; weight: number } {
  switch (sectionType) {
    case 'hook': return { prefer: ['text_full_emphasis', 'text_top_visual_bottom'], weight: 3 };
    case 'revelation': return { prefer: ['visual_full_bleed', 'visual_center_text_caption'], weight: 3 };
    case 'conclusion': return { prefer: ['visual_full_bleed', 'text_full_emphasis'], weight: 2.5 };
    case 'comparison': return { prefer: ['text_left_visual_right', 'visual_left_text_right'], weight: 2 };
    case 'list_reveal': return { prefer: ['text_left_visual_right', 'text_top_visual_bottom'], weight: 2 };
    case 'flow_chart':
    case 'diagram': return { prefer: ['visual_center_text_caption', 'text_top_visual_bottom'], weight: 2 };
    default: return { prefer: SPLIT_TEMPLATES, weight: 1 };
  }
}

interface Cluster { els: Element[]; box: Rect | null; }

// VISUAL group = the "hero" block (assets + diagram primitives) placed rigidly into the visual
// region. TEXT-FLOW group = prose that is re-flowed as a vertical stack into the text region.
// A "caption" (a body_text spatially tied to the hero in the source layout) is pulled out of the
// flow and placed directly UNDER the visual's rendered bottom (fixes the caption-on-asset bug).
const VISUAL_TYPES = new Set(['svg_asset', 'png_asset', 'node_box', 'node_circle', 'connector_arrow', 'highlight_box', 'thought_bubble']);
const CAPTION_MIN_LOCAL_X = 900; // source captions sit under the right-hand hero (x ≥ ~960)

// Default body_text wrap width (chars) when relayout hasn't set a region-aware one. Mirrors the
// renderer's historical fixed wrap so estimates and the actual render agree.
const DEFAULT_WRAP_CHARS = 52;

// Count wrapped lines EXACTLY the way the renderer's wrapText does (greedy by char budget on word
// boundaries) so reflowText reserves the right vertical space for multi-line body copy. Without
// this, body_text was measured as 1 line and the element stacked below it collided with the
// wrapped overflow (the "$8 minibar" tag-on-text overlap).
function countWrappedLines(text: string, maxChars: number): number {
  if (!text) return 1;
  let lines = 0;
  for (const raw of text.split('\n')) {
    let current = '';
    for (const word of raw.split(' ')) {
      if (current.length + word.length + 1 <= maxChars) {
        current += (current ? ' ' : '') + word;
      } else {
        if (current) lines++;
        current = word;
      }
    }
    if (current) lines++;
  }
  return Math.max(1, lines);
}

// Estimate a board-local bounding box for an element (matches the prompt's heuristic for text).
function elBox(el: Element): Rect {
  if (el.type === 'rule_line' || el.type === 'connector_arrow') {
    const x1 = el.x, y1 = el.y, x2 = el.x2 ?? el.x, y2 = el.y2 ?? el.y;
    return { x: Math.min(x1, x2), y: Math.min(y1, y2), w: Math.abs(x2 - x1) || 4, h: Math.abs(y2 - y1) || 4 };
  }
  if (VISUAL_TYPES.has(el.type) || el.type === 'node_box' || el.type === 'highlight_box') {
    const w = el.asset_width ?? el.width ?? 320;
    const h = el.asset_height ?? el.height ?? 320;
    return { x: el.x, y: el.y, w, h };
  }
  if (el.type === 'node_circle') {
    const r = el.radius ?? 40;
    return { x: el.x - r, y: el.y - r, w: r * 2, h: r * 2 };
  }
  // Text-ish: estimate from content length × font size. Line-height factors MIRROR each renderer
  // element so the reserved vertical space matches what actually draws (otherwise the element below
  // creeps up into it): bodyText.ts 1.45, listReveal.ts 1.5, others single-line ~1.35.
  const fs = el.font_size ?? 32;
  let lineCount = el.lines?.length ?? 1;
  let lineHeightFactor = 1.35;
  if (el.type === 'body_text') lineHeightFactor = 1.45;
  if (el.type === 'list_reveal') lineHeightFactor = 1.5;
  if (el.type === 'body_text' && el.content) {
    lineCount = countWrappedLines(el.content, el.wrap_chars ?? DEFAULT_WRAP_CHARS);
  }
  let h = lineCount * fs * lineHeightFactor;
  // label_tag renders inside a pill box (paddingY*2 = 10px + a stroke); reserve for the box, not
  // just the glyph, so a tag stacked under a list/body never clips the row above it.
  if (el.type === 'label_tag') h = fs + 10 + fs * 0.45;
  // list_reveal: add the last row's descender slack so the element below clears the final item.
  if (el.type === 'list_reveal') h += fs * 0.4;
  // Width: a wrapped line is at most wrap_chars wide, not the whole content length. Tags are mono
  // (wider glyphs) and boxed, so estimate a touch wider.
  const wrapW = el.type === 'body_text' && el.content
    ? Math.min(el.content.length, el.wrap_chars ?? DEFAULT_WRAP_CHARS)
    : (el.content ? el.content.length : (el.lines ? Math.max(...el.lines.map((l) => l.length)) : 10));
  const charW = el.type === 'label_tag' ? 0.62 : 0.55;
  return { x: el.x, y: el.y, w: Math.max(40, wrapW * fs * charW), h };
}

function unionBox(els: Element[]): Rect | null {
  if (els.length === 0) return null;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const el of els) {
    const b = elBox(el);
    minX = Math.min(minX, b.x); minY = Math.min(minY, b.y);
    maxX = Math.max(maxX, b.x + b.w); maxY = Math.max(maxY, b.y + b.h);
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

// Translate (and optionally scale) every element in a cluster about the cluster's box center so the
// box lands centered in `region`. Scale is uniform, clamped to [scaleMin, scaleMax] and to what
// fits the region. Text clusters pass scaleMin = scaleMax = 1 (PURE TRANSLATION) so font sizes —
// and the legibility floor — are never shrunk; only visuals scale.
function placeCluster(cluster: Cluster, region: Rect, scaleMin: number, scaleMax: number): void {
  if (!cluster.box || cluster.els.length === 0) return;
  const box = cluster.box;
  const fit = Math.min(region.w / Math.max(box.w, 1), region.h / Math.max(box.h, 1));
  const scale = Math.max(scaleMin, Math.min(scaleMax, fit));
  const cx = box.x + box.w / 2;
  const cy = box.y + box.h / 2;
  const tx = region.x + region.w / 2;
  const ty = region.y + region.h / 2;

  const remapX = (x: number) => tx + (x - cx) * scale;
  const remapY = (y: number) => ty + (y - cy) * scale;

  for (const el of cluster.els) {
    el.x = remapX(el.x);
    el.y = remapY(el.y);
    if (typeof el.x2 === 'number') el.x2 = remapX(el.x2);
    if (typeof el.y2 === 'number') el.y2 = remapY(el.y2);
    if (scale !== 1) {
      if (typeof el.width === 'number') el.width *= scale;
      if (typeof el.height === 'number') el.height *= scale;
      if (typeof el.asset_width === 'number') el.asset_width *= scale;
      if (typeof el.asset_height === 'number') el.asset_height *= scale;
      if (typeof el.radius === 'number') el.radius *= scale;
    }
  }
}

// Re-flow text elements as a clean vertical STACK inside `region` (local coords), preserving the
// source reading order (sorted by original y). This actually COMPACTS the prose into the region —
// unlike a rigid translate, which kept the LLM's sprawl and could fling a caption across the frame
// or pile everything onto one line. x is set per the anchor (left edge of region, or centred);
// font sizes are never changed (legibility floor preserved). If the natural stack is taller than
// the region, only the GAPS are compressed (down to a minimum), never the text itself.
function reflowText(els: Element[], region: Rect, anchor: 'left' | 'center'): void {
  if (els.length === 0) return;

  // Assign each body_text a region-aware wrap width FIRST, so (a) elBox below reserves the correct
  // multi-line height and (b) the renderer wraps the copy to fit this column instead of a fixed 52
  // chars (which overflowed narrow/right-shifted regions off the frame edge). Avg body glyph ≈
  // 0.55em; clamp to a sane legible range.
  for (const el of els) {
    if (el.type === 'body_text' && el.content) {
      const fs = el.font_size ?? 32;
      el.wrap_chars = Math.max(18, Math.min(DEFAULT_WRAP_CHARS, Math.floor(region.w / (fs * 0.55))));
    }
  }

  const ordered = [...els].sort((a, b) => a.y - b.y);

  const PAD = 24;            // natural gap between stacked elements
  const MIN_PAD = 10;        // floor when we must compress to fit
  const heights = ordered.map((el) => elBox(el).h);
  const natural = heights.reduce((a, b) => a + b, 0) + PAD * (ordered.length - 1);
  // Compress only the gaps if the stack overflows the region height.
  let pad = PAD;
  if (natural > region.h && ordered.length > 1) {
    pad = Math.max(MIN_PAD, (region.h - heights.reduce((a, b) => a + b, 0)) / (ordered.length - 1));
  }

  let y = region.y;
  for (let k = 0; k < ordered.length; k++) {
    const el = ordered[k];
    const b = elBox(el);
    // Horizontal anchor: left edge at region.x, or centre the element's width in the region.
    const anchorX = anchor === 'center' ? region.x + (region.w - b.w) / 2 : region.x;
    const dx = anchorX - el.x;
    el.x = anchorX;
    if (el.type === 'rule_line') {
      // A divider: redraw it horizontally at this row, width capped to the region.
      el.y = y; el.y2 = y;
      el.x2 = anchorX + Math.min(region.w, 480);
    } else {
      el.y = y;
      if (typeof el.x2 === 'number') el.x2 += dx; // keep any second point's x relative
    }
    y += b.h + pad;
  }
}

// Place a caption directly BELOW the visual's rendered bounding box (asset_bottom + padding),
// horizontally centred on the visual — never on top of it (fixes the caption-overlap bug).
function placeCaption(caption: Element, visualBox: Rect, padding = 20): void {
  // Wrap the caption to a tidy width tied to the visual (not the fixed 52 chars), so a long caption
  // becomes a centred 2-3 line block under the asset rather than a single line that runs off-frame.
  if (caption.type === 'body_text' && caption.content) {
    const fs = caption.font_size ?? 32;
    const capW = Math.max(360, Math.min(760, visualBox.w * 1.25));
    caption.wrap_chars = Math.max(18, Math.min(DEFAULT_WRAP_CHARS, Math.floor(capW / (fs * 0.55))));
  }
  const b = elBox(caption);
  const cx = visualBox.x + visualBox.w / 2;
  caption.x = cx - b.w / 2;
  caption.y = visualBox.y + visualBox.h + padding;
}

// Camera-safe content area inside the 1920×1080 section. Content is kept within this band on BOTH
// axes so (a) nothing is cut at the frame edge — the off-screen-text bug — and (b) the camera has
// real room to push in / pan without clipping content or revealing the neighbouring section (the
// "static slideshow" fix: a centred zoom can only move if content doesn't already fill the frame).
const SAFE_TOP = 120;
const SAFE_BOTTOM = 945;   // 825px tall content band (≈76% of height)
const SAFE_LEFT = 170;
const SAFE_RIGHT = 1750;   // 1580px wide content band (≈82% of width) ⇒ camera gets ~12%+ push room

// Uniformly scale a visual cluster about a pivot (used to shrink an oversized hero so a caption
// below it still fits the safe band). Text is never scaled (legibility floor).
function scaleVisualCluster(els: Element[], factor: number, pivotX: number, pivotY: number): void {
  for (const el of els) {
    el.x = pivotX + (el.x - pivotX) * factor;
    el.y = pivotY + (el.y - pivotY) * factor;
    if (typeof el.x2 === 'number') el.x2 = pivotX + (el.x2 - pivotX) * factor;
    if (typeof el.y2 === 'number') el.y2 = pivotY + (el.y2 - pivotY) * factor;
    if (typeof el.width === 'number') el.width *= factor;
    if (typeof el.height === 'number') el.height *= factor;
    if (typeof el.asset_width === 'number') el.asset_width *= factor;
    if (typeof el.asset_height === 'number') el.asset_height *= factor;
    if (typeof el.radius === 'number') el.radius *= factor;
  }
}

// Keep a section's whole content within the camera-safe band on BOTH axes. If it's too big in
// either axis (a big hero + caption stack that cut "If it loses money…" off the bottom, or a wide
// tag/visual spilling past the right edge), shrink the hero (and re-seat its caption) until it
// fits, then shift the content to sit inside the band (centred horizontally; bottom-priority
// vertically). Text is never scaled — only translated — so the legibility floor is preserved.
function fitSectionToSafeArea(allEls: Element[], visualEls: Element[], caption: Element | null): void {
  const safeW = SAFE_RIGHT - SAFE_LEFT;
  const safeH = SAFE_BOTTOM - SAFE_TOP;
  let bbox = unionBox(allEls);
  if (!bbox) return;

  // Too big in either axis ⇒ shrink the hero by the binding factor (pivot at hero top so it shrinks
  // upward/inward, freeing edge space). Re-seat the caption under the shrunk hero. Skip the VERTICAL
  // shrink when the TEXT stack alone is already taller than the band: shrinking the hero can't fix a
  // text-bound overflow (it would just needlessly shrink the asset); the vertical pass below contains
  // it within the section instead.
  if ((bbox.w > safeW || bbox.h > safeH) && visualEls.length > 0) {
    const vbox = unionBox(visualEls);
    const textBox = unionBox(allEls.filter((e) => !visualEls.includes(e)));
    const textBound = !!textBox && textBox.h >= safeH;
    if (vbox && vbox.w > 0 && vbox.h > 0) {
      const fW = bbox.w > safeW ? Math.max(0.4, 1 - (bbox.w - safeW) / vbox.w) : 1;
      const fH = (bbox.h > safeH && !textBound) ? Math.max(0.4, 1 - (bbox.h - safeH) / vbox.h) : 1;
      const f = Math.min(fW, fH);
      if (f < 0.999) {
        scaleVisualCluster(visualEls, f, vbox.x + vbox.w / 2, vbox.y);
        if (caption) placeCaption(caption, unionBox(visualEls)!, 20);
        bbox = unionBox(allEls)!;
      }
    }
  }

  // Horizontal: centre the content in the band if it fits; otherwise clamp its edges inside.
  let shiftX = 0;
  if (bbox.w <= safeW) shiftX = (SAFE_LEFT + safeW / 2) - (bbox.x + bbox.w / 2);
  else if (bbox.x < SAFE_LEFT) shiftX = SAFE_LEFT - bbox.x;
  else if (bbox.x + bbox.w > SAFE_RIGHT) shiftX = SAFE_RIGHT - (bbox.x + bbox.w);

  // Vertical: prefer the safe band. If content is TALLER than the band (a big headline + multi-line
  // body + a hero that can't shrink), keep the BOTTOM off the frame edge — the bottom is what clips
  // and reads worst (the "text half off the bottom" bug) — letting the top use the upper margin.
  // NEVER pin to SAFE_TOP in a way that pushes the bottom past the section (the old bug).
  const HARD_MARGIN = 24;
  let shiftY = 0;
  const top = bbox.y, bot = bbox.y + bbox.h;
  if (bbox.h <= safeH) {
    if (top < SAFE_TOP) shiftY = SAFE_TOP - top;
    else if (bot > SAFE_BOTTOM) shiftY = SAFE_BOTTOM - bot;
  } else {
    shiftY = (SECTION_H - HARD_MARGIN) - bot;                  // bottom-align within the section
    if (top + shiftY < HARD_MARGIN) shiftY = HARD_MARGIN - top; // taller than the section ⇒ top-align
  }

  if (shiftX !== 0 || shiftY !== 0) {
    for (const el of allEls) {
      el.x += shiftX; el.y += shiftY;
      if (typeof el.x2 === 'number') el.x2 += shiftX;
      if (typeof el.y2 === 'number') el.y2 += shiftY;
    }
  }

  // Last resort: still taller than the whole section (very rare) — uniformly scale EVERYTHING about
  // the section centre so nothing clips off the frame. Text is scaled too here (the ONLY case we ever
  // shrink text) because a clipped line reads far worse than slightly smaller copy.
  const finalBox = unionBox(allEls);
  if (finalBox && finalBox.h > SECTION_H - 2 * HARD_MARGIN) {
    const f = (SECTION_H - 2 * HARD_MARGIN) / finalBox.h;
    const px = SECTION_W / 2, py = SECTION_H / 2;
    for (const el of allEls) {
      el.x = px + (el.x - px) * f; el.y = py + (el.y - py) * f;
      if (typeof el.x2 === 'number') el.x2 = px + (el.x2 - px) * f;
      if (typeof el.y2 === 'number') el.y2 = py + (el.y2 - py) * f;
      if (typeof el.font_size === 'number') el.font_size = Math.max(22, el.font_size * f);
      if (typeof el.width === 'number') el.width *= f;
      if (typeof el.height === 'number') el.height *= f;
      if (typeof el.asset_width === 'number') el.asset_width *= f;
      if (typeof el.asset_height === 'number') el.asset_height *= f;
      if (typeof el.radius === 'number') el.radius *= f;
    }
  }
}

function rectsOverlap(a: Rect, b: Rect, pad = 8): boolean {
  return !(a.x + a.w <= b.x + pad || b.x + b.w <= a.x + pad || a.y + a.h <= b.y + pad || b.y + b.h <= a.y + pad);
}

// GUARANTEE the visual hero never overlaps the text. Templates put text + visual in separate regions,
// but a tall section (a multi-line list + an extra blur_reveal headline) can overflow its text region,
// and list lines don't wrap — so the text can run across and collide with the hero (the "headline over
// the scale" bug). If they overlap, shrink the visual and reseat it into the LARGEST free band around
// the text within the safe area. Visual-only move (text is left where it reads); a caption follows the
// hero. No-op when there's no overlap, so well-laid-out sections are untouched.
function separateVisualFromText(textEls: Element[], visualEls: Element[], caption: Element | null): void {
  if (visualEls.length === 0 || textEls.length === 0) return;
  const tbox = unionBox(textEls);
  let vbox = unionBox(visualEls);
  if (!tbox || !vbox || !rectsOverlap(tbox, vbox)) return;

  // Free bands around the text, within the safe content area.
  const bands: Rect[] = [
    { x: SAFE_LEFT, y: SAFE_TOP, w: SAFE_RIGHT - SAFE_LEFT, h: tbox.y - SAFE_TOP },                       // above
    { x: SAFE_LEFT, y: tbox.y + tbox.h, w: SAFE_RIGHT - SAFE_LEFT, h: SAFE_BOTTOM - (tbox.y + tbox.h) },  // below
    { x: SAFE_LEFT, y: SAFE_TOP, w: tbox.x - SAFE_LEFT, h: SAFE_BOTTOM - SAFE_TOP },                      // left
    { x: tbox.x + tbox.w, y: SAFE_TOP, w: SAFE_RIGHT - (tbox.x + tbox.w), h: SAFE_BOTTOM - SAFE_TOP },    // right
  ].filter((b) => b.w > 90 && b.h > 90);
  // If the text fills the safe area, tuck a shrunk hero into the bottom-right corner as a last resort.
  if (bands.length === 0) bands.push({ x: SAFE_RIGHT - 340, y: SAFE_BOTTOM - 260, w: 340, h: 260 });
  bands.sort((a, b) => a.w * a.h - b.w * b.h);
  const band = bands[bands.length - 1]; // largest

  const margin = 24;
  const f = Math.min(1, (band.w - margin * 2) / vbox.w, (band.h - margin * 2) / vbox.h);
  if (f < 0.999) scaleVisualCluster(visualEls, f, vbox.x + vbox.w / 2, vbox.y + vbox.h / 2);
  vbox = unionBox(visualEls)!;
  const dx = band.x + (band.w - vbox.w) / 2 - vbox.x;
  const dy = band.y + (band.h - vbox.h) / 2 - vbox.y;
  for (const el of visualEls) {
    el.x += dx; el.y += dy;
    if (typeof el.x2 === 'number') el.x2 += dx;
    if (typeof el.y2 === 'number') el.y2 += dy;
  }
  if (caption) placeCaption(caption, unionBox(visualEls)!, 20);
}

// Clamp every element so it stays within the section's safe area [margin, SECTION-margin].
function clampToFrame(els: Element[], margin = 40): void {
  for (const el of els) {
    el.x = Math.max(margin, Math.min(SECTION_W - margin, el.x));
    el.y = Math.max(margin, Math.min(SECTION_H - margin, el.y));
    if (typeof el.x2 === 'number') el.x2 = Math.max(margin, Math.min(SECTION_W - margin, el.x2));
    if (typeof el.y2 === 'number') el.y2 = Math.max(margin, Math.min(SECTION_H - margin, el.y2));
  }
}

// Count the flow-text elements a section will stack (non-visual, excluding the hero caption).
function flowTextCount(section: Section, hasVisual: boolean): number {
  return section.elements.filter((e) =>
    !VISUAL_TYPES.has(e.type) &&
    !(hasVisual && e.type === 'body_text' && (e.x - section.x_offset) >= CAPTION_MIN_LOCAL_X)
  ).length;
}

// ── Template assignment (seeded; no repeat within 2; full beats spaced) ─────────
function assignTemplates(sections: Section[], rnd: () => number): TemplateId[] {
  const fullGap = 4 + Math.floor(rnd() * 3); // ~1 full beat per 4–6 sections
  const chosen: TemplateId[] = [];
  let lastFull = -fullGap;

  sections.forEach((s, i) => {
    const hasVisual = s.elements.some((e) => VISUAL_TYPES.has(e.type));
    const textCount = flowTextCount(s, hasVisual);
    const recent = new Set(chosen.slice(-2));
    const prevFull = i > 0 && TEMPLATES[chosen[i - 1]].isFull;

    let candidates = (Object.keys(TEMPLATES) as TemplateId[]).filter((id) => {
      const t = TEMPLATES[id];
      if (t.requiresVisual && !hasVisual) return false;
      if (t.visual === null && hasVisual) return false;        // don't drop a hero on a text-only template
      if (textCount > t.maxText) return false;                 // minimal-text templates only for light sections
      if (recent.has(id)) return false;                        // no repeat within 2
      if (t.isFull && (prevFull || i - lastFull < fullGap)) return false; // full-beat spacing
      return true;
    });
    if (candidates.length === 0) {
      // Fallback: a split that still fits the text count, ideally not used in the last 2. The
      // two left/right splits hold any amount of text (maxText 99), so this always resolves.
      candidates = SPLIT_TEMPLATES.filter((id) => textCount <= TEMPLATES[id].maxText && !recent.has(id));
      if (candidates.length === 0) candidates = SPLIT_TEMPLATES.filter((id) => textCount <= TEMPLATES[id].maxText);
      if (candidates.length === 0) candidates = ['text_left_visual_right', 'visual_left_text_right'];
    }

    // Weight: bias toward this section_type's preferred family; splits common, fulls occasional.
    const bias = biasFor(s.section_type);
    const weights = candidates.map((id) => {
      let w = TEMPLATES[id].isFull ? 0.5 : 1.5;
      if (bias.prefer.includes(id)) w *= bias.weight;
      return w;
    });
    const total = weights.reduce((a, b) => a + b, 0);
    let r = rnd() * total;
    let pick = candidates[0];
    for (let k = 0; k < candidates.length; k++) {
      r -= weights[k];
      if (r <= 0) { pick = candidates[k]; break; }
    }

    if (TEMPLATES[pick].isFull) lastFull = i;
    chosen.push(pick);
  });

  return chosen;
}

// ── Main entry ──────────────────────────────────────────────────────────────────
export interface RelayoutResult {
  templates: TemplateId[];
  cols: number;
  rows: number;
}

export function relayoutBoard(spec: BoardSpec, seedStr?: string): RelayoutResult {
  const sections = spec.board.sections;
  if (sections.length === 0) return { templates: [], cols: COLS, rows: 0 };

  const rnd = mulberry32(hashSeed(seedStr ?? spec.video_id ?? 'seed'));
  const templates = assignTemplates(sections, rnd);

  sections.forEach((section, i) => {
    // 1) Normalize element coords to section-local (current origin is x_offset, y_offset).
    const ox = section.x_offset, oy = section.y_offset;
    for (const el of section.elements) {
      el.x -= ox; el.y -= oy;
      if (typeof el.x2 === 'number') el.x2 -= ox;
      if (typeof el.y2 === 'number') el.y2 -= oy;
    }

    // 2) Classify (in section-local coords) into VISUAL hero, a CAPTION tied to the hero, and the
    // TEXT-FLOW prose; then place each per the chosen template.
    const tpl = TEMPLATES[templates[i]];
    const visualEls = section.elements.filter((e) => VISUAL_TYPES.has(e.type));
    const hasVisual = visualEls.length > 0;
    // Caption = a body_text that sat under the right-hand hero in the source layout.
    const caption = hasVisual
      ? section.elements.find((e) => e.type === 'body_text' && e.x >= CAPTION_MIN_LOCAL_X) ?? null
      : null;
    const textEls = section.elements.filter((e) => !VISUAL_TYPES.has(e.type) && e !== caption);

    // Visual region (rigid translate + scale-to-fit). For a text-only template that still has a
    // hero, fall back to a sensible centred region so the asset is never dropped.
    const visualRegion: Rect = tpl.visual ?? { x: 540, y: 230, w: 840, h: 700 };
    const visualCluster: Cluster = { els: visualEls, box: unionBox(visualEls) };
    if (visualCluster.box) placeCluster(visualCluster, visualRegion, 0.5, tpl.visualScaleMax);

    // Text region: no hero ⇒ give the prose the whole frame, centred (no awkward empty half).
    const textRegion = hasVisual ? tpl.text : { x: 180, y: 240, w: 1560, h: 600 };
    const textAnchor: 'left' | 'center' = hasVisual ? tpl.textAnchor : 'center';
    reflowText(textEls, textRegion, textAnchor);

    // Caption goes directly under the placed visual's rendered bottom + padding.
    if (caption && visualCluster.box) placeCaption(caption, unionBox(visualEls)!, 20);

    // Keep the whole section within the camera-safe content band (both axes) so nothing sits at the
    // frame edge AND the camera has room to push/pan (shrinks an oversized hero + re-seats caption).
    fitSectionToSafeArea(section.elements, visualEls, caption);

    // Final guarantee: the hero never overlaps the text (a tall list + extra headline can overflow its
    // region into the hero). Reseats the hero into the largest free band if they collide. No-op otherwise.
    separateVisualFromText(textEls, visualEls, caption);

    clampToFrame(section.elements);

    // 3) Snake (boustrophedon) grid placement → 2-D board. Section order stays linear.
    const row = Math.floor(i / COLS);
    const col = i % COLS;
    const gx = row % 2 === 0 ? col : (COLS - 1 - col);
    const nx = gx * SECTION_W;
    const ny = row * SECTION_H;
    section.x_offset = nx;
    section.y_offset = ny;
    section.width = SECTION_W;
    section.height = SECTION_H;
    for (const el of section.elements) {
      el.x += nx; el.y += ny;
      if (typeof el.x2 === 'number') el.x2 += nx;
      if (typeof el.y2 === 'number') el.y2 += ny;
    }
  });

  const rows = Math.ceil(sections.length / COLS);
  spec.board.width = (sections.length <= COLS ? sections.length : COLS) * SECTION_W;
  spec.board.height = rows * SECTION_H;

  return { templates, cols: COLS, rows };
}
