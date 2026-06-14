import * as path from 'path';
import { existsSync } from 'fs';
import type { Image } from '@napi-rs/canvas';
import { BoardSpec, Section } from './schema';
import { getCameraAtTime } from './camera';

export const DEBUG = process.env.DEBUG_RENDER === '1' || process.env.DEBUG_RENDER === 'true';

// How much of the viewport (in canvas px) is NOT covered by any section — i.e. black canvas.
function computeDeadPx(vpL: number, vpR: number, sections: Section[]): number {
  const clipped = sections
    .map((s) => [Math.max(vpL, s.x_offset), Math.min(vpR, s.x_offset + s.width)] as [number, number])
    .filter(([a, b]) => b > a)
    .sort((p, q) => p[0] - q[0]);
  let covered = 0;
  let cursor = -Infinity;
  for (const [a, b] of clipped) {
    const start = Math.max(a, cursor);
    if (b > start) {
      covered += b - start;
      cursor = Math.max(cursor, b);
    }
  }
  return vpR - vpL - covered;
}

// ── ISSUE 1: camera viewport_x vs section x_offset, dead canvas per keyframe + transition ──
export function dumpCameraDebug(spec: BoardSpec): void {
  const sections = spec.board.sections;
  const kfs = spec.board.camera_keyframes;

  console.log('\n================ CAMERA DEBUG (ISSUE 1: BLACK GAPS) ================');
  console.log(`board.width=${spec.board.width}  output viewport width=1920`);
  console.log('\nSECTION LAYOUT:');
  for (const s of sections) {
    console.log(
      `  ${s.id.padEnd(12)} x_offset=${String(s.x_offset).padStart(5)} width=${String(s.width).padStart(5)} → spans x[${s.x_offset}, ${s.x_offset + s.width}]`
    );
  }

  const sorted = [...sections].sort((a, b) => a.x_offset - b.x_offset);
  console.log('\nGAPS BETWEEN SECTIONS:');
  for (let i = 0; i < sorted.length - 1; i++) {
    const gap = sorted[i + 1].x_offset - (sorted[i].x_offset + sorted[i].width);
    const tag = gap > 0 ? 'DEAD CANVAS' : gap < 0 ? 'OVERLAP' : 'touching (ok)';
    console.log(`  ${sorted[i].id} → ${sorted[i + 1].id}: ${gap}px  [${tag}]`);
  }

  console.log('\nAT-REST KEYFRAMES (dead canvas visible while camera is parked):');
  for (const k of kfs) {
    const vpL = k.viewport_x;
    const vpR = k.viewport_x + k.viewport_width;
    const covered = sections.filter((s) => s.x_offset < vpR && s.x_offset + s.width > vpL);
    const dead = computeDeadPx(vpL, vpR, sections);
    console.log(
      `  t=${k.time_seconds.toFixed(1).padStart(5)}  viewport_x=${String(k.viewport_x).padStart(5)}  vp_w=${String(k.viewport_width).padStart(5)}  → vp[${vpL}, ${vpR}]  covers[${covered.map((s) => s.id).join(',') || 'NONE'}]  DEAD=${dead}px (${((dead / k.viewport_width) * 100).toFixed(0)}% of frame)`
    );
  }

  console.log('\nTRANSITIONS (dead canvas sweeping through frame mid-pan):');
  for (let i = 0; i < kfs.length - 1; i++) {
    const a = kfs[i];
    const b = kfs[i + 1];
    if (a.viewport_x === b.viewport_x && a.viewport_width === b.viewport_width) continue;
    let worst = { t: 0, dead: -1, vpL: 0, vpR: 0, covers: '' };
    for (let step = 1; step < 10; step++) {
      const t = a.time_seconds + (b.time_seconds - a.time_seconds) * (step / 10);
      const cam = getCameraAtTime(kfs, sections, t);
      const vpL = cam.viewport_x;
      const vpR = cam.viewport_x + cam.viewport_width;
      const dead = computeDeadPx(vpL, vpR, sections);
      if (dead > worst.dead) {
        const covers = sections.filter((s) => s.x_offset < vpR && s.x_offset + s.width > vpL).map((s) => s.id).join(',');
        worst = { t, dead, vpL, vpR, covers };
      }
    }
    console.log(
      `  ${a.time_seconds}s→${b.time_seconds}s  worst@${worst.t.toFixed(1)}s  vp[${worst.vpL.toFixed(0)}, ${worst.vpR.toFixed(0)}]  covers[${worst.covers || 'NONE'}]  MAX DEAD=${worst.dead.toFixed(0)}px`
    );
  }
  console.log('====================================================================\n');
}

// ── ISSUE 2: SVG asset path / existence / dims / field resolution ──
export function dumpSvgDebug(
  spec: BoardSpec,
  svgDir: string,
  svgAssets: Map<string, Image[]>
): void {
  console.log('\n================ SVG ASSET DEBUG (ISSUE 2: INVISIBLE ASSETS) ================');
  console.log(`svgDir resolved to: ${svgDir}`);
  console.log(`svgDir exists:      ${existsSync(svgDir)}`);
  console.log(`asset_needs:        [${spec.asset_needs.join(', ')}]`);
  console.log(`assets loaded into map: [${[...svgAssets.keys()].join(', ') || 'NONE'}]`);
  console.log('\nsvg_asset ELEMENTS IN SPEC:');
  for (const sec of spec.board.sections) {
    for (const el of sec.elements) {
      if (el.type !== 'svg_asset') continue;
      const name = el.asset_name ?? el.content ?? '';
      const file = path.join(svgDir, `${name}.svg`);
      const rasterized = svgAssets.get(name)?.[0];
      const frameCount = svgAssets.get(name)?.length ?? 0;
      console.log(
        `  ${el.id}: asset_name=${JSON.stringify(el.asset_name)} content=${JSON.stringify(el.content)} → resolvedName="${name}"`
      );
      console.log(`      file: ${file}`);
      console.log(`      file exists: ${existsSync(file)}   rasterized dims: ${rasterized ? `${rasterized.width}x${rasterized.height}` : 'NOT LOADED'}   frames: ${frameCount}`);
      console.log(`      renderer looks up svgAssets.get(asset_name ?? content = "${name}") → ${svgAssets.has(name) ? 'HIT' : 'MISS → invisible'}`);
      console.log(`      el.x=${el.x} el.y=${el.y} el.width=${el.width} el.height=${el.height} reveal_at=${el.reveal_at_seconds}`);
    }
  }
  console.log('=============================================================================\n');
}

// ── ISSUE 3: duration vs audio ──
export function dumpDurationDebug(spec: BoardSpec, totalFrames: number): void {
  const kfs = spec.board.camera_keyframes;
  const lastKf = kfs[kfs.length - 1]?.time_seconds ?? 0;
  let lastReveal = 0;
  for (const sec of spec.board.sections) {
    for (const el of sec.elements) lastReveal = Math.max(lastReveal, el.reveal_at_seconds);
  }
  console.log('\n================ DURATION DEBUG (ISSUE 3: VIDEO CUTOFF) ================');
  console.log(`spec.duration_seconds:   ${spec.duration_seconds}  → totalFrames=${totalFrames} @ ${spec.fps}fps`);
  console.log(`last camera keyframe:    ${lastKf}s`);
  console.log(`last element reveal:     ${lastReveal}s`);
  console.log(`audio_file:              ${spec.audio_file}`);
  console.log('NOTE: ffmpeg uses -shortest. Final video length = min(frames length, clean_audio length).');
  console.log('========================================================================\n');
}
