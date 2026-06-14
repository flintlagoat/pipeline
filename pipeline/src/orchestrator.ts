import * as path from 'path';
import * as fs from 'fs';
import { createHash } from 'crypto';
import { execSync, spawnSync } from 'child_process';
import chokidar from 'chokidar';
import { processAudio } from './audio/audioProcessor';
import { mixSfx } from './audio/sfx';
import { mixMusic } from './audio/music';
import { generateBoardSpec } from './specGenerator';
import { ensureAssets, AnimSpec } from './assetGenerator';
import { generateScript } from './scriptGenerator';
import { ChannelConfig, AudioConfig } from './types/specTypes';
import { resolveAudioConfig } from './audio/audioConfig';
import { loadChannelSpec, toChannelConfig, toRenderProfile } from './channelSpec';
import { buildSvgAssetSystemPrompt } from './prompts/svgAssetSystemPrompt';
import { synthesizeVoiceover, TtsOptions, TtsResult } from './tts';
import { loadLearnings, formatLearningsForPrompt, logInjectedRules } from './analytics/learnings';
import { VideoPackage, packageForTopic } from './autopilot/packaging';
import { generateThumbnailForJob } from './thumbnailGenerator';
import { pickScriptArc } from './autopilot/scriptArcs';

// ── Paths ────────────────────────────────────────────────────────────────────

const ROOT = path.resolve(__dirname, '..', '..');

function jobDir(channelId: string, jobId: string): string {
  return path.join(ROOT, 'jobs', channelId, jobId);
}

function outputDir(channelId: string, jobId: string): string {
  return path.join(ROOT, 'output', channelId, jobId);
}

function statusPath(channelId: string, jobId: string): string {
  return path.join(outputDir(channelId, jobId), 'status.json');
}

function channelConfigPath(channelId: string): string {
  return path.join(ROOT, 'channels', channelId, 'config.json');
}

// ── Status ───────────────────────────────────────────────────────────────────

export type JobStatus =
  | 'queued'
  | 'processing_audio'
  | 'generating_spec'
  | 'generating_assets'
  | 'rendering'
  | 'ready_for_review'
  | 'approved'
  | 'uploaded'
  | 'failed';

interface StatusFile {
  status: JobStatus;
  jobId: string;
  channelId: string;
  startedAt: string;
  updatedAt: string;
  error: string | null;
}

function writeStatus(channelId: string, jobId: string, status: JobStatus, error?: string): void {
  const outDir = outputDir(channelId, jobId);
  fs.mkdirSync(outDir, { recursive: true });
  const existing = readStatus(channelId, jobId);
  const file: StatusFile = {
    status,
    jobId,
    channelId,
    startedAt: existing?.startedAt ?? new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    error: error ?? null,
  };
  fs.writeFileSync(statusPath(channelId, jobId), JSON.stringify(file, null, 2), 'utf8');
}

function readStatus(channelId: string, jobId: string): StatusFile | null {
  const p = statusPath(channelId, jobId);
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, 'utf8')) as StatusFile;
}

// ── Channel config ────────────────────────────────────────────────────────────

// Legacy ChannelConfig the spec/script/audio code consumes — now derived from the channel's
// ChannelSpec (channel.spec.json), or synthesized from a legacy config.json if no spec exists.
export function loadChannelConfig(channelId: string): ChannelConfig {
  return toChannelConfig(loadChannelSpec(channelId));
}

// ── Phase 0: Script generation ─────────────────────────────────────────────────

/**
 * Generates a narration script for a job (Phase 0) and writes it to the job's script.txt,
 * ready for the operator to read while recording. Returns the script text + counts. Creates
 * the job folder if needed. Generic across topics/channels (voice comes from channel config).
 *
 * Packaging-first (session 6): every script pays off a video PACKAGE (title + thumbnail
 * concept + hook promise). The package is taken from `packaging`, else from a previously
 * saved meta.json, else designed now for the given topic. It is persisted to meta.json so
 * the thumbnail generator and publish metadata use the same contract.
 */
export async function generateScriptForJob(
  channelId: string,
  jobId: string,
  topic: string,
  minutes: number,
  packaging?: VideoPackage
): Promise<{ scriptPath: string; script: string; wordCount: number; targetWords: number }> {
  const cfg = loadChannelConfig(channelId);
  const dir = jobDir(channelId, jobId);
  fs.mkdirSync(dir, { recursive: true });
  const metaPath = path.join(dir, 'meta.json');

  // Resolve the package: explicit arg → saved meta.json → design one for this topic now.
  // Non-fatal: a packaging failure must never block script generation (the script prompt
  // simply runs without the contract block, as before session 6).
  let pkg = packaging;
  if (!pkg) {
    try {
      const prev = fs.existsSync(metaPath) ? JSON.parse(fs.readFileSync(metaPath, 'utf8')) : {};
      if (prev.packaging?.title) pkg = prev.packaging as VideoPackage;
    } catch { /* fall through to designing one */ }
  }
  if (!pkg) {
    try {
      console.log('  [Phase 0] Designing video package (title/thumbnail/hook contract)...');
      pkg = await packageForTopic(channelId, cfg, topic);
      console.log(`  [Phase 0] Package: "${pkg.title}" | thumb: "${pkg.thumbnail.bigText}"`);
    } catch (e) {
      console.warn(`  [Phase 0] Packaging skipped (${(e as Error).message}) — writing script without a package.`);
    }
  }

  // Closed loop (Part 2): condition this script on what has actually worked for this channel
  // (promoted rules + retention pitfalls). No-op on a channel with no learnings yet.
  const learnings = loadLearnings(channelId);
  const { text: learningsBlock, ruleIds } = formatLearningsForPrompt(learnings);
  if (ruleIds.length) console.log(`  [Phase 0] Conditioning on ${ruleIds.length} learned rule(s): ${ruleIds.join(', ')}`);
  logInjectedRules(dir, ruleIds, learningsBlock);

  // Seeded narrative arc (session 7): vary the body shape per video so the channel never feels
  // templated. Seed off the topic; rotate by the channel's published count so consecutive uploads
  // walk different arcs; avoid repeating the immediately previous video's arc.
  const lastArc = learnings.videoLog[learnings.videoLog.length - 1]?.specChoices?.scriptArc as string | undefined;
  const arc = pickScriptArc(`${channelId}:${topic}`, learnings.videoLog.length, lastArc);
  console.log(`  [Phase 0] Narrative arc: ${arc.name}`);

  const { script, wordCount, targetWords, factCheck } = await generateScript(topic, minutes, cfg, learningsBlock, pkg, arc);

  const scriptPath = path.join(dir, 'script.txt');
  fs.writeFileSync(scriptPath, script + '\n', 'utf8');
  console.log(`  Script written → ${scriptPath}`);

  // Persist the fact-check audit (paper trail: claims + confidence + any hedges applied).
  if (factCheck) {
    try {
      fs.writeFileSync(path.join(dir, 'factcheck.json'), JSON.stringify(factCheck, null, 2), 'utf8');
    } catch { /* audit is best-effort */ }
  }

  // Persist the topic + length + package so the publish step can title the video, the thumbnail
  // generator can render the concept, and the analytics feedback loop can attribute metrics to
  // a topic/approach. Non-fatal if it can't write.
  try {
    const prev = fs.existsSync(metaPath) ? JSON.parse(fs.readFileSync(metaPath, 'utf8')) : {};
    fs.writeFileSync(metaPath, JSON.stringify({
      ...prev, topic, minutes, scriptArc: arc.id,
      ...(pkg ? { packaging: pkg } : {}), createdAt: new Date().toISOString(),
    }, null, 2), 'utf8');
  } catch { /* meta is best-effort */ }

  return { scriptPath, script, wordCount, targetWords };
}

// ── Phase 0.5: TTS voiceover ───────────────────────────────────────────────────

/**
 * Synthesizes the job's voiceover.wav from its script.txt using the swappable TTS adapter
 * (default Fish S1, SAPI stand-in fallback). The channel's audioIdentity.voice is the selected
 * voice unless overridden. Generic across channels.
 */
export async function generateVoiceoverForJob(
  channelId: string,
  jobId: string,
  opts: TtsOptions = {}
): Promise<TtsResult> {
  const dir = jobDir(channelId, jobId);
  const scriptPath = path.join(dir, 'script.txt');
  if (!fs.existsSync(scriptPath)) {
    throw new Error(`No script.txt for ${channelId}/${jobId} — generate a script first.`);
  }
  const text = fs.readFileSync(scriptPath, 'utf8').trim();
  const channelSpec = loadChannelSpec(channelId);
  // Saved per-job voice settings (options.json `voice`) are the base; explicit args override them;
  // the channel's audioIdentity.voice is the final fallback for the voice id.
  const merged: TtsOptions = { ...readJobVoiceOptions(channelId, jobId), ...opts };
  const voice = merged.voice ?? channelSpec.audioIdentity.voice;
  const outWav = path.join(dir, 'voiceover.wav');

  console.log(`  [Phase 0.5] Synthesizing voiceover (${merged.backend ?? process.env.TTS_BACKEND ?? 'fish'}${voice ? `, voice ${voice}` : ''})...`);
  const result = await synthesizeVoiceover(text, outWav, { ...merged, voice });
  console.log(`  [Phase 0.5] Voiceover written via ${result.backendUsed} → ${outWav}`);
  return result;
}

// ── Job detection ─────────────────────────────────────────────────────────────

function hasAllInputs(channelId: string, jobId: string): boolean {
  const dir = jobDir(channelId, jobId);
  return (
    fs.existsSync(path.join(dir, 'voiceover.wav')) &&
    fs.existsSync(path.join(dir, 'script.txt'))
  );
}

function isAlreadyProcessing(channelId: string, jobId: string): boolean {
  const s = readStatus(channelId, jobId);
  if (!s) return false;
  const terminal: JobStatus[] = ['ready_for_review', 'approved', 'uploaded', 'failed'];
  return !terminal.includes(s.status);
}

// ── Renderer subprocess ───────────────────────────────────────────────────────

function renderVideo(specPath: string, outputVideoPath: string, draft = false): void {
  const rendererDir = path.join(ROOT, 'renderer');
  // --transpile-only skips a full typecheck of the renderer on every render (it's typechecked
  // in CI / dev); shaves a few seconds off the parent-process boot. Workers already boot
  // transpile-only internally.
  const args = ['ts-node', '--transpile-only', 'src/index.ts', `"${specPath}"`, `"${outputVideoPath}"`];
  if (draft) args.push('--draft');
  const result = spawnSync('npx', args, { cwd: rendererDir, stdio: 'inherit', shell: true });
  if (result.status !== 0) {
    throw new Error(`Renderer exited with code ${result.status ?? 'unknown'}`);
  }
}

// ── YouTube upload stub ───────────────────────────────────────────────────────

function uploadToYouTube(channelId: string, jobId: string, videoPath: string): void {
  console.log(`[UPLOAD STUB] Would upload ${videoPath} to channel ${channelId} (job ${jobId})`);
  console.log('  YouTube Data API v3 upload not yet implemented.');
}

// ── Main pipeline ─────────────────────────────────────────────────────────────

// Per-job audio overrides (written by the web UI as options.json), merged over channel config.
function readJobAudioOptions(channelId: string, jobId: string): AudioConfig | undefined {
  const p = path.join(jobDir(channelId, jobId), 'options.json');
  if (!fs.existsSync(p)) return undefined;
  try {
    const opts = JSON.parse(fs.readFileSync(p, 'utf8')) as { audio?: AudioConfig };
    return opts.audio;
  } catch {
    console.warn('  [audio] options.json not valid JSON — ignoring per-job overrides');
    return undefined;
  }
}

// Per-job TTS/voice overrides (written by the web UI as options.json `voice`). Used by the
// auto-voiceover step so a job rendered without recorded audio uses the operator's voice settings.
function readJobVoiceOptions(channelId: string, jobId: string): TtsOptions {
  const p = path.join(jobDir(channelId, jobId), 'options.json');
  if (!fs.existsSync(p)) return {};
  try {
    const opts = JSON.parse(fs.readFileSync(p, 'utf8')) as { voice?: TtsOptions };
    return opts.voice ?? {};
  } catch {
    return {};
  }
}

export async function processJob(
  channelId: string,
  jobId: string,
  jobAudio?: AudioConfig,
  opts: { draft?: boolean } = {}
): Promise<void> {
  console.log(`\n=== Processing job: ${channelId}/${jobId} ===`);

  const jDir = jobDir(channelId, jobId);
  const oDir = outputDir(channelId, jobId);
  fs.mkdirSync(oDir, { recursive: true });

  const voiceoverPath = path.join(jDir, 'voiceover.wav');
  const scriptPath = path.join(jDir, 'script.txt');
  const specPath = path.join(oDir, 'board_spec.json');
  const videoPath = path.join(oDir, 'video.mp4');

  try {
    // ── Phase 0.5 (auto): synthesize a voiceover if none was recorded/uploaded ──
    // If the operator gave us a script but no voiceover.wav, generate one with the TTS adapter
    // (default Fish S1, using the job's saved voice settings) so Run "just works" end-to-end.
    if (!fs.existsSync(voiceoverPath)) {
      if (!fs.existsSync(scriptPath)) {
        throw new Error('Job needs a script.txt (to auto-generate a voiceover) or a recorded voiceover.wav.');
      }
      console.log('\n[Phase 0.5] No voiceover found — auto-generating from script via TTS...');
      const vo = await generateVoiceoverForJob(channelId, jobId, readJobVoiceOptions(channelId, jobId));
      console.log(`  [Phase 0.5] Voiceover ready via ${vo.backendUsed}${vo.fellBack ? ' (fell back)' : ''}.`);
    }

    // ── Phase 3: Audio Pipeline ──
    writeStatus(channelId, jobId, 'processing_audio');
    console.log('\n[Phase 3] Audio pipeline...');
    const { cleanAudioPath, timestamps, duration } = await processAudio(voiceoverPath, oDir);
    console.log(`  Audio duration: ${duration.toFixed(1)}s`);

    // ── Phase 2: Spec Generator ──
    writeStatus(channelId, jobId, 'generating_spec');
    console.log('\n[Phase 2] Generating board spec...');
    const channelSpec = loadChannelSpec(channelId);
    const channelConfig = toChannelConfig(channelSpec);
    const audioCfg = resolveAudioConfig(channelConfig.audio, jobAudio ?? readJobAudioOptions(channelId, jobId));
    const script = fs.readFileSync(scriptPath, 'utf8');
    const { spec, assetNeeds } = await generateBoardSpec(script, timestamps, channelConfig);

    // Authoritative duration is the actual clean_audio length, NOT the spec generator's
    // guess or the last keyframe time. Prevents the renderer from cutting the video short
    // (or padding it past) the narration.
    spec.duration_seconds = duration;

    // Embed the channel's render profile (style tokens) so the renderer adopts this channel's
    // palette/typography/background/camera/motion — absent ⇒ renderer falls back to blueprint.
    spec.style = toRenderProfile(channelSpec);

    // ── Phase 3 (additive): SFX layer ──
    // Layer a sparse handful of swoosh/cha-ching cues onto the narration, timed off the
    // spec's element/scene-cut times and the trimmed word timeline. Renderer plays whichever
    // audio file spec.audio_file points to, so we just repoint it at the mixed result.
    let audioForRender = cleanAudioPath;
    try {
      const sfxDir = path.join(ROOT, 'assets', 'sfx');
      const mixedPath = path.join(oDir, 'clean_audio_sfx.wav');
      const mixed = mixSfx(cleanAudioPath, spec, timestamps, sfxDir, mixedPath, audioCfg.sfx);
      if (mixed) audioForRender = mixed;
    } catch (e) {
      // SFX is non-critical — never fail the job over it; fall back to dry narration.
      console.warn(`  [SFX] skipped (mix error): ${(e as Error).message}`);
    }

    // ── Phase 3 (additive): mood-shifting music bed ──
    // Lay a minimal music bed under the narration+SFX that shifts mood with the sections
    // (hook→comparison→revelation→conclusion). Non-critical — never fail the job over it.
    try {
      const musicDir = path.join(ROOT, 'assets', 'music');
      const musicPath = path.join(oDir, 'clean_audio_music.wav');
      const mixed = mixMusic(audioForRender, spec, musicDir, musicPath, audioCfg.music);
      if (mixed) audioForRender = mixed;
    } catch (e) {
      console.warn(`  [music] skipped (mix error): ${(e as Error).message}`);
    }

    // Patch audio path in spec to point at the audio the renderer should mix in
    // (clean_audio.wav, or clean_audio_sfx.wav when SFX were layered) — relative to spec.
    spec.audio_file = path.relative(oDir, audioForRender).replace(/\\/g, '/');
    fs.writeFileSync(specPath, JSON.stringify(spec, null, 2), 'utf8');
    console.log(`  Spec written → ${specPath}`);

    // ── Phase 2.5: Asset Generator ──
    writeStatus(channelId, jobId, 'generating_assets');
    console.log('\n[Phase 2.5] Ensuring assets...');
    // Collect any assets the spec marked for animation (anim_action) so the generator
    // produces multi-frame sequences (door opens, person waves, etc.) instead of a still.
    const animInfo = new Map<string, AnimSpec>();
    for (const sec of spec.board.sections) {
      for (const el of sec.elements) {
        const name = el.asset_name ?? el.content;
        if (el.type === 'svg_asset' && el.anim_action && name) {
          animInfo.set(name, { action: el.anim_action, frames: el.anim_frames ?? 4 });
        }
      }
    }
    // Per-channel asset style (wireframe / flat-filled / hand-drawn / …) drives the SVG prompt.
    // `ink` = the channel's contrasting pen color (assetRules override → stroke → text primary).
    const ink = channelSpec.assetRules.ink ?? channelSpec.assetStyle.strokeColor ?? channelSpec.palette.textPrimary;
    const assetSystemPrompt = buildSvgAssetSystemPrompt({
      style: channelSpec.assetStyle.style,
      strokeColor: channelSpec.assetStyle.strokeColor,
      fillColor: channelSpec.assetStyle.fillColor,
      fill: channelSpec.assetStyle.fill,
      stroke: channelSpec.assetStyle.stroke,
      background: channelSpec.palette.background,
      ink,
    });
    // Contrast guard + palette-hash cache-bust: stale (e.g. old white-on-light) cached assets are
    // auto-invalidated when the palette changes, and every touched asset is remapped toward ink.
    const contrastRules = {
      background: channelSpec.palette.background,
      ink,
      minContrastRatio: channelSpec.assetRules.minContrastRatio,
      forbidNearBackground: channelSpec.assetRules.forbidNearBackground,
    };
    const paletteHash = createHash('sha1')
      .update(JSON.stringify({ palette: channelSpec.palette, assetStyle: channelSpec.assetStyle, assetRules: channelSpec.assetRules }))
      .digest('hex')
      .slice(0, 12);
    await ensureAssets(channelId, assetNeeds, animInfo, assetSystemPrompt, { contrast: contrastRules, paletteHash });

    // ── Phase 1: Renderer ──
    writeStatus(channelId, jobId, 'rendering');
    console.log(`\n[Phase 1] Rendering video${opts.draft ? ' (DRAFT — half-res preview)' : ''}...`);
    renderVideo(specPath, videoPath, opts.draft);

    // ── Phase 1.5: Thumbnail (session 6) ──
    // Render the packaging's thumbnail concept (or a deterministic fallback) in the channel's
    // visual language. Non-critical — the publish step attaches it only if it exists.
    try {
      console.log('\n[Phase 1.5] Rendering thumbnail...');
      const thumbPath = generateThumbnailForJob(channelId, jobId);
      console.log(`  Thumbnail → ${thumbPath}`);
    } catch (e) {
      console.warn(`  [thumbnail] skipped: ${(e as Error).message}`);
    }

    writeStatus(channelId, jobId, 'ready_for_review');
    console.log(`\n✅ Job complete — review at:\n   ${videoPath}`);
    console.log(`\n   To approve: npm run approve ${channelId} ${jobId}`);

  } catch (err) {
    const msg = (err as Error).message;
    writeStatus(channelId, jobId, 'failed', msg);
    console.error(`\n✗ Job failed: ${msg}`);
    throw err;
  }
}

export async function approveJob(channelId: string, jobId: string): Promise<void> {
  const s = readStatus(channelId, jobId);
  if (!s) throw new Error(`Job not found: ${channelId}/${jobId}`);
  if (s.status !== 'ready_for_review') {
    throw new Error(`Job is ${s.status}, not ready_for_review`);
  }

  writeStatus(channelId, jobId, 'approved');
  console.log(`Job approved: ${channelId}/${jobId}`);

  const videoPath = path.join(outputDir(channelId, jobId), 'video.mp4');
  uploadToYouTube(channelId, jobId, videoPath);
  writeStatus(channelId, jobId, 'uploaded');
}

export function printStatus(): void {
  const jobsRoot = path.join(ROOT, 'output');
  if (!fs.existsSync(jobsRoot)) {
    console.log('No jobs found.');
    return;
  }

  const rows: { channel: string; job: string; status: string; updated: string }[] = [];

  for (const channelId of fs.readdirSync(jobsRoot)) {
    const channelPath = path.join(jobsRoot, channelId);
    if (!fs.statSync(channelPath).isDirectory()) continue;
    for (const jobId of fs.readdirSync(channelPath)) {
      const s = readStatus(channelId, jobId);
      if (s) {
        rows.push({
          channel: channelId,
          job: jobId,
          status: s.status,
          updated: new Date(s.updatedAt).toLocaleString(),
        });
      }
    }
  }

  if (rows.length === 0) {
    console.log('No jobs found.');
    return;
  }

  console.log('\nJob Status:');
  console.log('─'.repeat(80));
  for (const r of rows) {
    console.log(`  ${r.channel}/${r.job}  →  ${r.status.padEnd(20)} (${r.updated})`);
  }
  console.log('─'.repeat(80));
}

// ── File watcher ──────────────────────────────────────────────────────────────

const DEBOUNCE_MS = 2000;
const pendingJobs = new Set<string>();

export function startWatcher(): void {
  const watchDir = path.join(ROOT, 'jobs');
  fs.mkdirSync(watchDir, { recursive: true });

  console.log(`Watching for jobs in: ${watchDir}`);
  console.log('Drop voiceover.wav + script.txt into jobs/{channel_id}/{job_id}/\n');

  const watcher = chokidar.watch(watchDir, {
    persistent: true,
    ignoreInitial: false,
    depth: 3,
  });

  const tryQueue = (filePath: string): void => {
    const rel = path.relative(watchDir, filePath);
    const parts = rel.split(path.sep);
    if (parts.length < 3) return;
    const [channelId, jobId] = parts;
    const key = `${channelId}/${jobId}`;

    if (pendingJobs.has(key)) return;
    if (isAlreadyProcessing(channelId, jobId)) return;
    if (!hasAllInputs(channelId, jobId)) return;

    pendingJobs.add(key);
    setTimeout(async () => {
      pendingJobs.delete(key);
      if (!hasAllInputs(channelId, jobId)) return;
      if (isAlreadyProcessing(channelId, jobId)) return;
      writeStatus(channelId, jobId, 'queued');
      try {
        await processJob(channelId, jobId);
      } catch {
        // error already written to status.json
      }
    }, DEBOUNCE_MS);
  };

  watcher.on('add', tryQueue).on('change', tryQueue);
  watcher.on('error', (err) => console.error('Watcher error:', err));

  process.on('SIGINT', () => {
    console.log('\nStopping watcher...');
    watcher.close().then(() => process.exit(0));
  });
}
