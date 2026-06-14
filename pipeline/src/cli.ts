import './config/env'; // load .env into process.env FIRST, before anything reads a key
import { processJob, approveJob, printStatus, startWatcher, generateScriptForJob, generateVoiceoverForJob } from './orchestrator';
import { generateThumbnailForJob } from './thumbnailGenerator';
import { generateChannelSpec } from './channelGenerator';
import { loadChannelSpec } from './channelSpec';
import { generateChannelPreview } from './channelPreview';
import * as path from 'path';
import { TtsBackendId } from './tts';
import { youtubeAuthFlow } from './publish/youtubeAuth';
import { publishJob } from './publish';
import { pullAnalytics } from './analytics/pull';
import { analyzeChannel } from './analytics/analyze';
import { autorun } from './autopilot/autorun';
import { researchOutliers, formatDemandForPrompt } from './research/outliers';
import { loadChannelConfig } from './orchestrator';

const [, , cmd, ...args] = process.argv;

async function main(): Promise<void> {
  switch (cmd) {
    case 'watch': {
      startWatcher();
      break;
    }

    case 'channel:new': {
      // npm run channel:new "<title>" "<description>" [niche] [audience] [tone]
      const [title, description, niche, audience, tone] = args;
      if (!title || !description) {
        console.error('Usage: npm run channel:new "<title>" "<description>" [niche] [audience] [tone]');
        process.exit(1);
      }
      console.log(`Generating channel spec for "${title}"...`);
      const spec = await generateChannelSpec(title, description, { niche, audience, tone });
      console.log(`\n✅ Channel created: ${spec.id}`);
      console.log(`   archetype: ${spec.archetype}`);
      console.log(`   palette:   bg ${spec.palette.background}, accents ${spec.palette.accent1}/${spec.palette.accent2}`);
      console.log(`   fonts:     ${spec.typography.display} / ${spec.typography.body} / ${spec.typography.mono}`);
      console.log(`   assets:    ${spec.assetStyle.style}   background: ${spec.background.mode} (grain ${spec.background.grain})`);
      console.log(`   saved →    channels/${spec.id}/channel.spec.json (+ config.json)`);
      break;
    }

    case 'channel:preview': {
      // npm run channel:preview <channel_id> [t1,t2,...seconds]
      const [channelId, timesArg] = args;
      if (!channelId) {
        console.error('Usage: npm run channel:preview <channel_id> [t1,t2,...seconds]');
        process.exit(1);
      }
      const spec = loadChannelSpec(channelId);
      const outDir = path.resolve(__dirname, '..', '..', 'output', channelId, '_preview');
      const times = timesArg ? timesArg.split(',').map(Number).filter((t) => Number.isFinite(t)) : undefined;
      console.log(`Rendering channel-look preview for "${channelId}"...`);
      const pngs = generateChannelPreview(spec, outDir, times);
      console.log(`\n✅ Preview frames (${pngs.length}):`);
      for (const pp of pngs) console.log(`   ${pp}`);
      break;
    }

    case 'script': {
      // npm run script <channel_id> <job_id> <minutes> "<topic/title ...>"
      const [channelId, jobId, minutesStr, ...topicParts] = args;
      const minutes = Number(minutesStr);
      const topic = topicParts.join(' ').trim();
      if (!channelId || !jobId || !Number.isFinite(minutes) || minutes <= 0 || !topic) {
        console.error('Usage: npm run script <channel_id> <job_id> <minutes> "<topic/title>"');
        process.exit(1);
      }
      const { scriptPath, wordCount, targetWords } = await generateScriptForJob(channelId, jobId, topic, minutes);
      console.log(`\n✅ Script ready (${wordCount} words, target ${targetWords}):\n   ${scriptPath}`);
      console.log(`\n   Record your voiceover (or: npm run voiceover ${channelId} ${jobId}), then:`);
      console.log(`   npm run process ${channelId} ${jobId}`);
      break;
    }

    case 'voiceover': {
      // npm run voiceover <channel> <job> [backend: fish|sapi] [voiceId]
      const [channelId, jobId, backend, voice] = args;
      if (!channelId || !jobId) {
        console.error('Usage: npm run voiceover <channel_id> <job_id> [fish|sapi] [voiceId]');
        process.exit(1);
      }
      const res = await generateVoiceoverForJob(channelId, jobId, {
        backend: backend as TtsBackendId | undefined,
        voice,
      });
      console.log(`\n✅ Voiceover ready via ${res.backendUsed}${res.fellBack ? ' (fell back)' : ''}:\n   ${res.wavPath}`);
      if (res.note) console.log(`   note: ${res.note}`);
      console.log(`\n   Then: npm run process ${channelId} ${jobId}`);
      break;
    }

    case 'process': {
      // npm run process <channel> <job> [--draft]   (--draft = fast half-res preview)
      const draft = args.includes('--draft');
      const [channelId, jobId] = args.filter((a) => !a.startsWith('--'));
      if (!channelId || !jobId) {
        console.error('Usage: npm run process <channel_id> <job_id> [--draft]');
        process.exit(1);
      }
      await processJob(channelId, jobId, undefined, { draft });
      break;
    }

    case 'thumbnail': {
      // npm run thumbnail <channel> <job> — (re)render the thumbnail from the job's package.
      const [channelId, jobId] = args;
      if (!channelId || !jobId) {
        console.error('Usage: npm run thumbnail <channel_id> <job_id>');
        process.exit(1);
      }
      const out = generateThumbnailForJob(channelId, jobId);
      console.log(`\n✅ Thumbnail ready:\n   ${out}`);
      break;
    }

    case 'approve': {
      const [channelId, jobId] = args;
      if (!channelId || !jobId) {
        console.error('Usage: npm run approve <channel_id> <job_id>');
        process.exit(1);
      }
      await approveJob(channelId, jobId);
      break;
    }

    case 'status': {
      printStatus();
      break;
    }

    case 'youtube:auth': {
      // npm run youtube:auth <channel>  — one-time OAuth handshake, saves refresh token.
      const [channelId] = args;
      if (!channelId) {
        console.error('Usage: npm run youtube:auth <channel_id>');
        process.exit(1);
      }
      await youtubeAuthFlow(channelId);
      break;
    }

    case 'publish': {
      // npm run publish <channel> <job> [--schedule]
      const [channelId, jobId] = args;
      const schedule = args.includes('--schedule');
      if (!channelId || !jobId) {
        console.error('Usage: npm run publish <channel_id> <job_id> [--schedule]');
        process.exit(1);
      }
      const res = await publishJob(channelId, jobId, { schedule });
      console.log(`\n✅ ${res.message}`);
      if (res.videoUrl) console.log(`   ${res.videoUrl}`);
      break;
    }

    case 'analytics:pull': {
      // npm run analytics:pull <channel>
      const [channelId] = args;
      if (!channelId) {
        console.error('Usage: npm run analytics:pull <channel_id>');
        process.exit(1);
      }
      const res = await pullAnalytics(channelId);
      console.log(`\n✅ Pulled analytics for ${res.videos} video(s) → ${res.rawPath}`);
      break;
    }

    case 'analytics:analyze': {
      // npm run analytics:analyze <channel>
      const [channelId] = args;
      if (!channelId) {
        console.error('Usage: npm run analytics:analyze <channel_id>');
        process.exit(1);
      }
      const res = await analyzeChannel(channelId);
      console.log(`\n✅ Analysis complete. ${res.summary}`);
      console.log(`   learnings → ${res.learningsPath}`);
      break;
    }

    case 'research': {
      // npm run research <channel>  — preview niche outliers + winning patterns (needs YOUTUBE_API_KEY)
      const [channelId] = args;
      if (!channelId) {
        console.error('Usage: npm run research <channel_id>');
        process.exit(1);
      }
      const cfg = loadChannelConfig(channelId);
      const r = await researchOutliers(cfg.niche);
      if (r.note) { console.log(`\n${r.note}`); break; }
      console.log(`\nSampled ${r.sampled} niche videos; ${r.outliers.length} outliers.\n`);
      console.log(formatDemandForPrompt(r) || '(no demand signal)');
      break;
    }

    case 'autorun': {
      // npm run autorun <channel> [minutes] ["topic"]
      const [channelId, minutesStr, ...topicParts] = args;
      if (!channelId) {
        console.error('Usage: npm run autorun <channel_id> [minutes] ["topic"]');
        process.exit(1);
      }
      const minutes = Number(minutesStr) > 0 ? Number(minutesStr) : undefined;
      const topic = topicParts.join(' ').trim() || undefined;
      await autorun(channelId, { minutes, topic });
      break;
    }

    default: {
      console.log(`
YouTube Automation Pipeline

Commands:
  npm run watch                                    Watch for new jobs and process automatically
  npm run channel:new "<title>" "<desc>" ...       Generate a new channel (ChannelSpec)
  npm run channel:preview <channel>                Render still preview frames of a channel's look (no API)
  npm run script <channel> <job> <min> "<topic>"   Phase 0: generate a narration script
  npm run voiceover <channel> <job> [fish|sapi]    Phase 0.5: synthesize voiceover (default Fish S1)
  npm run process <channel> <job> [--draft]        Manually process a job → video (--draft = fast preview)
  npm run thumbnail <channel> <job>                Phase 1.5: (re)render the thumbnail from the job's package
  npm run approve <channel> <job>                  Approve a job (local mark)
  npm run status                                   Show all job statuses

  YouTube publishing (Part 1):
  npm run youtube:auth <channel>                   One-time OAuth handshake (per channel)
  npm run publish <channel> <job> [--schedule]     Upload to YouTube (private, or scheduled)

  Analytics feedback loop (Part 2):
  npm run analytics:pull <channel>                 Pull per-video metrics + retention
  npm run analytics:analyze <channel>              Update learnings.json (Opus, sample-gated)

  Passive loop (Part 3):
  npm run autorun <channel> [minutes] ["topic"]    Pull→analyze→script→voiceover→render→publish

Example:
  npm run script how_industries_work my_video_001 2 "How vending machines really make money"
  npm run process how_industries_work my_video_001
      `);
      process.exit(cmd ? 1 : 0);
    }
  }
}

main().catch((err: unknown) => {
  console.error('Error:', (err as Error).message);
  process.exit(1);
});
