import { BoardSpec, RenderProfile } from './schema';

// Archetype render presets (the RENDERER's copy — the pipeline has the richer ChannelSpec and
// emits a matching `style` block into each board_spec; this is the renderer-side source of
// truth + fallback). Each archetype differs in palette, typography, background, camera AND
// motion — not just color — so renders are visually unmistakable from one another.

// blueprint_board = the ORIGINAL look. These exact values reproduce the pre-refactor render
// (Bebas/IBM/Syne, grain 0.45, board grid + brackets, gentle cinematic push). Keep in sync
// with the old hardcoded constants so absent-style specs render identically (regression-safe).
export const BLUEPRINT_BOARD: RenderProfile = {
  background: { mode: 'board_grid', color: '#08090f' },
  grain: 0.45,
  filler: { enabled: true, grid: true, gridColor: '130,160,200', gridAlpha: 0.07, accentColor: '0,216,255' },
  fonts: { display: 'Bebas Neue', body: 'Syne', mono: 'IBM Plex Mono' },
  camera: { pushZoom: 0.93, maxTravel: 2.0, minDwell: 0.7, travelEasing: 'cinematic' },
  motion: { bobAmp: 1.0 },
};

// flat_motion_explainer = bright flat fills, bold kinetic type, MINIMAL camera (no push,
// snappy travels), no grain, no blueprint filler. Reads as a modern animated explainer.
export const FLAT_MOTION_EXPLAINER: RenderProfile = {
  background: { mode: 'flat', color: '#1B1F3B' },
  grain: 0,
  filler: { enabled: false, grid: false, gridColor: '255,255,255', gridAlpha: 0.04, accentColor: '255,209,102' },
  fonts: { display: 'Archivo Black', body: 'Poppins', mono: 'Space Mono' },
  camera: { pushZoom: 1.0, maxTravel: 0.9, minDwell: 0.5, travelEasing: 'ease_in_out' },
  motion: { bobAmp: 0.5 },
};

// documentary_slate = muted cinematic, serif display, slow deliberate moves, deep vignette
// background, light grain, no schematic filler. Reads as a prestige documentary.
export const DOCUMENTARY_SLATE: RenderProfile = {
  background: { mode: 'gradient', color: '#0E0E10', color2: '#1C1C22' },
  grain: 0.22,
  filler: { enabled: false, grid: false, gridColor: '200,200,200', gridAlpha: 0.03, accentColor: '198,160,90' },
  fonts: { display: 'Playfair Display', body: 'Spectral', mono: 'IBM Plex Mono' },
  camera: { pushZoom: 0.9, maxTravel: 2.6, minDwell: 1.0, travelEasing: 'cinematic' },
  motion: { bobAmp: 0.35 },
};

// notebook_sketch = warm paper texture, hand-drawn assets, marker-ish type, dotted-grid
// background, gentle bouncy motion. Reads as a hand-illustrated sketch notebook.
export const NOTEBOOK_SKETCH: RenderProfile = {
  background: { mode: 'dotted', color: '#F4ECD8', color2: '#C9BFA3' },
  grain: 0.12,
  filler: { enabled: false, grid: false, gridColor: '120,100,70', gridAlpha: 0.06, accentColor: '60,90,150' },
  fonts: { display: 'Caveat', body: 'Shantell Sans', mono: 'Kalam' },
  camera: { pushZoom: 0.95, maxTravel: 1.4, minDwell: 0.6, travelEasing: 'ease_in_out' },
  motion: { bobAmp: 1.3 },
};

// tech_terminal = near-black flat console, phosphor/amber accents, mono-forward type, light
// scanline grain, no grid. Reads as a hacker/terminal data channel.
export const TECH_TERMINAL: RenderProfile = {
  background: { mode: 'flat', color: '#07100B' },
  grain: 0.28,
  filler: { enabled: false, grid: false, gridColor: '60,255,150', gridAlpha: 0.06, accentColor: '124,255,203' },
  fonts: { display: 'Share Tech Mono', body: 'IBM Plex Sans', mono: 'JetBrains Mono' },
  camera: { pushZoom: 1.0, maxTravel: 0.9, minDwell: 0.5, travelEasing: 'snap' },
  motion: { bobAmp: 0.4 },
};

// vintage_press = aged newsprint paper, heavy print tooth (grain), slab/serif headlines, red+ink
// spot color, typewriter mono. Reads as a printed broadsheet / historical exposé.
export const VINTAGE_PRESS: RenderProfile = {
  background: { mode: 'paper', color: '#ECE3CE', color2: '#D8CBA8' },
  grain: 0.38,
  filler: { enabled: false, grid: false, gridColor: '120,110,90', gridAlpha: 0.05, accentColor: '46,71,86' },
  fonts: { display: 'Zilla Slab', body: 'Bitter', mono: 'Courier Prime' },
  camera: { pushZoom: 0.94, maxTravel: 1.6, minDwell: 0.9, travelEasing: 'ease_in_out' },
  motion: { bobAmp: 0.4 },
};

// editorial_magazine = bright near-white, airy whitespace, high-contrast modern serif display +
// clean grotesk body, ONE vivid accent, no grain/grid. Reads as a polished design magazine.
export const EDITORIAL_MAGAZINE: RenderProfile = {
  background: { mode: 'flat', color: '#FAF8F3' },
  grain: 0,
  filler: { enabled: false, grid: false, gridColor: '180,180,180', gridAlpha: 0.04, accentColor: '26,26,26' },
  fonts: { display: 'Fraunces', body: 'Inter', mono: 'Space Mono' },
  camera: { pushZoom: 0.97, maxTravel: 1.0, minDwell: 0.8, travelEasing: 'ease_in_out' },
  motion: { bobAmp: 0.4 },
};

// chalkboard = dark slate-green board, chalk-white handwriting, pastel chalk accents, chalk-dust
// grain, hand-drawn assets. Reads as a teacher working through it on the board.
export const CHALKBOARD: RenderProfile = {
  background: { mode: 'flat', color: '#1E2B24' },
  grain: 0.3,
  filler: { enabled: false, grid: false, gridColor: '230,230,220', gridAlpha: 0.05, accentColor: '143,208,201' },
  fonts: { display: 'Architects Daughter', body: 'Patrick Hand', mono: 'Cutive Mono' },
  camera: { pushZoom: 0.95, maxTravel: 1.3, minDwell: 0.7, travelEasing: 'ease_in_out' },
  motion: { bobAmp: 1.0 },
};

export const ARCHETYPES: Record<string, RenderProfile> = {
  blueprint_board: BLUEPRINT_BOARD,
  flat_motion_explainer: FLAT_MOTION_EXPLAINER,
  documentary_slate: DOCUMENTARY_SLATE,
  notebook_sketch: NOTEBOOK_SKETCH,
  tech_terminal: TECH_TERMINAL,
  vintage_press: VINTAGE_PRESS,
  editorial_magazine: EDITORIAL_MAGAZINE,
  chalkboard: CHALKBOARD,
};

// Deep-merge a partial profile over the blueprint_board default so a spec's `style` can be
// partial and anything it omits falls back to the original look.
export function resolveStyle(spec: BoardSpec): RenderProfile {
  const s = spec.style;
  const d = BLUEPRINT_BOARD;
  if (!s) return d;
  return {
    background: { ...d.background, ...(s.background ?? {}) },
    grain: typeof s.grain === 'number' ? s.grain : d.grain,
    filler: { ...d.filler, ...(s.filler ?? {}) },
    fonts: { ...d.fonts, ...(s.fonts ?? {}) },
    camera: { ...d.camera, ...(s.camera ?? {}) },
    motion: { ...d.motion, ...(s.motion ?? {}) },
  };
}
