import { z } from 'zod';

// ── ChannelSpec — the per-channel FORMAT SPEC (PART 1) ─────────────────────────
// This is the channel's whole identity: design tokens + voice + format. It is the canonical
// per-channel file (channels/<id>/channel.spec.json). The pipeline derives two things from it:
//   • a legacy ChannelConfig (for the existing spec/script/audio code) — see channelSpec.ts
//   • a RenderProfile embedded into each board_spec.json `style` block (the renderer consumes it)
// Generic across any niche. An archetype seeds the tokens; the generator then customizes them.

export const ARCHETYPE_IDS = [
  'blueprint_board',
  'flat_motion_explainer',
  'documentary_slate',
  'notebook_sketch',
] as const;
export type ArchetypeId = (typeof ARCHETYPE_IDS)[number];

const PaletteSchema = z.object({
  background: z.string(),
  surface: z.string(),
  textPrimary: z.string(),
  textSecondary: z.string(),
  accent1: z.string(),
  accent2: z.string(),
  money: z.string(),   // semantic: money/value
  up: z.string(),      // semantic: gain/positive
  down: z.string(),    // semantic: loss/negative
});

const TypographySchema = z.object({
  display: z.string(),          // Google Fonts family name
  body: z.string(),
  mono: z.string(),
  case: z.enum(['upper', 'title', 'none']).default('none'),
  letterSpacing: z.number().default(0),
});

const LayoutSchema = z.object({
  density: z.enum(['tight', 'normal', 'airy']).default('normal'),
  alignment: z.enum(['left', 'center']).default('left'),
});

const AssetStyleSchema = z.object({
  style: z.enum(['blueprint-wireframe', 'flat-filled', 'line-illustration', 'isometric', 'hand-drawn']),
  stroke: z.number().default(2),         // primary stroke weight
  fill: z.enum(['none', 'flat', 'soft']).default('none'),
  strokeColor: z.string(),               // hex; usually palette text/accent ("ink")
  fillColor: z.string().optional(),      // hex; for fill !== none
});

// Hard rules the asset pipeline enforces so generated SVGs are always VISIBLE on this channel's
// paper. `minContrastRatio` is the WCAG contrast floor every stroke/fill must clear against the
// background; `forbidNearBackground` rejects any color whose luminance sits within a small delta
// of the background (e.g. white on beige). The contrast guard (assetContrast.ts) remaps offenders
// toward `ink`. Defaults are safe for every archetype (white-on-dark clears 3.0 trivially).
const AssetRulesSchema = z.object({
  minContrastRatio: z.number().min(1).max(21).default(3.0),
  forbidNearBackground: z.boolean().default(true),
  ink: z.string().optional(), // remap target; defaults to assetStyle.strokeColor / palette.textPrimary
});

const CameraProfileSchema = z.object({
  movement: z.enum(['minimal', 'gentle', 'cinematic']).default('gentle'),
  pushZoom: z.number().min(0.8).max(1).default(0.93),
  maxTravel: z.number().min(0.4).max(4).default(2.0),
  minDwell: z.number().min(0.2).max(2).default(0.7),
  easing: z.enum(['ease_in_out', 'cinematic', 'snap']).default('cinematic'),
});

const MotionProfileSchema = z.object({
  bobAmp: z.number().min(0).max(2).default(1),
  entrance: z.enum(['fade_up', 'scale_in', 'blur_in', 'draw_on']).default('fade_up'),
  fillerDensity: z.enum(['none', 'low', 'medium', 'high']).default('low'),
});

const BackgroundSchema = z.object({
  mode: z.enum(['flat', 'board_grid', 'paper', 'gradient', 'dotted']),
  color: z.string(),
  color2: z.string().optional(),
  grain: z.number().min(0).max(1).default(0),
});

const AudioIdentitySchema = z.object({
  voice: z.string().default(''),              // TTS voice id (e.g. Fish S1 reference id)
  musicMoods: z.array(z.string()).default(['neutral']),
  sfxPack: z.string().default('default'),
  sfxIntensity: z.number().min(0).max(1).default(1),
});

const ScriptStyleSchema = z.object({
  tone: z.string(),
  sentenceStyle: z.string(),
  hookStyle: z.string(),
  pacing: z.string().default('measured'),
  vocabulary: z.string().default('plain, concrete'),
  episodeArchetype: z.string().default('explainer'),
  forbiddenPhrases: z.array(z.string()).default([]),
});

const FormatSchema = z.object({
  // Default 8 (session 6): >=8 min unlocks mid-roll ads and carries enough watch time per
  // view for the algorithm to rank the video. See GROWTH_ENGINE.md.
  minutes: z.number().min(0.5).max(60).default(8),
  sectionPattern: z.array(z.string()).default(['hook', 'body', 'body', 'revelation', 'conclusion']),
  recurringSegments: z.array(z.string()).default([]),
});

const ComboRuleSchema = z.object({
  primary: z.string(), partner: z.string(), combo: z.string(), keywords: z.array(z.string()),
});

export const ChannelSpecSchema = z.object({
  id: z.string().regex(/^[a-z0-9_]+$/, 'id must be lowercase letters, numbers, underscores'),
  title: z.string(),
  description: z.string(),
  niche: z.string(),
  archetype: z.enum(ARCHETYPE_IDS),
  palette: PaletteSchema,
  typography: TypographySchema,
  layout: LayoutSchema,
  assetStyle: AssetStyleSchema,
  assetRules: AssetRulesSchema.default({ minContrastRatio: 3.0, forbidNearBackground: true }),
  cameraProfile: CameraProfileSchema,
  motionProfile: MotionProfileSchema,
  background: BackgroundSchema,
  audioIdentity: AudioIdentitySchema,
  scriptStyle: ScriptStyleSchema,
  format: FormatSchema,
  comboRules: z.array(ComboRuleSchema).default([]),
});

export type ChannelSpec = z.infer<typeof ChannelSpecSchema>;

// ── RenderProfile — the subset the RENDERER consumes (mirrors renderer/src/schema.ts) ──
export interface RenderProfile {
  background: { mode: string; color: string; color2?: string };
  grain: number;
  filler: { enabled: boolean; grid: boolean; gridColor: string; gridAlpha: number; accentColor: string };
  fonts: { display: string; body: string; mono: string };
  camera: { pushZoom: number; maxTravel: number; minDwell: number; travelEasing: 'cinematic' | 'ease_in_out' | 'snap' };
  motion: { bobAmp: number };
}
