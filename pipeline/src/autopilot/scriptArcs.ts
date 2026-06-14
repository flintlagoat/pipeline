import { createHash } from 'crypto';

// Seeded narrative-arc variants (session 7). Even an optimized script formula becomes a pattern
// viewers feel if every video has the identical shape (hook → 3 body beats → revelation →
// conclusion at the same rhythm). These arcs are all still "name the familiar thing, reveal the
// hidden mechanism" — but each organizes the body DIFFERENTLY, so consecutive uploads on a channel
// feel distinct. One is chosen per video, seeded + rotated so the same arc never lands twice in a
// row on a channel. Generic across niches (no topic specifics).

export interface ScriptArc {
  id: string;
  name: string;
  blueprint: string; // the body-structure instruction injected into the script prompt
}

export const SCRIPT_ARCS: ScriptArc[] = [
  {
    id: 'mechanism',
    name: 'Mechanism reveal',
    blueprint:
      'Open on the familiar surface story everyone believes. Then expose the hidden mechanism one ' +
      'gear at a time, each beat revealing a part the last one implied. Land the single number or ' +
      'fact that proves the mechanism, then reframe the familiar thing in its light.',
  },
  {
    id: 'myth_bust',
    name: 'Myth-bust',
    blueprint:
      'State the thing "everyone knows" as if you believe it — then flip it: "that is exactly ' +
      'backwards." Spend the body proving the reverse is true, beat by beat, and explain WHY the ' +
      'myth survives (who benefits from you believing it). Reframe on the real mechanism.',
  },
  {
    id: 'follow_money',
    name: 'Follow the money',
    blueprint:
      'Follow a single dollar (or unit) through the system, party by party. Each beat hands the ' +
      'dollar to the next player and shows what they skim. Reveal where the money actually pools — ' +
      'usually not where the viewer assumed — and who ultimately pays. Reframe on that.',
  },
  {
    id: 'layers',
    name: 'Peel the layers',
    blueprint:
      'Start at the obvious answer, then say "but that is only the surface." Peel back a deeper ' +
      'layer each beat, every layer more surprising than the last, until you hit the core reason ' +
      'at the center. The held payoff is the innermost layer. Reframe outward from it.',
  },
  {
    id: 'expectation_gap',
    name: 'Expectation vs reality',
    blueprint:
      'Build out what the viewer THINKS they are paying for / getting, in concrete detail. Then ' +
      'build out what they are ACTUALLY paying for / getting. Make the gap between the two the ' +
      'engine of the video; the payoff is the size or absurdity of that gap. Reframe on it.',
  },
  {
    id: 'origin_to_now',
    name: 'Origin to now',
    blueprint:
      'Trace it to a single specific decision or moment of origin (a person, a year, a constraint). ' +
      'Then show how that one choice compounded as it scaled, beat by beat, into the present-day ' +
      'consequence the viewer lives with. The payoff connects the tiny origin to the huge result.',
  },
];

// Pick an arc deterministically from a seed, avoiding `avoidId` (the previous video's arc) so the
// same shape never repeats back-to-back. `rotation` (e.g. the channel's published count) advances
// the pick so a channel cycles through arcs over time even for similar topics.
export function pickScriptArc(seed: string, rotation = 0, avoidId?: string): ScriptArc {
  const h = createHash('sha1').update(seed).digest();
  const base = (h.readUInt32LE(0) + rotation) % SCRIPT_ARCS.length;
  let arc = SCRIPT_ARCS[base];
  if (avoidId && arc.id === avoidId) arc = SCRIPT_ARCS[(base + 1) % SCRIPT_ARCS.length];
  return arc;
}

export function formatArcForPrompt(arc: ScriptArc): string {
  return `STRUCTURAL BLUEPRINT FOR THIS VIDEO — "${arc.name}":\n${arc.blueprint}\nFollow this shape ` +
    `for the BODY (the hook and bridge-ending rules still apply). Do not announce the structure; ` +
    `let it organize the beats invisibly.`;
}
