import { execSync } from 'child_process';
import { existsSync } from 'fs';
import { BoardSpec, WordTimestamp } from '../types/specTypes';
import { probeDuration } from './trim';
import { ResolvedSfxConfig } from './audioConfig';
import { loadSoundLibrary, pickFile, categorySettings, SoundLibrary } from './soundLibrary';
import { analyzeTriggers, SfxCue } from './triggerEngine';

// SFX mixing pass (PART C rewrite). The trigger engine decides WHICH category fires WHEN; the
// categorized library decides WHICH file and the per-category mix settings (volume, peak-align,
// pre-roll lead). This file just realizes those cues with ffmpeg. Nothing topic-specific lives
// here anymore — no hardcoded swoosh/cha-ching cue logic. Generic across every topic.

// Time (seconds) of the loudest sample in an SFX file — its audible peak. Lets us align the
// PEAK to the event (strip a soft/silent head) instead of the file's first sample. Cached.
const peakCache = new Map<string, number>();
function detectPeakOffset(file: string): number {
  const cached = peakCache.get(file);
  if (cached !== undefined) return cached;
  let peak = 0;
  try {
    const sr = 48000;
    const pcm = execSync(`ffmpeg -v quiet -i "${file}" -ac 1 -ar ${sr} -f s16le -`, {
      maxBuffer: 1024 * 1024 * 64,
    }) as Buffer;
    let maxAbs = 0;
    let maxIdx = 0;
    for (let i = 0; i + 1 < pcm.length; i += 2) {
      const v = Math.abs(pcm.readInt16LE(i));
      if (v > maxAbs) { maxAbs = v; maxIdx = i / 2; }
    }
    peak = maxIdx / sr;
  } catch {
    peak = 0; // fall back to first-sample alignment if probing fails
  }
  peakCache.set(file, peak);
  return peak;
}

interface PlacedCue extends SfxCue {
  file: string;
  volume: number;
  startMs: number;   // ffmpeg adelay for the file start so the chosen alignment hits the event
}

function placeCues(cues: SfxCue[], lib: SoundLibrary, videoId: string): PlacedCue[] {
  const placed: PlacedCue[] = [];
  // Per-category occurrence index so repeated cues in a multi-file category can vary.
  const seen = new Map<string, number>();
  for (const cue of cues) {
    const idx = seen.get(cue.category) ?? 0;
    seen.set(cue.category, idx + 1);
    const file = pickFile(lib, cue.category, `${videoId}#${idx}`);
    if (!file) continue;
    const s = categorySettings(lib, cue.category);
    const peakOffset = s.peakAlign ? detectPeakOffset(file) : 0;
    const lead = s.leadMs / 1000; // peak lands `lead` BEFORE the event (anticipation)
    const targetPeak = cue.time - lead;
    const startMs = Math.max(0, Math.round((targetPeak - peakOffset) * 1000));
    placed.push({ ...cue, file, volume: s.volume, startMs });
  }
  return placed;
}

/**
 * Mixes the trigger engine's cues onto the clean narration. Returns the mixed file path, or
 * null when there is nothing to mix (SFX disabled, no library sounds, or no cues) — caller
 * keeps the dry narration. Non-fatal by contract: only a hard ffmpeg failure propagates.
 */
export function mixSfx(
  cleanAudioPath: string,
  spec: BoardSpec,
  timestamps: WordTimestamp[],
  sfxDir: string,
  outputPath: string,
  cfg: ResolvedSfxConfig
): string | null {
  if (!cfg.enabled) {
    console.log('  [SFX] disabled by config — narration left dry.');
    return null;
  }

  const lib = loadSoundLibrary(sfxDir);
  const totalFiles = [...lib.categories.values()].reduce((n, c) => n + c.files.length, 0);
  if (totalFiles === 0) {
    console.log(`  [SFX] no sound files under ${sfxDir} — skipping SFX pass`);
    return null;
  }

  const cues = analyzeTriggers(spec, timestamps, lib, cfg);
  if (cues.length === 0) {
    console.log('  [SFX] no eligible cues — narration left dry (this is fine).');
    return null;
  }

  const placed = placeCues(cues, lib, spec.video_id);
  if (placed.length === 0) return null;

  // ffmpeg graph: input 0 = narration, inputs 1..N = one SFX file per cue.
  const inputs: string[] = ['-i', `"${cleanAudioPath}"`];
  const filters: string[] = [];
  const mixLabels: string[] = ['[0:a]'];
  const summary: string[] = [];

  placed.forEach((cue, i) => {
    const inIdx = i + 1;
    inputs.push('-i', `"${cue.file}"`);
    filters.push(`[${inIdx}:a]adelay=${cue.startMs}:all=1,volume=${cue.volume}[s${inIdx}]`);
    mixLabels.push(`[s${inIdx}]`);
    summary.push(`${cue.category}@${cue.time.toFixed(1)}s`);
  });

  // normalize=0 keeps the narration at full level; duration=first locks output to narration.
  filters.push(`${mixLabels.join('')}amix=inputs=${placed.length + 1}:normalize=0:duration=first[mix]`);

  const cmd = [
    'ffmpeg', '-y',
    ...inputs,
    '-filter_complex', `"${filters.join(';')}"`,
    '-map', '"[mix]"',
    '-c:a', 'pcm_s16le',
    `"${outputPath}"`,
  ].join(' ');

  const byCat = placed.reduce<Record<string, number>>((acc, c) => {
    acc[c.category] = (acc[c.category] ?? 0) + 1; return acc;
  }, {});
  const catSummary = Object.entries(byCat).map(([k, v]) => `${v} ${k}`).join(', ');
  console.log(`  [SFX] mixing ${placed.length} cue(s) — ${catSummary}: ${summary.join(', ')}`);

  execSync(cmd, { stdio: 'inherit' });
  if (!existsSync(outputPath)) throw new Error(`SFX mix did not produce output at: ${outputPath}`);
  return outputPath;
}
