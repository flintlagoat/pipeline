import { CameraKeyframe, CameraState, Section, Element } from './schema';

// ── Camera path model (rewritten 2026-06-05) ──────────────────────────────────
// The board is one continuous gapless x-strip (section N at x = 1920×N). We treat
// it as a single whiteboard and MOVE A CAMERA across it, instead of cutting/fading
// between isolated screens. The whole path is derived here, once, from the section
// geometry + each section's element reveal times — the sparse spec keyframes are
// only used for section ordering (via x_offset). Per-frame interpolation
// (getCameraAtTime) is then a plain eased lerp over the dense path this builds.
//
// Three behaviours fall out of this one model:
//   #1 No black between scenes  — the camera ARRIVES at section N+1 exactly as that
//      section's first element reveals, gliding (never cutting/fading), so it never
//      sits framed on an empty/black section and the previous section stays partly
//      visible during the travel (overlap).
//   #2 Intra-scene movement     — within each section the camera does ONE gentle,
//      eased centred push-in (Ken Burns), so no section is perfectly still, but the
//      move is motivated and never twitchy.
//   #3 Entrance dwell           — the camera does not begin travelling to the next
//      section until every element in the current section has finished entering
//      PLUS a minimum dwell, so nothing animates in right as the camera leaves.

const ANIM_DURATION = 0.55;        // must match reveal.ts ANIM_DURATION (entrance length)
const HARD_MIN_TRAVEL = 0.45;      // shortest glide we will ever do (never an instant cut)

// Camera tuning now comes from the channel's render profile (style.ts). These defaults
// reproduce the original blueprint_board feel when no profile is supplied.
export interface CameraProfile {
  pushZoom: number;      // intra-scene push-in target (1 = none; 0.93 keeps content band in frame)
  maxTravel: number;     // longest section-to-section glide (s)
  minDwell: number;      // hold after entrances before leaving (s)
  travelEasing: CameraKeyframe['easing'];
}
const DEFAULT_CAMERA: CameraProfile = { pushZoom: 0.93, maxTravel: 2.0, minDwell: 0.7, travelEasing: 'cinematic' };

function ease(t: number, type: string): number {
  switch (type) {
    case 'cinematic': // cubic in-out — the default cinematic glide
      return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    case 'ease_in_out': // quad in-out
      return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    case 'ease_out': // cubic out — snappier, decisive finish
      return 1 - Math.pow(1 - t, 3);
    case 'overshoot': { // back-out — overshoots slightly then settles to exactly 1 at t=1
      const c1 = 1.70158, c3 = c1 + 1;
      return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
    }
    case 'drift':  // sine in-out — gentle slow drift (a travel character)
    case 'idle':   // same curve, but reserved for the in-section dwell so a hold's easing can
                   // never collide with an adjacent travel's easing (keeps transitions distinct)
      return -(Math.cos(Math.PI * t) - 1) / 2;
    default:
      return t; // snap / linear
  }
}

// ── Seeded RNG (mulberry32) so transition/zoom variety is deterministic per job ──
function hashSeed(s: string): number {
  let h = 1779033703 ^ s.length;
  for (let i = 0; i < s.length; i++) {
    h = Math.imul(h ^ s.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return h >>> 0;
}
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Dominant-axis travel direction between two frames' centers (for the "no two consecutive
// transitions share direction+easing" guarantee, derived for free from the snake geometry).
function moveDirection(from: Frame, to: Frame): 'left' | 'right' | 'up' | 'down' | 'none' {
  const dx = (to.viewport_x + to.viewport_width / 2) - (from.viewport_x + from.viewport_width / 2);
  const dy = (to.viewport_y + to.viewport_height / 2) - (from.viewport_y + from.viewport_height / 2);
  if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return 'none';
  return Math.abs(dx) >= Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up');
}

const TRAVEL_EASINGS: CameraKeyframe['easing'][] = ['cinematic', 'ease_in_out', 'ease_out', 'overshoot', 'drift'];

interface Frame {
  viewport_x: number;
  viewport_y: number;
  viewport_width: number;
  viewport_height: number;
}

interface SectionTiming {
  enter: number;        // first element reveal in the section (content appears)
  lastEntrance: number; // last element reveal + ANIM_DURATION (all entrances finished)
  base: Frame;          // the section framed edge-to-edge (16:9, scale ≈ 1)
}

function baseFrame(section: Section): Frame {
  const w = section.width;
  const h = w * (9 / 16);
  return {
    viewport_x: section.x_offset,
    viewport_y: section.y_offset + (section.height - h) / 2,
    viewport_width: w,
    viewport_height: h,
  };
}

// ── Content-aware framing (2026-06-13 s8 — kill the "static slideshow" feel) ─────
// The old camera held a section near edge-to-edge and did a barely-perceptible ~5% centred push.
// On a long hold (e.g. a 12s narration beat) that read as a frozen slide. Instead we now frame the
// section's actual CONTENT BOX and make the dwell a VISIBLE push-in + a seeded directional drift.
// Because every frame is computed to CONTAIN the content box (with margin) AND is clamped inside the
// section, the move never clips text and never reveals the neighbouring section.

// Approximate board-space box of a single element (generous, so framing never crops real glyphs).
function elExtent(el: Element): Frame {
  if (el.type === 'rule_line' || el.type === 'connector_arrow') {
    const x1 = el.x, y1 = el.y, x2 = el.x2 ?? el.x, y2 = el.y2 ?? el.y;
    return { viewport_x: Math.min(x1, x2), viewport_y: Math.min(y1, y2), viewport_width: Math.abs(x2 - x1) || 4, viewport_height: Math.abs(y2 - y1) || 4 };
  }
  if (el.asset_name || typeof el.asset_width === 'number' || (el.type === 'svg_asset' || el.type === 'png_asset' || el.type === 'node_box' || el.type === 'highlight_box')) {
    const w = el.asset_width ?? el.width ?? 300;
    const h = el.asset_height ?? el.height ?? 300;
    return { viewport_x: el.x, viewport_y: el.y, viewport_width: w, viewport_height: h };
  }
  if (el.type === 'node_circle') {
    const r = el.radius ?? 40;
    return { viewport_x: el.x - r, viewport_y: el.y - r, viewport_width: r * 2, viewport_height: r * 2 };
  }
  const fs = el.font_size ?? 32;
  const lh = el.type === 'list_reveal' ? 1.5 : el.type === 'body_text' ? 1.45 : 1.35;
  let lines = el.lines?.length ?? 1;
  if (el.type === 'body_text' && el.content) lines = Math.max(1, Math.ceil(el.content.length / ((el as Element).wrap_chars ?? 52)));
  const chars = el.content ? Math.min(el.content.length, (el as Element).wrap_chars ?? el.content.length) : (el.lines ? Math.max(...el.lines.map((l) => l.length)) : 10);
  // Slightly GENEROUS width (0.62em + pad) so the camera errs toward leaving margin around text
  // rather than clipping it — a tight frame that cuts a headline reads worse than a loose one.
  return { viewport_x: el.x, viewport_y: el.y, viewport_width: Math.max(60, chars * fs * 0.62 + 30), viewport_height: lines * fs * lh };
}

// Union content box of a section in board coords.
function contentBox(section: Section): Frame {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const el of section.elements) {
    const b = elExtent(el);
    minX = Math.min(minX, b.viewport_x); minY = Math.min(minY, b.viewport_y);
    maxX = Math.max(maxX, b.viewport_x + b.viewport_width); maxY = Math.max(maxY, b.viewport_y + b.viewport_height);
  }
  if (!Number.isFinite(minX)) return baseFrame(section);
  return { viewport_x: minX, viewport_y: minY, viewport_width: maxX - minX, viewport_height: maxY - minY };
}

function clampN(v: number, lo: number, hi: number): number { return Math.max(lo, Math.min(hi, v)); }

// A 16:9 viewport that CONTAINS `box` so the box fills `coverage` of the frame (coverage<1 ⇒
// margin), centred then panned within the slack by (panX,panY)∈[-1,1], and clamped to stay fully
// inside the section (so a hold never shows the neighbour). Smaller coverage ⇒ looser/wider frame;
// larger coverage ⇒ tighter push-in. `minWidthFrac` caps the max zoom (default 0.5 ⇒ ≤2×).
function frameForContent(section: Section, box: Frame, coverage: number, panX: number, panY: number, minWidthFrac = 0.5): Frame {
  const aspect = 16 / 9;
  // Viewport needed so the box fills `coverage` (fit both axes, 16:9).
  let vw = Math.max(box.viewport_width / coverage, (box.viewport_height / coverage) * aspect);
  vw = clampN(vw, section.width * minWidthFrac, section.width); // bounded zoom, never bigger than the section
  let vh = vw / aspect;
  if (vh > section.height) { vh = section.height; vw = vh * aspect; }

  const cx = box.viewport_x + box.viewport_width / 2;
  const cy = box.viewport_y + box.viewport_height / 2;
  const slackX = Math.max(0, vw - box.viewport_width);
  const slackY = Math.max(0, vh - box.viewport_height);
  let vx = cx - vw / 2 + panX * slackX * 0.5;
  let vy = cy - vh / 2 + panY * slackY * 0.5;
  // Keep the frame inside the section bounds (no neighbour bleed on a hold).
  vx = clampN(vx, section.x_offset, section.x_offset + section.width - vw);
  vy = clampN(vy, section.y_offset, section.y_offset + section.height - vh);
  return { viewport_x: vx, viewport_y: vy, viewport_width: vw, viewport_height: vh };
}

function expandBox(f: Frame, factor: number): Frame {
  const dw = f.viewport_width * (factor - 1), dh = f.viewport_height * (factor - 1);
  return { viewport_x: f.viewport_x - dw / 2, viewport_y: f.viewport_y - dh / 2, viewport_width: f.viewport_width * factor, viewport_height: f.viewport_height * factor };
}

function unionFrame(els: Element[]): Frame | null {
  if (!els.length) return null;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const el of els) {
    const b = elExtent(el);
    minX = Math.min(minX, b.viewport_x); minY = Math.min(minY, b.viewport_y);
    maxX = Math.max(maxX, b.viewport_x + b.viewport_width); maxY = Math.max(maxY, b.viewport_y + b.viewport_height);
  }
  return { viewport_x: minX, viewport_y: minY, viewport_width: maxX - minX, viewport_height: maxY - minY };
}
function fIntersect(a: Frame, b: Frame): boolean {
  return !(a.viewport_x + a.viewport_width <= b.viewport_x || b.viewport_x + b.viewport_width <= a.viewport_x
    || a.viewport_y + a.viewport_height <= b.viewport_y || b.viewport_y + b.viewport_height <= a.viewport_y);
}
function fContains(outer: Frame, inner: Frame): boolean {
  return inner.viewport_x >= outer.viewport_x - 2 && inner.viewport_y >= outer.viewport_y - 2
    && inner.viewport_x + inner.viewport_width <= outer.viewport_x + outer.viewport_width + 2
    && inner.viewport_y + inner.viewport_height <= outer.viewport_y + outer.viewport_height + 2;
}

// Build a frame around `box` that NEVER half-cuts an element: if the computed frame partially clips
// any element in `protect`, grow the target to include it fully and recompute. Guarantees a held
// frame shows each protected element wholly in or wholly out — never hanging past the border.
function clipSafeFrame(section: Section, box: Frame, coverage: number, pan: [number, number], protect: Element[]): Frame {
  let target = box;
  for (let iter = 0; iter < 5; iter++) {
    const fr = frameForContent(section, target, coverage, pan[0], pan[1], 0.62); // ≤ ~1.6× — never "push too far"
    let grew = false;
    let minX = target.viewport_x, minY = target.viewport_y;
    let maxX = target.viewport_x + target.viewport_width, maxY = target.viewport_y + target.viewport_height;
    for (const a of protect) {
      const ab = elExtent(a);
      if (fIntersect(fr, ab) && !fContains(fr, ab)) {
        minX = Math.min(minX, ab.viewport_x); minY = Math.min(minY, ab.viewport_y);
        maxX = Math.max(maxX, ab.viewport_x + ab.viewport_width); maxY = Math.max(maxY, ab.viewport_y + ab.viewport_height);
        grew = true;
      }
    }
    if (!grew) return fr;
    target = { viewport_x: minX, viewport_y: minY, viewport_width: maxX - minX, viewport_height: maxY - minY };
  }
  return frameForContent(section, target, coverage, pan[0], pan[1], 0.62);
}

// ── Reveal-driven framing (2026-06-14) ──────────────────────────────────────────
// The camera FOLLOWS THE REVEALS. A "moment" is a cluster of elements that appear close together in
// time; the camera is framed to CONTAIN that cluster (plus the previous one, for continuity) AT the
// time it reveals — so content NEVER animates in off-camera, and the motion shape follows each
// section's own reveal timing instead of a repeated push pattern. Frames are clip-safe against the
// elements visible by that moment (a visible thing is never half-cut) at a moderate zoom (no hard
// push-in past the title). Earlier-revealed content may leave the frame — it was already seen.
interface Moment { time: number; frame: Frame; }

const REVEAL_GAP = 1.3;       // reveals within this many seconds form one moment
const MOMENT_COVERAGE = 0.82; // content fills ~82% of the frame (breathing room, moderate zoom)

function revealMoments(section: Section): Moment[] {
  const els = section.elements.filter((e) => Number.isFinite(e.reveal_at_seconds));
  if (els.length === 0) return [{ time: 0, frame: baseFrame(section) }];
  const sorted = [...els].sort((a, b) => a.reveal_at_seconds - b.reveal_at_seconds);

  // Cluster elements by reveal time.
  const clusters: Element[][] = [];
  let cur: Element[] = [];
  let lastT = -Infinity;
  for (const e of sorted) {
    if (cur.length && e.reveal_at_seconds - lastT > REVEAL_GAP) { clusters.push(cur); cur = []; }
    cur.push(e);
    lastT = e.reveal_at_seconds;
  }
  if (cur.length) clusters.push(cur);

  const moments: Moment[] = [];
  for (let k = 0; k < clusters.length; k++) {
    const time = Math.min(...clusters[k].map((e) => e.reveal_at_seconds));
    // Frame this cluster + the previous one (continuity), clip-safe against everything visible by now
    // so a revealed element is never bisected; not-yet-revealed elements may sit at the edge unseen.
    const focus = k === 0 ? clusters[0] : [...clusters[k - 1], ...clusters[k]];
    const box = unionFrame(focus)!;
    const revealedByNow = sorted.filter((e) => e.reveal_at_seconds <= time + 0.05);
    moments.push({ time, frame: clipSafeFrame(section, expandBox(box, 1.16), MOMENT_COVERAGE, [0, 0], revealedByNow) });
  }
  return moments;
}

function sectionTiming(section: Section): SectionTiming {
  let enter = Infinity;
  let lastEntrance = 0;
  for (const el of section.elements) {
    enter = Math.min(enter, el.reveal_at_seconds);
    lastEntrance = Math.max(lastEntrance, el.reveal_at_seconds + ANIM_DURATION);
  }
  if (!Number.isFinite(enter)) enter = 0;
  return { enter, lastEntrance, base: baseFrame(section) };
}

function kf(time: number, f: Frame, easing: CameraKeyframe['easing']): CameraKeyframe {
  return {
    time_seconds: time,
    viewport_x: f.viewport_x,
    viewport_y: f.viewport_y,
    viewport_width: f.viewport_width,
    viewport_height: f.viewport_height,
    easing,
  };
}

// Build the full dense camera path from the sections + their reveal timings.
// Replaces the old normalizeCameraKeyframes (which kept one static frame per scene
// and let the renderer hold dead-still then snap-pan — the "slideshow" feel).
export function buildCameraPath(
  sections: Section[],
  duration: number,
  cam: CameraProfile = DEFAULT_CAMERA,
  seedStr = 'camera'
): CameraKeyframe[] {
  // Visit sections in NARRATION (array) order — NOT sorted by x_offset. With the 2-D snake grid
  // (FIX 3) section x is no longer monotonic, so the array order is the authoritative path order.
  const ordered = sections.filter((s) => s.elements.length > 0);

  if (ordered.length === 0) {
    return [kf(0, baseFrame(sections[0] ?? { x_offset: 0, y_offset: 0, width: 1920, height: 1080, id: '', section_type: 'hook', elements: [] }), 'ease_in_out')];
  }

  const rnd = mulberry32(hashSeed(seedStr));
  const timings = ordered.map(sectionTiming);
  const sectionMoments = ordered.map((s) => revealMoments(s));
  const out: CameraKeyframe[] = [];
  let prevCombo = '';                       // last transition's direction+easing (must not repeat)
  // Rotating easings for in-section moves so two consecutive moves never share a direction+easing.
  const MOVE_EASINGS: CameraKeyframe['easing'][] = ['cinematic', 'ease_in_out', 'ease_out', 'drift'];
  let easeIdx = 0;
  const nextEase = () => MOVE_EASINGS[easeIdx++ % MOVE_EASINGS.length];

  for (let i = 0; i < ordered.length; i++) {
    const cur = timings[i];
    const moments = sectionMoments[i];

    // Emit this section's reveal-moment keyframes — the camera FOLLOWS the reveals. For sections after
    // the first, moment[0] is already on screen (the travel arrived on it), so start at moment[1].
    // Each is led slightly so the camera ARRIVES just before the cluster animates in (never off-frame
    // / mid-pan). A long gap between two reveals is filled with gentle drift so it never sits still.
    const startK = i === 0 ? 0 : 1;
    for (let k = startK; k < moments.length; k++) {
      let t = moments[k].time - (k === 0 ? 0 : 0.45);
      if (out.length) t = Math.max(t, out[out.length - 1].time_seconds + 0.4);
      if (i === 0 && k === 0) t = 0;
      const prevT = out.length ? out[out.length - 1].time_seconds : t;
      if (out.length && t - prevT > HOLD_GAP) for (const d of driftFrames(ordered[i], prevT, t, easeIdx++)) out.push(d);
      out.push(kf(t, moments[k].frame, i === 0 && k === 0 ? 'ease_in_out' : nextEase()));
    }

    const lastFrame = moments[moments.length - 1].frame;
    const lastT = out.length ? out[out.length - 1].time_seconds : 0;

    if (i < ordered.length - 1) {
      const nextFirst = sectionMoments[i + 1][0].frame;
      const nextEnter = timings[i + 1].enter;
      const arriveNext = Math.max(nextEnter, lastT + HARD_MIN_TRAVEL + 0.01);
      // Hold until it's time to leave (after entrances + dwell), capped; then glide to the next
      // section's first moment. Fill a long hold with gentle drift so it's never a frozen slide.
      let departStart = Math.max(cur.lastEntrance + cam.minDwell, arriveNext - cam.maxTravel, lastT);
      departStart = Math.min(departStart, arriveNext - HARD_MIN_TRAVEL);
      departStart = Math.max(departStart, lastT + 0.1);
      for (const d of driftFrames(ordered[i], lastT, departStart, easeIdx++)) out.push(d);
      // Hold on the last framing until depart time, so the camera doesn't leave the section (into
      // empty board space) the instant the last element reveals.
      out.push(kf(departStart, lastFrame, 'idle'));

      const dir = moveDirection(out[out.length - 1], nextFirst);
      let ti = Math.floor(rnd() * TRAVEL_EASINGS.length);
      for (let z = 0; z < TRAVEL_EASINGS.length; z++) {
        const cand = TRAVEL_EASINGS[(ti + z) % TRAVEL_EASINGS.length];
        if (`${dir}:${cand}` !== prevCombo) { ti = (ti + z) % TRAVEL_EASINGS.length; break; }
      }
      const easing = TRAVEL_EASINGS[ti];
      prevCombo = `${dir}:${easing}`;
      out.push(kf(arriveNext, nextFirst, easing));
    } else {
      // Last section: fill the tail with gentle drift then hold to the end so it never freezes.
      const endT = Math.max(duration, lastT + HARD_MIN_TRAVEL);
      for (const d of driftFrames(ordered[i], lastT, endT, easeIdx++)) out.push(d);
      out.push(kf(endT, lastFrame, 'idle'));
    }
  }

  // Final pass: no two consecutive MOVING keyframes may share a direction+easing combo, so the
  // motion never reads as a mechanical repeat (only keyframes that actually move count).
  let prevMoveCombo = '';
  for (let z = 1; z < out.length; z++) {
    const dir = moveDirection(out[z - 1], out[z]);
    if (dir === 'none') continue;
    if (`${dir}:${out[z].easing}` === prevMoveCombo) {
      const alt = MOVE_EASINGS.find((e) => `${dir}:${e}` !== prevMoveCombo);
      if (alt) out[z] = { ...out[z], easing: alt };
    }
    prevMoveCombo = `${dir}:${out[z].easing}`;
  }

  return out;
}

// Gentle drift keyframes to fill a stretch where the camera would otherwise sit still — i.e. a long
// narration gap with no new reveals. These are slow, subtle pans/zooms over the WHOLE visible content
// (a quiet Ken Burns while the narrator keeps talking about what's already on screen), NOT a push-to-
// visual tour. Clip-safe so nothing is bisected; varied pan per step so it never looks mechanical.
const HOLD_GAP = 4.5; // a gap longer than this (incl. between spread-out reveals) gets a gentle breath
// Alternating TIGHT/WIDE coverage (plus varied pan) so the drift always produces a gentle zoom
// breath — even on a near-full-width text section where panning has no room. Subtle, not a push.
const DRIFT_VARIANTS: Array<[number, number, number]> = [ // [coverage, panX, panY]
  [0.95, -0.3, -0.2], [0.82, 0.35, 0.3], [0.93, 0.3, -0.3], [0.84, -0.3, 0.25], [0.90, 0.0, 0.35],
];

function driftFrames(section: Section, fromT: number, toT: number, startVariant: number): CameraKeyframe[] {
  const span = toT - fromT;
  const n = Math.floor(span / HOLD_GAP);
  if (n < 1) return [];
  const visible = section.elements.filter((e) => Number.isFinite(e.reveal_at_seconds));
  const box = unionFrame(visible) ?? baseFrame(section);
  const ease: CameraKeyframe['easing'][] = ['drift', 'ease_in_out', 'cinematic', 'ease_out'];
  const out: CameraKeyframe[] = [];
  for (let s = 1; s <= n; s++) {
    const t = fromT + span * (s / (n + 1));
    const [cov, px, py] = DRIFT_VARIANTS[(startVariant + s) % DRIFT_VARIANTS.length];
    out.push(kf(t, clipSafeFrame(section, expandBox(box, 1.04), cov, [px, py], visible), ease[s % ease.length]));
  }
  return out;
}

export function getCameraAtTime(
  keyframes: CameraKeyframe[],
  _sections: Section[],
  currentTime: number
): CameraState {
  if (!keyframes.length) {
    return { viewport_x: 0, viewport_y: 0, viewport_width: 1920, viewport_height: 1080 };
  }
  if (currentTime <= keyframes[0].time_seconds) {
    const k = keyframes[0];
    return { viewport_x: k.viewport_x, viewport_y: k.viewport_y, viewport_width: k.viewport_width, viewport_height: k.viewport_height };
  }
  const last = keyframes[keyframes.length - 1];
  if (currentTime >= last.time_seconds) {
    return { viewport_x: last.viewport_x, viewport_y: last.viewport_y, viewport_width: last.viewport_width, viewport_height: last.viewport_height };
  }

  let from = keyframes[0];
  let to = keyframes[1];
  for (let i = 0; i < keyframes.length - 1; i++) {
    if (currentTime >= keyframes[i].time_seconds && currentTime < keyframes[i + 1].time_seconds) {
      from = keyframes[i];
      to = keyframes[i + 1];
      break;
    }
  }

  const duration = to.time_seconds - from.time_seconds;
  const rawT = duration > 0 ? Math.min(1, (currentTime - from.time_seconds) / duration) : 1;
  const t = ease(rawT, to.easing);

  return {
    viewport_x: from.viewport_x + (to.viewport_x - from.viewport_x) * t,
    viewport_y: from.viewport_y + (to.viewport_y - from.viewport_y) * t,
    viewport_width: from.viewport_width + (to.viewport_width - from.viewport_width) * t,
    viewport_height: from.viewport_height + (to.viewport_height - from.viewport_height) * t,
  };
}

export function toScreen(
  canvasX: number,
  canvasY: number,
  camera: CameraState,
  outputWidth: number
): { x: number; y: number; scale: number } {
  const scale = outputWidth / camera.viewport_width;
  return {
    x: (canvasX - camera.viewport_x) * scale,
    y: (canvasY - camera.viewport_y) * scale,
    scale,
  };
}

export function isInViewport(
  elX: number,
  elY: number,
  elW: number,
  elH: number,
  camera: CameraState
): boolean {
  const right = camera.viewport_x + camera.viewport_width;
  const bottom = camera.viewport_y + camera.viewport_height;
  return !(elX + elW < camera.viewport_x || elX > right || elY + elH < camera.viewport_y || elY > bottom);
}
