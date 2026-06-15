import { spawnSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { ChannelSpec } from './types/channelSpec';
import { BoardSpec, Element, Section } from './types/specTypes';
import { toRenderProfile } from './channelSpec';

const ROOT = path.resolve(__dirname, '..', '..');

// Build a synthetic, API-FREE board spec that exercises a channel's STYLE tokens (palette,
// typography, background, grain, camera, motion, reveals) using drawn primitives only — no
// svg_asset, so no asset-gen / Opus / Whisper / audio is involved. It is a faithful "vibe" preview:
// the colours, fonts, background, grain, reveal feel and camera personality are exactly what real
// videos use. (Generated asset ARTWORK additionally follows the channel's assetStyle; that shows
// once a real video renders — the preview deliberately stays instant + free.)
export function buildPreviewSpec(spec: ChannelSpec): BoardSpec {
  const p = spec.palette;
  const niche = (spec.niche || spec.title || 'how it works').trim();
  const W = 1920;
  const H = 1080;

  // All content sits inside a centred safe band (x 300..1620, y 190..860) so the channel's camera
  // push/idle-drift never crops it in the still preview. Left column = the "hook"; right column = a
  // small drawn schematic (nodes + arrow + tag) showing structure in the palette.
  const elements: Element[] = [
    // Invisible (background-coloured) anchors define a PADDED "art frame" region the camera frames.
    // Real content (x 305..1490, y 215..770) sits inside this region with margin on every side, so
    // the channel's camera push/idle only ever eats the empty margin — never the content — while the
    // composition stays padded/centred (not full-bleed) across all channels/seeds.
    { id: '_a_tl', type: 'rule_line', reveal_at_seconds: 0, reveal_type: 'instant', x: 180, y: 130, x2: 182, y2: 132, stroke_color: p.background, stroke_width: 1 },
    { id: '_a_br', type: 'rule_line', reveal_at_seconds: 0, reveal_type: 'instant', x: 1740, y: 950, x2: 1742, y2: 952, stroke_color: p.background, stroke_width: 1 },
    { id: 'eyebrow', type: 'eyebrow', reveal_at_seconds: 0.0, reveal_type: 'fade_up', x: 305, y: 215, content: niche.toUpperCase().slice(0, 24), font_size: 28, color: p.accent2, font_family: 'mono', letter_spacing: 4 },
    // font_size kept modest + copy short so even WIDE serif/slab display fonts stay left of the
    // right-hand schematic column (x≈1170) — the preview board is a fixed layout shared by every
    // archetype, from condensed Bebas to wide Fraunces.
    { id: 'headline', type: 'headline', reveal_at_seconds: 0.3, reveal_type: 'type_on', reveal_duration_seconds: 1.1, x: 305, y: 300, content: 'The part nobody sees', font_size: 64, color: p.textPrimary, font_family: 'display', emphasis_words: ['nobody'], emphasis_color: p.accent1 },
    { id: 'bignum', type: 'headline', reveal_at_seconds: 1.0, reveal_type: 'count_up', x: 305, y: 470, content: '$3,000', font_size: 116, color: p.money, font_family: 'display' },
    { id: 'rule', type: 'rule_line', reveal_at_seconds: 1.3, reveal_type: 'draw_on', x: 308, y: 600, x2: 760, y2: 600, stroke_color: p.accent1, stroke_width: 3 },
    { id: 'body', type: 'body_text', reveal_at_seconds: 1.6, reveal_type: 'fade_up', x: 308, y: 650, content: 'Every channel gets its own look, voice, and rhythm — built to be watched, not skipped.', font_size: 30, color: p.textSecondary, font_family: 'body', wrap_chars: 32 },
    { id: 'n1', type: 'node_box', reveal_at_seconds: 1.9, reveal_type: 'scale_in', x: 1170, y: 300, width: 300, height: 118, border_radius: 14, stroke_color: p.accent2, stroke_width: 3, content: 'INPUT', color: p.textPrimary, font_family: 'mono', font_size: 28 },
    { id: 'n2', type: 'node_box', reveal_at_seconds: 2.2, reveal_type: 'scale_in', x: 1170, y: 520, width: 300, height: 118, border_radius: 14, stroke_color: p.accent2, stroke_width: 3, content: 'AUTOPILOT', color: p.textPrimary, font_family: 'mono', font_size: 28 },
    { id: 'arrow', type: 'connector_arrow', reveal_at_seconds: 2.5, reveal_type: 'draw_on', x: 1320, y: 428, x2: 1320, y2: 520, stroke_color: p.accent1, stroke_width: 3 },
    { id: 'tag', type: 'label_tag', reveal_at_seconds: 2.7, reveal_type: 'fade_up', x: 1490, y: 572, content: 'output', color: p.accent1, font_family: 'mono', font_size: 24 },
  ];

  const section: Section = {
    id: 'preview',
    section_type: 'hook',
    x_offset: 0,
    y_offset: 0,
    width: W,
    height: H,
    elements,
  };

  // Use the channel's real style, but DAMP the camera so the still preview frames stay fully in
  // frame (push toward 1.0, shorter travel, longer dwell). Real videos use the channel's full
  // camera personality; a cropped still would just read as broken.
  const base = toRenderProfile(spec);
  const style = {
    ...base,
    camera: {
      ...base.camera,
      pushZoom: Math.max(base.camera.pushZoom, 0.985),
      maxTravel: Math.min(base.camera.maxTravel, 0.8),
      minDwell: Math.max(base.camera.minDwell, 1.4),
    },
  };

  return {
    video_id: `preview_${spec.id}`,
    channel_id: spec.id,
    format: 'landscape_16x9',
    duration_seconds: 6,
    fps: 30,
    audio_file: '',
    asset_needs: [],
    board: { width: W, height: H, background_color: p.background, sections: [section], camera_keyframes: [] },
    style,
  };
}

// Render still preview frames for a channel's look. Writes preview.spec.json + preview_N.png into
// outDir and returns the PNG paths. Spawns the renderer's preview entry the same way the
// orchestrator spawns renderVideo (ts-node --transpile-only, cwd=renderer, shell).
export function generateChannelPreview(spec: ChannelSpec, outDir: string, times?: number[]): string[] {
  const resolvedOut = path.resolve(outDir);
  fs.mkdirSync(resolvedOut, { recursive: true });

  const board = buildPreviewSpec(spec);
  const specPath = path.join(resolvedOut, 'preview.spec.json');
  fs.writeFileSync(specPath, JSON.stringify(board, null, 2), 'utf8');

  const rendererDir = path.join(ROOT, 'renderer');
  const args = ['ts-node', '--transpile-only', 'src/preview.ts', `"${specPath}"`, `"${resolvedOut}"`];
  if (times && times.length) args.push(`"${times.join(',')}"`);
  const r = spawnSync('npx', args, { cwd: rendererDir, stdio: 'inherit', shell: true });
  if (r.status !== 0) throw new Error(`channel preview render failed (exit ${r.status})`);

  return fs
    .readdirSync(resolvedOut)
    .filter((f) => /^preview_\d+\.png$/.test(f))
    .sort()
    .map((f) => path.join(resolvedOut, f));
}
