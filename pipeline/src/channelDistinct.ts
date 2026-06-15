import * as fs from 'fs';
import * as path from 'path';
import { ChannelSpec, ChannelSpecSchema, ArchetypeId } from './types/channelSpec';
import { ARCHETYPE_DEFAULTS } from './channelSpec';

// ── Per-channel distinctness pass ────────────────────────────────────────────────────────────
// Channel generation kept landing every new channel on the SAME look (notebook cream + Caveat,
// or whatever the model defaulted to) — two channels in the same archetype were near-identical,
// and YouTube's "inauthentic content" policy targets content that's "a template with little
// variation." So this pass makes the channel's visual identity DETERMINISTIC + CURATED + spread:
//
//   • Each archetype has a pool of hand-tuned SKINS (full palettes) + display/body/mono FONT pools.
//   • Seeded off the channel id, we pick a skin + a font triple and stamp them AUTHORITATIVELY over
//     palette/typography/background/assetStyle/camera/motion (the model's archetype CHOICE + voice
//     are respected; its raw hex/font guesses are replaced with a curated, contrast-safe skin).
//   • A small seeded hue rotation on the accents means even two channels that draw the same skin
//     still diverge.
//   • A collision guard re-rolls (next skin + salted seed) only when the result would fingerprint-
//     match an EXISTING channel, so true near-duplicates are still escaped.
//
// Result: two channels of the same archetype look clearly different (different paper/ink/accents +
// display font), and across the 8 archetypes the studio spreads wide. Deterministic per id, so a
// given channel always renders the same.

const ROOT = path.resolve(__dirname, '..', '..');

// ── A skin = a complete, curated colour scheme for one archetype (contrast already vetted). ──
interface Skin {
  bg: string;        // background base
  bg2?: string;      // background secondary (dotted dots / gradient edge / paper tint)
  ink: string;       // textPrimary
  a1: string;        // accent1
  a2: string;        // accent2
  money: string;     // semantic value colour
  up: string;        // semantic gain
  down: string;      // semantic loss
  grain?: number;    // optional grain override (else the archetype default)
}

// ≥5 skins per archetype. Skin[0] mirrors the archetype's canonical default (ARCHETYPE_DEFAULTS),
// so the original look is always reachable and reproducible.
const ARCHETYPE_SKINS: Record<ArchetypeId, Skin[]> = {
  blueprint_board: [
    { bg: '#08090F', ink: '#FFFFFF', a1: '#FFE500', a2: '#00D8FF', money: '#FFE500', up: '#00D8FF', down: '#FF3B30' },
    { bg: '#0B0A0E', ink: '#F5F5F7', a1: '#FF4D4D', a2: '#FF9F1C', money: '#FFC857', up: '#4ADE80', down: '#FF4D4D' },
    { bg: '#07100C', ink: '#EAFBF2', a1: '#4CE0A0', a2: '#00D8FF', money: '#4CE0A0', up: '#4CE0A0', down: '#FF5C7A' },
    { bg: '#0A0814', ink: '#F1EEFF', a1: '#B388FF', a2: '#18FFD5', money: '#C9A6FF', up: '#18FFD5', down: '#FF5C7A' },
    { bg: '#0E0B07', ink: '#FFF6E8', a1: '#FFB000', a2: '#5AD2FF', money: '#FFB000', up: '#5AD2FF', down: '#FF5C5C' },
  ],
  flat_motion_explainer: [
    { bg: '#1B1F3B', ink: '#FFFFFF', a1: '#FFD166', a2: '#06D6A0', money: '#FFD166', up: '#06D6A0', down: '#EF476F' },
    { bg: '#0E2A47', ink: '#FFFFFF', a1: '#FF6B6B', a2: '#4ECDC4', money: '#FFD93D', up: '#4ECDC4', down: '#FF6B6B' },
    { bg: '#2D1B4E', ink: '#FFFFFF', a1: '#C6FF00', a2: '#FF5DA2', money: '#C6FF00', up: '#5EEAD4', down: '#FF5DA2' },
    { bg: '#0B3A3A', ink: '#FFFFFF', a1: '#FFD93D', a2: '#FF6F61', money: '#FFD93D', up: '#7BE0AD', down: '#FF6F61' },
    { bg: '#1A1030', ink: '#FFFFFF', a1: '#FF3CAC', a2: '#2BD9FE', money: '#FFD166', up: '#2BD9FE', down: '#FF3CAC' },
  ],
  documentary_slate: [
    { bg: '#0E0E10', bg2: '#1C1C22', ink: '#F2EFE6', a1: '#C6A05A', a2: '#8FB6C9', money: '#C6A05A', up: '#8FB6C9', down: '#B5544A' },
    { bg: '#120E0B', bg2: '#241B14', ink: '#F0E7D8', a1: '#D8A24A', a2: '#A98E78', money: '#D8A24A', up: '#9CB39A', down: '#B5544A' },
    { bg: '#0A1012', bg2: '#142024', ink: '#ECF1F0', a1: '#CBB994', a2: '#6FA0A6', money: '#CBB994', up: '#6FA0A6', down: '#B5605A' },
    { bg: '#120A0C', bg2: '#221015', ink: '#F1E6E6', a1: '#C98B6B', a2: '#9A6A6F', money: '#C98B6B', up: '#8FA98C', down: '#C0584F' },
    { bg: '#0C0E12', bg2: '#181C24', ink: '#ECEEF2', a1: '#BBAE8C', a2: '#7E9AB8', money: '#BBAE8C', up: '#7E9AB8', down: '#B5605A' },
  ],
  notebook_sketch: [
    { bg: '#F4ECD8', bg2: '#C9BFA3', ink: '#2B2A26', a1: '#3C5A96', a2: '#C0492F', money: '#2E7D52', up: '#2E7D52', down: '#C0492F' },
    { bg: '#E8EBDF', bg2: '#C2CBB5', ink: '#2C342B', a1: '#5C7A4B', a2: '#B5552F', money: '#5C7A4B', up: '#5C7A4B', down: '#B5552F' },
    { bg: '#F6E9E4', bg2: '#E0C6BC', ink: '#3A2A2A', a1: '#B23A48', a2: '#2E6F95', money: '#2E7D52', up: '#2E6F95', down: '#B23A48' },
    { bg: '#E7D8BE', bg2: '#CBB68F', ink: '#33291B', a1: '#1F7A6D', a2: '#C85A2B', money: '#1F7A6D', up: '#1F7A6D', down: '#C85A2B' },
    { bg: '#ECEEF1', bg2: '#CDD2DA', ink: '#25282E', a1: '#3F4FB0', a2: '#D9762E', money: '#3F4FB0', up: '#3F8F6B', down: '#D9762E' },
    { bg: '#E6F0E8', bg2: '#C3D8C8', ink: '#2A2622', a1: '#2F8F6B', a2: '#B5604A', money: '#2F8F6B', up: '#2F8F6B', down: '#B5604A' },
  ],
  tech_terminal: [
    { bg: '#07100B', ink: '#D6FFE6', a1: '#33FF99', a2: '#7CFFCB', money: '#33FF99', up: '#33FF99', down: '#FF5C5C' },
    { bg: '#100A03', ink: '#FFE9C7', a1: '#FFB000', a2: '#FFD37A', money: '#FFB000', up: '#8FE388', down: '#FF5C5C' },
    { bg: '#0A0712', ink: '#FBE7FF', a1: '#FF3CAC', a2: '#00E5FF', money: '#FF3CAC', up: '#00E5FF', down: '#FF6B6B' },
    { bg: '#060B12', ink: '#E3F3FF', a1: '#5AD2FF', a2: '#B0E0FF', money: '#5AD2FF', up: '#6CF0C8', down: '#FF6B6B' },
    { bg: '#060A06', ink: '#EAFFD9', a1: '#B6FF3C', a2: '#6CFF6C', money: '#B6FF3C', up: '#6CFF6C', down: '#FF6B6B' },
  ],
  vintage_press: [
    { bg: '#ECE3CE', bg2: '#D8CBA8', ink: '#1E1B16', a1: '#B23A2E', a2: '#2E4756', money: '#6B5A2E', up: '#4A6B3E', down: '#B23A2E' },
    { bg: '#EADCC0', bg2: '#D2BF98', ink: '#241B12', a1: '#9C3B22', a2: '#4A4031', money: '#6B5A2E', up: '#5A6B3E', down: '#9C3B22' },
    { bg: '#E7E7DF', bg2: '#CFCFC4', ink: '#1A1C1E', a1: '#1F3A5F', a2: '#9A2B2B', money: '#5A5430', up: '#3E6B4E', down: '#9A2B2B' },
    { bg: '#E9E6D0', bg2: '#CFCBA9', ink: '#20231A', a1: '#5A6B2E', a2: '#98432B', money: '#6B5A2E', up: '#5A6B2E', down: '#98432B' },
    { bg: '#F0E6E0', bg2: '#DCC7BD', ink: '#241A18', a1: '#C0392B', a2: '#34495E', money: '#6B5A2E', up: '#4A6B3E', down: '#C0392B' },
  ],
  editorial_magazine: [
    { bg: '#FAF8F3', ink: '#14110E', a1: '#E5392F', a2: '#1A1A1A', money: '#B8860B', up: '#0E7C5A', down: '#E5392F' },
    { bg: '#FBFBFD', ink: '#111317', a1: '#1A56DB', a2: '#E5392F', money: '#B8860B', up: '#0E7C5A', down: '#E5392F' },
    { bg: '#F7F6F0', ink: '#16140F', a1: '#0E7C5A', a2: '#C2410C', money: '#B8860B', up: '#0E7C5A', down: '#C2410C' },
    { bg: '#FAF7FA', ink: '#1A1320', a1: '#7C3AED', a2: '#E11D48', money: '#B8860B', up: '#0E7C5A', down: '#E11D48' },
    { bg: '#F6F3EC', ink: '#141414', a1: '#111111', a2: '#C0392B', money: '#8A6D1B', up: '#2E7D52', down: '#C0392B' },
  ],
  chalkboard: [
    { bg: '#1E2B24', ink: '#F1EEE3', a1: '#FFE08A', a2: '#8FD0C9', money: '#FFE08A', up: '#9BD1A0', down: '#FF8A7A' },
    { bg: '#232830', ink: '#EFF1F2', a1: '#FFD27A', a2: '#7FB3D5', money: '#FFD27A', up: '#8FD0A0', down: '#FF8A7A' },
    { bg: '#232323', ink: '#F0EDE6', a1: '#F7A072', a2: '#9BD1C0', money: '#F7D08A', up: '#9BD1C0', down: '#FF8A7A' },
    { bg: '#1A2333', ink: '#EAF0F5', a1: '#FFD93D', a2: '#6FCF97', money: '#FFD93D', up: '#6FCF97', down: '#FF8A7A' },
    { bg: '#2A2320', ink: '#F2EAD9', a1: '#E8B04B', a2: '#88C0A6', money: '#E8B04B', up: '#88C0A6', down: '#FF8A7A' },
  ],
};

// Per-archetype font pools (all real Google Fonts; a missing one falls back gracefully — see
// renderer/src/fonts.ts). display = the headline personality; body = prose; mono = labels/eyebrows.
interface FontPool { display: string[]; body: string[]; mono: string[]; }
const FONT_POOLS: Record<ArchetypeId, FontPool> = {
  blueprint_board: {
    display: ['Bebas Neue', 'Anton', 'Oswald', 'Teko', 'Archivo Narrow'],
    body: ['Syne', 'Inter', 'Rajdhani', 'Chakra Petch', 'Saira'],
    mono: ['IBM Plex Mono', 'Space Mono', 'JetBrains Mono', 'Share Tech Mono'],
  },
  flat_motion_explainer: {
    display: ['Archivo Black', 'Montserrat', 'Sora', 'Outfit', 'Fredoka'],
    body: ['Poppins', 'Inter', 'Nunito Sans', 'Mulish', 'Work Sans'],
    mono: ['Space Mono', 'JetBrains Mono', 'IBM Plex Mono'],
  },
  documentary_slate: {
    display: ['Playfair Display', 'Cormorant Garamond', 'Libre Baskerville', 'DM Serif Display', 'EB Garamond'],
    body: ['Spectral', 'EB Garamond', 'Lora', 'Source Serif 4', 'Crimson Text'],
    mono: ['IBM Plex Mono', 'Courier Prime'],
  },
  notebook_sketch: {
    display: ['Caveat', 'Shantell Sans', 'Patrick Hand', 'Gloria Hallelujah', 'Kalam', 'Architects Daughter'],
    body: ['Quicksand', 'Nunito', 'Comic Neue', 'Itim', 'Shantell Sans'],
    mono: ['Space Mono', 'Kalam', 'Cousine'],
  },
  tech_terminal: {
    display: ['Share Tech Mono', 'VT323', 'Major Mono Display', 'JetBrains Mono', 'Red Hat Mono'],
    body: ['IBM Plex Sans', 'Inconsolata', 'Space Grotesk', 'Chakra Petch'],
    mono: ['JetBrains Mono', 'Space Mono', 'IBM Plex Mono', 'Fira Code'],
  },
  vintage_press: {
    display: ['Zilla Slab', 'Anton', 'Oswald', 'Roboto Slab', 'Playfair Display'],
    body: ['Bitter', 'Roboto Slab', 'PT Serif', 'Domine', 'Vollkorn'],
    mono: ['Courier Prime', 'Cutive Mono', 'Special Elite'],
  },
  editorial_magazine: {
    display: ['Fraunces', 'Playfair Display', 'DM Serif Display', 'Cormorant Garamond', 'Bodoni Moda'],
    body: ['Inter', 'Work Sans', 'Manrope', 'Archivo', 'Source Sans 3'],
    mono: ['Space Mono', 'IBM Plex Mono', 'JetBrains Mono'],
  },
  chalkboard: {
    display: ['Architects Daughter', 'Gloria Hallelujah', 'Patrick Hand', 'Caveat', 'Shadows Into Light'],
    body: ['Patrick Hand', 'Quicksand', 'Nunito', 'Shantell Sans'],
    mono: ['Cutive Mono', 'Space Mono', 'Kalam'],
  },
};

// ── seeded RNG (deterministic per channel id) ──
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
const between = (r: number, lo: number, hi: number) => lo + r * (hi - lo);
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const round2 = (v: number) => Math.round(v * 100) / 100;

// ── color helpers ──
function parseHex(hex: string): { r: number; g: number; b: number } | null {
  const m = /^#?([0-9a-fA-F]{6})$/.exec(hex.trim());
  if (!m) return null;
  const h = m[1];
  return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16) };
}
function toHex(r: number, g: number, b: number): string {
  const c = (v: number) => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0');
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
  const hue2rgb = (t: number) => {
    if (t < 0) t += 1; if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return { r: hue2rgb(h + 1 / 3) * 255, g: hue2rgb(h) * 255, b: hue2rgb(h - 1 / 3) * 255 };
}
function rotateHue(hex: string, deg: number): string {
  const c = parseHex(hex);
  if (!c) return hex; // leave rgba()/non-hex values untouched
  const { h, s, l } = rgbToHsl(c.r, c.g, c.b);
  const { r, g, b } = hslToRgb(h + deg, s, l);
  return toHex(r, g, b);
}
// Linear RGB blend of two hex colors (t=0 → a, t=1 → b). Used to derive surface/textSecondary.
function mix(a: string, b: string, t: number): string {
  const ca = parseHex(a), cb = parseHex(b);
  if (!ca || !cb) return a;
  return toHex(ca.r + (cb.r - ca.r) * t, ca.g + (cb.g - ca.g) * t, ca.b + (cb.b - ca.b) * t);
}

// ── coarse fingerprint for the collision guard (intentionally low-resolution) ──
function bucketHex(hex: string): string {
  const c = parseHex(hex);
  if (!c) return hex.toLowerCase();
  const q = (v: number) => Math.round(v / 40) * 40;
  return `${q(c.r)}-${q(c.g)}-${q(c.b)}`;
}
export function fingerprintSpec(spec: ChannelSpec): string {
  return [
    spec.archetype,
    spec.typography.display.toLowerCase(),
    bucketHex(spec.palette.background),
    bucketHex(spec.palette.accent1),
  ].join('|');
}

/** Coarse fingerprints of all OTHER existing channels (those with a channel.spec.json). */
export function loadExistingFingerprints(excludeId?: string): Set<string> {
  const set = new Set<string>();
  const base = path.join(ROOT, 'channels');
  if (!fs.existsSync(base)) return set;
  for (const id of fs.readdirSync(base)) {
    if (id === excludeId) continue;
    const p = path.join(base, id, 'channel.spec.json');
    if (!fs.existsSync(p)) continue;
    try {
      const parsed = ChannelSpecSchema.safeParse(JSON.parse(fs.readFileSync(p, 'utf8')));
      if (parsed.success) set.add(fingerprintSpec(parsed.data));
    } catch { /* ignore unreadable specs */ }
  }
  return set;
}

/** Count existing channels by archetype — used to BALANCE new picks away from saturated looks. */
export function loadArchetypeCounts(excludeId?: string): Record<string, number> {
  const counts: Record<string, number> = {};
  const base = path.join(ROOT, 'channels');
  if (!fs.existsSync(base)) return counts;
  for (const id of fs.readdirSync(base)) {
    if (id === excludeId) continue;
    const p = path.join(base, id, 'channel.spec.json');
    if (!fs.existsSync(p)) continue;
    try {
      const parsed = ChannelSpecSchema.safeParse(JSON.parse(fs.readFileSync(p, 'utf8')));
      if (parsed.success) counts[parsed.data.archetype] = (counts[parsed.data.archetype] ?? 0) + 1;
    } catch { /* ignore */ }
  }
  return counts;
}

// Stamp a seeded, curated skin + font triple over the spec's visual tokens. `skinShift` lets the
// collision guard jump to the next skin. The model's archetype/voice/format are preserved.
function skinned(spec0: ChannelSpec, skinShift: number): ChannelSpec {
  const arch = spec0.archetype;
  const def = ARCHETYPE_DEFAULTS[arch];
  const skins = ARCHETYPE_SKINS[arch];
  const pool = FONT_POOLS[arch];
  const id = spec0.id;

  // Discrete picks (skin + each font) each come from an INDEPENDENT hash of the id, so they spread
  // uniformly and don't correlate with one another. The collision guard advances the skin by one and
  // re-salts the fonts so a near-duplicate escapes on every axis.
  const idxOf = (salt: string, len: number) => seedFromString(`${id}:${salt}`) % len;
  const s = skins[(idxOf('skin', skins.length) + skinShift) % skins.length];

  // Continuous nudges (hue, camera, motion, grain) come from a seeded stream.
  const rng = mulberry32(seedFromString(id + (skinShift ? ':collide' : '')));

  // Seeded micro hue-rotation so two channels that draw the SAME skin still diverge a little.
  const hue = between(rng(), 4, 14) * (rng() < 0.5 ? -1 : 1);
  const a1 = rotateHue(s.a1, hue);
  const a2 = rotateHue(s.a2, hue * 0.6);
  const money = s.money.toLowerCase() === s.a1.toLowerCase() ? a1 : rotateHue(s.money, hue * 0.3);

  const palette = {
    background: s.bg,
    surface: mix(s.bg, s.ink, 0.1),
    textPrimary: s.ink,
    textSecondary: mix(s.ink, s.bg, 0.4),
    accent1: a1,
    accent2: a2,
    money,
    up: s.up,
    down: s.down,
  };

  const typography = {
    ...spec0.typography,
    display: pool.display[idxOf('disp' + skinShift, pool.display.length)],
    body: pool.body[idxOf('body' + skinShift, pool.body.length)],
    mono: pool.mono[idxOf('mono' + skinShift, pool.mono.length)],
    case: def.typography.case,
  };

  const grainBase = s.grain ?? def.background.grain;
  const grain = round2(clamp(grainBase + (grainBase > 0.03 ? between(rng(), -0.04, 0.04) : 0), 0, 1));
  const background = { mode: def.background.mode, color: s.bg, color2: s.bg2 ?? def.background.color2, grain };

  // Asset style follows the archetype; ink = the skin's text colour so generated SVGs stay legible
  // on this paper (the contrast guard reads assetRules.ink / assetStyle.strokeColor).
  const assetStyle = { ...spec0.assetStyle, style: def.assetStyle, strokeColor: s.ink, fillColor: spec0.assetStyle.fillColor ?? a1 };
  const assetRules = { ...spec0.assetRules, ink: s.ink };

  const cam = def.camera;
  const cameraProfile = {
    movement: cam.movement,
    pushZoom: round2(clamp(cam.pushZoom + between(rng(), -0.02, 0.02), 0.8, 1)),
    maxTravel: round2(clamp(cam.maxTravel + between(rng(), -0.3, 0.4), 0.4, 4)),
    minDwell: round2(clamp(cam.minDwell + between(rng(), -0.12, 0.15), 0.2, 2)),
    easing: cam.easing,
  };
  const mot = def.motion;
  const motionProfile = {
    entrance: mot.entrance,
    fillerDensity: mot.fillerDensity,
    bobAmp: round2(clamp(mot.bobAmp + between(rng(), -0.2, 0.2), 0, 2)),
  };

  return { ...spec0, palette, typography, background, assetStyle, assetRules, cameraProfile, motionProfile };
}

/**
 * Apply the deterministic per-channel skin. Pass `existing` (other channels' fingerprints) to enable
 * the collision guard; omit it to scan the channels dir automatically.
 */
export function applyDistinctness(spec0: ChannelSpec, existing?: Set<string>): ChannelSpec {
  const fps = existing ?? loadExistingFingerprints(spec0.id);
  let spec = skinned(spec0, 0);
  if (fps.has(fingerprintSpec(spec))) {
    // Near-identical to an existing channel — jump to the next skin + re-salt fonts, then accept.
    spec = skinned(spec0, 1);
  }
  // Re-validate so the output is always a clean, in-range ChannelSpec.
  return ChannelSpecSchema.parse(spec);
}
