import Anthropic from '@anthropic-ai/sdk';
import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'fs';
import { join } from 'path';
import { SVG_ASSET_SYSTEM_PROMPT } from './prompts/svgAssetSystemPrompt';
import { buildSvgAssetUserPrompt } from './prompts/svgAssetUserPrompt';
import { normalizeSvgContrast, ContrastRules } from './assetContrast';

const client = new Anthropic();

export type AssetStatus = 'reused' | 'generated' | 'failed';

export interface AssetResult {
  assetName: string;
  status: AssetStatus;
  path?: string;
  error?: string;
}

function svgDir(channelId: string): string {
  return join(process.cwd(), '..', 'channels', channelId, 'assets', 'svg');
}

function assetPath(channelId: string, assetName: string): string {
  return join(svgDir(channelId), `${assetName}.svg`);
}

function isValidSvg(text: string): boolean {
  const t = text.trim();
  return (
    t.startsWith('<svg') &&
    /<\/svg>\s*$/.test(t) &&
    /(<path|<rect|<circle|<line|<polyline|<polygon)/i.test(t)
  );
}

function stripFences(text: string): string {
  return text.replace(/^```(?:svg|xml)?\r?\n?/, '').replace(/\r?\n?```$/, '').trim();
}

async function generateSvg(assetName: string, systemPrompt: string): Promise<string> {
  const userPrompt = buildSvgAssetUserPrompt(assetName);
  const messages: Anthropic.MessageParam[] = [{ role: 'user', content: userPrompt }];

  for (let attempt = 0; attempt < 2; attempt++) {
    const response = await client.messages.create({
      model: 'claude-opus-4-8',
      max_tokens: 4096,
      system: [{ type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } }],
      messages,
    });

    const block = response.content[0];
    if (block.type !== 'text') throw new Error(`Unexpected content type: ${block.type}`);

    const svg = stripFences(block.text);

    if (isValidSvg(svg)) return svg;

    if (attempt === 1) {
      throw new Error(`SVG invalid after 2 attempts. Got: ${svg.slice(0, 200)}`);
    }

    messages.push({ role: 'assistant', content: block.text });
    messages.push({
      role: 'user',
      content:
        'The SVG you returned is invalid. It must start with <svg, end with </svg>, contain only raw SVG (no markdown fences), and include at least one path, rect, circle, line, polyline, or polygon element. Return the corrected SVG only.',
    });
  }

  throw new Error('Unreachable');
}

// Animated asset: generate N progressive wireframe FRAMES of an action. Frame 1 is the rest
// state; later frames advance the action; if it ends in a repeating motion (waving, pulsing)
// the last two frames are the alternating poses (the renderer loops them). Every frame keeps
// the IDENTICAL static outline so only the moving part animates (clean cross-dissolve).
async function generateAnimatedFrames(assetName: string, action: string, frameCount: number, systemPrompt: string): Promise<string[]> {
  const human = assetName.replace(/_/g, ' ');
  const userPrompt = `Generate exactly ${frameCount} frames of a minimal ANIMATION of: ${human}.
The action across the frames: ${action}

OUTPUT: ONLY a JSON array of exactly ${frameCount} strings — each string a complete "<svg …>…</svg>". No markdown, no prose, nothing else.
RULES:
- EVERY frame uses the IDENTICAL viewBox and an IDENTICAL static outline/structure. Only the MOVING part (a door, a figure, an arm, a level) changes between frames. Keep every unchanged element byte-for-byte identical across all frames so the static parts don't flicker.
- Frame 1 = the initial / rest / closed state. Each later frame advances the action a step.
- If the action ends in a REPEATING motion (waving, pulsing, spinning), make the LAST TWO frames the two alternating poses so they loop smoothly.
- Follow ALL the style + COLOR rules from the system prompt above (use the channel ink color, never white or any color near the paper background). No <text>, no animation tags.`;

  for (let attempt = 0; attempt < 2; attempt++) {
    const response = await client.messages.create({
      model: 'claude-opus-4-8',
      max_tokens: 8000,
      // Use the per-channel system prompt (carries the ink/contrast/style rules), NOT the
      // hardcoded white-on-dark default — the old bug that made light-bg animations invisible.
      system: [{ type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: userPrompt }],
    });
    const block = response.content[0];
    if (block.type !== 'text') throw new Error(`Unexpected content type: ${block.type}`);

    let frames: unknown;
    try {
      frames = JSON.parse(stripFences(block.text).replace(/^```(?:json)?\r?\n?/, '').replace(/\r?\n?```$/, ''));
    } catch {
      if (attempt === 1) throw new Error(`animated frames not valid JSON: ${block.text.slice(0, 160)}`);
      continue;
    }
    if (Array.isArray(frames) && frames.length >= 2 && frames.every((f) => typeof f === 'string' && isValidSvg(stripFences(f)))) {
      return (frames as string[]).map((f) => stripFences(f));
    }
    if (attempt === 1) throw new Error(`animated frames invalid (got ${Array.isArray(frames) ? frames.length : 'non-array'})`);
  }
  throw new Error('Unreachable');
}

export interface AnimSpec { action: string; frames: number; }

// Options that make asset generation palette-aware (FIX 1). `contrast` runs the deterministic
// contrast guard over every touched asset (reused OR generated) so cached white-on-light assets
// are fixed in place; `paletteHash` is recorded per asset so a palette change auto-invalidates
// (busts) stale cached assets — no manual deletion. Both optional ⇒ legacy behavior unchanged.
export interface EnsureAssetsOptions {
  contrast?: ContrastRules;
  paletteHash?: string;
}

// Sidecar manifest: assetName → paletteHash the cached SVG was generated/normalized under.
function metaPath(channelId: string): string {
  return join(svgDir(channelId), '.assetmeta.json');
}
function readMeta(channelId: string): Record<string, string> {
  try {
    return JSON.parse(readFileSync(metaPath(channelId), 'utf8')) as Record<string, string>;
  } catch {
    return {};
  }
}
function writeMeta(channelId: string, meta: Record<string, string>): void {
  try {
    writeFileSync(metaPath(channelId), JSON.stringify(meta, null, 2), 'utf8');
  } catch { /* non-fatal */ }
}

// List all on-disk frame files for an asset (frame 1 + __2/__3/… companions).
function frameFilesFor(channelId: string, assetName: string): string[] {
  const out: string[] = [];
  for (let fi = 1; ; fi++) {
    const p = fi === 1 ? assetPath(channelId, assetName) : assetPath(channelId, `${assetName}__${fi}`);
    if (!existsSync(p)) break;
    out.push(p);
  }
  return out;
}

// Run the contrast guard over each frame file in place. Idempotent: once remapped, colors pass
// and the file stops changing. Returns the count of remapped color occurrences.
function normalizeAssetFiles(files: string[], assetName: string, contrast?: ContrastRules): number {
  if (!contrast) return 0;
  let total = 0;
  for (const p of files) {
    try {
      const src = readFileSync(p, 'utf8');
      const { svg, remapped } = normalizeSvgContrast(src, contrast);
      if (remapped.length > 0 && svg !== src) {
        writeFileSync(p, svg, 'utf8');
        total += remapped.length;
      }
    } catch { /* skip unreadable frame */ }
  }
  if (total > 0) console.log(`  [contrast] remapped ${total} low-contrast color(s) in "${assetName}" toward ink`);
  return total;
}

export async function ensureAssets(
  channelId: string,
  assetNeeds: string[],
  animInfo?: Map<string, AnimSpec>,
  systemPrompt: string = SVG_ASSET_SYSTEM_PROMPT,
  options: EnsureAssetsOptions = {}
): Promise<AssetResult[]> {
  const results: AssetResult[] = [];
  const { contrast, paletteHash } = options;
  const meta = readMeta(channelId);

  for (const assetName of assetNeeds) {
    const path = assetPath(channelId, assetName);

    // Frame 1 existing ⇒ candidate for reuse. But if the palette changed since this asset was
    // cached (hash mismatch), treat it as STALE and regenerate — this is the cache-bust that
    // clears old white-on-light assets automatically. A matching/absent hash ⇒ reuse (and still
    // run the contrast guard, which fixes any legacy white asset in place).
    const stale = paletteHash !== undefined && meta[assetName] !== undefined && meta[assetName] !== paletteHash;
    if (existsSync(path) && !stale) {
      normalizeAssetFiles(frameFilesFor(channelId, assetName), assetName, contrast);
      if (paletteHash !== undefined) meta[assetName] = paletteHash;
      console.log(`  ✓ reused   ${assetName}`);
      results.push({ assetName, status: 'reused', path });
      continue;
    }
    if (stale) console.log(`  ♻ palette changed — regenerating stale asset ${assetName}`);

    const anim = animInfo?.get(assetName);
    try {
      mkdirSync(svgDir(channelId), { recursive: true });
      if (anim) {
        console.log(`  ↳ generating ${assetName} (animated, ${anim.frames} frames)...`);
        const frames = await generateAnimatedFrames(assetName, anim.action, anim.frames, systemPrompt);
        frames.forEach((svg, i) => {
          const p = i === 0 ? path : assetPath(channelId, `${assetName}__${i + 1}`);
          writeFileSync(p, svg, 'utf8');
        });
        console.log(`  ✅ generated ${assetName} (${frames.length} frames)`);
      } else {
        console.log(`  ↳ generating ${assetName}...`);
        writeFileSync(path, await generateSvg(assetName, systemPrompt), 'utf8');
        console.log(`  ✅ generated ${assetName}`);
      }
      // Belt-and-suspenders: guard the freshly generated SVG too, then record the palette hash.
      normalizeAssetFiles(frameFilesFor(channelId, assetName), assetName, contrast);
      if (paletteHash !== undefined) meta[assetName] = paletteHash;
      results.push({ assetName, status: 'generated', path });
    } catch (err) {
      const error = (err as Error).message;
      console.error(`  ✗ failed   ${assetName} — ${error}`);
      results.push({ assetName, status: 'failed', error });
    }
  }

  if (paletteHash !== undefined) writeMeta(channelId, meta);
  return results;
}
