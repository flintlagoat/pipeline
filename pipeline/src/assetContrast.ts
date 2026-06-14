// Programmatic, DETERMINISTIC contrast guard for generated/cached SVG assets (FIX 1.3).
//
// On light-background channels (e.g. notebook_sketch / beige paper) some cached or animated
// assets were drawn in white / near-white and effectively vanished. This module parses an SVG,
// collects every stroke/fill/stop-color it declares, computes the WCAG contrast ratio of each
// against the channel background, and remaps any color that fails `minContrastRatio` (or sits
// within a hair of the background) TOWARD the channel ink — darkening it step-wise so a hued
// accent keeps its hue when possible, falling back to solid ink. `fill="none"` and `none` are
// always preserved. Pure string→string given the same inputs (no RNG, no I/O) — safe for the
// "identical output for a fixed seed" guarantee.

export interface ContrastRules {
  background: string;        // hex, the paper/canvas color
  ink: string;               // hex, the remap target (dark on light bg, light on dark bg)
  minContrastRatio: number;  // WCAG floor (e.g. 3.0)
  forbidNearBackground: boolean;
}

interface Rgb { r: number; g: number; b: number; }

function parseColor(value: string): Rgb | null {
  const v = value.trim().toLowerCase();
  if (v === 'none' || v === 'transparent' || v === 'currentcolor') return null;
  if (v === 'white') return { r: 255, g: 255, b: 255 };
  if (v === 'black') return { r: 0, g: 0, b: 0 };
  const hex = v.startsWith('#') ? v.slice(1) : null;
  if (hex) {
    if (hex.length === 3) {
      return {
        r: parseInt(hex[0] + hex[0], 16),
        g: parseInt(hex[1] + hex[1], 16),
        b: parseInt(hex[2] + hex[2], 16),
      };
    }
    if (hex.length === 6) {
      return {
        r: parseInt(hex.slice(0, 2), 16),
        g: parseInt(hex.slice(2, 4), 16),
        b: parseInt(hex.slice(4, 6), 16),
      };
    }
  }
  const m = v.match(/^rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/);
  if (m) return { r: +m[1], g: +m[2], b: +m[3] };
  return null;
}

function toHex({ r, g, b }: Rgb): string {
  const h = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
  return `#${h(r)}${h(g)}${h(b)}`;
}

// WCAG relative luminance.
function luminance({ r, g, b }: Rgb): number {
  const ch = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b);
}

export function contrastRatio(a: Rgb, b: Rgb): number {
  const la = luminance(a);
  const lb = luminance(b);
  const hi = Math.max(la, lb);
  const lo = Math.min(la, lb);
  return (hi + 0.05) / (lo + 0.05);
}

function mix(a: Rgb, b: Rgb, t: number): Rgb {
  return { r: a.r + (b.r - a.r) * t, g: a.g + (b.g - a.g) * t, b: a.b + (b.b - a.b) * t };
}

// Returns a remapped color (hex) for `color` so it clears `minContrastRatio` vs background,
// blending toward ink in 10% steps (keeps hue when a partial darken already passes), or null
// if it already passes and isn't near-background.
function remapColor(color: Rgb, rules: ContrastRules): string | null {
  const bg = parseColor(rules.background) ?? { r: 255, g: 255, b: 255 };
  const ink = parseColor(rules.ink) ?? { r: 0, g: 0, b: 0 };

  const passes = contrastRatio(color, bg) >= rules.minContrastRatio;
  const nearBg = rules.forbidNearBackground && contrastRatio(color, bg) < 1.5;
  if (passes && !nearBg) return null;

  for (let step = 1; step <= 10; step++) {
    const candidate = mix(color, ink, step / 10);
    if (contrastRatio(candidate, bg) >= rules.minContrastRatio) return toHex(candidate);
  }
  return toHex(ink);
}

// Attribute form: stroke="..", fill="..", stop-color="..". Also inline-style form
// (stroke:..;fill:..) for robustness against hand-authored / older cached assets.
const ATTR_RE = /\b(stroke|fill|stop-color)\s*=\s*"([^"]*)"/gi;
const STYLE_PROP_RE = /\b(stroke|fill|stop-color)\s*:\s*([^;"']+)/gi;

/**
 * Remap every low-contrast stroke/fill in `svg` toward `ink`. Returns the (possibly unchanged)
 * SVG and the list of original color values that were remapped.
 */
export function normalizeSvgContrast(
  svg: string,
  rules: ContrastRules
): { svg: string; remapped: string[] } {
  const remapped: string[] = [];

  const fix = (value: string): string => {
    const rgb = parseColor(value);
    if (!rgb) return value; // none / url() / unparseable → leave as-is
    const next = remapColor(rgb, rules);
    if (next === null) return value;
    remapped.push(value.trim());
    return next;
  };

  let out = svg.replace(ATTR_RE, (_m, prop: string, value: string) => `${prop}="${fix(value)}"`);
  out = out.replace(STYLE_PROP_RE, (_m, prop: string, value: string) => `${prop}:${fix(value)}`);

  return { svg: out, remapped };
}
