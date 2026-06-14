import './config/env';
import * as fs from 'fs';
import { factCheckScript } from './factCheck';
import { loadChannelSpec, toChannelConfig } from './channelSpec';

// Live test of the fact-check pass (Haiku). Usage: npx ts-node src/test_factcheck.ts <scriptPath> [channelId]
async function main(): Promise<void> {
  const scriptPath = process.argv[2] ?? '../jobs/how_industries_work/feeltest_s7/script.txt';
  const channelId = process.argv[3] ?? 'how_industries_work';
  const cfg = toChannelConfig(loadChannelSpec(channelId));
  const script = fs.readFileSync(scriptPath, 'utf8');

  const r = await factCheckScript(script, cfg);
  console.log(`\nclaims checked: ${r.claims.length} | low-confidence: ${r.lowCount} | changed: ${r.changed}\n`);
  for (const c of r.claims) {
    const mark = c.confidence === 'low' ? '⚠ LOW ' : c.confidence === 'medium' ? '~ med ' : '✓ high';
    console.log(`  ${mark}  ${c.text}${c.fix ? `\n           → ${c.fix}` : ''}`);
  }
  if (r.changed) {
    console.log('\n──── REVISED SCRIPT ────\n');
    console.log(r.script);
  }
}
main().catch((e: unknown) => { console.error('test_factcheck failed:', (e as Error).message); process.exit(1); });
