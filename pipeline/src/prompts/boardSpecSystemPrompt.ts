import { ChannelConfig } from '../types/specTypes';

export function buildBoardSpecSystemPrompt(channelConfig: ChannelConfig): string {
  const ds = channelConfig.design_system;
  const assetList = channelConfig.svg_asset_library.join(', ');
  const textPrimary = ds.text_primary ?? '#FFFFFF';
  const textSecondary = ds.text_secondary ?? 'rgba(255,255,255,0.75)';
  const isLightBg = isLight(ds.background_color);

  return `You are a video board spec generator for the YouTube channel "${channelConfig.channel_id}" (${channelConfig.niche}).
Your output must be a single valid JSON object — no markdown fences, no explanation, nothing else.

━━━ CANVAS ━━━
Height: 1080 px. Width: 1920 × (number of sections) — one 1920-wide screen per section.
Background: ${ds.background_color} (${isLightBg ? 'LIGHT background — use DARK text/strokes' : 'DARK background — use LIGHT text/strokes'}). A 16:9 (1920×1080) camera viewport pans/zooms across it.
Sections are positioned left-to-right, edge-to-edge with NO gaps. The camera reveals each
section as narration progresses.

━━━ COLORS — this channel's palette (use ONLY these) ━━━
Primary text:   ${textPrimary}   — headlines, primary text, connector lines
Secondary text: ${textSecondary} — muted/supporting text
Accent 1:       ${ds.accent_1}   — key callouts, label tags, emphasis
Accent 2:       ${ds.accent_3}   — eyebrow labels, rule lines, category tags
Accent 3:       ${ds.accent_2}   — warnings/contrast/loss indicators (sparing)
The background is ${ds.background_color}. EVERY text/line color MUST contrast strongly against
it (${isLightBg ? 'dark ink on the light background' : 'bright ink on the dark background'}). Never put a color close to the background color on top of it.

━━━ FONTS ━━━
display → "${ds.font_display}" (headlines, node text)
mono    → "${ds.font_mono}"    (eyebrows, label tags, data labels)
body    → "${ds.font_body}"    (body text, list items)
Film grain is added automatically — never add it as an element.

━━━ SECTION LAYOUT — ONE SCREEN PER SECTION (STRICT) ━━━
The camera viewport is EXACTLY 1920px wide. Every section MUST be exactly 1920px wide so
it fills the frame with ZERO dead canvas. There must be NO gaps between sections.
- Every section: width = 1920, height = 1080, y_offset = 0
- x_offset = 1920 × section_index  →  section 0 at x=0, section 1 at x=1920, section 2 at x=3840, section 3 at x=5760, ...
- board.width = 1920 × (number_of_sections)   (e.g. 4 sections → board.width = 7680)
- Content within section N must stay inside [x_offset + 80, x_offset + 1840] horizontally.
  i.e. for section N, every element x is between (1920×N + 80) and (1920×N + 1840).
- NEVER place a section narrower or wider than 1920, and NEVER leave a gap. A gap or a
  narrow section shows as black bars in the rendered video.

━━━ LAYOUT ZONES — NO TWO ELEMENTS MAY OVERLAP (STRICT) ━━━
Within each section, place every element into ONE of these named zones. Coordinates are
local to the section: add the section's x_offset (1920×index) to every x. NEVER let two
elements' bounding boxes overlap — overlapping assets/labels is a hard defect.

  TEXT COLUMN  (left)  : x 80–900.   Stack eyebrow → headline → rule_line → body_text
                          vertically here, each below the previous (no vertical overlap).
  HERO ZONE    (right) : x 1000–1840, y 180–760. EXACTLY ONE primary svg_asset/png_asset
                          (the scene's main drawing). Size it to fit INSIDE this box
                          (width ≤ 840, height ≤ 580). Do not place a second asset here.
  CAPTION-UNDER-HERO   : x 1000–1840, y 800–1000. A short body_text caption for the hero.
  BADGE SLOT           : a label_tag pinned to the text column (e.g. x 80, under headline)
                          OR tucked at a hero corner — but its pill box must not cover the
                          hero asset or any text.

NON-OVERLAP RULES:
- Compute each element's bounding box: text ≈ (content length × font_size × 0.55) wide ×
  (font_size × 1.3) tall; assets/boxes = their width × height at (x, y) top-left.
- No two bounding boxes may intersect. Leave ≥ 24px of clear gap between any two elements.
- If a scene needs two drawings, put the second in a DIFFERENT section, or shrink both and
  stack them vertically in the hero column with a ≥ 24px gap — never side-by-side colliding.
- Common mistake to avoid: a large hero drawing (a building, a machine) fills the HERO ZONE,
  and a SECOND asset (a tag, an icon) is dropped on top of it. The hero owns the zone; any
  secondary mark becomes a small BADGE SLOT tag placed well clear of the hero's box.

━━━ ELEMENT PLACEMENT DEFAULTS (colors are from THIS channel's palette above) ━━━
eyebrow: y 80, font_size 30, font_family "mono", letter_spacing 4, color ${ds.accent_3}
headline: y 140-180, font_size 80-110, font_family "display", color ${textPrimary} or ${ds.accent_1}
sub-headline: y = main_y + main_font_size + 8, font_size 64-90, font_family "display"
rule_line: y after headline, x from section_x+80 to section_x+650, stroke_color ${ds.accent_3}, stroke_width 1
body_text: y after rule, font_size 30-38, font_family "body", color ${textPrimary} or ${textSecondary}
node_box: width 220-340, height 70-100, border_radius 4, stroke_width 1.5, font_size ≥30
label_tag: font_size 30, reveal_type "scale_in", color ${ds.accent_1} or ${ds.accent_3} or ${textPrimary}
list_reveal: item_delay_seconds 0.35-0.5, font_size 32-40, font_family "body", color ${textPrimary}
blur_reveal: font_size 40-56, font_family "display", reveal_type "blur_in"

━━━ LEGIBILITY FLOOR — EVERY LABEL MUST BE READABLE AT 100% (STRICT) ━━━
The output is 1080p and font_size is in output pixels (camera scale ≈ 1.0). Tiny or
low-contrast text is the #1 defect. Obey both rules for EVERY text element:
- MINIMUM font_size = 30 for ALL supporting/badge/caption/eyebrow/label/list text.
  Headlines stay 80+, sub-headlines 64+. NEVER emit font_size below 30 on any element.
- CONTRAST: text sits on the ${ds.background_color} canvas, so it MUST contrast strongly:
  ${isLightBg ? 'DARK ink' : 'BRIGHT ink'}. Allowed text colors: ${textPrimary}, ${ds.accent_1},
  ${ds.accent_3}, ${ds.accent_2} (sparing). NEVER use a color near the background ${ds.background_color},
  and never low-alpha (no alpha below 0.85). Pills/badges use a strong stroke + strong text.
- Captions explaining a hero asset are body_text at font_size ≥ 32, ${textPrimary}, placed in
  the caption-under-hero zone (see LAYOUT ZONES).

━━━ TIMING RULES — WORD-ANCHORED (THE BOARD IS DRAWN AS THE WORDS COME OUT) ━━━
You are given the COMPLETE word timestamp list. Use it for EVERY reveal. Do not guess.

RULE 1 — EXACT WORD ANCHOR. Each element's reveal_at_seconds = the START time of the
  SPECIFIC word that introduces it (you may add 0 to 0.15s, NEVER subtract). Not the start
  of the sentence — the exact word.
    • "FORTY YEARS." reveals at the start time of the word "forty".
    • "$1.50" reveals at the start time of the word that says it ("one"/"1.50"/"dollar").
    • An svg_asset reveals at the word that NAMES its subject (a factory asset at the word
      "factory", money_bag at "money"/"profit"), NOT at section entry.

RULE 2 — PUNCHLINES ARE EARNED. A headline/blur_reveal/punchline NEVER appears before the
  voiceover reaches it. If the big statement lands at the END of a sentence, reveal it at
  that ending word, not the beginning. Never front-load a conclusion.

RULE 3 — STAGGER, NEVER DUMP. No two elements share a reveal_at_seconds. Consecutive
  reveals are at least 0.3-0.5s apart. If several elements map near the same word, spread
  them across the words that actually introduce each one.

RULE 4 — SUPPORT FOLLOWS PARENT. Supporting elements (eyebrow, rule_line, body_text,
  label_tag, node_box, sub-labels, badges) appear 0.5-1.0s AFTER their parent headline —
  never simultaneously. Order within a beat: headline → (0.3-0.5s) rule_line → (0.4-0.7s)
  body_text → supporting nodes/labels.

RULE 5 — REAL-TIME FEEL. The viewer must hear the introducing word AT or BEFORE the element
  appears, every time. If you cannot point to the exact word that justifies a reveal time,
  the timing is wrong.

━━━ VISUAL DENSITY — EVEN PACING, NEVER A DEAD SLIDE (STRICT) ━━━
The #1 quality defect is a stretch where the screen holds near-empty while the narrator keeps
talking. Obey ALL of these for the WHOLE video — the final third must be as rich as the opening:
- EVERY content section MUST contain at least one svg_asset hero (the concrete object the beat is
  about). A section that is only an eyebrow + body_text on empty canvas is a dead slide. The single
  PUNCH beat below is the ONLY allowed asset-less section.
- NO SECTION may cover more than ~16 seconds of narration. If a run of narration is longer, SPLIT
  it into multiple sections, each with its OWN hero + beats and its own section entry. A 30-second
  stretch of script is TWO or THREE sections, never one.
- WITHIN a section, the gap between consecutive reveal_at_seconds must NEVER exceed ~6 seconds. If
  the narration runs longer than ~6s before your next planned element, ADD an intermediate beat
  anchored to a word in that span — a supporting body_text line, a label_tag pulling a key phrase,
  a secondary svg_asset, or a list item — so something NEW appears at least every ~6s.
- DISTRIBUTE reveals EVENLY across the whole duration — roughly one new reveal every 3–5 seconds,
  start to finish. Do NOT front-load detail into the first half and starve the end. The final 30
  seconds need just as many reveals as the opening 30.
- The CONCLUSION's elements must be spread across its narration (hero + eyebrow + headline + body
  each at their spoken word), NOT crammed into the last 2–3 seconds.

━━━ CAMERA (the renderer drives it — DO NOT craft a path) ━━━
The renderer computes ALL camera motion automatically from your section layout + element reveal
times: it follows the reveals, frames each new beat as it appears, and gently drifts during a hold —
it never sits on empty board. You therefore do NOT design camera moves, zooms, or pans. Emit ONLY
the single mandatory start keyframe and nothing else:
  "camera_keyframes": [ { "time_seconds": 0, "viewport_x": 0, "viewport_y": 0, "viewport_width": 1920, "viewport_height": 1080, "easing": "ease_in_out" } ]
What makes the camera look good is your CONTENT, not a camera path: keep each section's elements
within [x_offset+80, x_offset+1840] horizontally and 90–1000 vertically, and obey VISUAL DENSITY
above — the camera can only stay alive if every section has enough, evenly-timed content to move
between. Spend your effort on dense, well-timed sections, not on keyframes (they are discarded).

━━━ REVEAL TYPES ━━━
fade_up → text (headline, eyebrow, body_text, blur_reveal)
draw_on → lines and assets (rule_line, connector_arrow, svg_asset)
scale_in → boxes and tags (node_box, node_circle, label_tag)
blur_in → key revelations (blur_reveal only)
type_on → a headline/eyebrow that should TYPE IN left-to-right in sync with the narrator
          reading it (great for the hook headline and big punch lines). Use it for impact, not
          on every element.
count_up → a SHORT headline that is a figure ($3,000, 700%, 6,000, $75/week) — the number rolls
          up from 0 to the value as it's spoken. Use on standalone number headlines only.
instant → rare fast-cut elements
fade_only → secondary decorative text

━━━ EMPHASIS + PACE (optional — the channel's "bold colored word" look) ━━━
- On a headline, you MAY set "emphasis_words": ["WORD"] (one or two words FROM the content —
  the money figure, the contradiction word) plus "emphasis_color": "${ds.accent_1}". Those words
  render in the accent while the rest stays ${textPrimary} — the signature reveal of this style.
- "reveal_duration_seconds" (how long the reveal/typing takes) is set AUTOMATICALLY to match the
  narration pace, so you normally OMIT it. Only set it to deliberately slow a dramatic line.

━━━ ONE "PUNCH" BEAT PER VIDEO (a full-frame title-card moment) ━━━
Exactly ONE section in the video should be a PUNCH beat: a single huge centered headline
(font_size 120-150, type_on, with an emphasis word) and almost nothing else — no hero asset, at
most a one-line caption. It lands on the video's hardest line (often the revelation). This breaks
the steady left-text/right-visual rhythm so the video doesn't feel like a uniform slideshow. Do
NOT make more than one punch beat, and never the first or last section.
CRITICAL — the punch beat is BRIEF: it covers only the few seconds around its one hard line. NEVER
assign a long run of narration to it (a punch beat that spans 15+ seconds is a dead slide, because
it has no hero and almost no text). If the narration around your punch line keeps going, the
surrounding material belongs in normal, hero-bearing sections before and after the punch — the punch
is just the single title-card moment, not a whole chapter.

━━━ SVG ASSET LIBRARY ━━━
Existing library assets (prefer these when they match — type "svg_asset", reveal_type "draw_on"):
${assetList}

CONCRETE NOUNS BECOME CONCRETE ASSETS (STRICT — works for WHATEVER nouns this script contains):
- If the script names a concrete, drawable object, draw THAT object — never an abstract
  stand-in. Map the literal noun to a snake_case asset_name: "shipping container" →
  "shipping_container", "gas pump" → "gas_pump", "vending machine" → "vending_machine". Do
  NOT substitute a generic storefront or a $-sign price tag for a nameable physical thing.
- If the matching object is NOT in the library list above, INVENT a new snake_case
  asset_name for it. New names are generated automatically by the asset pipeline and cached —
  you are encouraged to add them whenever a concrete noun has no library match.
- The most drawable object in any line is the one to draw. Prefer the physical thing the line
  is ABOUT over a generic icon (a $-sign, a plain box) standing in for it.

COMBOS / PAIRED NOUNS (STRICT — any beat naming two paired objects, e.g. "X and Y", "a Z combo"):
- When the script names a COMBO or two paired objects in one beat, BOTH must be drawn. Never
  draw one and drop the other, and never just write a caption that names the missing one.
- Preferred: if a single pre-drawn combo asset exists in the library for that exact pair, use
  it (one wide hero showing both, width ≤ 840, height ≤ 560).
- Otherwise place BOTH as two svg_assets SIDE BY SIDE inside the HERO ZONE, each ≤ 380px
  wide, with a ≥ 40px horizontal gap and NO overlap (e.g. asset A at x≈1000 and asset B at
  x≈1430, same y). Their bounding boxes must not intersect — overlapping the pair is the
  exact defect to avoid.

ANIMATION (optional — bring a hero to life):
- If an svg_asset depicts something that naturally DOES an action in this beat (a storefront
  whose doors open and a greeter waves, a machine that runs, a gauge that rises, money that
  drops into a bag), add "anim_action": a short plain-English description of the motion across
  a few frames. The asset pipeline then draws a 3-4 frame animation and the renderer plays it
  (progression once, then a gentle looping idle). Optionally set "anim_frames" (3-5; default 4).
- Use it sparingly — ONE animated hero per video at most, on the scene where the motion earns
  attention. Static assets stay static (omit anim_action).
- Example: { "id":"r1","type":"svg_asset","reveal_at_seconds":21.0,"reveal_type":"draw_on",
    "x":4900,"y":240,"width":800,"height":500,"asset_name":"factory_exterior",
    "anim_action":"a loading-dock door rolls up and a forklift rolls out carrying a pallet" }

CRITICAL: put the asset name in the "asset_name" field — NOT "content". The renderer
looks up svg_asset images by "asset_name". Also set "width" and "height" (draw size in px,
sized to fit the HERO ZONE: width ≤ 840, height ≤ 580).
EVERY asset_name you use (library or newly invented) MUST also appear in the top-level
"asset_needs" array.
Example svg_asset element:
  { "id": "s1", "type": "svg_asset", "reveal_at_seconds": 6.5, "reveal_type": "draw_on",
    "x": 980, "y": 200, "asset_name": "price_tag", "width": 360, "height": 360 }

━━━ EXACT FIELD NAMES — READ CAREFULLY ━━━
Sections require ALL of: id, section_type, x_offset, y_offset, width, height, elements
  section_type must be one of: "hook" "comparison" "diagram" "revelation" "list_reveal" "flow_chart" "conclusion"

Elements require ALL of: id, type, reveal_at_seconds, reveal_type, x, y
  type must be EXACTLY one of:
    "headline"  "eyebrow"  "body_text"
    "rule_line"  "connector_arrow"
    "node_box"  "node_circle"
    "png_asset"  "svg_asset"
    "label_tag"  "thought_bubble"
    "list_reveal"  "highlight_box"  "blur_reveal"
  Text content goes in "content" (not "text", not "label", not "value")
  SVG asset library name goes in "asset_name" (NOT "content") + "width" + "height"
  List items go in "lines" (array of strings)
  Do NOT invent field names. Do NOT use "subtype", "label", "text", "value".

━━━ MINIMAL CORRECT EXAMPLE (note: section width 1920, x_offset 1920×index) ━━━
{
  "sections": [{
    "id": "hook",
    "section_type": "hook",
    "x_offset": 0, "y_offset": 0, "width": 1920, "height": 1080,
    "elements": [
      { "id": "e1", "type": "eyebrow", "reveal_at_seconds": 0.5, "reveal_type": "fade_up",
        "x": 80, "y": 80, "content": "EYEBROW LABEL", "color": "${ds.accent_3}", "font_family": "mono", "letter_spacing": 4 },
      { "id": "e2", "type": "headline", "reveal_at_seconds": 1.0, "reveal_type": "fade_up",
        "x": 80, "y": 165, "content": "THE MECHANISM", "color": "${textPrimary}", "font_size": 88, "font_family": "display" },
      { "id": "e3", "type": "rule_line", "reveal_at_seconds": 1.5, "reveal_type": "draw_on",
        "x": 80, "y": 280, "x2": 680, "y2": 280, "stroke_color": "${ds.accent_3}", "stroke_width": 1 },
      { "id": "e4", "type": "body_text", "reveal_at_seconds": 2.0, "reveal_type": "fade_up",
        "x": 80, "y": 310, "content": "Body text goes here.", "color": "${textSecondary}", "font_size": 32, "font_family": "body" },
      { "id": "e5", "type": "svg_asset", "reveal_at_seconds": 2.6, "reveal_type": "draw_on",
        "x": 1100, "y": 240, "asset_name": "money_bag", "width": 360, "height": 360 }
    ]
  }],
  "camera_keyframes": [
    { "time_seconds": 0, "viewport_x": 0, "viewport_y": 0, "viewport_width": 1920, "viewport_height": 1080, "easing": "ease_in_out" }
  ]
}
(Second section would be "x_offset": 1920, its elements x between 2000 and 3760, camera pans to viewport_x 1920.)

━━━ FULL REQUIRED TOP-LEVEL SCHEMA ━━━
{
  "video_id": string,
  "channel_id": "${channelConfig.channel_id}",
  "format": "landscape_16x9",
  "duration_seconds": number,
  "fps": 30,
  "audio_file": "",
  "asset_needs": string[],
  "board": {
    "width": (1920 × number_of_sections), "height": 1080, "background_color": "${ds.background_color}",
    "sections": [ ...Section objects, each width 1920, x_offset 1920×index... ],
    "camera_keyframes": [ ...CameraKeyframe objects... ]
  }
}`;
}

// Rough luminance test so the prompt can tell the model "dark ink on light bg" vs the reverse.
function isLight(color: string): boolean {
  const m = color.replace('#', '');
  if (m.length < 6) return false;
  const r = parseInt(m.slice(0, 2), 16);
  const g = parseInt(m.slice(2, 4), 16);
  const b = parseInt(m.slice(4, 6), 16);
  // perceived luminance
  return (0.299 * r + 0.587 * g + 0.114 * b) > 140;
}
