import * as fs from 'fs';
import * as path from 'path';
import { relayoutBoard } from './relayout';
import { BoardSpec } from './types/specTypes';

const ROOT = path.resolve(__dirname, '..', '..');
const specPath = process.argv[2] || path.join(ROOT, 'output', 'tiny_kitchens', 'tk_001', 'board_spec.json');
const spec = JSON.parse(fs.readFileSync(specPath, 'utf8')) as BoardSpec;

// Dump ORIGINAL coords first.
console.log('=== ORIGINAL (pre-relayout) ===');
spec.board.sections.forEach((s, i) => {
  console.log(`S${i} ${s.section_type} x_off=${s.x_offset} y_off=${s.y_offset}`);
  for (const el of s.elements) {
    console.log(`   ${el.type.padEnd(12)} x=${el.x} y=${el.y} local_x=${el.x - s.x_offset} local_y=${el.y - s.y_offset}${el.asset_name ? ' ['+el.asset_name+' '+el.width+'x'+el.height+']' : ''}${el.content ? ' "'+el.content.slice(0,24)+'"' : ''}`);
  }
});

const r = relayoutBoard(spec);
console.log('\n=== AFTER RELAYOUT ===  grid', r.cols + 'x' + r.rows);
spec.board.sections.forEach((s, i) => {
  console.log(`S${i} ${s.section_type} [${r.templates[i]}] x_off=${s.x_offset} y_off=${s.y_offset}`);
  for (const el of s.elements) {
    const lx = el.x - s.x_offset, ly = el.y - s.y_offset;
    const flagX = lx < 40 || lx > 1880 ? ' <<X' : '';
    const flagY = ly < 30 || ly > 1050 ? ' <<Y' : '';
    console.log(`   ${el.type.padEnd(12)} local_x=${lx.toFixed(0)} local_y=${ly.toFixed(0)}${el.asset_name ? ' ['+el.asset_name+' '+Math.round(el.width||0)+'x'+Math.round(el.height||0)+']' : ''}${flagX}${flagY}`);
  }
});
