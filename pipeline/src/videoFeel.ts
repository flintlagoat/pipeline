import { createHash } from 'crypto';
import { BoardSpec, Element, ChannelConfig, RevealType, WordTimestamp } from './types/specTypes';

// Video-feel enhancement pass (session 7) — makes every video read as a VIDEO, not a slideshow,
// WITHOUT making them all identical. Runs deterministically off video_id so a given job is
// reproducible, but seeded so different videos get different reveal rhythms (viewers catch onto
// fixed patterns fast). Three effects, all generic/topic-agnostic:
//   1. Voice-paced reveal_duration — text reveals/types over a span proportional to its length
//      (longer line ⇒ longer reveal), clamped so it never overruns the next reveal in the section.
//   2. Seeded type_on — a VARIED subset of headlines/eyebrows type in left-to-right (the hook's
//      headline always types — it's the signature opening moment); the rest keep fade/scale so no
//      two videos animate the same beats the same way.
//   3. Auto-emphasis — a headline with no emphasis gets its single most salient token (a $/number,
//      an already-distinct word, else the longest word) colored in the channel accent and revealed
//      with the rest — the reference channel's "bold colored word" look.

const TYPE_CHARS_PER_SEC = 16;   // ≈ natural narration reading pace (~190 wpm)
const MIN_REVEAL = 0.4;
const MAX_REVEAL = 3.2;
const TEXT_TYPES = new Set(['headline', 'eyebrow', 'body_text', 'label_tag']);

// Small deterministic PRNG seeded from a string (mulberry32 over a hashed seed).
function makeRng(seed: string): () => number {
  const h = createHash('sha1').update(seed).digest();
  let a = h.readUInt32LE(0) ^ 0x9e3779b9;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function contentLength(el: Element): number {
  return (el.content ?? el.lines?.join(' ') ?? '').replace(/\s+/g, ' ').trim().length;
}

// A SHORT headline whose focal point is a big figure ($3,000 / 700% / 6,000) — worth a count-up.
// Length-gated so we never roll an incidental number buried in a full sentence.
const FEEL_NUM_RE = /(\d[\d,]*(?:\.\d+)?)/;
function isBigNumber(text: string): boolean {
  const t = text.trim();
  if (t.length === 0 || t.length > 16) return false;
  const m = t.match(FEEL_NUM_RE);
  if (!m) return false;
  if (m[1].includes(',')) return true;
  const v = parseFloat(m[1].replace(/,/g, ''));
  return Number.isFinite(v) && Math.abs(v) >= 100;
}

// Pick the most "clickable" word in a headline to emphasize: a money/number token wins, then an
// already-distinctive token (ALL-CAPS or contains a digit), else the longest alphabetic word.
function salientWord(text: string): string | undefined {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length < 2) return undefined; // single-word headlines don't need emphasis
  const clean = (w: string) => w.replace(/^[^\p{L}\p{N}$%]+|[^\p{L}\p{N}$%]+$/gu, '');
  const money = words.map(clean).find((w) => /[$£€]|\d/.test(w));
  if (money) return money;
  let best = '';
  for (const w of words.map(clean)) if (w.length > best.length) best = w;
  return best.length >= 4 ? best : undefined;
}

/**
 * Enhance a board spec in place with voice-paced, varied reveals + accent emphasis. `timestamps`
 * (optional) lets the reveal span track the actual narration where it can; otherwise length-based
 * pacing is used (which already correlates with speech time). Deterministic per spec.video_id.
 */
export function applyVideoFeel(
  spec: BoardSpec,
  channelConfig: ChannelConfig,
  timestamps: WordTimestamp[] = []
): { typed: number; emphasized: number; paced: number; counted: number } {
  const rng = makeRng(`feel:${spec.video_id}`);
  const accent = channelConfig.design_system.accent_1 || '#FFE500';
  const totalWords = timestamps.length;
  const speechEnd = totalWords ? timestamps[totalWords - 1].end : spec.duration_seconds;

  let typed = 0, emphasized = 0, paced = 0, counted = 0;

  for (const section of spec.board.sections) {
    // Order this section's text elements by reveal time so we can clamp durations to the gap.
    const textEls = section.elements
      .filter((el) => TEXT_TYPES.has(el.type) && contentLength(el) > 0)
      .sort((a, b) => a.reveal_at_seconds - b.reveal_at_seconds);

    textEls.forEach((el, i) => {
      const len = contentLength(el);
      const next = textEls[i + 1];
      // Gap until the next reveal in this section (or to the end of narration) bounds the span so
      // a long reveal never bleeds past the moment the narrator has moved on.
      const gap = (next ? next.reveal_at_seconds : Math.min(spec.duration_seconds, speechEnd)) - el.reveal_at_seconds;
      const wantSpan = len / TYPE_CHARS_PER_SEC;
      const span = Math.max(MIN_REVEAL, Math.min(MAX_REVEAL, wantSpan, gap > 0 ? gap * 0.9 : MAX_REVEAL));
      if (el.reveal_duration_seconds === undefined) { el.reveal_duration_seconds = round2(span); paced++; }

      const isHook = section.section_type === 'hook';
      const isHeadline = el.type === 'headline';
      const isEyebrow = el.type === 'eyebrow';

      // count_up: a headline that is a big figure ("$3,000", "700%", "6,000") rolls up from 0 —
      // a dynamic, on-brand reveal. Seeded so not every number animates (variety). Takes priority
      // over type_on for numeric headlines and is mutually exclusive with it.
      let assignedCount = false;
      if (isHeadline && el.reveal_type !== 'instant' && el.reveal_type !== 'draw_on' && isBigNumber(el.content ?? '')) {
        if (rng() < 0.7) { el.reveal_type = 'count_up'; assignedCount = true; counted++; }
      }

      // type_on assignment (seeded, varied). The hook headline always types (signature moment).
      // Other headlines/eyebrows type ~45% of the time; body types rarely (long bodies typing can
      // drag) — only short ones, occasionally. Respect an explicit instant/draw_on the model set,
      // and never override a count_up headline.
      if (!assignedCount && el.reveal_type !== 'instant' && el.reveal_type !== 'draw_on' && el.reveal_type !== ('count_up' as RevealType)) {
        let wantType = false;
        if (isHeadline && isHook && i === 0) wantType = true;
        else if (isHeadline) wantType = rng() < 0.45;
        else if (isEyebrow) wantType = rng() < 0.4;
        else if (el.type === 'body_text' && len <= 90) wantType = rng() < 0.25;
        if (wantType && el.reveal_type !== ('type_on' as RevealType)) { el.reveal_type = 'type_on'; typed++; }
      }

      // Auto-emphasis on headlines that have none (count_up headlines draw whole, so skip them).
      if (isHeadline && !assignedCount && el.reveal_type !== ('count_up' as RevealType) && (!el.emphasis_words || el.emphasis_words.length === 0)) {
        const word = salientWord(el.content ?? '');
        if (word) {
          el.emphasis_words = [word];
          el.emphasis_color = el.emphasis_color ?? accent;
          emphasized++;
        }
      }
    });
  }

  return { typed, emphasized, paced, counted };
}

function round2(n: number): number { return Math.round(n * 100) / 100; }
