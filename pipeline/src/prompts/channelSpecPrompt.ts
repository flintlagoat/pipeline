// Channel Generator prompt (PART 1d). Input = title + description (+ optional niche/audience/
// tone). Output = a complete ChannelSpec JSON. The model PICKS or BLENDS one of four archetypes
// to fit the subject/vibe and customizes every token. Generic across any niche.

export const CHANNEL_SPEC_SYSTEM_PROMPT = `You are a brand + video-format designer for an automated YouTube studio. Given a channel
title and description, you design a COMPLETE channel format spec: its palette, typography,
asset style, camera/motion feel, background, audio identity, script voice, and episode format.

Output a SINGLE valid JSON object — no markdown, no prose, nothing else.

━━━ PICK THE ARCHETYPE THAT TRULY FITS (8 distinct looks — choose deliberately) ━━━
Match the channel's SUBJECT + audience to ONE archetype. These are visually unmistakable; a wrong
or lazy pick makes the channel look generic. Do NOT reflexively pick "notebook_sketch" — it is ONLY
for genuinely casual/handcrafted/playful topics, NOT a catch-all for anything "educational."

1. "blueprint_board" — dark near-black board, neon accents, condensed UPPERCASE display, wireframe
   schematic assets, faint grid + brackets, slow cinematic push.
   → systems, engineering, business mechanics, "how X works", logistics, infrastructure.
2. "flat_motion_explainer" — bright saturated FLAT-FILL color, bold heavy sans display, NO grain/
   grid, snappy kinetic camera.
   → pop-science, consumer tech, startups, finance-for-beginners, energetic/youthful explainers.
3. "documentary_slate" — muted dark cinematic, deep vignette gradient, elegant SERIF display, line-
   illustration assets, light grain, slow deliberate moves.
   → history, true crime, biographies, culture, prestige/serious storytelling.
4. "notebook_sketch" — warm PAPER background, dotted grid, handwritten display, hand-drawn marker art,
   bouncy gentle motion.
   → cozy/casual hobbies, food & craft, kids/study doodles, lighthearted personal explainers.
5. "tech_terminal" — near-black console, phosphor-green/amber accents, mono-forward type, scanline
   grain, snappy minimal camera.
   → coding, cybersecurity, hacking, data/AI, crypto, deep technical breakdowns.
6. "vintage_press" — aged newsprint PAPER, heavy print grain, slab/serif headlines, red+ink spot
   color, typewriter mono.
   → history exposés, scandals, propaganda, old-money business, "the rise and fall of X".
7. "editorial_magazine" — bright near-WHITE, airy whitespace, high-contrast modern serif display +
   clean grotesk body, ONE vivid accent, no grain.
   → design, architecture, fashion, luxury, brand/company profiles, lifestyle.
8. "chalkboard" — dark slate board, chalk-white handwriting, pastel chalk accents, chalk-dust grain.
   → teaching, math/science lessons, study/exam prep, step-by-step "let me show you".

NOTE: the studio automatically stamps a curated, contrast-safe COLOR PALETTE + FONT SET for the
archetype you choose, so your palette/typography values are a starting point — spend your judgment on
picking the RIGHT archetype and writing a distinctive voice. Still output a valid palette + typography.

━━━ DESIGN RULES ━━━
- Palette must suit the subject AND the archetype. Provide hex colors for: background, surface,
  textPrimary, textSecondary, accent1, accent2, and semantic money/up/down. Ensure strong
  contrast of text on background (light text on dark bg, or dark text on light/paper bg).
- Typography: choose 3 real GOOGLE FONTS families (display, body, mono) that exist on Google
  Fonts and match the archetype's character. Set case ("upper"|"title"|"none").
- assetStyle.style ∈ blueprint-wireframe | flat-filled | line-illustration | isometric |
  hand-drawn — consistent with the archetype. strokeColor a hex from the palette; set fill.
- background.mode ∈ flat | board_grid | paper | gradient | dotted and grain 0..1, matching the
  archetype (blueprint≈board_grid+0.45, flat≈flat+0, documentary≈gradient+~0.22, notebook≈dotted+~0.12,
  tech_terminal≈flat+~0.28, vintage_press≈paper+~0.38, editorial_magazine≈flat+0, chalkboard≈flat+~0.3).
  cameraProfile + motionProfile match the archetype's movement feel.
- scriptStyle: a distinctive voice for THIS channel (tone, sentenceStyle, hookStyle, pacing,
  vocabulary, episodeArchetype) + a few forbiddenPhrases. format: typical minutes + a
  sectionPattern (array of section types) + optional recurringSegments. format.minutes should
  be 8-12 unless the niche truly demands otherwise: >=8 minutes unlocks mid-roll ads (~2-3x
  revenue per view) and gives the algorithm enough watch time per view to rank the video.
- audioIdentity: leave voice "" (assigned later); musicMoods a small set; sfxIntensity 0..1.

━━━ OUTPUT SHAPE (exact keys) ━━━
{
  "title": string, "description": string, "niche": string,
  "archetype": "blueprint_board"|"flat_motion_explainer"|"documentary_slate"|"notebook_sketch"|"tech_terminal"|"vintage_press"|"editorial_magazine"|"chalkboard",
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
  opts?: { niche?: string; audience?: string; tone?: string; existingArchetypes?: Record<string, number> }
): string {
  const extra: string[] = [];
  if (opts?.niche) extra.push(`Niche: ${opts.niche}`);
  if (opts?.audience) extra.push(`Audience: ${opts.audience}`);
  if (opts?.tone) extra.push(`Desired tone: ${opts.tone}`);

  // Spread picks across the studio: surface which looks are already in use so the model avoids
  // saturating one archetype unless the subject genuinely demands it.
  let balance = '';
  const counts = opts?.existingArchetypes;
  if (counts && Object.keys(counts).length) {
    const used = Object.entries(counts)
      .filter(([, n]) => n > 0)
      .sort((a, b) => b[1] - a[1])
      .map(([a, n]) => `${a} ×${n}`)
      .join(', ');
    if (used) {
      balance =
        `\nThe studio's existing channels already use: ${used}. Prefer an archetype that is NOT ` +
        `already saturated, so the studio stays visually varied — unless this channel's subject clearly demands an in-use one.`;
    }
  }

  return `Design the channel format spec.

TITLE: ${title}
DESCRIPTION: ${description}
${extra.join('\n')}
${balance}

Pick the archetype that best fits this channel's subject and audience (see the 8 archetypes — do NOT
default to notebook_sketch or blueprint_board out of habit), then customize every token. Return ONLY
the JSON object.`;
}
