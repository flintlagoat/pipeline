import { ChannelConfig } from '../types/specTypes';

// Packaging-first prompts (session 6). On YouTube the title + thumbnail + hook promise ARE the
// product — the video exists to pay them off. These prompts make Opus design the package BEFORE
// any script is written, the way top channels work. Fully generic: every channel-specific detail
// comes from the channel config; the asset library list grounds thumbnail concepts in SVGs that
// actually exist.

export function buildPackagingSystemPrompt(cfg: ChannelConfig, assetLibrary: string[]): string {
  const lib = assetLibrary.length
    ? `\nSVG ASSETS THAT ALREADY EXIST for this channel (prefer one of these as the thumbnail hero
visual — set "assetName" to the exact name; if none fits, omit assetName and describe a new visual):
${assetLibrary.join(', ')}`
    : '';

  return `You are the head of packaging for the YouTube channel "${cfg.channel_id}"
(niche: ${cfg.niche}). You design VIDEO PACKAGES — the title, thumbnail concept, and hook
promise — BEFORE the script exists. The package is a contract: the script will be written to
pay it off exactly.

━━━ WHY PACKAGING DECIDES EVERYTHING ━━━
A video gets views through two gates: (1) CTR — does the packaging earn the click against
every other thumbnail on screen? (2) retention — does the video keep the packaging's promise?
A perfect video with weak packaging gets no impressions expansion. Your output is judged on
click-worthiness AND honesty: the promise must be big but completely keepable.

━━━ TITLE RULES ━━━
- Under 60 characters. Shorter is stronger.
- Concrete and specific: real numbers, named things, physical objects beat abstractions.
  "Why Costco Sells $1.50 Hot Dogs" beats "The Economics of Cheap Food".
- One clear curiosity gap: the reader must FEEL the missing piece ("Why...", "How X actually...",
  "The real reason...", "X is not what you think"), but NEVER vague clickbait ("You won't
  believe..."). The gap must be answerable by the video.
- Front-load the searchable subject (the named thing) in the first ~40 characters.
- No ALL CAPS words, no emoji, no clickbait punctuation (?!).

━━━ THUMBNAIL CONCEPT RULES ━━━
- "bigText": at most 4 words. It must COMPLEMENT the title, never repeat its words — title and
  thumbnail are two halves of one message (title asks, thumbnail escalates; or thumbnail shows
  the shocking number the title hints at).
- Must be readable at 120px wide: short punchy words, a number is excellent ("$1.50 SINCE 1985").
- "emphasisWord": the single word from bigText to render in the channel accent color (the money
  number, the contradiction word).
- One focal hero visual only — a single recognizable object related to the promise. Set
  "assetName" if a library asset fits.${lib}

━━━ HOOK PROMISE + LOOPS + PAYOFF ━━━
- "hookPromise": the specific sentence-level promise the first 15 seconds of the video must make
  (the title's promise restated HARDER, with a concrete stake).
- "openLoops": 2–3 specific unresolved questions the script will plant early and resolve later.
  Each must be genuinely answerable by the video's content.
- "payoff": the single most surprising, concrete revelation — the reason this video exists. It
  gets held to the final third. It must be strong enough that a viewer would mention it to a
  friend.

━━━ SCORING ━━━
Score each package 0–100 on: curiosity gap strength (40%), broad demand for the subject — would
a casual scroller who never heard of this channel click? (40%), fit with the channel's niche and
voice (20%). Be honest and spread your scores; do not cluster everything at 85.

━━━ OUTPUT — STRICT JSON ONLY (no prose, no code fences) ━━━
[
  {
    "title": "...",
    "altTitles": ["...", "..."],
    "description": "1–2 keyword-rich sentences for the YouTube description (plain, no hashtags).",
    "thumbnail": {
      "bigText": "...",
      "emphasisWord": "...",
      "assetName": "optional_library_asset",
      "visualIdea": "one line describing the hero visual"
    },
    "hookPromise": "...",
    "openLoops": ["...", "..."],
    "payoff": "...",
    "whyItWorks": "one sentence on the demand/curiosity logic",
    "score": 0
  }
]
Return ONLY that JSON array, even when asked for a single package (array of 1).`;
}

export function buildPackagingIdeasUserPrompt(
  cfg: ChannelConfig,
  n: number,
  coveredTitles: string[],
  winnerRules: string[],
  demandBlock = ''
): string {
  const demand = demandBlock.trim()
    ? `\n━━━ ${demandBlock.trim()}\nUse this REAL demand data to choose subjects/angles people are clicking on right now — but pick a FRESH topic, never copy a listed title.\n`
    : '';
  return `Design the ${n} best NEW video packages for this channel right now.

CHANNEL NICHE: ${cfg.niche}
VOICE/TONE: ${cfg.voice_guide.tone}
HOOK STYLE: ${cfg.voice_guide.hook_formula}

ALREADY COVERED (do not repeat or closely overlap):
${coveredTitles.map((t) => `- ${t}`).join('\n') || '- (nothing yet)'}
${winnerRules.length ? `\nFORMATS PROVEN TO WORK ON THIS CHANNEL (lean into the same shape):\n${winnerRules.map((w) => `- ${w}`).join('\n')}` : ''}
${demand}
Each package must target a DIFFERENT subject. Favor subjects a casual viewer already recognizes
(familiar thing, hidden mechanism) — recognition drives clicks. Return the JSON array sorted by
score, best first.`;
}

export function buildPackagingForTopicUserPrompt(cfg: ChannelConfig, topic: string): string {
  return `Design the single best video package FOR THIS EXACT TOPIC (do not change the subject;
you may sharpen the angle):

TOPIC: ${topic}

CHANNEL NICHE: ${cfg.niche}
VOICE/TONE: ${cfg.voice_guide.tone}
HOOK STYLE: ${cfg.voice_guide.hook_formula}

Return a JSON array containing exactly 1 package.`;
}
