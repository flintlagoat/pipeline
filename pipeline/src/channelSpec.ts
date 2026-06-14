import * as fs from 'fs';
import * as path from 'path';
import {
  ChannelSpec, ChannelSpecSchema, RenderProfile, ArchetypeId,
} from './types/channelSpec';
import { ChannelConfig } from './types/specTypes';

const ROOT = path.resolve(__dirname, '..', '..');
const channelDir = (id: string) => path.join(ROOT, 'channels', id);
const specPath = (id: string) => path.join(channelDir(id), 'channel.spec.json');
const configPath = (id: string) => path.join(channelDir(id), 'config.json');

function hexTriple(hex: string): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16) || 0;
  const g = parseInt(h.slice(2, 4), 16) || 0;
  const b = parseInt(h.slice(4, 6), 16) || 0;
  return `${r},${g},${b}`;
}

// ── Archetype seed defaults (mirror renderer/src/style.ts so a generated channel that picks an
// archetype renders in that archetype's voice). The generator starts from these and customizes. ──
interface ArchetypeDefaults {
  fillerEnabled: boolean;
  fillerGrid: boolean;
  gridColor: string;
  palette: ChannelSpec['palette'];
  typography: Pick<ChannelSpec['typography'], 'display' | 'body' | 'mono' | 'case'>;
  assetStyle: ChannelSpec['assetStyle']['style'];
  background: Pick<ChannelSpec['background'], 'mode' | 'color' | 'color2' | 'grain'>;
  camera: ChannelSpec['cameraProfile'];
  motion: ChannelSpec['motionProfile'];
}

export const ARCHETYPE_DEFAULTS: Record<ArchetypeId, ArchetypeDefaults> = {
  blueprint_board: {
    fillerEnabled: true, fillerGrid: true, gridColor: '130,160,200',
    palette: { background: '#08090f', surface: '#10131c', textPrimary: '#FFFFFF', textSecondary: 'rgba(255,255,255,0.75)', accent1: '#FFE500', accent2: '#00D8FF', money: '#FFE500', up: '#00D8FF', down: '#FF3B30' },
    typography: { display: 'Bebas Neue', body: 'Syne', mono: 'IBM Plex Mono', case: 'upper' },
    assetStyle: 'blueprint-wireframe',
    background: { mode: 'board_grid', color: '#08090f', grain: 0.45 },
    camera: { movement: 'cinematic', pushZoom: 0.93, maxTravel: 2.0, minDwell: 0.7, easing: 'cinematic' },
    motion: { bobAmp: 1.0, entrance: 'fade_up', fillerDensity: 'low' },
  },
  flat_motion_explainer: {
    fillerEnabled: false, fillerGrid: false, gridColor: '255,255,255',
    palette: { background: '#1B1F3B', surface: '#272C54', textPrimary: '#FFFFFF', textSecondary: '#B9C0E8', accent1: '#FFD166', accent2: '#06D6A0', money: '#FFD166', up: '#06D6A0', down: '#EF476F' },
    typography: { display: 'Archivo Black', body: 'Poppins', mono: 'Space Mono', case: 'none' },
    assetStyle: 'flat-filled',
    background: { mode: 'flat', color: '#1B1F3B', grain: 0 },
    camera: { movement: 'minimal', pushZoom: 1.0, maxTravel: 0.9, minDwell: 0.5, easing: 'ease_in_out' },
    motion: { bobAmp: 0.5, entrance: 'scale_in', fillerDensity: 'none' },
  },
  documentary_slate: {
    fillerEnabled: false, fillerGrid: false, gridColor: '200,200,200',
    palette: { background: '#0E0E10', surface: '#1C1C22', textPrimary: '#F2EFE6', textSecondary: '#A9A399', accent1: '#C6A05A', accent2: '#8FB6C9', money: '#C6A05A', up: '#8FB6C9', down: '#B5544A' },
    typography: { display: 'Playfair Display', body: 'Spectral', mono: 'IBM Plex Mono', case: 'title' },
    assetStyle: 'line-illustration',
    background: { mode: 'gradient', color: '#0E0E10', color2: '#1C1C22', grain: 0.22 },
    camera: { movement: 'cinematic', pushZoom: 0.9, maxTravel: 2.6, minDwell: 1.0, easing: 'cinematic' },
    motion: { bobAmp: 0.35, entrance: 'blur_in', fillerDensity: 'none' },
  },
  notebook_sketch: {
    fillerEnabled: false, fillerGrid: false, gridColor: '120,100,70',
    palette: { background: '#F4ECD8', surface: '#EAE0C6', textPrimary: '#2B2A26', textSecondary: '#6B6760', accent1: '#3C5A96', accent2: '#C0492F', money: '#2E7D52', up: '#2E7D52', down: '#C0492F' },
    typography: { display: 'Caveat', body: 'Shantell Sans', mono: 'Kalam', case: 'none' },
    assetStyle: 'hand-drawn',
    background: { mode: 'dotted', color: '#F4ECD8', color2: '#C9BFA3', grain: 0.12 },
    camera: { movement: 'gentle', pushZoom: 0.95, maxTravel: 1.4, minDwell: 0.6, easing: 'ease_in_out' },
    motion: { bobAmp: 1.3, entrance: 'draw_on', fillerDensity: 'low' },
  },
};

// ── Adapters ───────────────────────────────────────────────────────────────────

/** The render-profile (style tokens) embedded into board_spec.json for the renderer. */
export function toRenderProfile(spec: ChannelSpec): RenderProfile {
  const a = ARCHETYPE_DEFAULTS[spec.archetype];
  return {
    background: { mode: spec.background.mode, color: spec.background.color, color2: spec.background.color2 },
    grain: spec.background.grain,
    filler: {
      enabled: a.fillerEnabled && spec.motionProfile.fillerDensity !== 'none',
      grid: a.fillerGrid && spec.motionProfile.fillerDensity !== 'none',
      gridColor: a.gridColor,
      gridAlpha: spec.motionProfile.fillerDensity === 'high' ? 0.11 : spec.motionProfile.fillerDensity === 'medium' ? 0.09 : 0.07,
      accentColor: hexTriple(spec.palette.accent2),
    },
    fonts: { display: spec.typography.display, body: spec.typography.body, mono: spec.typography.mono },
    camera: {
      pushZoom: spec.cameraProfile.pushZoom,
      maxTravel: spec.cameraProfile.maxTravel,
      minDwell: spec.cameraProfile.minDwell,
      travelEasing: spec.cameraProfile.easing,
    },
    motion: { bobAmp: spec.motionProfile.bobAmp },
  };
}

/** Legacy ChannelConfig the existing spec/script/audio code consumes. */
export function toChannelConfig(spec: ChannelSpec): ChannelConfig {
  return {
    channel_id: spec.id,
    niche: spec.niche,
    voice_guide: {
      tone: spec.scriptStyle.tone,
      sentence_style: spec.scriptStyle.sentenceStyle,
      forbidden_phrases: spec.scriptStyle.forbiddenPhrases,
      hook_formula: spec.scriptStyle.hookStyle,
    },
    design_system: {
      background_color: spec.palette.background,
      text_primary: spec.palette.textPrimary,
      text_secondary: spec.palette.textSecondary,
      accent_1: spec.palette.accent1,
      accent_2: spec.palette.down,     // "red/loss" accent slot in the board prompt
      accent_3: spec.palette.accent2,  // "cyan/secondary" accent slot
      font_display: spec.typography.display,
      font_mono: spec.typography.mono,
      font_body: spec.typography.body,
      asset_style: spec.assetStyle.style,
      grain_intensity: spec.background.grain,
    },
    svg_asset_library: loadAssetLibrary(spec.id),
    combo_rules: spec.comboRules,
    audio: {
      sfx: { enabled: true, intensity: spec.audioIdentity.sfxIntensity },
      music: { enabled: spec.audioIdentity.musicMoods.length > 0, track: null },
    },
  };
}

function loadAssetLibrary(id: string): string[] {
  const dir = path.join(channelDir(id), 'assets', 'svg');
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => f.endsWith('.svg') && !/__\d+\.svg$/.test(f)).map((f) => f.replace(/\.svg$/, ''));
}

// ── Load / save ──────────────────────────────────────────────────────────────

/** Load a channel's ChannelSpec. If channel.spec.json is missing, synthesize a blueprint_board
 *  spec from the legacy config.json so existing channels keep working unchanged. */
export function loadChannelSpec(channelId: string): ChannelSpec {
  const p = specPath(channelId);
  if (fs.existsSync(p)) {
    return ChannelSpecSchema.parse(JSON.parse(fs.readFileSync(p, 'utf8')));
  }
  // Synthesize from legacy config.json (regression path for channels created before PART 1).
  const cfgP = configPath(channelId);
  if (!fs.existsSync(cfgP)) throw new Error(`No channel.spec.json or config.json for "${channelId}"`);
  const cfg = JSON.parse(fs.readFileSync(cfgP, 'utf8')) as ChannelConfig;
  return synthesizeBlueprintSpec(channelId, cfg);
}

export function channelSpecExists(channelId: string): boolean {
  return fs.existsSync(specPath(channelId));
}

/** Save a ChannelSpec → channel.spec.json + a derived config.json + asset dirs. */
export function saveChannelSpec(spec: ChannelSpec): void {
  const dir = channelDir(spec.id);
  fs.mkdirSync(path.join(dir, 'assets', 'svg'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'assets', 'png'), { recursive: true });
  fs.writeFileSync(specPath(spec.id), JSON.stringify(spec, null, 2), 'utf8');
  fs.writeFileSync(configPath(spec.id), JSON.stringify(toChannelConfig(spec), null, 2), 'utf8');
}

function synthesizeBlueprintSpec(channelId: string, cfg: ChannelConfig): ChannelSpec {
  const a = ARCHETYPE_DEFAULTS.blueprint_board;
  const ds = cfg.design_system;
  return ChannelSpecSchema.parse({
    id: channelId,
    title: channelId,
    description: cfg.niche,
    niche: cfg.niche,
    archetype: 'blueprint_board',
    palette: {
      ...a.palette,
      background: ds.background_color, accent1: ds.accent_1, accent2: ds.accent_3, down: ds.accent_2,
      money: ds.accent_1, up: ds.accent_3,
    },
    typography: { display: ds.font_display, body: ds.font_body, mono: ds.font_mono, case: 'upper', letterSpacing: 0 },
    layout: { density: 'normal', alignment: 'left' },
    assetStyle: { style: 'blueprint-wireframe', stroke: 2, fill: 'none', strokeColor: '#FFFFFF' },
    cameraProfile: a.camera,
    motionProfile: a.motion,
    background: { mode: 'board_grid', color: ds.background_color, grain: ds.grain_intensity },
    audioIdentity: { voice: '', musicMoods: ['curious', 'tense', 'uplifting', 'reflective', 'neutral'], sfxPack: 'default', sfxIntensity: 1 },
    scriptStyle: {
      tone: cfg.voice_guide.tone, sentenceStyle: cfg.voice_guide.sentence_style,
      hookStyle: cfg.voice_guide.hook_formula, pacing: 'measured', vocabulary: 'plain, concrete',
      episodeArchetype: 'explainer', forbiddenPhrases: cfg.voice_guide.forbidden_phrases,
    },
    format: { minutes: 2, sectionPattern: ['hook', 'comparison', 'diagram', 'revelation', 'conclusion'], recurringSegments: [] },
    comboRules: cfg.combo_rules ?? [],
  });
}
