import { relayoutBoard } from './relayout';
import { BoardSpec, Element } from './types/specTypes';

// Offline regression test (no API) for the wrapped-body-text overlap bug (s7 fix). A long body_text
// wraps to multiple lines; before the fix the element stacked below it (a label_tag, or another body
// line) was placed only one line down and collided with the wrapped overflow. This reconstructs that
// exact shape, runs the deterministic relayout, and asserts no vertical overlap between stacked text.

let failures = 0;
function assert(cond: boolean, msg: string): void {
  console.log(`  ${cond ? '✓' : '✗ FAIL'} ${msg}`);
  if (!cond) failures++;
}

// Mirror the renderer's char-wrap + the relayout height model to compute an element's rendered box.
function wrapLines(text: string, maxChars: number): number {
  let lines = 0;
  for (const raw of text.split('\n')) {
    let cur = '';
    for (const w of raw.split(' ')) {
      if (cur.length + w.length + 1 <= maxChars) cur += (cur ? ' ' : '') + w;
      else { if (cur) lines++; cur = w; }
    }
    if (cur) lines++;
  }
  return Math.max(1, lines);
}
function renderedBox(el: Element): { top: number; bottom: number; left: number; right: number } {
  const fs = el.font_size ?? 32;
  let lineCount = el.lines?.length ?? 1;
  const lh = el.type === 'body_text' ? 1.45 : 1.35;
  if (el.type === 'body_text' && el.content) lineCount = wrapLines(el.content, el.wrap_chars ?? 52);
  const wrapW = el.type === 'body_text' && el.content
    ? Math.min(el.content.length, el.wrap_chars ?? 52)
    : (el.content ? el.content.length : 10);
  const w = Math.max(40, wrapW * fs * 0.55);
  const h = lineCount * fs * lh;
  return { top: el.y, bottom: el.y + h, left: el.x, right: el.x + w };
}

function mkSpec(): BoardSpec {
  return {
    video_id: 'overlap_test_fixed_seed',
    channel_id: 'how_industries_work',
    format: 'landscape_16x9',
    duration_seconds: 30,
    fps: 30,
    audio_file: '',
    asset_needs: ['water_bottle'],
    board: {
      width: 1920, height: 1080, background_color: '#08090f',
      sections: [{
        id: 'hook', section_type: 'hook', x_offset: 0, y_offset: 0, width: 1920, height: 1080,
        elements: [
          { id: 'eye', type: 'eyebrow', reveal_at_seconds: 0.3, reveal_type: 'fade_up', x: 100, y: 90,
            content: 'THE MINIBAR ECONOMY', color: '#00D8FF', font_family: 'mono' },
          { id: 'head', type: 'headline', reveal_at_seconds: 0.3, reveal_type: 'type_on', x: 100, y: 150,
            content: 'THE $8 BOTTLE', font_size: 100, color: '#FFFFFF', font_family: 'display' },
          { id: 'body', type: 'body_text', reveal_at_seconds: 3, reveal_type: 'fade_up', x: 100, y: 300,
            content: 'Not overpriced by accident. The minibar is one of the most engineered traps in hospitality.',
            font_size: 34, color: 'rgba(255,255,255,0.85)', font_family: 'body' },
          { id: 'tag', type: 'label_tag', reveal_at_seconds: 11, reveal_type: 'scale_in', x: 100, y: 360,
            content: 'MOST HOTELS LOSE MONEY ON IT', font_size: 32, color: '#FF3B30', font_family: 'mono' },
          // A right-shifted region case: a long body line that previously ran off the frame edge.
          { id: 'body2', type: 'body_text', reveal_at_seconds: 6, reveal_type: 'fade_up', x: 100, y: 460,
            content: 'A can of soda costs the hotel under a dollar. They charge you six, eight, sometimes ten.',
            font_size: 34, color: '#FFE500', font_family: 'body' },
          { id: 'asset', type: 'svg_asset', reveal_at_seconds: 1, reveal_type: 'draw_on', x: 700, y: 450,
            width: 500, height: 560, asset_name: 'water_bottle' },
        ],
      }],
      camera_keyframes: [],
    },
  };
}

const spec = mkSpec();
relayoutBoard(spec);
const els = spec.board.sections[0].elements;
const ox = spec.board.sections[0].x_offset;
const oy = spec.board.sections[0].y_offset;

// Rebase to section-local for frame-bound checks.
for (const el of els) { el.x -= ox; el.y -= oy; if (typeof el.x2 === 'number') el.x2 -= ox; if (typeof el.y2 === 'number') el.y2 -= oy; }

const byId = (id: string) => els.find((e) => e.id === id)!;

console.log('wrapped body_text reserves multi-line height + no collision with the element below:');
const body = byId('body');
assert((body.wrap_chars ?? 52) < 52, `body wrap_chars set region-aware (got ${body.wrap_chars})`);
assert(wrapLines(body.content!, body.wrap_chars ?? 52) >= 2, 'long body wraps to ≥2 lines');

// Check every pair of stacked TEXT elements for vertical overlap (only matters when they share x-span).
const textEls = els.filter((e) => ['eyebrow', 'headline', 'body_text', 'label_tag', 'list_reveal'].includes(e.type));
let overlaps = 0;
for (let i = 0; i < textEls.length; i++) {
  for (let j = i + 1; j < textEls.length; j++) {
    const a = renderedBox(textEls[i]);
    const b = renderedBox(textEls[j]);
    const xOverlap = a.left < b.right - 8 && b.left < a.right - 8;
    const yOverlap = a.top < b.bottom - 8 && b.top < a.bottom - 8;
    if (xOverlap && yOverlap) {
      overlaps++;
      console.log(`    ✗ overlap: ${textEls[i].id} ∩ ${textEls[j].id}`);
    }
  }
}
assert(overlaps === 0, `no text/text overlaps in the stack (found ${overlaps})`);

console.log('\nall text stays within the 1920×1080 frame:');
let offFrame = 0;
for (const el of textEls) {
  const b = renderedBox(el);
  if (b.left < 0 || b.right > 1920 || b.top < 0 || b.bottom > 1080) {
    offFrame++;
    console.log(`    ✗ off-frame: ${el.id} [${b.left.toFixed(0)},${b.top.toFixed(0)} → ${b.right.toFixed(0)},${b.bottom.toFixed(0)}]`);
  }
}
assert(offFrame === 0, `no text runs off the frame edge (found ${offFrame})`);

// ── Text↔visual overlap (the "headline over the scale" bug) ─────────────────────────────────────
// An OVERLOADED section: eyebrow + headline + rule + a 4-line list of LONG (unwrapped) lines + a
// second blur_reveal headline + a big svg_asset — the exact shape that overflowed its text region and
// collided with the hero. After relayout, the hero must not overlap ANY text element.
function genericBox(el: Element): { x: number; y: number; w: number; h: number } {
  if (['svg_asset', 'png_asset', 'node_box', 'highlight_box'].includes(el.type)) {
    return { x: el.x, y: el.y, w: el.asset_width ?? el.width ?? 320, h: el.asset_height ?? el.height ?? 320 };
  }
  const fs = el.font_size ?? 32;
  const lh = el.type === 'list_reveal' ? 1.5 : el.type === 'body_text' ? 1.45 : 1.35;
  let lines = el.lines?.length ?? 1;
  if (el.type === 'body_text' && el.content) lines = wrapLines(el.content, el.wrap_chars ?? 52);
  const chars = el.content
    ? (el.type === 'body_text' ? Math.min(el.content.length, el.wrap_chars ?? 52) : el.content.length)
    : (el.lines ? Math.max(...el.lines.map((l) => l.length)) : 10);
  return { x: el.x, y: el.y, w: Math.max(40, chars * fs * 0.55), h: lines * fs * lh };
}
function overlap(a: ReturnType<typeof genericBox>, b: ReturnType<typeof genericBox>, pad = 8): boolean {
  return !(a.x + a.w <= b.x + pad || b.x + b.w <= a.x + pad || a.y + a.h <= b.y + pad || b.y + b.h <= a.y + pad);
}

console.log('\noverloaded section (list + extra headline + hero): hero must not overlap any text:');
const ov: BoardSpec = {
  video_id: 'overloaded_fixed_seed', channel_id: 'how_industries_work', format: 'landscape_16x9',
  duration_seconds: 30, fps: 30, audio_file: '', asset_needs: ['statistical_bet_scale'],
  board: {
    width: 1920, height: 1080, background_color: '#08090f',
    sections: [{
      id: 'january', section_type: 'list_reveal', x_offset: 0, y_offset: 0, width: 1920, height: 1080,
      elements: [
        { id: 'j_eye', type: 'eyebrow', reveal_at_seconds: 0.3, reveal_type: 'fade_up', x: 100, y: 90, content: 'HUNTING SEASON', color: '#00D8FF', font_family: 'mono' },
        { id: 'j_head', type: 'headline', reveal_at_seconds: 1, reveal_type: 'type_on', x: 100, y: 160, content: 'JANUARY ADS', font_size: 90, color: '#FFFFFF', font_family: 'display' },
        { id: 'j_rule', type: 'rule_line', reveal_at_seconds: 2, reveal_type: 'draw_on', x: 100, y: 300, x2: 580, y2: 300, stroke_color: '#00D8FF', stroke_width: 1 },
        { id: 'j_list', type: 'list_reveal', reveal_at_seconds: 3, reveal_type: 'fade_up', x: 100, y: 320, lines: ['Not hunting for athletes.', 'Hunting for the person most likely to quit by March.', 'Motivated, guilty, optimistic — buys a year, uses five weeks.', 'Pays like a regular, consumes like a ghost.'], font_size: 36, color: '#FFFFFF', font_family: 'body' },
        { id: 'j_punch', type: 'blur_reveal', reveal_at_seconds: 18, reveal_type: 'blur_in', x: 100, y: 560, content: 'THE MOST PROFITABLE CUSTOMER', font_size: 64, color: '#FFE500', font_family: 'display' },
        { id: 'j_asset', type: 'svg_asset', reveal_at_seconds: 4, reveal_type: 'draw_on', x: 700, y: 470, width: 680, height: 465, asset_name: 'statistical_bet_scale' },
      ],
    }],
    camera_keyframes: [],
  },
};
relayoutBoard(ov);
const oels = ov.board.sections[0].elements;
const oox = ov.board.sections[0].x_offset, ooy = ov.board.sections[0].y_offset;
for (const el of oels) { el.x -= oox; el.y -= ooy; if (typeof el.x2 === 'number') el.x2 -= oox; if (typeof el.y2 === 'number') el.y2 -= ooy; }
const heroEl = oels.find((e) => e.type === 'svg_asset')!;
const heroBox = genericBox(heroEl);
let heroHits = 0;
for (const el of oels) {
  if (el === heroEl) continue;
  if (['eyebrow', 'headline', 'body_text', 'label_tag', 'list_reveal', 'blur_reveal'].includes(el.type) && overlap(heroBox, genericBox(el))) {
    heroHits++;
    console.log(`    ✗ hero overlaps ${el.id} (${el.type})`);
  }
}
assert(heroHits === 0, `hero does not overlap any text element (found ${heroHits})`);
// And the hero must still be on-frame.
assert(heroBox.x >= 0 && heroBox.y >= 0 && heroBox.x + heroBox.w <= 1920 && heroBox.y + heroBox.h <= 1080, 'hero stays within the frame');

console.log(`\n${failures === 0 ? '✅ overlap regression test passed' : `❌ ${failures} test(s) failed`}`);
process.exit(failures === 0 ? 0 : 1);
