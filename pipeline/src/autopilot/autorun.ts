import {
  generateScriptForJob, generateVoiceoverForJob, processJob, loadChannelConfig,
} from '../orchestrator';
import { loadChannelSpec } from '../channelSpec';
import { pullAnalytics } from '../analytics/pull';
import { analyzeChannel } from '../analytics/analyze';
import { publishJob } from '../publish';
import { designPackages, packageForTopic, VideoPackage } from './packaging';

// autorun (Part 3) — the full passive loop for ONE channel, one command:
//   pull latest analytics → analyze + update learnings → pick next topic → generate script
//   (conditioned on learnings) → synthesize voiceover (Fish S1) → produce video → publish
//   scheduled per schedule.json (respecting autoPublish + quota).
// Each stage is logged; non-critical stages (analytics, publish) are caught and reported so a
// missing key or no-auth never aborts the run. Critical stages (script/voiceover/render) abort
// with a clear error. Generic across channels — no topic hardcoding.

export interface AutorunOptions {
  minutes?: number;       // script length; defaults to the channel's format.minutes
  topic?: string;         // explicit topic; if omitted, one is generated (conditioned on learnings)
  ttsBackend?: 'fish' | 'sapi';
}

export interface AutorunResult {
  jobId: string;
  topic: string;
  videoUrl?: string;
  publishMessage: string;
}

function newJobId(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `auto_${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

async function stage<T>(label: string, fn: () => Promise<T>, critical: boolean): Promise<T | undefined> {
  console.log(`\n──[autorun] ${label} ──────────────────────────────`);
  try {
    return await fn();
  } catch (e) {
    const msg = (e as Error).message;
    if (critical) {
      console.error(`  ✗ ${label} FAILED (critical): ${msg}`);
      throw e;
    }
    console.warn(`  ⚠ ${label} skipped: ${msg}`);
    return undefined;
  }
}

export async function autorun(channelId: string, opts: AutorunOptions = {}): Promise<AutorunResult> {
  console.log(`\n╔═══ AUTORUN: ${channelId} ═══╗`);
  const spec = loadChannelSpec(channelId);
  const cfg = loadChannelConfig(channelId);
  const minutes = opts.minutes ?? spec.format.minutes ?? 2;
  const jobId = newJobId();

  // 1) Pull analytics (non-critical — no auth/first run just skips).
  await stage('1/6 Pull analytics', () => pullAnalytics(channelId), false);

  // 2) Analyze + update learnings (non-critical — needs Anthropic key; skip on failure).
  await stage('2/6 Analyze + update learnings', async () => {
    const r = await analyzeChannel(channelId);
    console.log(`  ${r.summary}`);
  }, false);

  // 3) Packaging (critical — packaging-first, session 6): design the title/thumbnail/hook
  //    contract BEFORE the script. With an explicit topic we package that topic; otherwise the
  //    engine proposes scored candidates and the best one wins.
  const pkg: VideoPackage = (await stage('3/6 Design video package (packaging-first)', async () => {
    if (opts.topic) return packageForTopic(channelId, cfg, opts.topic);
    const candidates = await designPackages(channelId, cfg, 5);
    console.log(`  candidates:\n${candidates.map((p) => `    ${p.score.toString().padStart(3)} — ${p.title}`).join('\n')}`);
    return candidates[0];
  }, true))!;
  const topic = pkg.title;
  console.log(`  package: "${pkg.title}" | thumb: "${pkg.thumbnail.bigText}" (score ${pkg.score})`);

  // 4) Script (critical) — conditioned on learnings AND the package inside generateScriptForJob.
  await stage('4/6 Generate script (closed loop)', async () => {
    const r = await generateScriptForJob(channelId, jobId, topic, minutes, pkg);
    console.log(`  ${r.wordCount} words → ${r.scriptPath}`);
  }, true);

  // 5) Voiceover via Fish S1 (critical — the pipeline needs voiceover.wav). Falls back to SAPI
  //    only if FISH_API_KEY is absent (handled inside the adapter).
  await stage('5/6 Synthesize voiceover (Fish S1)', async () => {
    const r = await generateVoiceoverForJob(channelId, jobId, { backend: opts.ttsBackend });
    console.log(`  voiceover via ${r.backendUsed}${r.fellBack ? ' (fell back)' : ''}`);
  }, true);

  // 6) Render the video (critical).
  await stage('6/6 Produce video', () => processJob(channelId, jobId), true);

  // 7) Publish — scheduled per schedule.json, respecting autoPublish + quota (non-critical:
  //    the video is already rendered locally even if publishing is deferred/blocked).
  let publishMessage = 'not attempted';
  let videoUrl: string | undefined;
  await stage('Publish (per schedule.json)', async () => {
    const r = await publishJob(channelId, jobId, {});
    publishMessage = r.message;
    videoUrl = r.videoUrl;
    console.log(`  ${r.message}`);
  }, false);

  console.log(`\n╚═══ AUTORUN complete: ${channelId}/${jobId} ═══╝`);
  console.log(`   topic:   ${topic}`);
  console.log(`   publish: ${publishMessage}`);
  return { jobId, topic, videoUrl, publishMessage };
}
