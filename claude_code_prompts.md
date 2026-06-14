# Claude Code Session Prompts
# YouTube Automation Pipeline — How Industries Work

---

## BEFORE YOU START

**Your project folder needs:**
- `CLAUDE.md` in the root
- Node.js 20+ installed
- Python 3.10+ installed
- FFmpeg installed: `brew install ffmpeg` (Mac) or `winget install ffmpeg` (Windows)

**How to use these in Google Antigravity:**
1. Open Antigravity, open your project folder
2. Open the agent sidebar (the chat panel)
3. Switch the model to **Claude Sonnet 4.6** (not Gemini) for consistency
4. Paste the full prompt for the phase you're building
5. Let the agent run — it will read CLAUDE.md and build the phase
6. Do not start the next phase until the current one passes its acceptance test

---

# PROMPT 1 — Build the Board Renderer

*Paste everything below this line into a fresh Antigravity agent session:*

---

Read CLAUDE.md in the current directory completely before writing any code.

You are building **Phase 1: The Board Renderer**. This is a Node.js TypeScript project that reads a `board_spec.json` file and renders a complete video. It uses `@napi-rs/canvas` to draw frames and FFmpeg to assemble them — no browser or Chromium required.

## Step 0: Install dependencies

```bash
mkdir -p renderer/src/elements renderer/fonts
cd renderer
npm init -y
npm install @napi-rs/canvas @resvg/resvg-js fluent-ffmpeg ffmpeg-static
npm install @anthropic-ai/sdk zod
npm install -D typescript @types/node ts-node
npx tsc --init --target ES2022 --module commonjs --strict --outDir dist --rootDir src
```

## Architecture

The renderer works in three stages:

**Stage 1: Setup**
- Load and register fonts (auto-download TTF files on first run)
- Pre-render the grain overlay as a PNG buffer (done once, reused every frame)
- Load and parse board_spec.json
- Pre-rasterize all SVG assets needed by this spec using @resvg/resvg-js

**Stage 2: Frame loop**
For each frame from 0 to `totalFrames`:
- Calculate current time in seconds: `currentTime = frame / fps`
- Interpolate camera viewport for this frame from `camera_keyframes`
- Create a canvas at 1920×1080 (landscape) or 1080×1920 (portrait)
- Fill with background color `#08090f`
- For each section, for each element: calculate if revealed, calculate animation progress, draw if in viewport
- Composite the grain overlay on top
- Save frame as PNG to `/tmp/frames_{video_id}/frame_000001.png` (zero-padded 6 digits)

**Stage 3: FFmpeg assembly**
- Stitch all frames into video at spec fps
- Mix in audio file if it exists
- Output final video.mp4
- Clean up temp frames folder

## Camera System

```typescript
// camera.ts
// Easing functions
const ease = (t: number, type: string): number => {
  if (type === 'cinematic') {
    // cubic-bezier(0.77, 0, 0.175, 1) approximation
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }
  if (type === 'ease_in_out') {
    return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
  }
  return t; // snap
};

export function getCameraAtTime(keyframes: CameraKeyframe[], currentTime: number): CameraState {
  // Find the two keyframes we're between
  // Interpolate viewport_x, viewport_y, viewport_width, viewport_height
  // Apply easing based on the destination keyframe's easing type
  // Return interpolated CameraState
}

// To convert element canvas coordinates to screen coordinates:
export function toScreen(canvasX: number, canvasY: number, camera: CameraState, outputWidth: number): {x: number, y: number, scale: number} {
  const scale = outputWidth / camera.viewport_width; // outputWidth = 1920
  return {
    x: (canvasX - camera.viewport_x) * scale,
    y: (canvasY - camera.viewport_y) * scale,
    scale, // use this to scale font sizes and stroke widths
  };
}

// Skip drawing elements entirely outside the viewport (optimization):
export function isInViewport(element: Element, camera: CameraState): boolean {
  // Check if element's bounding box overlaps with camera viewport
}
```

## Reveal/Animation System

```typescript
// reveal.ts
const ANIM_DURATION_SECONDS = 0.55; // duration of reveal animation

export function getRevealProgress(revealAtSeconds: number, currentTime: number): number {
  if (currentTime < revealAtSeconds) return 0;
  const elapsed = currentTime - revealAtSeconds;
  return Math.min(1, elapsed / ANIM_DURATION_SECONDS);
}

// Apply reveal_type to get drawing parameters:
export function applyReveal(
  ctx: CanvasRenderingContext2D,
  revealType: RevealType,
  progress: number,
  drawFn: () => void
): void {
  if (progress === 0) return;
  
  switch (revealType) {
    case 'fade_up':
      ctx.save();
      ctx.globalAlpha = progress;
      ctx.translate(0, (1 - progress) * 12); // 12px upward slide
      drawFn();
      ctx.restore();
      break;
    case 'fade_only':
      ctx.save();
      ctx.globalAlpha = progress;
      drawFn();
      ctx.restore();
      break;
    case 'scale_in':
      ctx.save();
      ctx.globalAlpha = progress;
      // scale from element center — caller sets transform origin
      drawFn();
      ctx.restore();
      break;
    case 'blur_in':
      ctx.save();
      const blurPx = (1 - progress) * 8;
      ctx.globalAlpha = 0.2 + progress * 0.8;
      if (blurPx > 0.1) ctx.filter = `blur(${blurPx.toFixed(1)}px)`;
      drawFn();
      ctx.filter = 'none';
      ctx.restore();
      break;
    case 'instant':
      if (progress > 0) drawFn();
      break;
    default:
      ctx.save();
      ctx.globalAlpha = progress;
      drawFn();
      ctx.restore();
  }
}
```

## Font Loading

```typescript
// fonts.ts
import { GlobalFonts } from '@napi-rs/canvas';
import { existsSync, mkdirSync, writeFileSync } from 'fs';

const FONT_DIR = './fonts';
const FONTS = [
  {
    family: 'Bebas Neue',
    file: 'BebasNeue-Regular.ttf',
    url: 'https://fonts.gstatic.com/s/bebasneue/v14/JTUSjIg69CK48gW7PXooxU5J.ttf',
  },
  {
    family: 'IBM Plex Mono',
    file: 'IBMPlexMono-Regular.ttf',
    url: 'https://fonts.gstatic.com/s/ibmplexmono/v19/-F63fjptAgt5VM-kVkqdyU8n1i8q1s5s.ttf',
  },
  {
    family: 'Syne',
    file: 'Syne-Bold.ttf',
    url: 'https://fonts.gstatic.com/s/syne/v22/8vIS7w4qzmVxsWxjBZRjr0FKM_04uA.ttf',
  },
];

export async function loadFonts(): Promise<void> {
  if (!existsSync(FONT_DIR)) mkdirSync(FONT_DIR, { recursive: true });
  for (const font of FONTS) {
    const fontPath = `${FONT_DIR}/${font.file}`;
    if (!existsSync(fontPath)) {
      console.log(`Downloading font: ${font.family}...`);
      const response = await fetch(font.url);
      const buffer = await response.arrayBuffer();
      writeFileSync(fontPath, Buffer.from(buffer));
    }
    GlobalFonts.registerFromPath(fontPath, font.family);
  }
}
```

## Element Drawing

Each element file exports a single draw function:
`drawHeadline(ctx, element, screenPos, scale, progress, revealType)`

**Shared helper — `fontSpec(fontFamily, fontSize, scale)`:**
Returns the canvas font string. Map: display → "Bebas Neue", mono → "IBM Plex Mono", body → "Syne".
Scale the fontSize by the camera scale factor so text appears the right size on screen.

**For letter-spacing** (canvas doesn't support it natively): implement `drawSpacedText(ctx, text, x, y, letterSpacing)` that draws each character individually with the specified gap.

**headline.ts:** `ctx.font`, `ctx.fillStyle`, `ctx.fillText`. Use `drawSpacedText` for letter_spacing > 0.

**eyebrowLabel.ts:** Same as headline but smaller, with letter-spacing. IBM Plex Mono font.

**bodyText.ts:** Syne font. Handle multi-line: split on `\n` or auto-wrap at ~52 chars. Draw each line with lineHeight spacing.

**ruleLine.ts (draw_on):**
```typescript
// Draw from (x1,y1) to (x2,y2) but only up to `progress` of the way:
const endX = screenX1 + (screenX2 - screenX1) * progress;
const endY = screenY1 + (screenY2 - screenY1) * progress;
ctx.beginPath();
ctx.moveTo(screenX1, screenY1);
ctx.lineTo(endX, endY);
ctx.strokeStyle = element.stroke_color;
ctx.lineWidth = element.stroke_width * scale;
ctx.stroke();
```

**connectorArrow.ts (draw_on):** Same as rule_line but add an arrowhead polygon at the endpoint when progress > 0.8.

**nodeBox.ts:** Draw a rounded rectangle with stroke only (no fill). For draw_on reveal: animate the rect border by drawing it as 4 line segments sequentially as progress goes 0→1.

**nodeCircle.ts:** Same but `ctx.arc`.

**svgAsset.ts (pre-rasterized):**
```typescript
// SVGs are pre-rasterized during setup using @resvg/resvg-js
// The rasterized ImageData is passed in
// For draw_on reveal: use clip-reveal (expanding rect from left edge)
ctx.save();
ctx.beginPath();
ctx.rect(screenX, screenY, assetScreenWidth * progress, assetScreenHeight);
ctx.clip();
ctx.drawImage(rasterizedImage, screenX, screenY, assetScreenWidth, assetScreenHeight);
ctx.restore();
// For fade_only reveal: just globalAlpha
```

**pngAsset.ts:** Load with `loadImage()` from @napi-rs/canvas. Apply reveal animation. Apply subtle glow: draw the image at low opacity and blur behind it as a glow layer.

**labelTag.ts:** White-outlined rounded rect (small, pill-shaped) with text inside. Like a sticky label. Scale_in reveal.

**thoughtBubble.ts:** Cubic bezier curve from source point to target text position. Draw_on reveal. Then fade_up the floating text.

**listReveal.ts:** Array of text lines. Each line has its own reveal time = `element.reveal_at_seconds + (index * item_delay_seconds)`. Call `getRevealProgress` and draw each line independently.

**highlightBox.ts:** Draw_on rect outline around specified area.

**blurReveal.ts:** Same as body text but uses blur_in reveal type by default.

## Grain Overlay

```typescript
// grain.ts — generate once, composite on every frame
import { createCanvas } from '@napi-rs/canvas';

export function generateGrainOverlay(width: number, height: number): Buffer {
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');
  const imageData = ctx.createImageData(width, height);
  
  for (let i = 0; i < imageData.data.length; i += 4) {
    const noise = Math.random() * 255;
    imageData.data[i] = noise;
    imageData.data[i+1] = noise;
    imageData.data[i+2] = noise;
    imageData.data[i+3] = Math.random() * 30; // low opacity, random per pixel
  }
  ctx.putImageData(imageData, 0, 0);
  return canvas.toBuffer('image/png');
}
// Cache this buffer. Composite on every frame at opacity 0.45 using ctx.globalAlpha.
```

## FFmpeg Assembly

```typescript
// ffmpeg.ts
import ffmpeg from 'fluent-ffmpeg';
import ffmpegPath from 'ffmpeg-static';
ffmpeg.setFfmpegPath(ffmpegPath as string);

export async function assembleVideo(
  framesDir: string,
  audioPath: string | null,
  outputPath: string,
  fps: number
): Promise<void> {
  return new Promise((resolve, reject) => {
    let cmd = ffmpeg()
      .input(`${framesDir}/frame_%06d.png`)
      .inputFPS(fps)
      .videoCodec('libx264')
      .outputOptions(['-pix_fmt yuv420p', '-crf 18']);

    if (audioPath && existsSync(audioPath)) {
      cmd = cmd.input(audioPath).audioCodec('aac').outputOptions(['-shortest']);
    }

    cmd.output(outputPath)
      .on('end', resolve)
      .on('error', reject)
      .run();
  });
}
```

## Main Entry Point

```typescript
// index.ts — exported function
export async function renderVideo(specPath: string, outputPath: string): Promise<void> {
  // 1. Load fonts
  // 2. Parse spec
  // 3. Pre-rasterize SVG assets
  // 4. Generate grain overlay buffer
  // 5. Create temp frames directory
  // 6. Frame loop: render each frame, save as PNG
  // 7. Assemble with FFmpeg
  // 8. Clean up temp frames
  console.log(`Rendered: ${outputPath}`);
}

// Also allow direct CLI invocation:
// node dist/index.js ../test/fixtures/test_board_spec.json ../test/test_output.mp4
if (require.main === module) {
  renderVideo(process.argv[2], process.argv[3]);
}
```

## Test Spec

Create this exact file at `/test/fixtures/test_board_spec.json`:

```json
{
  "video_id": "test_001",
  "channel_id": "how_industries_work",
  "format": "landscape_16x9",
  "duration_seconds": 20,
  "fps": 30,
  "audio_file": "",
  "asset_needs": [],
  "board": {
    "width": 3840,
    "height": 1080,
    "background_color": "#08090f",
    "sections": [
      {
        "id": "hook",
        "section_type": "hook",
        "x_offset": 0,
        "y_offset": 0,
        "width": 1300,
        "height": 1080,
        "elements": [
          { "id": "e1", "type": "eyebrow", "reveal_at_seconds": 0.5, "reveal_type": "fade_up", "x": 80, "y": 80, "content": "HOW INDUSTRIES WORK", "color": "#00D8FF", "font_family": "mono", "letter_spacing": 4 },
          { "id": "e2", "type": "headline", "reveal_at_seconds": 1.0, "reveal_type": "fade_up", "x": 80, "y": 165, "content": "COSTCO SELLS", "color": "#FFFFFF", "font_size": 88, "font_family": "display" },
          { "id": "e3", "type": "headline", "reveal_at_seconds": 1.4, "reveal_type": "fade_up", "x": 80, "y": 262, "content": "$1.50 HOT DOGS", "color": "#FFE500", "font_size": 88, "font_family": "display" },
          { "id": "e4", "type": "rule_line", "reveal_at_seconds": 2.0, "reveal_type": "draw_on", "x": 80, "y": 320, "x2": 720, "y2": 320, "stroke_color": "#00D8FF", "stroke_width": 1 },
          { "id": "e5", "type": "body_text", "reveal_at_seconds": 2.4, "reveal_type": "fade_up", "x": 80, "y": 360, "content": "The price hasn't changed since 1985.", "color": "rgba(255,255,255,0.65)", "font_size": 22, "font_family": "body" },
          { "id": "e6", "type": "label_tag", "reveal_at_seconds": 3.5, "reveal_type": "scale_in", "x": 80, "y": 460, "content": "INTENTIONAL", "color": "#FFE500" }
        ]
      },
      {
        "id": "diagram",
        "section_type": "diagram",
        "x_offset": 1500,
        "y_offset": 0,
        "width": 1500,
        "height": 1080,
        "elements": [
          { "id": "e7", "type": "eyebrow", "reveal_at_seconds": 7.0, "reveal_type": "fade_up", "x": 1580, "y": 80, "content": "THE MECHANISM", "color": "#FFE500", "font_family": "mono", "letter_spacing": 4 },
          { "id": "e8", "type": "node_box", "reveal_at_seconds": 7.5, "reveal_type": "scale_in", "x": 1580, "y": 200, "width": 260, "height": 80, "content": "HOT DOG  $1.50", "color": "#FF3B30", "stroke_width": 1.5, "border_radius": 4 },
          { "id": "e9", "type": "connector_arrow", "reveal_at_seconds": 8.2, "reveal_type": "draw_on", "x": 1840, "y": 240, "x2": 2000, "y2": 240, "stroke_color": "#FFFFFF", "stroke_width": 1.5 },
          { "id": "e10", "type": "node_box", "reveal_at_seconds": 8.6, "reveal_type": "scale_in", "x": 2000, "y": 200, "width": 300, "height": 80, "content": "PSYCHOLOGICAL ANCHOR", "color": "#FFE500", "stroke_width": 1.5, "border_radius": 4 },
          { "id": "e11", "type": "list_reveal", "reveal_at_seconds": 10.0, "reveal_type": "fade_up", "x": 1580, "y": 420, "lines": ["Brain recalibrates what cheap means", "Trust in the store increases", "Average basket: $200+"], "color": "rgba(255,255,255,0.85)", "font_size": 20, "font_family": "body", "item_delay_seconds": 0.45 },
          { "id": "e12", "type": "blur_reveal", "reveal_at_seconds": 13.5, "reveal_type": "blur_in", "x": 1580, "y": 660, "content": "THE HOT DOG IS NOT A PRODUCT.", "color": "#FFE500", "font_size": 42, "font_family": "display" }
        ]
      }
    ],
    "camera_keyframes": [
      { "time_seconds": 0, "viewport_x": 0, "viewport_y": 0, "viewport_width": 1920, "viewport_height": 1080, "easing": "ease_in_out" },
      { "time_seconds": 2.8, "viewport_x": 100, "viewport_y": 0, "viewport_width": 1400, "viewport_height": 787, "easing": "cinematic" },
      { "time_seconds": 6.5, "viewport_x": 1300, "viewport_y": 0, "viewport_width": 1920, "viewport_height": 1080, "easing": "cinematic" },
      { "time_seconds": 9.5, "viewport_x": 1500, "viewport_y": 80, "viewport_width": 1440, "viewport_height": 810, "easing": "ease_in_out" },
      { "time_seconds": 13.0, "viewport_x": 1400, "viewport_y": 0, "viewport_width": 1920, "viewport_height": 1080, "easing": "ease_in_out" }
    ]
  }
}
```

## Acceptance Test

```bash
cd renderer
npx ts-node src/index.ts ../test/fixtures/test_board_spec.json ../test/test_output.mp4
```

Open `test_output.mp4`. It should show:
- Black background throughout
- "COSTCO SELLS" and "$1.50 HOT DOGS" headlines appearing with fade-up at the right times
- Cyan rule line drawing in at t=2.0s
- Camera panning and zooming smoothly around t=2.8s and t=6.5s
- Node boxes appearing with scale-in
- List items appearing one by one starting at t=10.0s
- Yellow text sharpening from blur at t=13.5s
- Film grain visible as subtle texture

If elements appear at the wrong time or camera doesn't move: check camera.ts interpolation.
If fonts are wrong: check fonts.ts registered correctly.
If SVG assets fail: this test spec has no SVG assets (`asset_needs: []`) so that won't show here.

## Rules

- Do NOT use any browser APIs, window object, or DOM — this is pure Node.js
- Do NOT start Phase 2 this session
- When done: mark Phase 1 ✅ in CLAUDE.md, update Current Sprint to "Phase 2 next"

---

# PROMPT 2 — Build the Board Spec Generator

*Paste everything below this line into a fresh Antigravity agent session after Phase 1 passes its test:*

---

Read CLAUDE.md completely before writing any code.

Phase 1 (renderer) is complete. You are building **Phase 2: The Board Spec Generator**.

A TypeScript function that calls the Claude API twice and returns a valid `BoardSpec` plus `assetNeeds[]`.

**Inputs:** script, timestamps (WordTimestamp[]), channelConfig, format
**Output:** { spec: BoardSpec, assetNeeds: string[] }

**Call 1 — Structural Analysis (claude-haiku-4-5-20251001):**
Return JSON: overall_structure, sections with timestamps, key_beats, asset_suggestions.

**Call 2 — Full spec (claude-sonnet-4-6):**
System prompt in `boardSpecSystemPrompt.ts` must include:
- Dark canvas visual rules (#08090f, white/yellow/red/cyan only)
- Canvas layout rules (3840×1080, sections left-to-right with 200px gaps)
- Element placement defaults (eyebrow at y=80, headline at y=140–180, etc.)
- Timing rules (reveal 0.2–0.5s after spoken word, camera moves start 0.7s early)
- Camera rules (cinematic easing, zoom in for revelations, never smaller than 600px wide)
- SVG asset library list (from CLAUDE.md channel config)
- Instruction: return raw JSON only, no markdown code fences

Validate output with Zod. Retry once if invalid, sending back the error.

Files to create:
```
pipeline/src/
  specGenerator.ts
  prompts/boardSpecSystemPrompt.ts
  prompts/boardSpecUserPrompt.ts
  prompts/structuralAnalysisPrompt.ts
  validation/validateSpec.ts
  types/specTypes.ts
  utils/findTimestamp.ts
```

Test: use a 200-word Costco hot dog script with generated fake timestamps at 2.3 words/sec. Output must pass validateSpec().

Rules: Do NOT start Phase 2.5 this session. Mark Phase 2 ✅ when done.

---

# PROMPT 2.5 — Build the Asset Generator

*Paste everything below this line into a fresh Antigravity agent session after Phase 2 passes its test:*

---

Read CLAUDE.md completely before writing any code.

Phases 1 and 2 are complete. You are building **Phase 2.5: The Asset Generator**.

Takes `assetNeeds: string[]` from Phase 2. Checks which SVGs already exist in `/channels/{channel_id}/assets/svg/`. For missing ones, calls Claude API (claude-sonnet-4-6) to generate SVG code and saves it.

**SVG generation system prompt (in `svgAssetSystemPrompt.ts`):**
- Pure SVG, self-contained, no external dependencies
- White/light-gray (#E0E0E0) strokes, fill="none", transparent background
- Viewbox "0 0 400 300" for wide objects, "0 0 300 400" for tall
- Stroke-width 1.5–2px main outlines, 1px details
- Clean schematic style — not cartoonish
- Paths ordered so a left-to-right clip-reveal looks intentional (outline first, details second)
- Return ONLY raw SVG starting with `<svg`. No explanation. No markdown.

After generation: validate it parses as valid XML and contains at least one path/rect/circle. Retry once if invalid.

Never overwrite existing assets. Log "reused" or "generated" or "failed" for each asset.

Files: `pipeline/src/assetGenerator.ts`, `pipeline/src/prompts/svgAssetSystemPrompt.ts`, `pipeline/src/prompts/svgAssetUserPrompt.ts`

Test: call `ensureAssets("how_industries_work", ["costco_building", "money_flow_diagram"])`. Both should exist after the call. Open and visually verify the generated SVGs look like wireframe drawings.

Rules: Do NOT start Phase 3 this session. Mark Phase 2.5 ✅ when done.

---

# PROMPT 3 — Build the Audio Pipeline and Orchestrator

*Paste everything below this line into a fresh Antigravity agent session after Phase 2.5 passes its test:*

---

Read CLAUDE.md completely before writing any code.

Phases 1, 2, and 2.5 are complete. Build **Phase 3 (Audio Pipeline) and Phase 5 (Orchestrator)** together.

## Phase 3: Audio Pipeline

**Input:** raw_voiceover.wav → **Output:** clean_audio.wav + timestamps.json

Step 1 — Denoise: `python -m df {input} {output}` (check tool exists, helpful error if not)
Step 2 — Transcribe: `whisper {file} --model small --output_format json --word_timestamps True --output_dir {dir}` — parse words array for `{word, start, end}`
Step 3 — Trim: `auto-editor {file} --margin 0.08sec --edit audio:threshold=0.04 --export json --output {trimmed}` — parse kept ranges, recalculate timestamps with `adjustTimestamps(originals, keptRanges)`

Files: `pipeline/src/audio/` — denoise.ts, transcribe.ts, trim.ts, audioProcessor.ts, checkDependencies.ts, types.ts

## Phase 5: Orchestrator

Watches `/jobs/{channel_id}/{job_id}/` for both voiceover.wav AND script.txt.
When both present: run Phase 3 → 2 → 2.5 → render (call renderer's `renderVideo()`) → output to `/output/{channel_id}/{job_id}/`

Status flow: queued → processing_audio → generating_spec → generating_assets → rendering → ready_for_review → approved → uploaded

CLI: `npm run watch`, `npm run process {channel} {job}`, `npm run approve {channel} {job}`, `npm run status`

Use chokidar for watching. Filesystem state only (status.json per job). YouTube upload = stub that logs "Would upload."

Create `/README.md` covering: prerequisites, Python tool install commands, how to drop a job, how to run, how to review and approve.

Rules: Do NOT build Phase 4 this session. Mark Phases 3 and 5 ✅ when done. Update Current Sprint to "End-to-end test with real voiceover."
