import { ensureAssets } from './assetGenerator';

async function main() {
  if (!process.env['ANTHROPIC_API_KEY']) {
    console.error('Error: ANTHROPIC_API_KEY environment variable is not set.');
    process.exit(1);
  }

  console.log('Phase 2.5 acceptance test — Asset Generator');
  console.log('Channel: how_industries_work');
  console.log('Assets:  costco_building, money_flow_diagram');
  console.log('');

  const results = await ensureAssets('how_industries_work', [
    'costco_building',
    'money_flow_diagram',
  ]);

  console.log('\nResults:');
  for (const r of results) {
    if (r.status === 'failed') {
      console.log(`  ✗ ${r.assetName}: FAILED — ${r.error}`);
    } else {
      console.log(`  ✓ ${r.assetName}: ${r.status} → ${r.path}`);
    }
  }

  const failed = results.filter((r) => r.status === 'failed');
  if (failed.length > 0) {
    console.error(`\n✗ Test FAILED — ${failed.length} asset(s) could not be generated`);
    process.exit(1);
  }

  console.log('\n✅ Phase 2.5 PASSED — open the SVG files in a browser to visually verify.');
}

main().catch(console.error);
