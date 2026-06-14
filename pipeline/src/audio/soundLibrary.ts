import { existsSync, readFileSync, readdirSync, statSync } from 'fs';
import * as path from 'path';

// Categorized, drop-in SFX library (PART C). Scans assets/sfx/<category>/ for audio files at
// run time and merges per-category mix settings from an optional manifest.json. Adding a
// sound is just dropping a file in a folder — no code change. Multiple files per category are
// supported; pickFile() chooses one deterministically per (video, category) so a video is
// stable across re-runs and different videos vary.

const AUDIO_EXT = new Set(['.wav', '.mp3', '.ogg', '.m4a', '.aac', '.flac']);

export interface CategorySettings {
  volume: number;
  leadMs: number;       // ms the sound's PEAK is pre-rolled before the event (anticipation)
  peakAlign: boolean;   // align loudest sample to the event (strip soft head) vs. first sample
}

export interface SoundCategory {
  name: string;
  files: string[];      // absolute paths
  settings: CategorySettings;
}

export interface SoundLibrary {
  dir: string;
  categories: Map<string, SoundCategory>;
}

const DEFAULT_SETTINGS: CategorySettings = { volume: 0.4, leadMs: 0, peakAlign: true };

interface ManifestCategory {
  volume?: number;
  lead_ms?: number;
  peak_align?: boolean;
}
interface Manifest {
  categories?: Record<string, ManifestCategory>;
}

function readManifest(sfxDir: string): Manifest {
  const p = path.join(sfxDir, 'manifest.json');
  if (!existsSync(p)) return {};
  try {
    return JSON.parse(readFileSync(p, 'utf8')) as Manifest;
  } catch {
    console.warn(`  [sfx] manifest.json is not valid JSON — using engine defaults`);
    return {};
  }
}

function scanAudioFiles(dir: string): string[] {
  if (!existsSync(dir) || !statSync(dir).isDirectory()) return [];
  return readdirSync(dir)
    .filter((f) => AUDIO_EXT.has(path.extname(f).toLowerCase()))
    .sort()
    .map((f) => path.join(dir, f));
}

/** Loads the categorized SFX library from `sfxDir`. Empty categories are kept (no files). */
export function loadSoundLibrary(sfxDir: string): SoundLibrary {
  const manifest = readManifest(sfxDir);
  const categories = new Map<string, SoundCategory>();

  // Categories = every subfolder present, plus any declared in the manifest (so a documented
  // category with no files yet still exists as an empty bucket).
  const names = new Set<string>();
  if (existsSync(sfxDir)) {
    for (const entry of readdirSync(sfxDir)) {
      if (statSync(path.join(sfxDir, entry)).isDirectory()) names.add(entry);
    }
  }
  for (const n of Object.keys(manifest.categories ?? {})) names.add(n);

  for (const name of names) {
    const mc = manifest.categories?.[name] ?? {};
    const settings: CategorySettings = {
      volume: typeof mc.volume === 'number' ? mc.volume : DEFAULT_SETTINGS.volume,
      leadMs: typeof mc.lead_ms === 'number' ? mc.lead_ms : DEFAULT_SETTINGS.leadMs,
      peakAlign: typeof mc.peak_align === 'boolean' ? mc.peak_align : DEFAULT_SETTINGS.peakAlign,
    };
    categories.set(name, { name, files: scanAudioFiles(path.join(sfxDir, name)), settings });
  }

  return { dir: sfxDir, categories };
}

export function categoryHasSound(lib: SoundLibrary, category: string): boolean {
  const c = lib.categories.get(category);
  return !!c && c.files.length > 0;
}

function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

/** Deterministically pick one file from a category for a given key (e.g. videoId). */
export function pickFile(lib: SoundLibrary, category: string, key: string): string | null {
  const c = lib.categories.get(category);
  if (!c || c.files.length === 0) return null;
  return c.files[hashStr(key + category) % c.files.length];
}

export function categorySettings(lib: SoundLibrary, category: string): CategorySettings {
  return lib.categories.get(category)?.settings ?? DEFAULT_SETTINGS;
}
