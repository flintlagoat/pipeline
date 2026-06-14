// Board spec schema types — duplicated from renderer/src/schema.ts for package independence.
// Keep in sync with renderer/src/schema.ts. Do not change without updating both.

export interface BoardSpec {
  video_id: string;
  channel_id: string;
  format: 'landscape_16x9' | 'portrait_9x16';
  duration_seconds: number;
  fps: 30;
  audio_file: string;
  asset_needs: string[];
  board: Board;
  style?: import('./channelSpec').RenderProfile;  // per-channel render tokens for the renderer
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
  reveal_duration_seconds?: number;  // voice-sync (s7): reveal/typing span; absent ⇒ default 0.55s
  emphasis_words?: string[];         // words in `content` to color with emphasis_color
  emphasis_color?: string;
  wrap_chars?: number;               // region-aware body_text wrap width (s7 fix); set by relayout
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
  | 'headline' | 'eyebrow' | 'body_text'
  | 'rule_line' | 'connector_arrow'
  | 'node_box' | 'node_circle'
  | 'png_asset' | 'svg_asset'
  | 'label_tag' | 'thought_bubble'
  | 'list_reveal' | 'highlight_box' | 'blur_reveal';

export type RevealType =
  | 'fade_up' | 'draw_on' | 'scale_in' | 'blur_in'
  | 'type_on' | 'count_up' | 'instant' | 'fade_only';

export interface CameraKeyframe {
  time_seconds: number;
  viewport_x: number;
  viewport_y: number;
  viewport_width: number;
  viewport_height: number;
  easing: 'ease_in_out' | 'cinematic' | 'snap';
}

// Pipeline-specific types

export interface WordTimestamp {
  word: string;
  start: number;
  end: number;
}

// A paired-noun / combo rule (generic, per-channel). When a section's text mentions one of
// `keywords` and the spec drew `primary` but not `partner`, the deterministic safety net
// swaps `primary` for the pre-drawn `combo` asset that shows both. Lives in channel config so
// the CODE stays topic-agnostic — no channel hardcodes a fixed list of nouns.
export interface ComboRule {
  primary: string;
  partner: string;
  combo: string;
  keywords: string[];
}

export interface ChannelConfig {
  channel_id: string;
  niche: string;
  voice_guide: {
    tone: string;
    sentence_style: string;
    forbidden_phrases: string[];
    hook_formula: string;
  };
  design_system: {
    background_color: string;
    text_primary?: string;     // main text color (light on dark bg, or dark on light bg)
    text_secondary?: string;   // muted/secondary text color
    accent_1: string;
    accent_2: string;
    accent_3: string;
    font_display: string;
    font_mono: string;
    font_body: string;
    asset_style: string;
    grain_intensity: number;
  };
  svg_asset_library: string[];
  combo_rules?: ComboRule[];   // optional; absent ⇒ combo safety net is a no-op
  audio?: AudioConfig;         // optional; see audio/audioConfig.ts for defaults
}

// ── Audio config (Phase 3 engine, PART C). All optional; merged over defaults. ──
export interface AudioSfxConfig {
  enabled?: boolean;
  intensity?: number;          // 0..1 scales how many cues fire (0 = none, 1 = full)
  max_cues?: number;
  min_spacing_seconds?: number;
  big_money_min?: number;      // dollars; money cue only fires at/above this
}
export interface AudioMusicConfig {
  enabled?: boolean;
  track?: string | null;       // chosen bed filename/stem, "none"/null = no music
  volume?: number;             // bed level under narration
  duck?: boolean;              // sidechain-duck the bed under narration
}
export interface AudioConfig {
  sfx?: AudioSfxConfig;
  music?: AudioMusicConfig;
}

export interface StructuralAnalysis {
  overall_structure: string;
  estimated_duration: number;
  sections: Array<{
    id: string;
    start_time: number;
    end_time: number;
    title: string;
    content_summary: string;
  }>;
  key_beats: Array<{
    time: number;
    description: string;
    type: string;
  }>;
  asset_suggestions: string[];
}
