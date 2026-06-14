import { BoardSpec, Section, ComboRule } from './types/specTypes';

// Deterministic safety net for "combo / paired noun" beats (Issue 5). The spec generator
// is an LLM and has repeatedly drawn a lone primary object while the script names a PAIR
// (e.g. "hot dog + soda combo") — dropping the partner or overlapping the two. This pass
// GUARANTEES both objects are drawn: if a section has the `primary` asset and its text
// mentions the partner/keyword, and the partner isn't already drawn, we swap the primary for
// the single pre-drawn `combo` asset (one wide hero showing both — zero overlap risk).
//
// GENERIC BY DESIGN: the rules are NOT hardcoded here. They come from the channel config
// (`combo_rules`). A channel with no combo_rules gets a complete no-op, so this never biases
// any topic toward food/Costco. Idempotent and keyword-gated.

function sectionText(section: Section): string {
  const parts: string[] = [];
  for (const el of section.elements) {
    if (el.content) parts.push(el.content);
    if (el.lines) parts.push(el.lines.join(' '));
  }
  return parts.join(' ').toLowerCase();
}

function svgAssetNames(section: Section): Set<string> {
  const names = new Set<string>();
  for (const el of section.elements) {
    if (el.type === 'svg_asset') {
      const n = el.asset_name ?? el.content;
      if (n) names.add(n);
    }
  }
  return names;
}

/**
 * Mutates the spec in place so every combo beat draws both objects. Returns the list of
 * asset names it added (so the caller can fold them into asset_needs).
 */
export function ensureComboAssets(spec: BoardSpec, rules: ComboRule[] = []): string[] {
  const added: string[] = [];
  if (rules.length === 0) return added;   // no rules configured ⇒ generic no-op

  for (const section of spec.board.sections) {
    const present = svgAssetNames(section);
    const text = sectionText(section);

    for (const rule of rules) {
      const hasPrimary = present.has(rule.primary);
      const hasPartner = present.has(rule.partner) || present.has(rule.combo);
      const mentionsPair = rule.keywords.some((k) => text.includes(k));

      if (!hasPrimary || hasPartner || !mentionsPair) continue;

      // Swap the lone primary svg_asset for the combined hero (shows both, no overlap math).
      const el = section.elements.find(
        (e) => e.type === 'svg_asset' && (e.asset_name ?? e.content) === rule.primary
      );
      if (!el) continue;

      el.asset_name = rule.combo;
      // The combo art is wider (≈1.6:1). Size it to fit the hero zone and clamp inside the
      // section's content band [x_offset+80, x_offset+1840].
      const w = Math.min(820, Math.max(el.width ?? 700, 720));
      const h = Math.round(w * (300 / 480));
      el.width = w;
      el.height = h;
      const maxX = section.x_offset + section.width - 80 - w;
      el.x = Math.max(section.x_offset + 1000, Math.min(el.x, maxX));

      if (!added.includes(rule.combo)) added.push(rule.combo);
      console.log(`  [combo] section "${section.id}": ${rule.primary} → ${rule.combo} (script pairs it with ${rule.partner})`);
    }
  }

  // Fold any swapped-in combo assets into asset_needs so Phase 2.5 ensures they exist.
  for (const name of added) {
    if (!spec.asset_needs.includes(name)) spec.asset_needs.push(name);
  }
  return added;
}
