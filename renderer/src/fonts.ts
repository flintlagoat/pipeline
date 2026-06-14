import { GlobalFonts } from '@napi-rs/canvas';
import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'fs';
import * as path from 'path';
import { RenderProfile } from './schema';
import { BLUEPRINT_BOARD } from './style';

const FONT_DIR = path.join(__dirname, '../fonts');

// iOS 4.3 Safari UA — predates WOFF support, so Google Fonts serves TTF
// (IE/modern UAs get WOFF/WOFF2, which @napi-rs/canvas cannot load on Windows)
const TTF_UA = 'Mozilla/5.0 (iPod; U; CPU iPhone OS 4_3 like Mac OS X; en-us) AppleWebKit/533.17.9 (KHTML, like Gecko) Version/5.0.2 Mobile/8J2 Safari/6533.18.5';

interface FontSpec { family: string; file: string; query: string; }

// Google Fonts query string for a family. Most families register at weight 400 (which matches
// fontSpec's no-weight output). Families whose default cut is heavier (e.g. Archivo Black) still
// resolve at 400 — that IS their weight. Spaces → '+'.
function fontEntry(family: string): FontSpec {
  return {
    family,
    file: family.replace(/[^A-Za-z0-9]/g, '') + '-Regular.ttf',
    query: family.replace(/\s+/g, '+'),
  };
}

// De-dupe the 3 families a profile asks for (display/body/mono may overlap).
function fontsForProfile(profile: RenderProfile): FontSpec[] {
  const fams = [profile.fonts.display, profile.fonts.body, profile.fonts.mono];
  const seen = new Set<string>();
  const out: FontSpec[] = [];
  for (const f of fams) {
    if (!f || seen.has(f)) continue;
    seen.add(f);
    out.push(fontEntry(f));
  }
  return out;
}

const TTF_MAGIC = Buffer.from([0x00, 0x01, 0x00, 0x00]); // TrueType
const OTF_MAGIC = Buffer.from([0x4F, 0x54, 0x54, 0x4F]); // "OTTO" OpenType/CFF

function isTrueTypeOrOpenType(buf: Buffer): boolean {
  if (buf.length < 4) return false;
  return (
    buf.slice(0, 4).equals(TTF_MAGIC) ||
    buf.slice(0, 4).equals(OTF_MAGIC)
  );
}

async function resolveFontUrl(query: string): Promise<string> {
  const cssUrl = `https://fonts.googleapis.com/css?family=${query}`;
  const resp = await fetch(cssUrl, { headers: { 'User-Agent': TTF_UA } });
  if (!resp.ok) throw new Error(`Google Fonts CSS fetch failed for "${query}": ${resp.status}`);
  const css = await resp.text();

  // Prefer explicit .ttf URL
  const ttfMatch = css.match(/url\((https?:\/\/[^)]+\.ttf)\)/i);
  if (ttfMatch) return ttfMatch[1];

  // Fall back to any gstatic URL
  const anyMatch = css.match(/url\((https?:\/\/fonts\.gstatic\.com[^)]+)\)/);
  if (anyMatch) return anyMatch[1];

  throw new Error(`Could not find font URL in CSS for "${query}". CSS snippet:\n${css.slice(0, 400)}`);
}

export async function loadFonts(profile: RenderProfile = BLUEPRINT_BOARD): Promise<void> {
  if (!existsSync(FONT_DIR)) mkdirSync(FONT_DIR, { recursive: true });
  const fonts = fontsForProfile(profile);
  for (const font of fonts) {
    const fontPath = path.join(FONT_DIR, font.file);

    // Re-download if missing or if cached file is not a valid TTF/OTF
    let needsDownload = !existsSync(fontPath);
    if (!needsDownload) {
      const existing = readFileSync(fontPath);
      if (!isTrueTypeOrOpenType(existing)) {
        console.log(`  Cached ${font.file} is not TTF/OTF — re-downloading...`);
        needsDownload = true;
      }
    }

    // A single bad/unreachable family must NOT kill the render — canvas falls back to a
    // default face for that family name. Only fatal for the blueprint defaults would matter,
    // and those are cached. So download failures are warned and skipped.
    try {
      if (needsDownload) {
        console.log(`Downloading font: ${font.family}...`);
        const url = await resolveFontUrl(font.query);
        const response = await fetch(url, { headers: { 'User-Agent': TTF_UA } });
        if (!response.ok) throw new Error(`Failed to download ${font.family}: ${response.statusText}`);
        const buf = Buffer.from(await response.arrayBuffer());
        if (!isTrueTypeOrOpenType(buf)) {
          console.warn(`  WARNING: downloaded ${font.file} is still not TTF/OTF (magic: ${buf.slice(0, 4).toString('hex')})`);
        }
        writeFileSync(fontPath, buf);
        console.log(`  Saved: ${font.file} (${buf.length} bytes)`);
      }
      if (existsSync(fontPath)) GlobalFonts.registerFromPath(fontPath, font.family);
    } catch (e) {
      console.warn(`  [fonts] could not load "${font.family}" (${(e as Error).message}) — using a fallback face.`);
      continue;
    }
  }
}
