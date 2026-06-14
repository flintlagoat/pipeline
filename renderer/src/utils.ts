import type { SKRSContext2D } from '@napi-rs/canvas';

// Active logical→real font map for the current render. Defaults to the blueprint_board faces;
// index.ts calls setFontMap() once per render with the active channel profile's fonts, so every
// element's font_family ("display"/"mono"/"body") resolves to that channel's typography without
// threading the profile through all 14 element draw functions. (Renderer is single-process.)
let FONT_MAP: Record<string, string> = {
  display: 'Bebas Neue',
  mono: 'IBM Plex Mono',
  body: 'Syne',
};

export function setFontMap(map: { display: string; body: string; mono: string }): void {
  FONT_MAP = { display: map.display, mono: map.mono, body: map.body };
}

export function fontSpec(fontFamily: string | undefined, fontSize: number): string {
  const family = FONT_MAP[fontFamily ?? 'body'] ?? FONT_MAP.body;
  return `${fontSize}px "${family}"`;
}

export function drawSpacedText(
  ctx: SKRSContext2D,
  text: string,
  x: number,
  y: number,
  letterSpacing: number
): void {
  let cursor = x;
  for (const char of text) {
    ctx.fillText(char, cursor, y);
    cursor += ctx.measureText(char).width + letterSpacing;
  }
}

// Normalize a word for emphasis matching: lowercase, strip surrounding punctuation/symbols.
function wordKey(w: string): string {
  return w.toLowerCase().replace(/^[^\p{L}\p{N}$%]+|[^\p{L}\p{N}$%]+$/gu, '');
}

export interface RichLineOpts {
  letterSpacing?: number;       // px between glyphs (already scaled)
  baseColor: string;
  emphasisColor?: string;       // color for emphasized words (defaults to baseColor if unset)
  emphasisSet?: Set<string>;    // lowercased wordKeys to emphasize
  visibleChars?: number;        // type_on: number of fully-shown chars (omit ⇒ all)
  leadAlpha?: number;           // type_on: alpha of the partially-shown leading char
}

// Draw one line of text char-by-char with optional letter spacing, per-word emphasis coloring,
// and a type_on reveal (a smooth leading-char fade). Returns the total advance width. This is the
// shared path for headline/body/eyebrow so the "bold colored word reveal, typed in sync with the
// voice" look is consistent everywhere. When no type_on / emphasis / spacing is in play it still
// renders correctly (just a per-char fillText, which is fine for short lines).
export function drawRichLine(
  ctx: SKRSContext2D,
  text: string,
  x: number,
  y: number,
  opts: RichLineOpts
): number {
  const { letterSpacing = 0, baseColor, emphasisColor, emphasisSet, visibleChars, leadAlpha = 1 } = opts;
  const limit = visibleChars === undefined ? text.length : Math.min(text.length, visibleChars + 1);

  // Fast path: fully-revealed static text with no spacing and no emphasis (the case on the vast
  // majority of frames — typing/emphasis are brief). One fillText beats per-char measure+draw.
  if (
    letterSpacing === 0 &&
    (!emphasisSet || emphasisSet.size === 0) &&
    (visibleChars === undefined || visibleChars >= text.length)
  ) {
    ctx.fillStyle = baseColor;
    ctx.fillText(text, x, y);
    return ctx.measureText(text).width;
  }

  // Precompute per-char emphasis flags by walking words and their spans.
  const emphFlags = new Array<boolean>(text.length).fill(false);
  if (emphasisSet && emphasisSet.size) {
    let i = 0;
    while (i < text.length) {
      // skip whitespace
      while (i < text.length && /\s/.test(text[i])) i++;
      const start = i;
      while (i < text.length && !/\s/.test(text[i])) i++;
      if (i > start) {
        const key = wordKey(text.slice(start, i));
        if (key && emphasisSet.has(key)) for (let k = start; k < i; k++) emphFlags[k] = true;
      }
    }
  }

  let cursor = x;
  for (let idx = 0; idx < limit; idx++) {
    const ch = text[idx];
    const isLead = visibleChars !== undefined && idx === visibleChars;
    ctx.fillStyle = emphFlags[idx] && emphasisColor ? emphasisColor : baseColor;
    if (isLead && leadAlpha < 1) {
      const prev = ctx.globalAlpha;
      ctx.globalAlpha = prev * Math.max(0, leadAlpha);
      ctx.fillText(ch, cursor, y);
      ctx.globalAlpha = prev;
    } else {
      ctx.fillText(ch, cursor, y);
    }
    cursor += ctx.measureText(ch).width + letterSpacing;
  }
  return cursor - x;
}

export function wrapText(text: string, maxChars: number): string[] {
  if (!text) return [];
  const words = text.split(' ');
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    if (current.length + word.length + 1 <= maxChars) {
      current += (current ? ' ' : '') + word;
    } else {
      if (current) lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines;
}

export function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
