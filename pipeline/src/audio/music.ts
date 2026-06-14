import { execSync } from 'child_process';
import { existsSync, readdirSync } from 'fs';
import * as path from 'path';
import { BoardSpec, Section } from '../types/specTypes';
import { probeDuration } from './trim';
import { ResolvedMusicConfig } from './audioConfig';

// Background music bed (PART C rewrite). Three modes via config.music.track:
//   • "none"            → no bed (valid choice).
//   • null / "auto"     → mood-shifting bed: each section maps to a mood, tracks crossfade at
//                          mood changes (hook=curious → comparison=tense → revelation=uplifting
//                          → conclusion=reflective).
//   • "<stem>"          → one chosen track (e.g. "uplifting", "curious_2") for the whole video.
// In every mode the bed is DUCKED under the narration (sidechain compression, when enabled) so
// it drops while words play and swells in the gaps, plus gentle fade in/out. config.volume sets
// the resting bed level; config.duck toggles the sidechain ducking.

const CROSSFADE = 2.0;   // seconds of mood-to-mood crossfade (auto mode) and edge fades
const MIN_SEG = 3.0;     // ignore mood blips shorter than this (auto mode)

const SECTION_MOOD: Record<Section['section_type'], string> = {
  hook: 'curious',
  comparison: 'tense',
  diagram: 'neutral',
  revelation: 'uplifting',
  list_reveal: 'neutral',
  flow_chart: 'neutral',
  conclusion: 'reflective',
};

interface MoodSeg { start: number; end: number; mood: string; }

function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

const AUDIO_EXT = ['mp3', 'wav', 'ogg', 'm4a', 'flac'];

// Files matching a stem: "<stem>.<ext>" and/or "<stem>_<n>.<ext>".
function tracksForStem(musicDir: string, stem: string): string[] {
  if (!existsSync(musicDir)) return [];
  const re = new RegExp(`^${stem}(_\\d+)?\\.(${AUDIO_EXT.join('|')})$`, 'i');
  return readdirSync(musicDir).filter((f) => re.test(f)).sort().map((f) => path.join(musicDir, f));
}

function pickTrack(musicDir: string, stem: string, videoId: string): string | null {
  let list = tracksForStem(musicDir, stem);
  if (list.length === 0) list = tracksForStem(musicDir, 'neutral'); // graceful fallback
  if (list.length === 0) return null;
  return list[hashStr(videoId + stem) % list.length];
}

/** List available music bed stems (deduped) for the UI's track picker. */
export function listMusicStems(musicDir: string): string[] {
  if (!existsSync(musicDir)) return [];
  const stems = new Set<string>();
  for (const f of readdirSync(musicDir)) {
    const m = f.match(new RegExp(`^(.+?)(_\\d+)?\\.(${AUDIO_EXT.join('|')})$`, 'i'));
    if (m) stems.add(m[1].toLowerCase());
  }
  return [...stems].sort();
}

export function buildMoodTimeline(spec: BoardSpec): MoodSeg[] {
  // Order sections by NARRATION TIME (first reveal), NOT x_offset. The 2-D snake-grid relayout
  // (s3) made x_offset non-monotonic with time, so the old x_offset sort produced overlapping mood
  // segments — e.g. "uplifting" scheduled [13s→78s] while later moods played underneath, stacking
  // 2–3 music tracks at once (the "overwhelming" bug). Sorting by enter time keeps segments
  // sequential and non-overlapping.
  const ordered = spec.board.sections
    .filter((s) => s.elements.length > 0)
    .map((s) => ({ s, enter: Math.min(...s.elements.map((e) => e.reveal_at_seconds)) }))
    .sort((a, b) => a.enter - b.enter);
  if (ordered.length === 0) return [];

  const raw: MoodSeg[] = ordered.map((x, i) => ({
    start: i === 0 ? 0 : x.enter,
    end: i < ordered.length - 1 ? ordered[i + 1].enter : spec.duration_seconds,
    mood: SECTION_MOOD[x.s.section_type] ?? 'neutral',
  })).filter((seg) => seg.end > seg.start); // guard against any zero/negative span

  const merged: MoodSeg[] = [];
  for (const seg of raw) {
    const last = merged[merged.length - 1];
    if (last && last.mood === seg.mood) last.end = seg.end;
    else merged.push({ ...seg });
  }
  return merged.filter((s) => s.end - s.start >= MIN_SEG);
}

/**
 * Mixes a (mood-shifting or single-track) music bed under the narration, ducked. Returns the
 * mixed file path, or null when there is no bed to add (disabled, "none", or no tracks) — the
 * caller then keeps the narration as-is. Non-fatal by contract.
 */
export function mixMusic(
  narrationPath: string,
  spec: BoardSpec,
  musicDir: string,
  outputPath: string,
  cfg: ResolvedMusicConfig
): string | null {
  if (!cfg.enabled || cfg.track === 'none') {
    console.log(`  [music] ${cfg.enabled ? 'track "none"' : 'disabled'} — no bed.`);
    return null;
  }

  const narrDur = probeDuration(narrationPath);
  const inputs: string[] = ['-i', `"${narrationPath}"`];
  const filters: string[] = [];
  const bedLabels: string[] = [];
  let summary = '';

  if (cfg.track && cfg.track !== 'none') {
    // ── Single chosen track for the whole video ──
    const track = pickTrack(musicDir, cfg.track, spec.video_id);
    if (!track) {
      console.log(`  [music] no track found for "${cfg.track}" in ${musicDir} — no bed.`);
      return null;
    }
    const fadeOut = Math.max(0, narrDur - CROSSFADE);
    inputs.push('-stream_loop', '-1', '-i', `"${track}"`);
    filters.push(
      `[1:a]atrim=0:${narrDur.toFixed(3)},asetpts=PTS-STARTPTS,` +
      `afade=t=in:st=0:d=${CROSSFADE},afade=t=out:st=${fadeOut.toFixed(3)}:d=${CROSSFADE},` +
      `volume=${cfg.volume}[bed]`
    );
    bedLabels.push('[bed]');
    summary = `single "${path.basename(track)}"`;
  } else {
    // ── Auto: mood-shifting crossfaded bed ──
    const timeline = buildMoodTimeline(spec);
    const segs = timeline
      .map((s) => ({ ...s, track: pickTrack(musicDir, s.mood, spec.video_id) }))
      .filter((s): s is MoodSeg & { track: string } => !!s.track);
    if (segs.length === 0) {
      console.log(`  [music] no tracks in ${musicDir} — no bed (fine).`);
      return null;
    }
    segs.forEach((seg, i) => {
      const idx = i + 1;
      const isLast = i === segs.length - 1;
      const segLen = Math.max(0.1, Math.min(seg.end, narrDur) - seg.start);
      const startMs = Math.max(0, Math.round(seg.start * 1000));
      const take = isLast ? segLen : segLen + CROSSFADE;
      const fadeOutStart = isLast ? Math.max(0, segLen - CROSSFADE) : segLen;
      inputs.push('-stream_loop', '-1', '-i', `"${seg.track}"`);
      filters.push(
        `[${idx}:a]atrim=0:${take.toFixed(3)},asetpts=PTS-STARTPTS,` +
        `afade=t=in:st=0:d=${CROSSFADE},afade=t=out:st=${fadeOutStart.toFixed(3)}:d=${CROSSFADE},` +
        `volume=${cfg.volume},adelay=${startMs}:all=1[mus${idx}]`
      );
      bedLabels.push(`[mus${idx}]`);
    });
    summary = segs.map((s) => `${s.mood}[${s.start.toFixed(1)}-${Math.min(s.end, narrDur).toFixed(1)}s]`).join(' → ');
  }

  // Combine bed segments into one [bed] stream (if more than one).
  let bed = bedLabels[0];
  if (bedLabels.length > 1) {
    filters.push(`${bedLabels.join('')}amix=inputs=${bedLabels.length}:normalize=0:duration=longest[bed]`);
    bed = '[bed]';
  }

  // Duck the bed under the narration (sidechain), then mix narration + ducked bed.
  // asplit the narration: one copy is the final voice, one keys the compressor.
  let finalMix: string;
  if (cfg.duck) {
    filters.push('[0:a]asplit=2[narr][sc]');
    filters.push(
      // Duck hard so narration always sits on top: lower threshold ⇒ ducks as soon as speech starts,
      // higher ratio ⇒ deeper dip, snappy attack + moderate release so the bed swells only in real gaps.
      `${bed}[sc]sidechaincompress=threshold=0.025:ratio=12:attack=20:release=300:makeup=1[ducked]`
    );
    filters.push('[narr][ducked]amix=inputs=2:normalize=0:duration=first[mix]');
    finalMix = '[mix]';
  } else {
    filters.push(`[0:a]${bed}amix=inputs=2:normalize=0:duration=first[mix]`);
    finalMix = '[mix]';
  }

  const cmd = [
    'ffmpeg', '-y',
    ...inputs,
    '-filter_complex', `"${filters.join(';')}"`,
    '-map', `"${finalMix}"`,
    '-c:a', 'pcm_s16le',
    `"${outputPath}"`,
  ].join(' ');

  console.log(`  [music] bed: ${summary}${cfg.duck ? ' (ducked under narration)' : ''}`);
  execSync(cmd, { stdio: 'inherit' });
  if (!existsSync(outputPath)) throw new Error(`music mix did not produce output at: ${outputPath}`);
  return outputPath;
}
