// Channel Generator prompt (PART 1d). Input = title + description (+ optional niche/audience/
// tone). Output = a complete ChannelSpec JSON. The model PICKS or BLENDS one of four archetypes
// to fit the subject/vibe and customizes every token. Generic across any niche.

export const CHANNEL_SPEC_SYSTEM_PROMPT = `You are a brand + video-format designer for an automated YouTube studio. Given a channel
title and description, you design a COMPLETE channel format spec: its palette, typography,
asset style, camera/motion feel, background, audio identity, script voice, and episode format.

Output a SINGLE valid JSON object — no markdown, no prose, nothing else.

━━━ PICK AN ARCHETYPE THAT FITS (do NOT default to blueprint) ━━━
Choose the archetype whose FEEL matches the channel, then customize its tokens to the subject.
The four archetypes are visually unmistakable from one another — pick deliberately:

1. "blueprint_board" — dark near-black board, neon accents, condensed UPPERCASE display type,
   wireframe schematic assets, faint grid + registration brackets, slow cinematic camera push.
   Fits: systems/engineering/business-mechanics/"how it works" explainers.
2. "flat_motion_explainer" — bright saturated FLAT-FILL color blocks, bold heavy sans display,
   NO grain, NO grid, minimal snappy camera, kinetic. Fits: pop-explainer, tech, finance-for-
   beginners, energetic/youthful topics.
3. "documentary_slate" — muted cinematic, deep vignette gradient, elegant SERIF display, line-
   illustration assets, light grain, slow deliberate moves. Fits: history, true-stories, culture,
   prestige/serious topics.
4. "notebook_sketch" — warm PAPER background with a dotted grid, hand-drawn marker assets,
   handwritten display font, bouncy gentle motion. Fits: education, study, creative, casual/fun.

━━━ DESIGN RULES ━━━
- Palette must suit the subject AND the archetype. Provide hex colors for: background, surface,
  textPrimary, textSecondary, accent1, accent2, and semantic money/up/down. Ensure strong
  contrast of text on background (light text on dark bg, or dark text on light/paper bg).
- Typography: choose 3 real GOOGLE FONTS families (display, body, mono) that exist on Google
  Fonts and match the archetype's character. Set case ("upper"|"title"|"none").
- assetStyle.style ∈ blueprint-wireframe | flat-filled | line-illustration | isometric |
  hand-drawn — consistent with the archetype. strokeColor a hex from the palette; set fill.
- background.mode ∈ flat | board_grid | paper | gradient | dotted and grain 0..1, matching the
  archetype (blueprint≈board_grid+0.45 grain, flat≈flat+0 grain, documentary≈gradient+~0.22,
  notebook≈dotted+~0.12). cameraProfile + motionProfile match the archetype's movement feel.
- scriptStyle: a distinctive voice for THIS channel (tone, sentenceStyle, hookStyle, pacing,
  vocabulary, episodeArchetype) + a few forbiddenPhrases. format: typical minutes + a
  sectionPattern (array of section types) + optional recurringSegments. format.minutes should
  be 8-12 unless the niche truly demands otherwise: >=8 minutes unlocks mid-roll ads (~2-3x
  revenue per view) and gives the algorithm enough watch time per view to rank the video.
- audioIdentity: leave voice "" (assigned later); musicMoods a small set; sfxIntensity 0..1.

━━━ OUTPUT SHAPE (exact keys) ━━━
{
  "title": string, "description": string, "niche": string,
  "archetype": "blueprint_board"|"flat_motion_explainer"|"documentary_slate"|"notebook_sketch",
  "palette": { "background":hex,"surface":hex,"textPrimary":hex,"textSecondary":hex,"accent1":hex,"accent2":hex,"money":hex,"up":hex,"down":hex },
  "typography": { "display":string,"body":string,"mono":string,"case":"upper"|"title"|"none","letterSpacing":number },
  "layout": { "density":"tight"|"normal"|"airy","alignment":"left"|"center" },
  "assetStyle": { "style":string,"stroke":number,"fill":"none"|"flat"|"soft","strokeColor":hex,"fillColor":hex (optional) },
  "cameraProfile": { "movement":"minimal"|"gentle"|"cinematic","pushZoom":0.8-1.0,"maxTravel":0.4-4,"minDwell":0.2-2,"easing":"ease_in_out"|"cinematic"|"snap" },
  "motionProfile": { "bobAmp":0-2,"entrance":"fade_up"|"scale_in"|"blur_in"|"draw_on","fillerDensity":"none"|"low"|"medium"|"high" },
  "background": { "mode":"flat"|"board_grid"|"paper"|"gradient"|"dotted","color":hex,"color2":hex (optional),"grain":0-1 },
  "audioIdentity": { "voice":"","musicMoods":string[],"sfxPack":"default","sfxIntensity":0-1 },
  "scriptStyle": { "tone":string,"sentenceStyle":string,"hookStyle":string,"pacing":string,"vocabulary":string,"episodeArchetype":string,"forbiddenPhrases":string[] },
  "format": { "minutes":number,"sectionPattern":string[],"recurringSegments":string[] },
  "comboRules": []
}
Do NOT include an "id" — it is assigned from the title. Return ONLY the JSON object.`;

export function buildChannelSpecUserPrompt(
  title: string,
  description: string,
  opts?: { niche?: string; audience?: string; tone?: string }
): string {
  const extra: string[] = [];
  if (opts?.niche) extra.push(`Niche: ${opts.niche}`);
  if (opts?.audience) extra.push(`Audience: ${opts.audience}`);
  if (opts?.tone) extra.push(`Desired tone: ${opts.tone}`);
  return `Design the channel format spec.

TITLE: ${title}
DESCRIPTION: ${description}
${extra.join('\n')}

Pick the archetype that best fits this channel's subject and vibe (it should NOT be
blueprint_board unless a dark schematic systems-explainer is genuinely the best fit), then
customize every token. Return ONLY the JSON object.`;
}
