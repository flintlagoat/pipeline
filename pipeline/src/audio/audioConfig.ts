import { AudioConfig } from '../types/specTypes';

// Tunable audio config layer (PART C). Channel config supplies a base `audio` block; a job
// (e.g. from the web UI) can override per-run. Both are partial and merged over these
// defaults so the engine always has a complete, sane config without anything hardcoded in
// the mixers.

export interface ResolvedSfxConfig {
  enabled: boolean;
  intensity: number;       // 0..1 — scales how many cues fire (0 = silent, 1 = full)
  maxCues: number;
  minSpacing: number;      // seconds between any two cues
  bigMoneyMin: number;     // dollars; money cue only at/above this
  cueFloor: number;        // no SFX before this time (don't hit the opening title)
}

export interface ResolvedMusicConfig {
  enabled: boolean;
  // "none"  → no music bed
  // "auto" / null → mood-shifting bed (track per section mood)
  // "<stem>" → use that one track (e.g. "uplifting", "curious_2") as the whole bed
  track: string | null;
  volume: number;
  duck: boolean;           // sidechain-duck the bed under the narration
}

export interface ResolvedAudioConfig {
  sfx: ResolvedSfxConfig;
  music: ResolvedMusicConfig;
}

export const DEFAULT_AUDIO: ResolvedAudioConfig = {
  sfx: { enabled: true, intensity: 1.0, maxCues: 6, minSpacing: 2.5, bigMoneyMin: 100, cueFloor: 1.0 },
  music: { enabled: true, track: null, volume: 0.13, duck: true },
};

function num(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}
function bool(v: unknown, fallback: boolean): boolean {
  return typeof v === 'boolean' ? v : fallback;
}

/** Merge channel-level then job-level partial audio configs over the defaults. */
export function resolveAudioConfig(
  channel?: AudioConfig,
  job?: AudioConfig
): ResolvedAudioConfig {
  const cs = channel?.sfx ?? {};
  const js = job?.sfx ?? {};
  const cm = channel?.music ?? {};
  const jm = job?.music ?? {};

  const pick = <T>(jobV: T | undefined, chV: T | undefined, def: T): T =>
    jobV !== undefined ? jobV : chV !== undefined ? chV : def;

  const d = DEFAULT_AUDIO;
  const sfx: ResolvedSfxConfig = {
    enabled: bool(pick(js.enabled, cs.enabled, d.sfx.enabled), d.sfx.enabled),
    intensity: Math.max(0, Math.min(1, num(pick(js.intensity, cs.intensity, d.sfx.intensity), d.sfx.intensity))),
    maxCues: Math.max(0, Math.round(num(pick(js.max_cues, cs.max_cues, d.sfx.maxCues), d.sfx.maxCues))),
    minSpacing: num(pick(js.min_spacing_seconds, cs.min_spacing_seconds, d.sfx.minSpacing), d.sfx.minSpacing),
    bigMoneyMin: num(pick(js.big_money_min, cs.big_money_min, d.sfx.bigMoneyMin), d.sfx.bigMoneyMin),
    cueFloor: d.sfx.cueFloor,
  };

  // music.track: job wins, then channel, then default (null = auto). Normalize "none"/"" .
  const rawTrack = jm.track !== undefined ? jm.track : cm.track !== undefined ? cm.track : d.music.track;
  let track: string | null = rawTrack ?? null;
  if (typeof track === 'string') {
    const t = track.trim().toLowerCase();
    if (t === '' || t === 'auto') track = null;
    else if (t === 'none') track = 'none';
  }

  const music: ResolvedMusicConfig = {
    enabled: bool(pick(jm.enabled, cm.enabled, d.music.enabled), d.music.enabled),
    track,
    volume: num(pick(jm.volume, cm.volume, d.music.volume), d.music.volume),
    duck: bool(pick(jm.duck, cm.duck, d.music.duck), d.music.duck),
  };

  return { sfx, music };
}
