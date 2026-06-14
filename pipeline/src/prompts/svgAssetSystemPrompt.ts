import { ChannelSpec } from '../types/channelSpec';

// Per-channel SVG asset style. The asset generator builds its system prompt from the channel's
// assetStyle + palette so a flat-filled channel gets filled shapes, a hand-drawn channel gets
// wobbly marker strokes, etc. — not always the blueprint wireframe. Generic across niches.

type AssetStyleId = ChannelSpec['assetStyle']['style'];

interface AssetStyleArgs {
  style: AssetStyleId;
  strokeColor: string;
  fillColor?: string;
  fill: 'none' | 'flat' | 'soft';
  stroke: number;
  background: string;   // canvas bg hex (assets are transparent but must contrast with it)
  ink?: string;         // dark/contrasting "pen" color; defaults to strokeColor
}

const STYLE_RULES: Record<AssetStyleId, string> = {
  'blueprint-wireframe':
    `Style: clean engineering schematic / technical blueprint. fill="none" on every shape — OUTLINES ONLY.\n` +
    `Strokes the given color, 1.5-2px main / 1px detail. NOT cartoonish, no decorative curves.`,
  'flat-filled':
    `Style: modern FLAT vector illustration. Bold solid FILLS using the given fill color(s); thin or no outline.\n` +
    `Clean geometric shapes, confident silhouettes, a couple of flat shades. No gradients, no outlines-only.`,
  'line-illustration':
    `Style: elegant single-weight LINE illustration (editorial / documentary). Confident continuous contours,\n` +
    `fill="none", a few interior detail lines. Refined, not technical, not cartoonish.`,
  'isometric':
    `Style: ISOMETRIC line drawing (30° axes). Show depth with parallel edges and simple side/top faces;\n` +
    `light flat fills allowed for faces. Keep it clean and readable.`,
  'hand-drawn':
    `Style: HAND-DRAWN marker/sketch. Slightly irregular, lively strokes (a touch wobbly), as if drawn by hand.\n` +
    `Mostly outlines with optional rough fills/hatching. Warm and casual, NOT a rigid technical drawing.`,
};

export function buildSvgAssetSystemPrompt(args: AssetStyleArgs): string {
  const ink = args.ink ?? args.strokeColor;
  const fillLine =
    args.fill === 'none'
      ? `- Use fill="none" on shapes (this style is outline-based).`
      : `- Use solid fills with "${args.fillColor ?? args.strokeColor}" (and a darker/lighter shade for depth). ${args.fill === 'soft' ? 'Soft, low-contrast fills.' : 'Bold flat fills.'}`;

  return `You are an SVG asset generator for an automated YouTube video studio.

Generate clean SVG drawings used as visual assets. The active channel's visual style:
${STYLE_RULES[args.style]}

RULES — follow exactly:
- Output ONLY raw SVG starting with <svg. No explanation, no markdown, no code fences.
- Self-contained: no external dependencies, no <image>, no <use> with external hrefs.
- Transparent background: do NOT add a background rect. The canvas background (the "paper") is ${args.background}, so the drawing must read clearly against it.
- CONTRAST IS MANDATORY. Draw like a pen/pencil on this paper: use the ink color "${ink}" for ALL strokes and fills. NEVER use white, near-white, or any color whose lightness is close to the paper ${args.background} — such a drawing would be invisible. Every visible stroke/fill must contrast strongly with the paper.
- Primary stroke color "${args.strokeColor}", ~${args.stroke}px main outlines, thinner for detail. Detail strokes may be a slightly lighter shade of the ink, but NEVER approach the paper color.
${fillLine}
- RECOGNIZABILITY FIRST: for a concrete physical object, the drawing must be instantly identifiable as that exact object — include its defining features. Draw the actual object, never a generic box or abstract symbol.
- Path ordering: draw the outer silhouette/outline FIRST, then interior details left-to-right, so a left-to-right clip-reveal animation looks intentional (as if being sketched).
- Viewbox: "0 0 400 300" for wide/horizontal subjects, "0 0 300 400" for tall/vertical subjects.
- Allowed elements: <line>, <rect>, <circle>, <polyline>, <polygon>, <path>, <g>. Keep it readable.
- Do NOT use <text> elements. Do NOT add animation, style blocks, or class attributes.`;
}

// Back-compat default (blueprint wireframe on the original near-black canvas).
export const SVG_ASSET_SYSTEM_PROMPT = buildSvgAssetSystemPrompt({
  style: 'blueprint-wireframe', strokeColor: '#FFFFFF', fill: 'none', stroke: 2, background: '#08090f',
});
