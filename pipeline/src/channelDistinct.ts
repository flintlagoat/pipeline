import * as fs from 'fs';
import * as path from 'path';
import { ChannelSpec, ChannelSpecSchema, ArchetypeId } from './types/channelSpec';

// ── Per-channel distinctness pass ────────────────────────────────────────────────────────────
// Channel generation is already fresh per channel, but two channels in the SAME niche/archetype
// can converge on a near-identical look — and YouTube's "inauthentic content" policy targets
// content that's "easily replicable at scale / a template with little variation." So we add a
// DETERMINISTIC, seeded signature (seeded off the channel id) to the most visible brand tokens
// (accent hues + motion/grain feel), plus a LOW-SENSITIVITY collision guard: only when a freshly
// generated channel is near-identical (same archetype + display font + coarse bg/accent buckets)
// to an EXISTING channel do we re-roll harder (bigger hue shift + a display-font swap). Per the
// operator: it's fine if two channels look similar — fresh generation already spreads 200 apart;
// we only catch true near-duplicates.

const ROOT = path.resolve(__dirname, '..', '..');

// Alternate display fonts per archetype (all real Google Fonts) — used only by the collision re-roll.
const DISPLAY_FONT_POOL: Record<ArchetypeId, string[]> = {
  blueprint_board: ['Bebas Neue', 'Anton', 'Oswald', 'Teko', 'Archivo Narrow'],
  flat_motion_explainer: ['Archivo Black', 'Poppins', 'Montserrat', 'Sora', 'Outfit'],
  documentary_slate: ['Playfair Display', 'Spectral', 'Cormorant Garamond', 'Libre Baskerville', 'DM Serif Display'],
  notebook_sketch: ['Caveat', 'Shantell Sans', 'Patrick Hand', 'Gloria Hallelujah', 'Kalam'],
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

// ── color helpers (hue-rotate accents while preserving saturation/lightness) ──
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

function nudge(spec: ChannelSpec, rng: () => number, strong: boolean): ChannelSpec {
  const hue = between(rng(), strong ? 20 : 6, strong ? 42 : 16) * (rng() < 0.5 ? -1 : 1);

  const palette = {
    ...spec.palette,
    accent1: rotateHue(spec.palette.accent1, hue),
    accent2: rotateHue(spec.palette.accent2, hue * 0.6),
  };

  const cam = spec.cameraProfile;
  const cameraProfile = {
    ...cam,
    pushZoom: round2(clamp(cam.pushZoom + between(rng(), -0.02, 0.02), 0.8, 1)),
    maxTravel: round2(clamp(cam.maxTravel + between(rng(), -0.3, 0.3), 0.4, 4)),
    minDwell: round2(clamp(cam.minDwell + between(rng(), -0.12, 0.12), 0.2, 2)),
  };

  const mot = spec.motionProfile;
  const motionProfile = { ...mot, bobAmp: round2(clamp(mot.bobAmp + between(rng(), -0.2, 0.2), 0, 2)) };

  // Only nudge grain on archetypes that actually use it (never add grain to a clean flat look).
  let background = spec.background;
  if (spec.background.grain > 0.05) {
    background = { ...spec.background, grain: round2(clamp(spec.background.grain + between(rng(), -0.05, 0.05), 0, 1)) };
  }

  // Font swap only on the strong (collision) re-roll — otherwise keep the model's deliberate choice.
  let typography = spec.typography;
  if (strong) {
    const pool = DISPLAY_FONT_POOL[spec.archetype].filter(
      (f) => f.toLowerCase() !== spec.typography.display.toLowerCase()
    );
    if (pool.length) typography = { ...spec.typography, display: pool[Math.floor(rng() * pool.length)] };
  }

  return { ...spec, palette, cameraProfile, motionProfile, background, typography };
}

/**
 * Apply the deterministic per-channel signature. Pass `existing` (other channels' fingerprints) to
 * enable the low-sensitivity collision guard; omit it to scan the channels dir automatically.
 */
export function applyDistinctness(spec0: ChannelSpec, existing?: Set<string>): ChannelSpec {
  const fps = existing ?? loadExistingFingerprints(spec0.id);
  let spec = nudge(spec0, mulberry32(seedFromString(spec0.id)), false);
  if (fps.has(fingerprintSpec(spec))) {
    // Near-identical to an existing channel — re-roll harder, ONE pass, then accept regardless.
    spec = nudge(spec0, mulberry32(seedFromString(spec0.id + ':collide')), true);
  }
  // Re-validate so the output is always a clean, in-range ChannelSpec.
  return ChannelSpecSchema.parse(spec);
}
