import './config/env'; // load .env (ANTHROPIC_API_KEY etc.) as a side effect
import * as path from 'path';
import * as fs from 'fs';
import { createHash } from 'crypto';
import { generateBoardSpec } from './specGenerator';
import { ensureAssets, AnimSpec } from './assetGenerator';
import { loadChannelSpec, toChannelConfig, toRenderProfile } from './channelSpec';
import { buildSvgAssetSystemPrompt } from './prompts/svgAssetSystemPrompt';
import { WordTimestamp } from './types/specTypes';

// Re-run ONLY Phase 2 (spec gen) + Phase 2.5 (assets) for an already-processed job, reusing the
// existing output/<ch>/<job>/timestamps.json + clean_audio_*.wav — so a spec/relayout/prompt change
// can be exercised on the real path WITHOUT re-running Whisper (slow CPU transcribe) or re-mixing
// audio. Mirrors orchestrator.processJob Phase 2→2.5 exactly. Render separately with the renderer
// CLI on the written board_spec.json.
//
// Usage: ts-node src/reprocessSpec.ts <channelId> <jobId>

const ROOT = path.resolve(__dirname, '..', '..');

async function main(): Promise<void> {
  const [channelId, jobId] = process.argv.slice(2);
  if (!channelId || !jobId) {
    console.error('Usage: ts-node src/reprocessSpec.ts <channelId> <jobId>');
    process.exit(1);
  }

  const oDir = path.join(ROOT, 'output', channelId, jobId);
  const jDir = path.join(ROOT, 'jobs', channelId, jobId);
  const specPath = path.join(oDir, 'board_spec.json');
  const tsPath = path.join(oDir, 'timestamps.json');
  const scriptPath = path.join(jDir, 'script.txt');

  if (!fs.existsSync(tsPath)) throw new Error(`No timestamps.json at ${tsPath} — run a full process first.`);
  if (!fs.existsSync(scriptPath)) throw new Error(`No script.txt at ${scriptPath}`);

  const timestamps = JSON.parse(fs.readFileSync(tsPath, 'utf8')) as WordTimestamp[];
  const script = fs.readFileSync(scriptPath, 'utf8');
  // Reuse the already-mixed audio if present (music > sfx > clean), else clean_audio.wav.
  const audioCandidates = ['clean_audio_music.wav', 'clean_audio_sfx.wav', 'clean_audio.wav'];
  const audioFile = audioCandidates.find((f) => fs.existsSync(path.join(oDir, f))) ?? 'clean_audio.wav';
  const cleanAudioPath = path.join(oDir, audioFile);
  const duration = timestamps.length ? timestamps[timestamps.length - 1].end : 0;

  console.log(`\n=== Re-spec ${channelId}/${jobId} (reusing timestamps + ${audioFile}) ===`);
  console.log(`  ${timestamps.length} words, duration ${duration.toFixed(1)}s`);

  // ── Phase 2: spec ──
  const channelSpec = loadChannelSpec(channelId);
  const channelConfig = toChannelConfig(channelSpec);
  const { spec, assetNeeds } = await generateBoardSpec(script, timestamps, channelConfig);
  spec.duration_seconds = duration;
  spec.style = toRenderProfile(channelSpec);
  spec.audio_file = path.relative(oDir, cleanAudioPath).replace(/\\/g, '/');
  fs.writeFileSync(specPath, JSON.stringify(spec, null, 2), 'utf8');
  console.log(`  Spec written → ${specPath}`);

  // ── Phase 2.5: assets (mirror orchestrator) ──
  const animInfo = new Map<string, AnimSpec>();
  for (const sec of spec.board.sections) {
    for (const el of sec.elements) {
      const name = el.asset_name ?? el.content;
      if (el.type === 'svg_asset' && el.anim_action && name) {
        animInfo.set(name, { action: el.anim_action, frames: el.anim_frames ?? 4 });
      }
    }
  }
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

  console.log(`\n✅ Re-spec complete. Now render:\n   cd renderer && npx ts-node --transpile-only src/index.ts "../${path.relative(ROOT, specPath).replace(/\\/g, '/')}" "../output/${channelId}/${jobId}/video.mp4"`);
}

main().catch((err) => { console.error('Re-spec failed:', err); process.exit(1); });
