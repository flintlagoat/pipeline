// Animated number count-up (session 7). When a headline is a figure ("$3,000", "700%", "6,000"),
// the `count_up` reveal animates the digits rolling up from zero to the target over the reveal
// window — the signature explainer-video move (far more dynamic than a static fade), and perfectly
// on-brand for a numbers-heavy channel. Pure string→string; preserves the original prefix/suffix,
// decimal places, and thousands separators so the final frame lands exactly on the written value.

const NUM_RE = /(\d[\d,]*(?:\.\d+)?)/; // first number run: digits, optional commas + decimals

// ease-out cubic: fast then decelerates into the final value (feels like it "lands").
function easeOutCubic(t: number): number {
  const u = 1 - Math.min(1, Math.max(0, t));
  return 1 - u * u * u;
}

/** Is this text worth animating as a count-up? (a number ≥ 100, or any comma/decimal figure). */
export function isCountable(text: string): boolean {
  const m = text.match(NUM_RE);
  if (!m) return false;
  const raw = m[1];
  if (raw.includes(',')) return true;
  const val = parseFloat(raw.replace(/,/g, ''));
  return Number.isFinite(val) && Math.abs(val) >= 100;
}

function formatLike(value: number, decimals: number, hasComma: boolean): string {
  let s = value.toFixed(decimals);
  if (hasComma) {
    const [intPart, decPart] = s.split('.');
    const withSep = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    s = decPart !== undefined ? `${withSep}.${decPart}` : withSep;
  }
  return s;
}

/**
 * Return `text` with its first number interpolated from 0 → target by `progress` (0..1), keeping
 * the surrounding characters ($, %, "percent", "/week", …) and the number's own formatting. At
 * progress ≥ 1 the result is identical to the input.
 */
export function interpolateNumber(text: string, progress: number): string {
  const m = NUM_RE.exec(text);
  if (!m) return text;
  const raw = m[1];
  const hasComma = raw.includes(',');
  const decimals = raw.includes('.') ? (raw.split('.')[1]?.length ?? 0) : 0;
  const target = parseFloat(raw.replace(/,/g, ''));
  if (!Number.isFinite(target)) return text;
  const current = target * easeOutCubic(progress);
  const formatted = formatLike(current, decimals, hasComma);
  return text.slice(0, m.index) + formatted + text.slice(m.index + raw.length);
}
