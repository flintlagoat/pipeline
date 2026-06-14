import { readFileSync, writeFileSync } from 'fs';
import * as path from 'path';
import { generateBoardSpec } from './specGenerator';
import { generateFakeTimestamps } from './utils/findTimestamp';
import { validateSpec } from './validation/validateSpec';
import { ChannelConfig } from './types/specTypes';

async function main(): Promise<void> {
  if (!process.env['ANTHROPIC_API_KEY']) {
    console.error('Error: ANTHROPIC_API_KEY environment variable is not set.');
    process.exit(1);
  }

  const root = path.join(__dirname, '../..');
  const script = readFileSync(path.join(root, 'test/fixtures/test_script.txt'), 'utf8').trim();
  const channelConfig = JSON.parse(
    readFileSync(path.join(root, 'channels/how_industries_work/config.json'), 'utf8')
  ) as ChannelConfig;

  const wordCount = script.split(/\s+/).length;
  const timestamps = generateFakeTimestamps(script, 2.3);
  const estimatedDuration = timestamps[timestamps.length - 1].end;

  console.log(`Script: ${wordCount} words @ 2.3 w/s = ~${estimatedDuration.toFixed(1)}s`);
  console.log('Generating board spec...');

  const { spec, assetNeeds } = await generateBoardSpec(script, timestamps, channelConfig);

  const validation = validateSpec(spec);
  if (!validation.success) {
    console.error('\n❌ Validation failed:');
    console.error(validation.error);
    process.exit(1);
  }

  const totalElements = spec.board.sections.reduce((sum, s) => sum + s.elements.length, 0);
  console.log('\n✅ Spec generated and validated:');
  console.log(`  video_id:         ${spec.video_id}`);
  console.log(`  duration_seconds: ${spec.duration_seconds}s`);
  console.log(`  sections:         ${spec.board.sections.length}`);
  console.log(`  elements:         ${totalElements}`);
  console.log(`  camera keyframes: ${spec.board.camera_keyframes.length}`);
  console.log(`  asset_needs:      ${assetNeeds.length > 0 ? assetNeeds.join(', ') : 'none'}`);

  const outPath = path.join(root, 'test/test_spec_output.json');
  writeFileSync(outPath, JSON.stringify(spec, null, 2));
  console.log(`\nSaved to: ${outPath}`);
}

main().catch((err: unknown) => {
  console.error('\nTest failed:', err);
  process.exit(1);
});
