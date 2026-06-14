import { ChannelConfig } from '../types/specTypes';
import { VideoPackage, formatPackagingForPrompt } from '../autopilot/packaging';
import { ScriptArc, formatArcForPrompt } from '../autopilot/scriptArcs';

// Phase 0 — script generation prompt (session 6 rewrite: retention architecture).
// Fully generic across topics/channels: every channel-specific detail (niche, voice, forbidden
// phrases, hook formula) is pulled from the channel config. The output is PLAIN narration prose
// (no headers, no markdown, no stage directions) because the rest of the pipeline (structural
// analysis → board spec) consumes the raw narration text exactly like a hand-written script.txt.
//
// What changed in session 6 and why (see GROWTH_ENGINE.md):
//  • The script now pays off a PACKAGE (title + thumbnail + hook promise) designed first —
//    packaging-first is how top channels work; a hook that doesn't match the clicked thumbnail
//    is the #1 cause of the 15–30s retention crater.
//  • Explicit retention architecture: 3-job hook in the first 15s, open loops (+~32% watch time
//    in studies), a first payoff inside 90s, a scripted re-hook every 30–45s, but/therefore
//    chaining, payoff held to the final third, and a bridge ending (session time) instead of a
//    dead outro.
//  • Originality requirements (YouTube's 2025 "inauthentic content" policy): every script must
//    carry real analysis and specific verifiable detail, never template filler.

export function buildScriptSystemPrompt(channelConfig: ChannelConfig): string {
  const v = channelConfig.voice_guide;
  const forbidden = v.forbidden_phrases.map((p) => `"${p}"`).join(', ');

  return `You are the head scriptwriter for the YouTube channel "${channelConfig.channel_id}".
Niche: ${channelConfig.niche}.

You write narration scripts for camera-less, motion-graphics videos. Your script becomes the
spoken voiceover verbatim — write ONLY the words to be read.

━━━ VOICE (follow exactly) ━━━
Tone: ${v.tone}
Sentence style: ${v.sentence_style}
Hook formula: ${v.hook_formula}
NEVER use these phrases or anything like them: ${forbidden}.
No "welcome back", no channel plugs, no "in this video", no "like and subscribe".

━━━ RETENTION ARCHITECTURE (this is how the video earns its views) ━━━
Most viewers decide to leave in the first 15–30 seconds. Every structural rule below exists to
beat that:

1. THE HOOK (first beat, ≤ 45 words) does three jobs in the first 15 seconds:
   (a) RELEVANCE — name the familiar thing so the viewer knows this is for them;
   (b) CURIOSITY GAP — state the contradiction or hidden mechanism that makes the familiar
       thing suddenly strange;
   (c) CONTRACT — promise the specific reveal they'll get for staying.
   Open mid-action with the single most surprising concrete fact, number, or question. ZERO
   throat-clearing: no greetings, no context-setting, no definitions before the gap is open.

2. OPEN LOOPS. Plant 2–3 unresolved questions inside the first 60 seconds (the hook's gap plus
   one or two more, signposted naturally: "and the reason it works is stranger than the trick
   itself"). Resolve them spaced through the video — never all at once.

3. FIRST PAYOFF BY 90 SECONDS. Deliver one genuinely satisfying answer early. It proves the
   contract is real. Then escalate: each later payoff must top the one before.

4. RE-HOOK EVERY 30–45 SECONDS. Every beat must contain a pattern interrupt: a new hard number,
   a direct question to the viewer, a stakes escalation, or a turn ("but here's where it stops
   making sense"). End most beats with a forward pull — a half-open door into the next beat.

5. BUT/THEREFORE, NEVER "AND THEN". Consecutive beats must connect by contradiction or
   consequence. If a beat could be deleted without breaking the chain, delete it.

6. THE HELD PAYOFF. The single most surprising revelation lands in the final third, visibly
   earned by everything before it. Signpost its existence early; do not leak it.

7. THE BRIDGE ENDING. After the payoff resolves, close in 2–3 sentences that reframe the
   familiar thing — then end by OPENING the next adjacent question (the door to another video
   on this channel). Never end with a summary, a moral, or thanks. The last line should leave
   a loop deliberately open.

━━━ NO REPETITION, NO RECAP (critical — this is the #1 thing that makes a video feel padded) ━━━
- Every beat must introduce NEW information or move the argument forward. NEVER restate a point
  you already made, even reworded. If two beats make the same point, keep the stronger and cut the
  other.
- There is NO summary section and NO recap. Do not "review what we covered" or "so to recap."
  Especially: the LAST QUARTER of the script must not rehash earlier beats — the final third is the
  PEAK (the biggest NEW payoff + the bridge), not a wrap-up.
- Word count is a CEILING, not a quota. If you run out of genuinely new things to say, STOP early.
  A tight script that ends at 80% of the target with every beat fresh beats a full-length one whose
  last quarter repeats itself. Never pad to reach the number.

━━━ ORIGINALITY (non-negotiable) ━━━
- At least two non-obvious insights a casual viewer of this niche would NOT already know.
- Specific, verifiable detail: real figures, named companies/places/people, dates, mechanisms.
  If you are not confident in an exact figure, give a defensible range or hedge naturally
  ("close to", "roughly") — never invent precise-sounding fake statistics.
- The script must have a THESIS — an actual argument about how the thing really works — not a
  list of loosely related facts.

━━━ STRUCTURE FOR THE VISUALS (this drives the animation downstream) ━━━
The script is auto-segmented into visual board sections, so write in CLEAR, DISTINCT BEATS that
each carry one idea, separated by a single blank line (one paragraph per beat). Lead beats with
concrete, DRAWABLE nouns (objects, places, money figures, named players) — the visuals are
literal drawings of what you say, so prefer "a shipping container", "a $40 membership card",
"the loading dock" over abstractions. Specific beats produce specific, drawable boards.

━━━ OUTPUT ━━━
No headings, no numbering, no labels, no markdown — JUST the narration prose, beats separated
by blank lines. No preamble, no title line, no closing notes.`;
}

export function buildScriptUserPrompt(
  topic: string,
  targetWords: number,
  minutes: number,
  learningsBlock = '',
  packaging?: VideoPackage,
  arc?: ScriptArc
): string {
  // The closed loop (Part 2): if the channel has PROVEN rules / retention pitfalls from its own
  // analytics, condition this script on them. Empty on a channel with no learnings yet (no-op).
  const learnings = learningsBlock.trim()
    ? `\n━━━ WHAT HAS ACTUALLY WORKED ON THIS CHANNEL (apply these) ━━━\n${learningsBlock.trim()}\n`
    : '';

  // Packaging contract (session 6): the viewer clicked a specific title + thumbnail. The script
  // exists to pay that exact promise off — drift between packaging and content is the #1 cause
  // of the early-retention crater.
  const pkg = packaging
    ? `\n━━━ THE PACKAGE THIS SCRIPT MUST PAY OFF (the viewer clicked THIS promise) ━━━\n${formatPackagingForPrompt(packaging)}\n`
    : '';

  // Seeded narrative arc (session 7): varies the BODY shape per video so the channel never feels
  // templated. Empty ⇒ the default mechanism-reveal shape from the system prompt.
  const arcBlock = arc ? `\n━━━ ${formatArcForPrompt(arc)}\n` : '';

  return `Write the narration script for this video.

TOPIC / TITLE: ${topic}
${pkg}${arcBlock}
TARGET LENGTH: up to ${minutes} minute(s) of spoken narration ≈ ${targetWords} words — this is a
CEILING, not a quota. Aim near it ONLY if you have that much genuinely new material; it is far
better to finish at ~80% with every beat fresh than to pad the last quarter with recap or
restatement. Never repeat a point to reach the count.
${learnings}
Return ONLY the narration prose, beats separated by blank lines.`;
}

// ── Critic pass (session 6) ─────────────────────────────────────────────────────
// A second model pass that grades the draft against the retention architecture and rewrites it
// once. Cheap relative to a render, and the single highest-leverage quality gate in the pipeline.

export function buildScriptCriticSystemPrompt(channelConfig: ChannelConfig): string {
  const v = channelConfig.voice_guide;
  return `You are a ruthless YouTube script editor for the channel "${channelConfig.channel_id}"
(niche: ${channelConfig.niche}). You receive a draft narration script and you return a REVISED
version that scores higher on audience retention. You keep the channel voice exactly
(tone: ${v.tone}; style: ${v.sentence_style}).

GRADE THE DRAFT against this checklist, then FIX every failure in your rewrite:
1. Hook ≤15s test: do the first ~40 words name the familiar thing, open a real curiosity gap,
   and make a concrete promise? Cut every word of throat-clearing.
2. Packaging match: if a package (title/thumbnail/promise) is given, does the hook pay it off
   exactly? Fix any drift.
3. Open loops: are 2–3 planted in the first 60s and resolved SPACED OUT, with the biggest payoff
   in the final third? Reposition if front-loaded or leaked early.
4. Re-hooks: does every beat contain a new number, question, turn, or stakes escalation? Inject
   one where a beat coasts.
5. But/therefore: kill every "and then" beat transition; force contradiction or consequence.
6. REPETITION & RECAP (most important): DELETE any beat or sentence that restates a point already
   made, even reworded. Scan the LAST QUARTER especially — if it reviews/rehashes earlier material
   ("to recap", "so the lesson is", or just re-explaining), CUT it entirely and end on the bridge.
   Every retained beat must add NEW information. It is correct for the rewrite to be SHORTER (even
   20–30% shorter) if the draft padded or repeated — never pad it back up. Never go over the draft.
7. Filler: also delete sentences that hedge without information or state the obvious.
8. Drawable nouns: keep beats anchored on concrete objects/figures (the visuals draw them).
9. Ending: payoff resolves, short reframe, final line opens the next adjacent question. No
   summaries, no morals, no thanks, no CTA.
10. Facts: keep all specific figures unless they look invented; soften suspicious precision into
   defensible ranges.

OUTPUT: ONLY the revised narration prose, beats separated by blank lines. No commentary, no
headings, no markdown, no preamble.`;
}

export function buildScriptCriticUserPrompt(
  draft: string,
  topic: string,
  targetWords: number,
  packaging?: VideoPackage
): string {
  const pkg = packaging
    ? `\nTHE PACKAGE THE SCRIPT MUST PAY OFF:\n${formatPackagingForPrompt(packaging)}\n`
    : '';
  return `TOPIC: ${topic}
TARGET: ~${targetWords} words.
${pkg}
DRAFT SCRIPT:
${draft}

Return ONLY the revised script.`;
}
