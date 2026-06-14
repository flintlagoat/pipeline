import Anthropic from '@anthropic-ai/sdk';
import * as fs from 'fs';
import * as path from 'path';
import { ChannelConfig } from '../types/specTypes';
import { loadLearnings } from '../analytics/learnings';
import { channelDir } from '../config/paths';
import {
  buildPackagingSystemPrompt,
  buildPackagingIdeasUserPrompt,
  buildPackagingForTopicUserPrompt,
} from '../prompts/packagingPrompt';
import { researchOutliers, formatDemandForPrompt } from '../research/outliers';

// Packaging engine (session 6) — the packaging-first brain. Designs complete video packages
// (title + thumbnail concept + hook promise + open loops + payoff) BEFORE the script exists,
// so every downstream stage (script, thumbnail, metadata) pays off one coherent promise.
// Generic across channels: niche/voice from config, thumbnail assets grounded in the channel's
// real SVG library. The winning package is persisted to the job's meta.json by the orchestrator.

const client = new Anthropic();

export interface ThumbnailConcept {
  bigText: string;        // ≤4 words, complements (never repeats) the title
  emphasisWord?: string;  // the one word rendered in the channel accent color
  assetName?: string;     // optional channel SVG library asset for the hero visual
  visualIdea: string;     // one-line description of the hero visual
}

export interface VideoPackage {
  title: string;          // ≤60 chars — the packaging contract
  altTitles: string[];    // backups for manual A/B
  description: string;    // 1–2 keyword-rich sentences for the YouTube description
  thumbnail: ThumbnailConcept;
  hookPromise: string;    // the promise the first 15s of script must make
  openLoops: string[];    // questions planted early, resolved later
  payoff: string;         // the held-back revelation (final third)
  whyItWorks: string;
  score: number;          // 0–100 model self-score (curiosity × demand × fit)
}

/** Names of the SVG assets that actually exist for a channel (grounds thumbnail concepts). */
export function listChannelAssets(channelId: string): string[] {
  const dir = path.join(channelDir(channelId), 'assets', 'svg');
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter((f) => f.endsWith('.svg') && !/__\d+\.svg$/.test(f)) // skip animation frames
    .map((f) => f.replace(/\.svg$/, ''))
    .sort();
}

function stripFences(s: string): string {
  return s.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
}

function coercePackage(raw: unknown): VideoPackage | null {
  const o = raw as Record<string, unknown>;
  const title = String(o.title ?? '').trim();
  if (!title) return null;
  const thumbRaw = (o.thumbnail ?? {}) as Record<string, unknown>;
  const bigText = String(thumbRaw.bigText ?? '').trim();
  return {
    title: title.slice(0, 100),
    altTitles: Array.isArray(o.altTitles) ? o.altTitles.map((t) => String(t).slice(0, 100)).slice(0, 3) : [],
    description: String(o.description ?? '').trim().slice(0, 600),
    thumbnail: {
      bigText: (bigText || title).split(/\s+/).slice(0, 5).join(' '),
      emphasisWord: thumbRaw.emphasisWord ? String(thumbRaw.emphasisWord).trim() : undefined,
      assetName: thumbRaw.assetName ? String(thumbRaw.assetName).trim() : undefined,
      visualIdea: String(thumbRaw.visualIdea ?? '').trim().slice(0, 300),
    },
    hookPromise: String(o.hookPromise ?? '').trim().slice(0, 400),
    openLoops: Array.isArray(o.openLoops) ? o.openLoops.map((l) => String(l).trim()).filter(Boolean).slice(0, 4) : [],
    payoff: String(o.payoff ?? '').trim().slice(0, 400),
    whyItWorks: String(o.whyItWorks ?? '').trim().slice(0, 400),
    score: Math.max(0, Math.min(100, Number(o.score) || 0)),
  };
}

async function callPackaging(system: string, user: string, maxTokens: number): Promise<VideoPackage[]> {
  const resp = await client.messages.create({
    model: 'claude-opus-4-8',
    max_tokens: maxTokens,
    system: [{ type: 'text', text: system }],
    messages: [{ role: 'user', content: user }],
  });
  const block = resp.content[0];
  if (block.type !== 'text') throw new Error('Packaging generation returned a non-text block.');
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripFences(block.text));
  } catch {
    throw new Error('Packaging generation did not return valid JSON.');
  }
  if (!Array.isArray(parsed)) throw new Error('Packaging generation did not return an array.');
  const packages = parsed.map(coercePackage).filter((p): p is VideoPackage => p !== null);
  if (packages.length === 0) throw new Error('Packaging generation produced no usable packages.');
  return packages.sort((a, b) => b.score - a.score);
}

/**
 * Design N candidate packages for the channel (new subjects, avoiding covered titles),
 * sorted best-first. This replaces "pick an interesting topic" — the topic now arrives
 * already packaged and scored.
 */
export async function designPackages(
  channelId: string,
  cfg: ChannelConfig,
  count = 5
): Promise<VideoPackage[]> {
  const n = Math.max(1, Math.min(12, Math.floor(count) || 5));
  const learnings = loadLearnings(channelId);
  const covered = learnings.videoLog.slice(-30).map((v) => v.title);
  const winners = learnings.appliedRules.filter((r) => r.status === 'active').map((r) => r.rule);

  // Data-driven demand (session 7): search the niche for outliers (videos that beat their channel
  // size) and feed the proven subjects/patterns into the prompt. No-ops without YOUTUBE_API_KEY.
  let demandBlock = '';
  try {
    const research = await researchOutliers(cfg.niche);
    demandBlock = formatDemandForPrompt(research);
    if (research.outliers.length) console.log(`  [packaging] ${research.outliers.length} niche outliers found → conditioning on proven demand`);
    else if (research.note) console.log(`  [packaging] ${research.note}`);
  } catch (e) {
    console.warn(`  [packaging] outlier research skipped: ${(e as Error).message}`);
  }

  const system = buildPackagingSystemPrompt(cfg, listChannelAssets(channelId));
  const user = buildPackagingIdeasUserPrompt(cfg, n, covered, winners, demandBlock);
  return callPackaging(system, user, 3500);
}

/** Design the single best package for a topic the operator already chose. */
export async function packageForTopic(
  channelId: string,
  cfg: ChannelConfig,
  topic: string
): Promise<VideoPackage> {
  const system = buildPackagingSystemPrompt(cfg, listChannelAssets(channelId));
  const user = buildPackagingForTopicUserPrompt(cfg, topic);
  const packages = await callPackaging(system, user, 1500);
  return packages[0];
}

/** Compact packaging block for the script prompt — the contract the script must pay off. */
export function formatPackagingForPrompt(pkg: VideoPackage): string {
  const lines = [
    `TITLE (the promise on the thumbnail page): ${pkg.title}`,
    `THUMBNAIL SHOWS: "${pkg.thumbnail.bigText}" — ${pkg.thumbnail.visualIdea}`,
    `HOOK PROMISE (first 15s must make exactly this promise, harder): ${pkg.hookPromise}`,
  ];
  if (pkg.openLoops.length) {
    lines.push(`OPEN LOOPS to plant early and resolve later:`);
    for (const l of pkg.openLoops) lines.push(`  • ${l}`);
  }
  if (pkg.payoff) lines.push(`HELD-BACK PAYOFF (resolve in the final third): ${pkg.payoff}`);
  return lines.join('\n');
}
