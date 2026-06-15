// Curated per-archetype "skins" for the free demo — a compact mirror of the pipeline's
// channelDistinct.ts. The demo model picks an archetype + writes the sample copy; this stamps a
// curated, contrast-safe palette + font set over its raw guesses so the public demo shows VARIED,
// distinct looks instead of converging on the same notebook cream every time. Seeded off the idea
// text → deterministic per idea, spread across ideas.

export type DemoArchetype =
  | 'blueprint_board'
  | 'flat_motion_explainer'
  | 'documentary_slate'
  | 'notebook_sketch'
  | 'tech_terminal'
  | 'vintage_press'
  | 'editorial_magazine'
  | 'chalkboard';

interface Skin { bg: string; ink: string; a1: string; a2: string; money: string; }
interface FontPool { display: string[]; body: string[]; mono: string[]; }

const BG_MODE: Record<DemoArchetype, 'flat' | 'board_grid' | 'paper' | 'gradient' | 'dotted'> = {
  blueprint_board: 'board_grid',
  flat_motion_explainer: 'flat',
  documentary_slate: 'gradient',
  notebook_sketch: 'dotted',
  tech_terminal: 'flat',
  vintage_press: 'paper',
  editorial_magazine: 'flat',
  chalkboard: 'flat',
};
const GRAIN: Record<DemoArchetype, number> = {
  blueprint_board: 0.45, flat_motion_explainer: 0, documentary_slate: 0.22, notebook_sketch: 0.12,
  tech_terminal: 0.28, vintage_press: 0.38, editorial_magazine: 0, chalkboard: 0.3,
};
const CASE: Record<DemoArchetype, 'upper' | 'title' | 'none'> = {
  blueprint_board: 'upper', flat_motion_explainer: 'none', documentary_slate: 'title',
  notebook_sketch: 'none', tech_terminal: 'none', vintage_press: 'title',
  editorial_magazine: 'title', chalkboard: 'none',
};

const SKINS: Record<DemoArchetype, Skin[]> = {
  blueprint_board: [
    { bg: '#08090F', ink: '#FFFFFF', a1: '#FFE500', a2: '#00D8FF', money: '#FFE500' },
    { bg: '#0B0A0E', ink: '#F5F5F7', a1: '#FF4D4D', a2: '#FF9F1C', money: '#FFC857' },
    { bg: '#07100C', ink: '#EAFBF2', a1: '#4CE0A0', a2: '#00D8FF', money: '#4CE0A0' },
    { bg: '#0A0814', ink: '#F1EEFF', a1: '#B388FF', a2: '#18FFD5', money: '#C9A6FF' },
    { bg: '#0E0B07', ink: '#FFF6E8', a1: '#FFB000', a2: '#5AD2FF', money: '#FFB000' },
  ],
  flat_motion_explainer: [
    { bg: '#1B1F3B', ink: '#FFFFFF', a1: '#FFD166', a2: '#06D6A0', money: '#FFD166' },
    { bg: '#0E2A47', ink: '#FFFFFF', a1: '#FF6B6B', a2: '#4ECDC4', money: '#FFD93D' },
    { bg: '#2D1B4E', ink: '#FFFFFF', a1: '#C6FF00', a2: '#FF5DA2', money: '#C6FF00' },
    { bg: '#0B3A3A', ink: '#FFFFFF', a1: '#FFD93D', a2: '#FF6F61', money: '#FFD93D' },
    { bg: '#1A1030', ink: '#FFFFFF', a1: '#FF3CAC', a2: '#2BD9FE', money: '#FFD166' },
  ],
  documentary_slate: [
    { bg: '#0E0E10', ink: '#F2EFE6', a1: '#C6A05A', a2: '#8FB6C9', money: '#C6A05A' },
    { bg: '#120E0B', ink: '#F0E7D8', a1: '#D8A24A', a2: '#A98E78', money: '#D8A24A' },
    { bg: '#0A1012', ink: '#ECF1F0', a1: '#CBB994', a2: '#6FA0A6', money: '#CBB994' },
    { bg: '#120A0C', ink: '#F1E6E6', a1: '#C98B6B', a2: '#9A6A6F', money: '#C98B6B' },
    { bg: '#0C0E12', ink: '#ECEEF2', a1: '#BBAE8C', a2: '#7E9AB8', money: '#BBAE8C' },
  ],
  notebook_sketch: [
    { bg: '#F4ECD8', ink: '#2B2A26', a1: '#3C5A96', a2: '#C0492F', money: '#2E7D52' },
    { bg: '#E8EBDF', ink: '#2C342B', a1: '#5C7A4B', a2: '#B5552F', money: '#5C7A4B' },
    { bg: '#F6E9E4', ink: '#3A2A2A', a1: '#B23A48', a2: '#2E6F95', money: '#2E7D52' },
    { bg: '#E7D8BE', ink: '#33291B', a1: '#1F7A6D', a2: '#C85A2B', money: '#1F7A6D' },
    { bg: '#ECEEF1', ink: '#25282E', a1: '#3F4FB0', a2: '#D9762E', money: '#3F4FB0' },
    { bg: '#E6F0E8', ink: '#2A2622', a1: '#2F8F6B', a2: '#B5604A', money: '#2F8F6B' },
  ],
  tech_terminal: [
    { bg: '#07100B', ink: '#D6FFE6', a1: '#33FF99', a2: '#7CFFCB', money: '#33FF99' },
    { bg: '#100A03', ink: '#FFE9C7', a1: '#FFB000', a2: '#FFD37A', money: '#FFB000' },
    { bg: '#0A0712', ink: '#FBE7FF', a1: '#FF3CAC', a2: '#00E5FF', money: '#FF3CAC' },
    { bg: '#060B12', ink: '#E3F3FF', a1: '#5AD2FF', a2: '#B0E0FF', money: '#5AD2FF' },
    { bg: '#060A06', ink: '#EAFFD9', a1: '#B6FF3C', a2: '#6CFF6C', money: '#B6FF3C' },
  ],
  vintage_press: [
    { bg: '#ECE3CE', ink: '#1E1B16', a1: '#B23A2E', a2: '#2E4756', money: '#6B5A2E' },
    { bg: '#EADCC0', ink: '#241B12', a1: '#9C3B22', a2: '#4A4031', money: '#6B5A2E' },
    { bg: '#E7E7DF', ink: '#1A1C1E', a1: '#1F3A5F', a2: '#9A2B2B', money: '#5A5430' },
    { bg: '#E9E6D0', ink: '#20231A', a1: '#5A6B2E', a2: '#98432B', money: '#6B5A2E' },
    { bg: '#F0E6E0', ink: '#241A18', a1: '#C0392B', a2: '#34495E', money: '#6B5A2E' },
  ],
  editorial_magazine: [
    { bg: '#FAF8F3', ink: '#14110E', a1: '#E5392F', a2: '#1A1A1A', money: '#B8860B' },
    { bg: '#FBFBFD', ink: '#111317', a1: '#1A56DB', a2: '#E5392F', money: '#B8860B' },
    { bg: '#F7F6F0', ink: '#16140F', a1: '#0E7C5A', a2: '#C2410C', money: '#B8860B' },
    { bg: '#FAF7FA', ink: '#1A1320', a1: '#7C3AED', a2: '#E11D48', money: '#B8860B' },
    { bg: '#F6F3EC', ink: '#141414', a1: '#111111', a2: '#C0392B', money: '#8A6D1B' },
  ],
  chalkboard: [
    { bg: '#1E2B24', ink: '#F1EEE3', a1: '#FFE08A', a2: '#8FD0C9', money: '#FFE08A' },
    { bg: '#232830', ink: '#EFF1F2', a1: '#FFD27A', a2: '#7FB3D5', money: '#FFD27A' },
    { bg: '#232323', ink: '#F0EDE6', a1: '#F7A072', a2: '#9BD1C0', money: '#F7D08A' },
    { bg: '#1A2333', ink: '#EAF0F5', a1: '#FFD93D', a2: '#6FCF97', money: '#FFD93D' },
    { bg: '#2A2320', ink: '#F2EAD9', a1: '#E8B04B', a2: '#88C0A6', money: '#E8B04B' },
  ],
};

const FONTS: Record<DemoArchetype, FontPool> = {
  blueprint_board: { display: ['Bebas Neue', 'Anton', 'Oswald', 'Teko', 'Archivo Narrow'], body: ['Syne', 'Inter', 'Rajdhani', 'Chakra Petch', 'Saira'], mono: ['IBM Plex Mono', 'Space Mono', 'JetBrains Mono', 'Share Tech Mono'] },
  flat_motion_explainer: { display: ['Archivo Black', 'Montserrat', 'Sora', 'Outfit', 'Fredoka'], body: ['Poppins', 'Inter', 'Nunito Sans', 'Mulish', 'Work Sans'], mono: ['Space Mono', 'JetBrains Mono', 'IBM Plex Mono'] },
  documentary_slate: { display: ['Playfair Display', 'Cormorant Garamond', 'Libre Baskerville', 'DM Serif Display', 'EB Garamond'], body: ['Spectral', 'EB Garamond', 'Lora', 'Source Serif 4', 'Crimson Text'], mono: ['IBM Plex Mono', 'Courier Prime'] },
  notebook_sketch: { display: ['Caveat', 'Shantell Sans', 'Patrick Hand', 'Gloria Hallelujah', 'Kalam', 'Architects Daughter'], body: ['Quicksand', 'Nunito', 'Comic Neue', 'Itim', 'Shantell Sans'], mono: ['Space Mono', 'Kalam', 'Cousine'] },
  tech_terminal: { display: ['Share Tech Mono', 'VT323', 'Major Mono Display', 'JetBrains Mono', 'Red Hat Mono'], body: ['IBM Plex Sans', 'Inconsolata', 'Space Grotesk', 'Chakra Petch'], mono: ['JetBrains Mono', 'Space Mono', 'IBM Plex Mono', 'Fira Code'] },
  vintage_press: { display: ['Zilla Slab', 'Anton', 'Oswald', 'Roboto Slab', 'Playfair Display'], body: ['Bitter', 'Roboto Slab', 'PT Serif', 'Domine', 'Vollkorn'], mono: ['Courier Prime', 'Cutive Mono', 'Special Elite'] },
  editorial_magazine: { display: ['Fraunces', 'Playfair Display', 'DM Serif Display', 'Cormorant Garamond', 'Bodoni Moda'], body: ['Inter', 'Work Sans', 'Manrope', 'Archivo', 'Source Sans 3'], mono: ['Space Mono', 'IBM Plex Mono', 'JetBrains Mono'] },
  chalkboard: { display: ['Architects Daughter', 'Gloria Hallelujah', 'Patrick Hand', 'Caveat', 'Shadows Into Light'], body: ['Patrick Hand', 'Quicksand', 'Nunito', 'Shantell Sans'], mono: ['Cutive Mono', 'Space Mono', 'Kalam'] },
};

// ── seeded RNG + color helpers (compact copies of channelDistinct's) ──
function seedFromString(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function mulberry32(a: number): () => number {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const pick = <T>(arr: T[], r: number): T => arr[Math.floor(r * arr.length) % arr.length];
function parseHex(hex: string): { r: number; g: number; b: number } | null {
  const m = /^#?([0-9a-fA-F]{6})$/.exec(hex.trim());
  if (!m) return null;
  return { r: parseInt(m[1].slice(0, 2), 16), g: parseInt(m[1].slice(2, 4), 16), b: parseInt(m[1].slice(4, 6), 16) };
}
function toHex(r: number, g: number, b: number): string {
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`.toUpperCase();
}
function rgbToHsl(r: number, g: number, b: number) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  const l = (max + min) / 2;
  let h = 0, s = 0;
  if (d !== 0) {
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      default: h = (r - g) / d + 4; break;
    }
    h *= 60;
  }
  return { h, s, l };
}
function hslToRgb(h: number, s: number, l: number) {
  h = ((h % 360) + 360) % 360 / 360;
  if (s === 0) return { r: l * 255, g: l * 255, b: l * 255 };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const f = (t: number) => {
    if (t < 0) t += 1; if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return { r: f(h + 1 / 3) * 255, g: f(h) * 255, b: f(h - 1 / 3) * 255 };
}
function rotateHue(hex: string, deg: number): string {
  const c = parseHex(hex);
  if (!c) return hex;
  const { h, s, l } = rgbToHsl(c.r, c.g, c.b);
  const { r, g, b } = hslToRgb(h + deg, s, l);
  return toHex(r, g, b);
}
function mix(a: string, b: string, t: number): string {
  const ca = parseHex(a), cb = parseHex(b);
  if (!ca || !cb) return a;
  return toHex(ca.r + (cb.r - ca.r) * t, ca.g + (cb.g - ca.g) * t, ca.b + (cb.b - ca.b) * t);
}

/**
 * Stamp a curated, seeded skin over the model's demo spec. Keeps the model's archetype (falling back
 * if it's unknown) + its sample copy/voice; replaces palette/typography/background with the skin so
 * the public demo always looks distinct + contrast-safe. Seed off the idea text.
 */
export function applyDemoSkin<T extends { archetype?: string }>(spec: T, seedStr: string): T {
  const arch = (spec?.archetype && SKINS[spec.archetype as DemoArchetype] ? spec.archetype : 'flat_motion_explainer') as DemoArchetype;
  const rng = mulberry32(seedFromString(`${seedStr}:${arch}`));
  const skins = SKINS[arch];
  const s = skins[Math.floor(rng() * skins.length) % skins.length];
  const hue = (4 + rng() * 10) * (rng() < 0.5 ? -1 : 1);
  const a1 = rotateHue(s.a1, hue);
  const a2 = rotateHue(s.a2, hue * 0.6);
  const pool = FONTS[arch];
  return {
    ...spec,
    archetype: arch,
    palette: {
      background: s.bg,
      surface: mix(s.bg, s.ink, 0.1),
      textPrimary: s.ink,
      textSecondary: mix(s.ink, s.bg, 0.4),
      accent1: a1,
      accent2: a2,
      money: s.money.toLowerCase() === s.a1.toLowerCase() ? a1 : rotateHue(s.money, hue * 0.3),
    },
    typography: {
      display: pick(pool.display, rng()),
      body: pick(pool.body, rng()),
      mono: pick(pool.mono, rng()),
      case: CASE[arch],
    },
    background: { mode: BG_MODE[arch], grain: GRAIN[arch] },
  };
}
