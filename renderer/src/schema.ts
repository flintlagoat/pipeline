import type { Image } from '@napi-rs/canvas';

export interface BoardSpec {
  video_id: string;
  channel_id: string;
  format: 'landscape_16x9' | 'portrait_9x16';
  duration_seconds: number;
  fps: number;
  audio_file: string;
  asset_needs: string[];
  board: Board;
  // Per-channel render profile (style tokens). Embedded by the pipeline from the channel's
  // ChannelSpec. Absent ⇒ the renderer falls back to the blueprint_board preset, so old specs
  // and the test fixture render exactly as before (regression-safe). See style.ts.
  style?: RenderProfile;
}

// ── Render profile (style tokens the RENDERER consumes) ────────────────────────
export type BackgroundMode = 'flat' | 'board_grid' | 'paper' | 'gradient' | 'dotted';

export interface RenderProfile {
  background: {
    mode: BackgroundMode;
    color: string;       // base fill
    color2?: string;     // gradient end / paper tint / dot color
  };
  grain: number;         // film-grain opacity 0..1 (0 = off)
  filler: {
    enabled: boolean;          // blueprint registration brackets + measurement ticks
    grid: boolean;             // faint board grid lines
    gridColor: string;         // "r,g,b"
    gridAlpha: number;
    accentColor: string;       // "r,g,b" for brackets/ticks
  };
  fonts: {
    display: string;     // family name registered by fonts.ts
    body: string;
    mono: string;
  };
  camera: {
    pushZoom: number;    // intra-scene push-in target (1 = no push, 0.9 = strong push)
    maxTravel: number;   // longest section→section glide (s)
    minDwell: number;    // hold after entrances before leaving (s)
    travelEasing: 'cinematic' | 'ease_in_out' | 'snap';
  };
  motion: {
    bobAmp: number;      // multiplier on idle asset float (0 = perfectly still)
  };
}

export interface Board {
  width: number;
  height: number;
  background_color: string;
  sections: Section[];
  camera_keyframes: CameraKeyframe[];
}

export interface Section {
  id: string;
  section_type: 'hook' | 'comparison' | 'diagram' | 'revelation' | 'list_reveal' | 'flow_chart' | 'conclusion';
  x_offset: number;
  y_offset: number;
  width: number;
  height: number;
  elements: Element[];
}

export interface Element {
  id: string;
  type: ElementType;
  reveal_at_seconds: number;
  reveal_type: RevealType;
  // Voice-sync (session 7): how long the reveal takes. For type_on this is the typing span
  // (characters appear across this window, ideally matched to how long the narrator spends on
  // the line); for other reveals it stretches/shortens the fade/scale. Absent ⇒ ANIM_DURATION.
  reveal_duration_seconds?: number;
  // Emphasis (session 7): words within `content` to render in `emphasis_color` (or the element
  // color brightened) — the channel's "bold colored word reveal" look. Case-insensitive match.
  emphasis_words?: string[];
  emphasis_color?: string;
  // Region-aware wrap (session 7 fix): max characters per wrapped line for body_text. The relayout
  // pass sets this from the element's text-region width so body copy wraps to fit its column instead
  // of a fixed 52 chars — prevents wrapped overflow colliding with the element below / running off
  // the frame edge in right-shifted regions. Absent ⇒ legacy 52.
  wrap_chars?: number;
  x: number;
  y: number;
  content?: string;
  lines?: string[];
  font_size?: number;
  color?: string;
  font_family?: 'display' | 'mono' | 'body';
  letter_spacing?: number;
  x2?: number;
  y2?: number;
  stroke_color?: string;
  stroke_width?: number;
  dashed?: boolean;
  width?: number;
  height?: number;
  radius?: number;
  border_radius?: number;
  asset_name?: string;
  asset_width?: number;
  asset_height?: number;
  anim_action?: string;   // if set, the asset-gen produces a multi-frame animation of this action
  anim_frames?: number;   // number of frames to generate (default 4)
  item_delay_seconds?: number;
  target_element_id?: string;
}

export type ElementType =
  | 'headline'
  | 'eyebrow'
  | 'body_text'
  | 'rule_line'
  | 'connector_arrow'
  | 'node_box'
  | 'node_circle'
  | 'png_asset'
  | 'svg_asset'
  | 'label_tag'
  | 'thought_bubble'
  | 'list_reveal'
  | 'highlight_box'
  | 'blur_reveal';

export type RevealType =
  | 'fade_up'
  | 'draw_on'
  | 'scale_in'
  | 'blur_in'
  | 'type_on'
  | 'count_up'
  | 'instant'
  | 'fade_only';

// Internal camera-path easings. The first three are the spec-level set (what the LLM may emit);
// the rest are added by buildCameraPath for per-transition VARIETY (FIX 3) — snappier finishes,
// an overshoot-and-settle, and a slow drift. getCameraAtTime's ease() handles them all.
export type CameraEasing = 'ease_in_out' | 'cinematic' | 'snap' | 'ease_out' | 'overshoot' | 'drift' | 'idle';

export interface CameraKeyframe {
  time_seconds: number;
  viewport_x: number;
  viewport_y: number;
  viewport_width: number;
  viewport_height: number;
  easing: CameraEasing;
}

export interface CameraState {
  viewport_x: number;
  viewport_y: number;
  viewport_width: number;
  viewport_height: number;
}

// ── Render settings (output dimensions + encode knobs for one render) ───────────
// Derived once per render (computeSettings in renderSetup.ts). The same settings are
// shared with every worker so all frames are produced identically. `--draft` lowers
// resolution/fps and disables grain for fast iteration; full renders are unchanged.
export interface RenderSettings {
  outputWidth: number;   // canvas/frame width  (1920 full, 960 draft landscape)
  outputHeight: number;  // canvas/frame height (1080 full, 540 draft landscape)
  fps: number;           // sample rate of the timeline (30 full, 15 draft)
  grain: boolean;        // composite the film-grain overlay (false in draft)
  crf: number;           // x264 quality (18 full, higher = smaller/faster draft)
}

// Per-render drawing context shared by every frame (and every worker thread). Canvases
// and Images cannot cross worker boundaries, so each worker builds its OWN context from
// the same spec — see renderSetup.prepareContext.
export interface RendererContext {
  grainImage: Image | null;        // pre-generated static grain overlay (null when grain off)
  svgAssets: Map<string, Image[]>; // each asset is a frame array (1 = static, >1 = animated)
  pngAssets: Map<string, Image>;
  profile: RenderProfile;          // resolved channel style tokens (style.ts)
  settings: RenderSettings;        // output dims / fps / grain / crf for this render
}
