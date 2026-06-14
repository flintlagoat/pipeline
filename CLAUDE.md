# YouTube Automation Pipeline — Project State
> READ THIS FILE COMPLETELY before writing any code.
> UPDATE THIS FILE before ending every session.
> Last updated: 2026-06-14 (session 9)
> Session 9 phase: PRODUCTIZATION — begin turning the pipeline into a sellable product, "Inkwell".
>   Decided in a market brainstorm (full notes in memory [[productization-pivot]]): position as the
>   ANTI-SLOP tool vs the demonetized stock-footage crowd; business model = free cloud demo → cloud
>   credit subscription → paid local app whose render runs local but whose spec/script "brain" calls
>   a HOSTED API (so the prompt IP never ships). Build order operator gave: pipeline channel-vibe +
>   fix risks → dependency fix → website → name. THIS SESSION SHIPPED + PUSHED to a NEW git repo
>   github.com/flintlagoat/pipeline (the folder was NOT a repo before; secret-scanned — .env, the
>   youtube.auth.json tokens, .quota, node_modules all excluded):
>   (1) DEPENDENCY FIX — transcription is now a PLUGGABLE backend (NEW pipeline/src/audio/transcribe/
>   {index.ts dispatcher, backends/localWhisper.ts, backends/cloud.ts}), selectable local|cloud|auto
>   via TRANSCRIBE_BACKEND or opts (mirrors tts/). cloud = any OpenAI-compatible /audio/transcriptions
>   (Groq whisper-large-v3 default) over global fetch — ZERO install for non-technical buyers. auto
>   keeps existing machines working (local if whisper present, else cloud). DeepFilterNet REMOVED
>   ENTIRELY (denoise.ts + checkDependencies.ts deleted; audioProcessor no longer denoises — clean/AI
>   VO needs none). .env.example documents TRANSCRIBE_*. tsc clean. (The "choose at setup" UI still
>   needs wiring into product onboarding; the engine reads env/opts already.)
>   (2) CHANNEL DISTINCTNESS — NEW pipeline/src/channelDistinct.ts: a deterministic per-channel
>   signature (seeded off channel id: accent hue-rotation + camera/motion/grain nudges) + a
>   LOW-SENSITIVITY collision guard (only re-rolls — bigger hue shift + display-font swap — when a
>   freshly generated channel is near-identical, by coarse fingerprint, to an existing one; per
>   operator: it's fine if two look similar, fresh gen spreads 200 apart). Wired into
>   generateChannelSpec right after validation (applies on preview AND save). Offline test
>   `npm run test:distinct` (all pass) + tsc clean. This is the anti-fingerprint = anti-demonetization
>   moat I flagged as the #1 risk.
>   (3) INKWELL WEBSITE — NEW website/ (Next.js 14.2.35 [patched] + Tailwind + Supabase). Landing page
>   (anti-slop hero, the demonetization problem, the empty-market-quadrant positioning, how-it-works,
>   features, 3-tier pricing, waitlist) + app/api/waitlist/route.ts + lib/supabaseAdmin.ts (server-only,
>   null-safe before keys exist) + supabase/migrations/0001_init.sql (leads table, RLS service-role
>   only). Brand NAME = Inkwell (operator picked from a shortlist). `npm run build` verified clean.
>   SUPABASE WORKAROUND: the MCP can't be authed inside the Claude Code desktop app, so the site is
>   ENV-DRIVEN — operator pastes 3 keys from the Supabase WEB dashboard into website/.env.local and
>   runs the SQL file in the web SQL editor (no CLI). Project ref lundkydfijkkqaaxrvrz (memory
>   [[product-infra-refs]]).
>   NOT YET DONE (next): channel-look PREVIEW (render sample frames from a draft ChannelSpec so users
>   iterate the vibe before committing) + make channel design the product front door; wire
>   transcription "choose at setup" into onboarding; a cloud render backend for the free demo; auth +
>   billing; deploy website/ to Vercel. The hosted-brain anti-piracy split is still future work.
> Session 8 phase: GO LIVE — real credentials wired + the publish loop PROVEN end-to-end, plus a
>   text-overlap render fix and a real posting schedule. Operator supplied all keys this session.
>   (1) CREDENTIALS LIVE (all in `.env`, gitignored): FISH_API_KEY (real voice), YOUTUBE_API_KEY
>   (outlier research), GOOGLE_CLIENT_ID/SECRET (OAuth). `npm run youtube:auth how_industries_work`
>   minted a refresh token (channel "How Industries Work" UCA9cymrTqx_2tto_lBfwu7w).
>   (2) FIRST REAL UPLOAD ✅ — `npm run publish how_industries_work feeltest_s7` uploaded PRIVATE,
>   API-confirmed (privacy=private, processing=succeeded): youtube.com/watch?v=6nzVEgJiqAE. CAVEAT:
>   custom thumbnail set FAILED 403 "user doesn't have permissions to upload custom thumbnails" —
>   this is ACCOUNT-SIDE (YouTube requires phone-verified account at youtube.com/verify), NOT a code
>   bug. publishJob already warns + continues (video uploads, thumbnail skipped). Once the operator
>   verifies, thumbnails attach automatically; nothing to change in code.
>   (3) OUTLIER RESEARCH FIXED + live: the raw niche string ("hidden business systems and industry
>   mechanics") was too specific → 1 result. `research/outliers.ts` now derives 2-3 short YouTube
>   queries from the niche (nicheToSearchQueries), 365-day window, merges + dedupes, and filters
>   Shorts/lyric noise. `npm run research how_industries_work` → 92 videos / 46 outliers + clean
>   pattern block (factory/manufacturing/process + question hooks). Feeds designPackages demandBlock.
>   (4) TEXT-OVERLAP RENDER FIX (operator-reported, confirmed on feeltest_s7 frames): body_text
>   wrapped at a FIXED 52 chars with no region awareness, and relayout's elBox measured it as ONE
>   line → wrapped overflow collided with the label_tag below it, and right-shifted columns ran off
>   the frame edge. FIX = region-aware wrap: relayout sets `wrap_chars` per body_text from its text-
>   region width (new schema field on renderer Element + pipeline Element + Zod), the renderer wraps
>   to it, and elBox counts wrapped lines EXACTLY like the renderer (countWrappedLines) + mirrors per-
>   type line-heights (bodyText 1.45 / listReveal 1.5 / tag pill-box) so stacked elements never clip.
>   PAD 20→24. Re-rendered feeltest_s7 (now the REAL Fish voice, 95.6s): comparison wraps in-column,
>   labor tags cleanly spaced, captions under visuals — all verified by frame inspection.
>   (5) POSTING SCHEDULE: ScheduleConfig gained optional `cadenceRules` (per-day-type times);
>   DEFAULT_SCHEDULE + channels/how_industries_work/schedule.json now post EVERY day — 14:00 (2 PM)
>   weekdays, 10:00 (10 AM) weekends, America/New_York. computeNextSlot honors cadenceRules (legacy
>   single `cadence` still works). autoPublish=false for now (first uploads stay private for review;
>   flip to true to enable autorun auto-go-live). New offline tests: `npm run test:overlap`,
>   `npm run test:schedule` (both pass; all prior tests + both tsc green).
> Session 7 phase: PRODUCTION OS — render speed + "feels like a video" + anti-pattern variety.
> Session 7 phase: PRODUCTION OS — render speed + "feels like a video" + anti-pattern variety.
>   (1) STREAMING RENDER: workers now pipe raw RGBA straight into per-chunk ffmpeg libx264
>   (renderer/src/encoder.ts), chunks concat via stream-copy + audio mux in one pass — NO more
>   PNG-per-frame, NO tens-of-GB temp disk. 20s fixture 118s→~15s wall (~8×); long videos gain
>   more. Worker-count heuristic stops over-parallelizing short clips. Visual output unchanged
>   (verified frame). DEBUG paths still write PNGs. (2) VIDEO-FEEL PACK: voice-synced type_on
>   (reveal_duration_seconds, smooth leading-char fade), bold colored word reveals (emphasis_words
>   /emphasis_color), subtle scale_in overshoot, + a prompt "punch beat" (one full-frame typed
>   title card per video). Renderer: reveal.ts/utils.ts(drawRichLine)/headline/bodyText/eyebrow +
>   schema fields; deterministic videoFeel.ts pass applies them so the model can't forget.
>   (3) ANTI-PATTERN VARIETY: everything seeded per video_id — 6 seeded NARRATIVE ARCS
>   (autopilot/scriptArcs.ts: mechanism/myth-bust/follow-money/layers/expectation-gap/origin-now)
>   reshape the script body + rotate per channel (no back-to-back repeats); type_on/emphasis
>   distribution varies per video (verified: 3 video_ids → 3 different typed-beat sets).
>   (4) FRONTEND+SERVER: GET meta, GET/POST thumbnail endpoints; UI thumbnail preview+regenerate,
>   packaging card, ideas pass the full package into script gen. (5) Default length 2→8 min from
>   s6 carried forward. tsc both clean; ui vite build clean; Phase 0 chain (packaging→arc→script
>   →critic→meta) live-verified producing a top-tier hotel-minibar script; thumbnail + endpoints
>   live. See "Production OS (2026-06-13 s7)" + GROWTH_ENGINE.md §4b.
> ALSO READ GROWTH_ENGINE.md — the strategy layer added in session 6 (how YouTube decides views,
>   research-backed benchmarks, the packaging-first content OS, the July-2025 "inauthentic
>   content" policy risk, and the roadmap). Content-brain changes should be argued against it.
> Session 6 phase: GROWTH ENGINE (packaging-first + retention architecture). Researched the
>   2025-26 algorithm (CTR×retention two-gate funnel, first-24-48h test window, open loops ≈+32%
>   watch time, 8-15min midroll sweet spot, "inauthentic content" demonetization wave) → wrote
>   GROWTH_ENGINE.md, then rebuilt the content pipeline around it:
>   (1) PACKAGING ENGINE (autopilot/packaging.ts + prompts/packagingPrompt.ts) — Opus designs
>   scored video PACKAGES (title ≤60ch + thumbnail bigText/emphasisWord/assetName + hookPromise
>   + openLoops + payoff + description) BEFORE the script. ideas.ts + topic.ts are now thin
>   wrappers; autorun stage 3 = "Design video package"; the package persists to meta.json and
>   the script/thumbnail/publish stages all pay off the SAME contract.
>   (2) RETENTION-ARCHITECTED SCRIPTS — scriptPrompt.ts rewritten (3-job hook in ≤15s, open
>   loops, first payoff ≤90s, re-hook every 30-45s, but/therefore chaining, payoff held to final
>   third, bridge ending instead of dead outro, originality/policy block) + a CRITIC PASS in
>   scriptGenerator.ts (2nd Opus call grades hook/loops/payoff-alignment/filler and rewrites
>   once; sanity-gated; SCRIPT_CRITIC=off disables).
>   (3) THUMBNAIL GENERATOR — renderer/src/thumbnail.ts + thumbnailCli.ts (1280×720, channel
>   palette/fonts, ≤4-word bigText, accent emphasisWord, glowing hero SVG, vignette) driven by
>   pipeline/src/thumbnailGenerator.ts (Phase 1.5 in processJob, non-critical; `npm run
>   thumbnail <ch> <job>`; falls back to title words + the video's own first svg_asset when no
>   package). publish findThumbnail() already auto-attaches output/<ch>/<job>/thumbnail.png.
>   (4) METADATA/SEO — metadata.ts builds real descriptions: packaging opener + CHAPTERS derived
>   from board sections/first-reveal times (headline → label; ≥3 chapters ≥10s apart, starts
>   0:00) + schedule.json `descriptionBoilerplate` (put the Kevin MacLeod CC-BY credit there).
>   (5) RETENTION→BEAT ATTRIBUTION — analytics/attribution.ts maps retention-curve drops to the
>   exact section/headline on screen (plus a 0:30 hook checkpoint); analyze.ts feeds those lines
>   per video into the analysis prompt so dropoffNotes cite real beats.
>   (6) LENGTH — default video length 2→8 min (how_industries_work spec, Zod FormatSchema
>   default, channel-gen prompt guidance): ≥8 min unlocks midrolls + watch-time ranking.
>   VERIFIED: pipeline+renderer tsc clean; thumbnail rendered live (fallback + packaged paths,
>   frame inspected); packaging engine live-tested on real Opus (5 valid scored packages);
>   server boot + /api/channels 200. NOT live-tested: full autorun with the new stages, real
>   upload w/ chapters. See "Growth Engine (2026-06-12 s6)" + GROWTH_ENGINE.md.
> Session 5 phase: FRONTEND CONTROL SURFACE. Big UI+server expansion so the operator drives
>   everything from the browser: (1) per-job VOICE controls (speed / expressiveness=temperature /
>   variation=top_p / volume / voice-id / model, threaded Fish prosody+sampling params); (2) EDIT
>   existing channel specs (⚙ Edit modal → POST /api/channels/:id/spec overwrite); (3) an in-server
>   QUEUE + SCHEDULER (jobs/_queue.json, one render at a time, scheduled items fire at runAt, FIFO
>   otherwise; manual Run uses the same path); (4) granular UPLOAD control (per-job title/desc/tags/
>   privacy/publishAt via publish.json + a channel schedule editor); (5) AUTO-IDEAS (💡 → Opus
>   returns title+summary+rundown to pick from); (6) AUTO-VOICEOVER on Run (no audio + has script ⇒
>   Fish synth as Phase 0.5). Quick upload defaults to schedule-by-cadence. pipeline tsc + ui vite
>   build clean; server boot + endpoint smoke test passed. See "Frontend Control Surface (2026-06-12
>   s5)".
> Session 4 phase: RENDER PERFORMANCE. Parallelized the frame loop across CPU cores with
>   worker_threads (renderer/src/renderWorker.ts + renderSetup.ts) and added a `--draft` fast
>   preview flag. ~4.5× faster on the 20s fixture (8m57s → 1m58s, single→19 workers); higher on
>   long real renders. Output is pixel-identical (proven: draft single-thread vs worker renders
>   are byte-identical sha256; full renders differ ONLY in random grain, exempt by design).
>   NOTE: the prompt's other two asks did NOT apply to this renderer — (1) an offscreen
>   "static section cache" would FREEZE per-element reveals / asset bob / breathing filler /
>   flipbook SVGs (content is NOT static per frame) → would break pixel-identity, so it was NOT
>   implemented; (3) a "grain pool" gives zero speedup because grain is already pre-generated
>   ONCE (grain.ts) and composited as a static overlay (CLAUDE.md mandates "static noise"). See
>   "Render Performance — worker_threads + --draft (2026-06-12 s4)".
> Session 3 phase: RENDER VARIETY + CONTRAST FIXES. Killed the "automated slideshow" feel:
>   (1) asset contrast guard so light-bg channels (tiny_kitchens/beige) never render white/
>   invisible assets — palette-driven SVG prompt + deterministic WCAG remap + palette-hash cache
>   bust; (2) a 7-template LAYOUT REGISTRY with seeded per-section assignment (no repeat within 2,
>   full beats spaced) so sections stop being uniformly text-left/visual-right; (3) a 2-D
>   BOUSTROPHEDON (snake) board layout + camera that now does up/down AND left/right moves, with
>   per-transition easing/direction variety, idle drift (nothing ever frozen) and varied resting
>   zoom. All deterministic per video_id. See "Render Variety + Contrast Fixes (2026-06-12 s3)".
> Current phase: CLOSED-LOOP AUTO-PUBLISHING COMPLETE. The pipeline now uploads to YouTube
>   (OAuth, scheduled/private, quota-aware), pulls its own analytics, learns from them
>   (per-channel learnings.json, sample-gated rules), conditions every new script on what
>   worked, and runs the whole loop with one command (`npm run autorun <channel>`). TTS default
>   = Fish Audio S1, now LIVE-VERIFIED (real S1 call produced a valid wav). `.env` config loader
>   added. See the "Auto-publish + Analytics Feedback Loop (2026-06-12 s2)" section below.
> Prior phase: CHANNEL FORMAT SYSTEM COMPLETE. The renderer is no longer hardcoded to one
>   "dark blueprint board" — a per-channel ChannelSpec (channels/<id>/channel.spec.json) now
>   drives palette, typography, asset style, camera/motion, background, voice + format. Four
>   distinct archetypes ship (blueprint_board = original, flat_motion_explainer, documentary_
>   slate, notebook_sketch). A Channel Generator (opus) creates a ChannelSpec from a title +
>   description (CLI `npm run channel:new`, or UI "+ New Channel"). TTS default = Fish Audio S1
>   (hosted API) with a Windows SAPI stand-in fallback (Phase 0.5 adapter). UI launches with
>   one command (`npm run ui` → one URL). Renderer consumes a `style` block embedded in
>   board_spec.json (absent ⇒ blueprint_board, regression-safe). See the 2026-06-12 section.
> Prior (2026-06-11): PARTS A–E — generic render rules, Phase 0 script gen, rebuilt audio
>   engine, full web UI flow, e2e test. (details further below.)
> Active channels: how_industries_work (blueprint_board), tiny_kitchens (notebook_sketch, test)
> IDE: Google Antigravity (VS Code fork, agent-first) — paste prompts into agent sidebar, use Claude Sonnet 4.6 model
> NOTE (2026-06-05): spec generation now runs on claude-opus-4-8 (specGenerator + assetGenerator).

---

## Production OS — speed + video-feel + variety (2026-06-13 s7)

Operator's mandate: faster render/creation, make it "feel more like a video and less like a
slideshow / presentation whiteboard" (detailed animations, voice-synced typed headers, b-roll
only where it truly helps), and — critically — NOT the same structure/timestamps every video
("people catch onto patterns fast… smooth/subtle"). All generic per channel; both tsc clean; ui
vite build clean. Strategy rationale in GROWTH_ENGINE.md §4b.

**1. STREAMING RENDER (the big speed win).** Killed PNG-per-frame entirely.
  - NEW `renderer/src/encoder.ts` `FrameEncoder` — spawns one ffmpeg `libx264` per worker and
    pipes RAW RGBA frames into its stdin (`-f rawvideo -pix_fmt rgba`), with backpressure handling
    (await 'drain' vs early-exit) and stderr capture. Workers run `threads:1` so N workers ≈ N
    cores; the single-process path uses `threads:0` (x264 auto).
  - `frameRenderer.ts` `renderFrame` now returns the `Canvas` (reused per thread — fully repainted
    each frame so reuse is safe) instead of a PNG Buffer; `renderFramePng` kept for the DEBUG path.
    `renderSetup.ts` gained `renderRangeToEncoder` (streams `Buffer.from(canvas.data())`).
  - `renderWorker.ts` owns a chunk `.mp4`; `index.ts` rewritten: workers → per-chunk encoders →
    `ffmpeg.ts concatChunks` (concat demuxer, `-c:v copy`, audio muxed in the SAME pass). No frames
    on disk; the temp dir holds only chunk mp4s + the shared grain png. Worker-count heuristic
    `MIN_FRAMES_PER_WORKER` (240 full / 120 draft) stops over-parallelizing short clips. DEBUG /
    DEBUG_START_FRAME still use the PNG path (frame files are the point). Orchestrator spawns the
    renderer with `--transpile-only`.
  - RESULTS: 20s fixture **118s → ~15s wall (~8×)**; a real 2:09 video rendered in **219s** total
    render-loop (vs the old path's ~24.5 min for a 65s video ⇒ ~13× on real content). Visual output
    unchanged — re-rendered frame is identical. Real content renders at ~18 fps aggregate (heavier
    than the toy fixture's 68 fps: 9 sections of content + type_on per-char draws + SVG raster ×N).
  - `utils.ts drawRichLine` has a FAST PATH (single `fillText`) for fully-revealed, no-emphasis,
    no-spacing lines — the majority of frames — so type_on only pays per-char cost while typing.

**2. VIDEO-FEEL PACK (reads as a video, not a board).**
  - Schema: `Element` gained `reveal_duration_seconds`, `emphasis_words[]`, `emphasis_color`
    (renderer `schema.ts` + pipeline `specTypes.ts` + Zod `validateSpec.ts` — Zod strips unknown
    keys so all three MUST be there or they vanish).
  - `reveal.ts`: `getRevealProgress` takes a duration; `typeOnState(text, progress)` → visible
    chars + leading-char alpha (smooth edge); `scale_in` now eases with a subtle overshoot
    (ease-out-back) so reveals land. NEW `utils.ts drawRichLine` renders a line char-by-char with
    per-word emphasis coloring + a type_on reveal (shared by headline/eyebrow/bodyText, which were
    rewritten to use it). body_text distributes the type budget across wrapped lines.
  - NEW `renderer/src/countUp.ts` + a `count_up` RevealType: a SHORT numeric headline ("$3,000",
    "700%", "6,000", "$75/week") rolls from 0 → target over the reveal (ease-out, preserving $/%/
    comma formatting; lands exactly on the written value). headline.ts interpolates per frame; added
    to renderer/pipeline RevealType + Zod. Verified live: mid-roll "$1,846" → settled "$3,000".
  - Deterministic `pipeline/src/videoFeel.ts applyVideoFeel(spec, cfg, timestamps)` (called LAST in
    `generateBoardSpec`, after relayout): sets voice-paced `reveal_duration_seconds` (≈ len/16 cps,
    clamped to the gap before the next reveal), seeds `type_on` onto a VARIED subset (hook headline
    always; others ~45%/40%/short-body-25%), assigns `count_up` to short big-number headlines (≤16
    chars, value ≥100 or comma; ~70%, mutually exclusive with type_on), and auto-emphasizes a
    salient headline word (money/number > distinctive > longest) in the accent. Seeded off `video_id`.
  - Spec prompt (`boardSpecSystemPrompt.ts`): taught `type_on`, `emphasis_words`/`emphasis_color`
    (the model often does emphasis itself now — auto-pass is the fallback), and ONE "punch beat"
    per video (huge centered typed headline, breaks the left-text/right-visual rhythm).

**2b. FACT-CHECK PASS (trust + policy protection).** NEW `pipeline/src/factCheck.ts` +
`prompts/factCheckPrompt.ts` — a Haiku audit run after the critic: rates every checkable claim
(number/percent/$/date/superlative/causal) high|medium|low and hedges ONLY the low-confidence
over-precise ones into defensible phrasings (verified on the minibar script: "forty rooms an
hour"→"dozens", "most hotels lose money"→"many struggle to break even"; "$8"/"700 percent"/
"300-room" left intact). Voice/structure/hook/ending preserved; fail-open + length-gated like the
critic; `FACT_CHECK=off` disables. Saves `jobs/<ch>/<job>/factcheck.json` (claims + confidence +
fixes) as a due-diligence paper trail against the "inauthentic content" policy. Wired into
`generateScript` (returns `ScriptResult.factCheck`) → `generateScriptForJob` persists it.

**2c. OUTLIER RESEARCH → data-driven topics (the biggest lever).** NEW
`pipeline/src/research/outliers.ts` — searches the niche via the YouTube Data API (public,
`YOUTUBE_API_KEY` only, NO OAuth: search.list + videos.list stats + channels.list subs), scores
each video by `views ÷ max(channelSubs, 500)` (an "outlier" = ≥4× its channel's subscriber base
with ≥20k views — a small channel's breakout is the cleanest demand signal), clusters winning
title FORMATS (question-hook / money-figure / "real reason" / number-led / contrarian / curiosity
+ frequent keywords), and feeds a PROVEN DEMAND block into `designPackages` (packaging prompt got
a `demandBlock` param). NO-OPS gracefully without the key (logs "research skipped", topics stay
taste-based) — same pattern as analytics pull. Pure scoring/clustering UNIT-TESTED offline
(`npm run test:outliers`, 12 assertions, exit 0); `npm run research <channel>` previews. CLI +
package.json scripts added; `.env.example` documents `YOUTUBE_API_KEY`. NOT verified live (no key
in this env) — the network path is structurally correct + isolated.

**3. ANTI-PATTERN VARIETY (never the same video twice).**
  - NEW `pipeline/src/autopilot/scriptArcs.ts` — 6 narrative arcs (mechanism / myth_bust /
    follow_money / layers / expectation_gap / origin_to_now). `pickScriptArc(seed, rotation,
    avoidId)` is seeded off `channelId:topic`, ROTATED by the channel's published count, and avoids
    the previous video's arc → consecutive uploads never share a body structure. Threaded through
    `buildScriptUserPrompt` → `generateScript` → `generateScriptForJob`; persisted to
    `meta.json.scriptArc` (so the analytics loop can attribute performance to arc and avoid repeats).
  - Combined with the seeded type_on distribution (verified: 3 video_ids → 3 different typed-beat
    sets), seeded camera/resting-zoom (s3) and seeded layout templates (s3), the rhythm + structure
    + reveal choices all vary per video while each stays individually optimized.
  - LEARNING LOOP CLOSED ON STRUCTURE: `analytics/pull.ts` now records `scriptArc` + packaging
    title into `videoLog.specChoices`; `analysisPrompt.ts` surfaces the arc per video and instructs
    Opus to promote an arc to a rule if it consistently retains better across ≥N videos. So the
    system learns which NARRATIVE STRUCTURES (not just scripts) work, and the script generator
    already conditions on active rules. Verified offline (arc surfaces in the analysis prompt).

**4. FRONTEND + SERVER.** Server: `GET …/jobs/:jid/meta`, `GET …/jobs/:jid/thumbnail`
(`?variant=thumbnail_v2.png` serves an A/B variant; no-cache), `GET …/jobs/:jid/thumbnails`
(list existing variants), `POST …/jobs/:jid/thumbnail` (regenerate → renders all 3 variants),
`POST …/jobs/:jid/thumbnail/primary` (`{variant}` → promote to thumbnail.png). UI (`App.tsx`): a
3-up thumbnail A/B GALLERY (cyan border = the primary that uploads; "use as primary" on the
others) + a packaging card (title/hook/payoff/loops/score) in the output section; the 💡 ideas
now carry the full `packaging` object into script generation (`generateScript(title, packaging)`
→ server `packaging` body field). `loadMeta()` hydrates both on job select.

**4b. THUMBNAIL A/B VARIANTS.** `renderer/src/thumbnail.ts` gained a `layout` field
(hero_right / hero_left / text_only) — text region + asset side branch on it; `thumbnailCli.ts`
accepts ONE spec or an ARRAY (batch). `thumbnailGenerator.ts generateThumbnailForJob(ch, job,
variants=true)` writes 3 specs (thumbnail.png hero-right, _v2 hero-left, _v3 text-only) and
renders all in ONE subprocess; `listThumbnailVariants` + `setPrimaryVariant` (copies a chosen
variant over thumbnail.png — the file publish uploads). Verified: 3 visually-distinct variants
rendered for feeltest_s7; endpoints 200. NOTE: promoting v2/v3 overwrites thumbnail.png's pixels
(slot 1 then mirrors the choice); regenerate re-renders all 3 originals — acceptable for the
pick-once-before-upload workflow.

**VERIFIED (live, this session):**
  - Streaming render: fixture ~15s; full 2:09 video rendered + thumbnail; output decodes clean
    (h264+aac, exact duration), frame re-render is identical after the fast-path optimization.
  - Full Phase 0 chain on "Why hotel minibars cost so much": packaging "Why Hotel Minibars Charge
    $8 for Water" / thumb "$8 SODA" (score 81), arc `expectation_gap`, critic-revised 306-word
    script that pays off the package, opens loops, holds the labor-cost payoff, and ends on a
    bridge question. meta.json has packaging + scriptArc.
  - Full `process` on that job: spec valid attempt 1, 3×3 snake grid, `video-feel type_on×8
    paced×32`, render+thumbnail. Frames inspected: "THE $8 BOTTLE" (\$8 yellow) with wireframe
    bottle hero + typed caption; "YOU'RE PAYING FOR THE SYSTEM" (SYSTEM yellow) + red warning tag +
    minibar-fridge hero (varied layout). Thumbnail = "$8 SODA" + glowing soda_cup. Genuinely
    top-tier output.
  - Server meta/thumbnail GET+POST → 200; ui build 188 KB.
  REFERENCE JOB left on disk: `how_industries_work/feeltest_s7` (SAPI voiceover, showcases s7).
  NOT done: full `autorun` (it'd repeat these stages live), real YouTube upload, b-roll (decided
  AGAINST stock b-roll — it's exactly what the policy crackdown targets; the rendered-art moat +
  type_on/emphasis/punch-beat deliver the "video feel" without it).

## Growth Engine — packaging-first + retention architecture (2026-06-12 s6)

Operator's mandate: "optimize everything so the videos beat 99% of YouTube — research how the
algorithm/metrics actually work, fix hooks/CTAs/packaging, point out and solve the system's
psychology/quality limitations; no change is too big." Research first (live web), then a strategy
doc, then code. **GROWTH_ENGINE.md is the strategy layer** — read it before touching the content
brain. Key research findings that drove the build: views = CTR gate × retention gate compounding
through a 24-48h test window; steepest dropoff is 15-30s; open loops ≈ +32% watch time; packaging
designed BEFORE content is how top channels work (titles <60ch); 8-15 min unlocks midrolls (~2-3×
RPM) + watch-time ranking; and YouTube's July-2025 "inauthentic content" policy is demonetizing
mass-produced AI channels at scale — original analysis, distinct rendered visuals, structural
variety, and (ideally) the operator's real voiceover are the protection.

**What shipped (all generic per channel, no topic hardcoding):**
- **Packaging engine** — NEW `autopilot/packaging.ts` (+ `prompts/packagingPrompt.ts`).
  `designPackages(ch, cfg, n)` = N scored candidates (new subjects, avoids covered titles, leans
  into promoted learnings rules); `packageForTopic(ch, cfg, topic)` = package an operator-chosen
  topic. `VideoPackage` = title/altTitles/description/thumbnail{bigText,emphasisWord,assetName,
  visualIdea}/hookPromise/openLoops[]/payoff/whyItWorks/score. Thumbnail concepts are GROUNDED:
  the prompt lists the channel's real `assets/svg/*.svg` names (`listChannelAssets`). `ideas.ts`
  (UI 💡) and `topic.ts` are now thin wrappers — same VideoIdea shape so App.tsx is untouched;
  full package rides in `idea.packaging`. Server script endpoint accepts optional `packaging`.
- **Flow of the contract:** `generateScriptForJob(ch, job, topic, min, pkg?)` resolves package =
  arg → meta.json → packageForTopic (non-fatal on failure) → injects it into the script prompt
  ("THE PACKAGE THIS SCRIPT MUST PAY OFF") → persists to `meta.json.packaging`. Thumbnail +
  publish metadata read the SAME meta.json. autorun stage 3 now prints scored candidates and
  picks the best.
- **Script prompts** (`scriptPrompt.ts` rewrite): retention architecture (hook does relevance+
  curiosity-gap+contract in ≤15s, zero throat-clearing; 2-3 open loops in first 60s; first payoff
  ≤90s; re-hook every 30-45s; but/therefore; held payoff final third; bridge ending that OPENS
  the next question — no summaries/thanks/CTA begging) + originality requirements (≥2 non-obvious
  insights, verifiable figures, a thesis — the policy shield). Critic pass in `scriptGenerator.ts`:
  second Opus call with an edit checklist, returns revised prose only; accepted only if 0.6-1.25×
  draft length; `SCRIPT_CRITIC=off` to disable; `ScriptResult.critiqued` reports it.
- **Thumbnails** — NEW `renderer/src/thumbnail.ts` (composition: palette bg + focus vignette +
  contain-fit hero SVG right w/ glow + auto-sized stacked display-font text left w/ accent
  emphasis word + accent underline; light-vs-dark handled by luminance) and `thumbnailCli.ts`
  (reads a ThumbnailSpec JSON; loads channel fonts via a minimal RenderProfile cast; BOM-safe).
  NEW `pipeline/src/thumbnailGenerator.ts` writes `output/<ch>/<job>/thumbnail.spec.json` and
  spawns the CLI like renderVideo. Fallbacks: bigText = title minus stopwords (4 words); hero =
  package assetName if it exists on disk, else the first svg_asset in the job's board_spec.
  Phase 1.5 in processJob (try/catch, non-critical). CLI `npm run thumbnail <ch> <job>`.
- **Metadata** (`publish/metadata.ts`): title = override → packaging.title → topic → jobId.
  Description = opener (override → packaging.description → first beat) + `Chapters:` block
  (sections → min reveal_at_seconds, label = first headline/eyebrow content, first forced 0:00,
  ≥3 chapters ≥10s apart else omitted) + `schedule.descriptionBoilerplate` (NEW ScheduleConfig
  field — REQUIRED Kevin MacLeod CC-BY credit belongs there when music is on). Chapters are
  skipped when an explicit description override exists.
- **Attribution** — NEW `analytics/attribution.ts` `retentionBeatLines(ch, job, curve)`: loads
  the job's board_spec, builds beat windows (section → min reveal time + headline label), maps
  the 3 steepest curve drops (>2pp between samples; absolute audienceWatchRatio preferred,
  relativeRetention fallback) to the beat on screen + a 0:30 hook checkpoint. analyze.ts passes
  a videoId→lines map into `buildAnalysisUserPrompt` (new optional param).
- **Length**: `channels/how_industries_work/channel.spec.json` format.minutes 2→8; Zod
  FormatSchema default 2→8; channelSpecPrompt now instructs 8-12 min.
- **Smoke harness**: NEW `pipeline/src/test_packaging.ts` (`npx ts-node src/test_packaging.ts
  <ch> ["topic"]`, live Opus).

**VERIFIED:** pipeline + renderer `tsc --noEmit` clean. Thumbnail live-rendered for e2e_001:
fallback path (no package → jobId text + vending_machine hero from board_spec) AND a packaged-
style spec ("$8,000 A MONTH" w/ yellow emphasis + glow) — frames visually inspected, composition
correct on the dark board. Packaging engine live on real Opus: 5 valid scored packages (88-83),
all with loops/payoffs/thumb concepts. Server boots, /api/channels 200. **NOT live-tested:** a
full `autorun` through the new stages (multiple Opus calls + ~24min render), a real upload with
chapters in the description, and the critic pass on a real 8-min script (logic verified, prompt
output not yet). UI untouched (ideas/scripts keep their shapes).

**GOTCHAS for next session:** (a) meta.json now carries `packaging` — server `patchJobOptions`
doesn't touch meta.json so no clobber risk, but anything else writing meta.json must spread the
previous object (generateScriptForJob does). (b) The critic pass adds one Opus call per script —
budget accordingly at scale; disable with SCRIPT_CRITIC=off. (c) buildChapters reads the OUTPUT
board_spec, so chapters only exist after a render (publish after process = fine). (d) The
8-minute default means scripts are now ~1200 words → spec gen output is bigger; max_tokens 16000
on the spec call has headroom but watch for truncation on 15min+ videos. (e) thumbnailCli is
spawned with `shell:true` + quoted paths (same pattern/deprecation warning as renderVideo).

## Frontend Control Surface (2026-06-12 s5)

Operator asked to drive everything from the browser. Six subsystems added across the UI
(`ui/src/App.tsx`) + server (`pipeline/src/server.ts`) + a few backend modules. All decisions were
confirmed with the operator first (scheduler model, voice knobs, auto-voiceover, upload privacy).
pipeline `tsc` + ui `vite build` clean; server boots and all new endpoints smoke-tested live.

- **Voice controls (per job).** Fish has no literal "tone" knob — it's voice + expressiveness. Added
  `speed` (prosody.speed), `volume` (prosody.volume), `temperature` (expressiveness), `top_p`
  (variation) to `tts/backends/fish.ts` (only sends keys the operator set; clamped) + `model` +
  `voice` id. Threaded through `TtsOptions` (`tts/index.ts`) and `generateVoiceoverForJob`
  (orchestrator), which now MERGES saved per-job voice settings (options.json `voice`) under
  explicit args under the channel default voice. UI = `VoicePanel` (sliders); persisted via the
  `/options` endpoint (`voice` block) AND sent by the 🔊 voiceover button.
- **Edit channel specs.** New `POST /api/channels/:cid/spec` (validate w/ ChannelSpecSchema, id must
  match, `saveChannelSpec` overwrite). UI `⚙ Edit` → `EditChannelModal` reusing a shared
  `SpecFields` editor (also used by New Channel). (`/save` still BLOCKS overwrite; the update route
  is the editor's path.)
- **Queue + in-process scheduler** (`server.ts`). ONE render at a time across the studio (renders
  saturate all cores via worker_threads). Persistent `jobs/_queue.json`; `setInterval(tryStartNext,
  4000)` drains it — scheduled items fire at/after `runAt`, else FIFO. `spawnJob` (factored from the
  old /process inline spawn) streams to the job's SSE; `beginRun`→on exit marks done/failed, runs
  `autoPublish` (schedule-to-cadence) if set, then `tryStartNext`. Manual Run = `enqueue` immediate
  + `tryStartNext`. Endpoints: `GET/POST /api/queue`, `DELETE /api/queue/:id`. Items left "running"
  from a prior process are requeued on load. **Only runs while the Studio server is up** (operator
  agreed). UI: right-sidebar Queue panel + a schedule row (datetime-local + auto-publish) on the job.
- **Granular upload control.** `metadata.ts` `PublishOverride` gained `privacyStatus` + `publishAt`
  (+ exported `readPublishOverride`); `publishJob` honors them (explicit publishAt wins; any
  publishAt ⇒ private). New `GET/POST /api/channels/:cid/jobs/:jid/publish-meta` (writes
  `publish.json`). Channel schedule editor: `ScheduleModal` → existing `POST .../schedule`
  (timezone, days, times, privacy, category, tags, autoPublish). UI publish panel now edits
  title/desc/tags/privacy/go-live-time inline. Quick "Upload + schedule next slot" = cadence.
- **Auto-ideas.** New `pipeline/src/autopilot/ideas.ts` (`generateIdeas`, Opus → JSON
  [{title,summary,rundown}], avoids covered titles like `topic.ts`). `POST /api/channels/:cid/ideas`.
  UI `💡 Ideas for me` → `IdeasModal` (pick → fill topic, or "Use & generate script").
- **Auto-voiceover on Run.** `processJob` (orchestrator) Phase 0.5: if no `voiceover.wav` but a
  `script.txt` exists, synthesize via the TTS adapter (job's saved voice settings) before the audio
  phase. `/process` precheck relaxed to "script OR audio"; UI `canRun` now needs only a script.
- **Misc UI:** `--draft` checkbox on Run (threaded to `/process` body → `cli process --draft`),
  render-progress regex now also matches the new "Rendered X/Y" worker line, queue SSE `queue`
  event, `jpost` helper, shared `Modal`.
- **GOTCHAS:** options.json is now `{ audio, voice }` — server `patchJobOptions` MERGES so neither
  clobbers the other; `parseVoiceOpts` strips empties/non-numbers. datetime-local values are LOCAL;
  server converts publishAt→UTC ISO, and `toLocalInput()` converts back for display. One render at a
  time is enforced by `activeKey`; manual Run while busy returns `{queued, startedNow:false}` and the
  UI shows "queued". NOT live-tested: a real queued render firing, real Fish voice-param audio, real
  YouTube upload with per-job privacy (no end-to-end render run this session — code+endpoints only).

## Render Performance — worker_threads + --draft (2026-06-12 s4)

Goal of the work order: cut render time (~20-25 min/min-of-video) WITHOUT changing visual output
(frames must be pixel-identical, grain exempt). After inspecting the renderer, only ONE of the
three proposed optimizations was valid here; the other two were based on premises that don't hold:

**Pre-work findings (why the plan changed):**
- **Section content is NOT static per frame.** Every element reveals over a 0.55s window
  (`reveal.ts`), every svg/png asset bobs continuously (`motion.ts assetBob`), animated SVGs
  cross-dissolve (`multiFrameState`), and the blueprint brackets/ticks "breathe" (`blueprint.ts`).
  So OPT 1 ("pre-render each section to a static offscreen canvas, only move the camera") would
  FREEZE all of that → NOT pixel-identical. **Not implemented** (would break the hard constraint).
- **Grain is already pre-generated ONCE** in `index.ts`/`grain.ts` and composited as a single
  static overlay every frame — there is no per-frame noise math to remove. So OPT 3 ("30-frame
  grain pool") yields ZERO speedup and would only ADD motion to grain that CLAUDE.md mandates be
  "static noise". **Not implemented.**
- The real cost is per-frame PNG encode + disk write in a **single-threaded** loop. → OPT 2.

**What shipped (OPT 2 + the `--draft` bonus):**
- **`renderer/src/renderSetup.ts` (NEW)** — shared, DRY core used by BOTH the single-thread path
  and the workers: `computeSettings(spec, draft)` (full = native/spec-fps/grain/CRF18; draft =
  half-res/15fps/no-grain/CRF30), `resolveChannelSvgDir` + `loadSvgAssets` (moved out of index.ts),
  `prepareContext()` (loads spec → resolveStyle → buildCameraPath → loadFonts → setFontMap → raster
  SVGs → grain), and `renderRange(spec, rctx, dir, start, end)` writing PNGs by **GLOBAL** frame
  index. Determinism: `buildCameraPath` is seeded off `video_id`, so every worker derives an
  identical path.
- **`renderer/src/renderWorker.ts` (NEW)** — worker entry. Gets `{startFrame,endFrame,specPath,
  framesDir,settings,grainPath}` via `workerData`, builds its OWN context (canvases/Images can't
  cross threads), renders its range, posts `progress`/`done`/`error`. Self-contained, no shared
  mutable state.
- **`renderer/src/index.ts` (rewritten orchestrator)** — `renderVideo(spec, out, {draft, workers})`.
  Main thread: pre-warms fonts ONCE (so N workers don't race the Google-Fonts download), generates
  grain ONCE and writes it to a shared `__grain.png` that EVERY worker loads (→ grain byte-identical
  across all chunks, no boundary "pop"), spawns `cores-1` workers over contiguous frame ranges
  (remainder → last worker), aggregates progress, then runs the **existing single FFmpeg assemble**
  over the shared frames dir. **Deliberately deviated from the prompt's per-worker `chunk_N.mp4` +
  `-c copy concat`** → instead all workers write into ONE frames dir with global indices and a
  single ffmpeg pass assembles them. This avoids H.264 GOP/timestamp seams at chunk boundaries,
  keeps audio muxing in one place, and is a bit-identical encode path. `DEBUG_RENDER`,
  `DEBUG_START_FRAME`/`DEBUG_MAX_FRAMES` (renumbered window) stay SINGLE-THREADED. `RENDER_WORKERS`
  env or `{workers}` opt overrides the count (1 ⇒ single-thread; used for the byte-identity test).
- **`frameRenderer.ts`** — now reads `outputWidth/Height/fps/grain` from `rctx.settings` (was
  derived from spec.format/spec.fps). A draft frame is just a smaller canvas at a lower fps; since
  every element derives scale from outputWidth, half-width ⇒ pixel-correct half-res, same
  composition. `RendererContext`/`RenderSettings` moved to `schema.ts`.
- **`ffmpeg.ts`** — `assembleVideo(...)` gained a `crf` param (18 full / 30 draft).
- **`--draft` plumbed end-to-end:** renderer CLI `... <out> --draft`; orchestrator `renderVideo(...,
  draft)` appends the flag to the ts-node subprocess; `processJob(ch, job, jobAudio?, {draft})`;
  CLI `npm run process <ch> <job> --draft`.

**Verification (test/fixtures/test_board_spec.json, 20s/600f/1080p, 20-core box):**
- 19-worker full render **1m58s** vs single-thread **8m57s** = **~4.5× / -78%** (exceeds the ≥50%
  target). Short clip ⇒ 19 cold ts-node worker bootstraps are a big fixed cost; on a real ~25-min
  render that amortizes and speedup approaches core count. CPU during the parallel run: all cores
  busy (one left for OS/ffmpeg).
- **Pixel-identity PROVEN:** both full renders = 1920×1080/30fps/20.0s/exactly 600 frames (no
  gaps/dupes). Draft single-thread vs draft worker (grain off ⇒ no nondeterminism) are
  **byte-identical (same sha256)**. Full renders differ only in random grain (random per-run in the
  ORIGINAL renderer too — `Math.random`), which is the documented exemption.
- `tsc --noEmit` clean in BOTH `renderer/` and `pipeline/`.
- GOTCHA for next time: the worker is a `.ts` under ts-node, so `index.ts` spawns it with
  `execArgv: ['-r','ts-node/register/transpile-only']` when `__filename` ends in `.ts` (and plain
  `renderWorker.js` for a compiled `tsc` build). Don't drop that or workers can't load.

---

## Objective

Build an automated YouTube video production pipeline. Operator records voiceovers (~34 min/day), everything else is automated. Start with one channel (How Industries Work), prove the system end-to-end, then expand to 10 channels. Long-term: Skool communities tied to each channel.

**Current focus: ONE channel. Make it work perfectly before expanding.**

---

## System Prerequisites

Must be installed before any phase will work:
- Node.js 20+
- Python 3.10+
- FFmpeg: `brew install ffmpeg` (Mac) or `winget install ffmpeg` (Windows)
- DeepFilterNet: `pip install deepfilternet` (**optional** — incompatible with Python 3.14; denoise step is skipped until package updates)
- Whisper: `pip install openai-whisper`
- FFmpeg: already required (see above) — also used for silence trimming in audio pipeline

No browser/Chromium required. The renderer uses @napi-rs/canvas (Skia-based, native Node.js).

---

## Visual Style — CRITICAL

Reference: The Dark Needle (@thedarkneedle on YouTube)

**Dark canvas, NOT white:**
- Background: `#08090f` (near-black with slight blue tint)
- Text colors: white `#FFFFFF`, yellow `#FFE500`, red `#FF3B30`, cyan `#00D8FF`
- No gradients. No drop shadows on text. No white backgrounds.
- Film grain overlay on viewport: static noise, opacity 0.45
- Slight outer glow on white figure/asset elements

**Mechanical model:**
One large dark canvas (e.g. 3840×1080px). A 16:9 camera viewport moves across it — pan any direction, zoom in/out — revealing content as narration plays. All content lives at fixed absolute coordinates. Sections can be placed left/right of each other AND above/below (2D layout).

**How Industries Work visual language:**
- Wireframe SVG drawings: building outlines, flow diagrams, org charts, product schematics
- These animate on with a clip-reveal effect (left-to-right expanding clip) that looks like being sketched
- Label tags floating near their subjects
- Bold colored text reveals timed precisely to narration

---

## How the Pipeline Works

```
OPERATOR drops two files:
  voiceover.wav + script.txt → /jobs/how_industries_work/{job_id}/
                     ↓
          [ORCHESTRATOR detects new job]
                     ↓
     [PHASE 3 — AUDIO PIPELINE]
     DeepFilterNet: denoise audio
     Whisper: word-level timestamps
     FFmpeg silenceremove: strip leading/trailing silence (timestamps not adjusted yet)
     Output: clean_audio.wav + timestamps.json
                     ↓
     [PHASE 2 — SPEC GENERATOR]
     Claude API (Haiku): structural analysis
     Claude API (Sonnet): full board_spec.json + asset_needs[]
                     ↓
     [PHASE 2.5 — ASSET GENERATOR]
     Check asset_needs[] against /channels/{id}/assets/svg/
     Missing assets: Claude API generates SVG code → saves to library
     Reusable assets accumulate over time (drawn once, cached forever)
                     ↓
     [PHASE 1 — BOARD RENDERER]
     @napi-rs/canvas renders each frame as PNG
     Camera viewport calculated per frame
     FFmpeg stitches frames + mixes audio → video.mp4
                     ↓
     OPERATOR reviews /output/how_industries_work/{job_id}/video.mp4
     Approves → YouTube upload
```

**Key principle: Claude API generates structured JSON. The renderer reads JSON. Renderer code never changes per video.**

---

## Board Spec Schema — THE CONTRACT

Do not change this schema without updating BOTH the renderer (Phase 1) AND the spec generator (Phase 2), and logging the change.

```typescript
interface BoardSpec {
  video_id: string;
  channel_id: string;
  format: "landscape_16x9" | "portrait_9x16";
  duration_seconds: number;
  fps: 30;
  audio_file: string;
  asset_needs: string[];  // svg asset names needed — Phase 2.5 ensures they exist

  board: {
    width: number;               // 3840 landscape, 1080 portrait
    height: number;              // 1080 landscape, 3840 portrait
    background_color: "#08090f";
    sections: Section[];
    camera_keyframes: CameraKeyframe[];
  };
}

interface Section {
  id: string;
  section_type: "hook" | "comparison" | "diagram" | "revelation" | "list_reveal" | "flow_chart" | "conclusion";
  x_offset: number;
  y_offset: number;
  width: number;
  height: number;
  elements: Element[];
}

interface Element {
  id: string;
  type: ElementType;
  reveal_at_seconds: number;
  reveal_type: RevealType;
  x: number;
  y: number;
  content?: string;
  lines?: string[];
  font_size?: number;
  color?: string;
  font_family?: "display" | "mono" | "body";
  letter_spacing?: number;
  x2?: number;
  y2?: number;
  stroke_color?: string;
  stroke_width?: number;
  dashed?: boolean;
  width?: number;
  height?: number;
  radius?: number;
  border_radius?: number;
  asset_name?: string;
  asset_width?: number;
  asset_height?: number;
  item_delay_seconds?: number;
  target_element_id?: string;
}

type ElementType =
  | "headline" | "eyebrow" | "body_text"
  | "rule_line" | "connector_arrow"
  | "node_box" | "node_circle"
  | "png_asset" | "svg_asset"
  | "label_tag" | "thought_bubble"
  | "list_reveal" | "highlight_box" | "blur_reveal";

type RevealType =
  | "fade_up"    // opacity + translateY
  | "draw_on"    // line draws from start to end, SVG clip-reveals left-to-right
  | "scale_in"   // scale 0.85→1 + opacity
  | "blur_in"    // blur 8px→0 + opacity 0.2→1
  | "type_on"    // characters appear one by one
  | "instant" | "fade_only";

interface CameraKeyframe {
  time_seconds: number;
  viewport_x: number;      // canvas X of camera top-left
  viewport_y: number;
  viewport_width: number;  // smaller = zoomed in
  viewport_height: number;
  easing: "ease_in_out" | "cinematic" | "snap";
}
```

**Camera math for canvas renderer:**
```typescript
// For each element, its position in the output frame:
const scale = OUTPUT_WIDTH / keyframe.viewport_width; // OUTPUT_WIDTH = 1920
const screenX = (element.x - keyframe.viewport_x) * scale;
const screenY = (element.y - keyframe.viewport_y) * scale;
// Skip drawing if element is entirely outside viewport
```

---

## Tech Stack

```
Runtime:           Node.js 20 + TypeScript
Video frames:      @napi-rs/canvas (Skia-based, no browser needed)
SVG rasterization: @resvg/resvg-js (converts SVG wireframes to PNG for canvas)
Video assembly:    fluent-ffmpeg + ffmpeg-static (stitches frames + mixes audio)
Audio denoise:     DeepFilterNet (Python subprocess)
Transcription:     openai-whisper (Python subprocess)
Silence removal:   FFmpeg silenceremove filter (leading/trailing only; timestamps unadjusted for now)
File watching:     chokidar
AI calls:          @anthropic-ai/sdk — claude-sonnet-4-6 (spec + assets), claude-haiku-4-5-20251001 (analysis)
Uploads:           YouTube Data API v3 (stub for now)
State:             Filesystem only (no database for MVP)
```

---

## Channel: How Industries Work

Config: `/channels/how_industries_work/config.json`

```json
{
  "channel_id": "how_industries_work",
  "niche": "hidden business systems and industry mechanics",
  "voice_guide": {
    "tone": "calm authority, slightly conspiratorial, insider knowledge",
    "sentence_style": "short punchy sentences. then longer explanatory ones. rhetorical questions followed immediately by the answer.",
    "forbidden_phrases": ["in today's video", "make sure to like", "as I mentioned", "basically"],
    "hook_formula": "name the familiar thing, hint at the hidden mechanism, promise the reveal"
  },
  "design_system": {
    "background_color": "#08090f",
    "accent_1": "#FFE500",
    "accent_2": "#FF3B30",
    "accent_3": "#00D8FF",
    "font_display": "Bebas Neue",
    "font_mono": "IBM Plex Mono",
    "font_body": "Syne",
    "asset_style": "wireframe_schematic",
    "grain_intensity": 0.45
  },
  "svg_asset_library": [
    "costco_building", "warehouse_interior", "shopping_cart", "price_tag",
    "conveyor_belt", "cash_register", "supply_chain_line", "org_chart_3tier",
    "money_bag", "arrow_curved_right", "factory_exterior", "person_standing",
    "person_sitting_chair", "fast_food_counter", "airplane_side", "casino_slot_machine"
  ]
}
```

**Asset accumulation model:**
- Generic assets (building outlines, people, objects): created once, reused across all videos
- Concept-specific assets (airline seating diagram, casino floor plan): generated by Phase 2.5 on first use, saved to library, reused in future videos
- The library grows over time. Every asset generated is cached permanently.

---

## Build Phases

### Phase 0 — Script Generator (claude-opus-4-8) ✅ COMPLETE (2026-06-11)
  - `pipeline/src/scriptGenerator.ts` + `prompts/scriptPrompt.ts`. `generateScript(topic,
    minutes, channelConfig)`: target words = minutes × `WORDS_PER_MINUTE` (150, tunable). Voice
    comes entirely from channel config (generic across topics/channels). Output is PLAIN
    narration prose (blank-line-separated beats) consumed exactly like a hand-written script.txt.
  - Orchestrator `generateScriptForJob()` writes `jobs/<ch>/<job>/script.txt`. CLI:
    `npm run script <ch> <job> <minutes> "<topic>"`. UI: the first step (Generate Script).
  - FINAL video length is still set by the operator's real recording; minutes only controls how
    much script to generate.
### Phase 1 — Board Renderer (@napi-rs/canvas + FFmpeg) ✅ COMPLETE
  - Note: Camera `viewport_x` must never shift horizontally past a section's `x_offset` — this clips left-edge content. Zoom in place by keeping `viewport_x` at or above the current section's `x_offset`. For a zoom that holds the left edge, set `viewport_x: 0` (or the section x_offset) and only change `viewport_width`.
  - **Renderer bug fixes applied (2026-06-04):**
    1. **Black frames between sections** — `getCameraAtTime` now accepts `sections[]` and content-clamps the interpolated viewport: if the viewport would land in empty canvas space between sections, it snaps to the nearest section boundary. `frameRenderer.ts` passes `spec.board.sections` to the call.
    2. **SVG assets not rendering** — `drawSvgAsset` was looking for `element.asset_width`/`element.asset_height` but the spec generator emits `element.width`/`element.height`. Fixed fallback chain: `asset_width ?? element.width ?? img.width` (same for height). SVGs now draw at their intended dimensions.
    3. **Dwell time** — Cross-section camera pans now hold at the source section until `max(keyframe_time, lastElementReveal + 1.5s)`. A minimum 0.5s pan duration is guaranteed so the transition is never a hard cut. Intra-section zooms/reframes are unaffected.
  - **Root-cause fixes applied (2026-06-04, session 2):** the 2026-06-04 session-1 fixes were surface patches; debug logging (`DEBUG_RENDER=1`) revealed the true root causes:
    1. **Black gaps (Issue 1)** — debug showed sections were 1200-1600px wide inside a 1920px viewport with 200px gaps → up to 38% of the frame was dead canvas, even at rest. The `clampToContent` patch never fired (viewport always overlapped ≥1 section). REAL FIX is in the spec generator: every section is now exactly 1920px wide at `x_offset = 1920×index`, zero gaps, `board.width = 1920×N`. Renderer camera code unchanged (the clamp is now a harmless no-op safety net).
    2. **Invisible SVGs (Issue 2)** — TWO independent bugs, either fatal: (a) `index.ts` built the channels path with `../../channels` (lands in `output/channels`, doesn't exist); now resolved by walking up to find `channels/<id>/assets/svg` (works for both real jobs and the test fixture). (b) the spec put the asset name in `content` but `drawSvgAsset` read `asset_name`; renderer now reads `asset_name ?? content`, the loader collects names from spec elements (not just the under-declared `asset_needs`), and the prompt now mandates `asset_name`.
    3. **Video cutoff (Issue 3)** — `adjustTimestamps` was a no-op while the audio WAS silence-trimmed, so Whisper timestamps (untrimmed timeline, words 4.96-48.48s) drifted ~5s from `clean_audio` (42.59s); `duration_seconds` came from the untrimmed last word (49) but ffmpeg `-shortest` clamped to the 42.59s audio, cutting the conclusion. FIX: trim is now timestamp-driven (`computeKeepWindow`), `adjustTimestamps` shifts words to the clean_audio timeline, and the orchestrator sets `duration_seconds` to the real clean_audio length.
    4. **Timing (Issue 4)** — see decision below.
### Phase 2 — Board Spec Generator ✅ COMPLETE
### Phase 2.5 — Asset Generator ✅ COMPLETE
### Phase 3 — Audio Pipeline ✅ COMPLETE
### Phase 4 — Content Pipeline ⬜ NOT STARTED (build after 1–3 working)
### Phase 5 — Orchestrator ✅ COMPLETE

---

## File Structure

```
/
├── CLAUDE.md
├── renderer/                        ← Phase 1
│   ├── package.json
│   ├── tsconfig.json
│   ├── fonts/                       ← auto-downloaded TTF files on first run
│   └── src/
│       ├── index.ts                 ← exported: renderVideo(specPath) → outputPath
│       ├── frameRenderer.ts         ← renders one frame to canvas
│       ├── elements/                ← one file per element type
│       │   ├── headline.ts
│       │   ├── eyebrowLabel.ts
│       │   ├── bodyText.ts
│       │   ├── ruleLine.ts
│       │   ├── connectorArrow.ts
│       │   ├── nodeBox.ts
│       │   ├── nodeCircle.ts
│       │   ├── svgAsset.ts
│       │   ├── pngAsset.ts
│       │   ├── labelTag.ts
│       │   ├── thoughtBubble.ts
│       │   ├── listReveal.ts
│       │   ├── highlightBox.ts
│       │   └── blurReveal.ts
│       ├── camera.ts                ← buildCameraPath() derives continuous board-pan + intra-scene push (2026-06-05 rewrite)
│       ├── motion.ts                ← gentle per-asset float/bob + breathe() helper (#6)
│       ├── blueprint.ts             ← quiet schematic filler: grid, registration brackets, ticks (#6)
│       ├── reveal.ts                ← animation progress calculations
│       ├── fonts.ts                 ← auto-downloads + registers fonts
│       ├── grain.ts                 ← generates grain overlay PNG once
│       ├── ffmpeg.ts                ← stitches frames + mixes audio
│       └── schema.ts                ← TypeScript types
├── pipeline/                        ← Phases 2, 2.5, 3, 5
│   ├── package.json
│   └── src/
│       ├── channelGenerator.ts      ← Channel Generator: title+desc → ChannelSpec (Opus)
│       ├── channelSpec.ts           ← load/save ChannelSpec + adapters (toRenderProfile/toChannelConfig) + archetype defaults
│       ├── scriptGenerator.ts       ← Phase 0: topic + minutes → narration script (Opus); reads learnings (closed loop)
│       ├── tts/                      ← Phase 0.5 TTS adapter (index + backends/fish.ts S1, backends/sapi.ts)
│       ├── config/                   ← env.ts (.env loader, no dep) + paths.ts (shared ROOT)
│       ├── publish/                  ← PART 1: youtubeClient/youtubeAuth/upload/schedule/quota/metadata + index(publishJob)
│       ├── analytics/                ← PART 2: youtubeAnalytics/pull/learnings/analyze (feedback loop)
│       ├── autopilot/                ← PART 3: autorun.ts (full passive loop) + topic.ts (next-topic picker)
│       ├── specGenerator.ts         ← Haiku structure + Opus spec; combo(config) + font-floor
│       ├── comboInsurance.ts        ← config-driven paired-noun safety net (rules from channel config)
│       ├── assetGenerator.ts        ← per-channel SVG style prompt threaded in (assetStyle)
│       ├── server.ts                ← Express API + SSE: script gen, audio options, MP4 extract, run
│       ├── audio/
│       │   ├── denoise.ts
│       │   ├── transcribe.ts
│       │   ├── trim.ts
│       │   ├── silence.ts           ← internal-gap removal + timestamp remap
│       │   ├── audioConfig.ts       ← tunable audio config: resolveAudioConfig(channel, job)
│       │   ├── soundLibrary.ts      ← categorized drop-in SFX library loader (folders + manifest)
│       │   ├── triggerEngine.ts     ← single trigger engine: spec+script+timestamps → cues
│       │   ├── sfx.ts               ← realizes cues from the library (per-category vol/peak/lead)
│       │   ├── music.ts             ← selectable + ducked bed (none / auto-mood / track)
│       │   └── audioProcessor.ts
│       ├── types/
│       │   ├── specTypes.ts         ← BoardSpec(+style) + ChannelConfig(+text colors,audio,combo)
│       │   └── channelSpec.ts       ← Zod ChannelSpec + RenderProfile + ARCHETYPE_IDS
│       ├── prompts/
│       │   ├── channelSpecPrompt.ts ← Channel Generator prompt (4 archetypes described)
│       │   ├── scriptPrompt.ts      ← Phase 0 script-gen prompt (voice from channel config)
│       │   ├── boardSpecSystemPrompt.ts  ← PALETTE-DRIVEN (bg/text colors, light-vs-dark)
│       │   ├── boardSpecUserPrompt.ts
│       │   └── svgAssetSystemPrompt.ts   ← buildSvgAssetSystemPrompt(assetStyle)
│       └── (renderer/src/ also gained: style.ts archetypes+resolveStyle, background.ts modes)
│       ├── validation/validateSpec.ts
│       └── orchestrator.ts
├── ui/                              ← web UI (Vite + React + Tailwind) — `npm run ui` (#8)
│   ├── package.json
│   ├── vite.config.ts               ← /api proxy → :5050 in dev
│   ├── index.html
│   └── src/{main.tsx, App.tsx, index.css}
├── channels/
│   └── how_industries_work/
│       ├── config.json
│       └── assets/
│           ├── svg/
│           └── png/
├── jobs/
│   └── how_industries_work/{job_id}/
│       ├── voiceover.wav
│       └── script.txt
├── output/
│   └── how_industries_work/{job_id}/
│       ├── video.mp4
│       ├── board_spec.json
│       ├── clean_audio.wav
│       ├── timestamps.json
│       └── status.json
└── test/fixtures/
    ├── test_board_spec.json
    └── test_script.txt
```

---

## Decisions Log

| Decision | Reason |
|----------|--------|
| @napi-rs/canvas + FFmpeg instead of Remotion | No browser/Chromium required — operator has parental restrictions blocking Chrome |
| SVG clip-reveal instead of strokeDashoffset | Canvas can't animate SVG paths natively; clip-reveal looks nearly identical |
| @resvg/resvg-js for SVG rasterization | Best Rust-based SVG → PNG converter for Node.js, no browser needed |
| Structured JSON spec, not raw React per video | Cheaper, consistent, debuggable |
| Dark canvas #08090f, not white | Matches reference channel visual style |
| 2D canvas layout (x+y, not just x) | Enables vertical camera moves |
| Phase 2.5 for asset generation | Separates concerns; assets accumulate over time |
| Local Whisper not OpenAI API | No per-minute cost at scale |
| Google Antigravity IDE | User's IDE — paste prompts into agent sidebar, select Claude Sonnet 4.6 model |
| Font download: iOS 4.3 UA for TTF | IE/modern UAs get WOFF/WOFF2 from Google Fonts; @napi-rs/canvas needs TTF/OTF. Old iOS Safari UA predates WOFF support so Google Fonts serves TTF. fonts.ts also validates magic bytes and re-downloads if format is wrong. |
| Camera zoom without horizontal shift | viewport_x must stay ≥ section x_offset during a zoom keyframe, or left-edge content clips. Zoom is achieved by reducing viewport_width, not by moving viewport_x rightward into content. |
| Syne weight: regular (400) not bold | fontSpec returns no weight modifier (implicit 400); downloading Syne:wght@700 causes weight mismatch and font fallback. Query uses plain "Syne" (400). |
| DeepFilterNet incompatible with Python 3.14 | Package not yet updated for 3.14. Denoise step is skipped until package updates — pipeline logs a warning and continues with original audio. |
| Sonnet spec prompt: include concrete example + exact field names | Without a minimal JSON example, Sonnet invents field names (type:"text"+subtype, "text" instead of "content", "label" instead of "section_type"). The "EXACT FIELD NAMES" section + minimal example section in the system prompt fixes this. |
| Sonnet max_tokens for spec generation: 16000 | A 60s video spec is ~24K JSON characters (~8K tokens). max_tokens:8000 truncated the first response. 16000 gives comfortable headroom. |
| SVG asset dimensions: spec uses width/height, not asset_width/asset_height | The spec generator emits `element.width` and `element.height` on svg_asset nodes (same fields shared with other element types). `drawSvgAsset` originally only checked `element.asset_width`/`element.asset_height`, falling through to the SVG's raw rasterized pixel dimensions (often tiny). Fixed: fallback chain is now `asset_width ?? width ?? img.width`. Do not change the spec generator — `width`/`height` is the correct field for all element types. |
| Camera dwell: renderer holds at section until reveal+1.5s | The spec generator produces keyframe times based on narration pacing, but reveals can run until near the departure keyframe. The renderer now delays cross-section pans until `max(from_keyframe_time, lastReveal + 1.5s)`, capped so at least 0.5s remains for the actual pan. This is renderer-side and requires no spec changes. |
| Camera content-clamp: viewport never in empty canvas gap | Sections may have small horizontal gaps (e.g. 200px) between x_offset boundaries. During a pan, the interpolated viewport_x could pass through that gap showing pure black. `getCameraAtTime` now clamps the viewport to always overlap at least one section during cross-section transitions. (Superseded 2026-06-04 s2: with 1920-wide gapless sections this clamp is now redundant; kept as a safety net.) |
| One-screen-per-section: width 1920, x_offset 1920×index, no gaps | Root cause of black gaps. Sections narrower than the 1920 viewport (or with 200px gaps) leave dead canvas in-frame that no renderer clamp can hide. Spec generator now emits exactly-1920-wide sections at 1920×index with board.width = 1920×N. Renderer untouched. |
| SVG asset name in `asset_name`, renderer accepts `asset_name ?? content` | Spec generator emitted the library name in `content`; renderer read `asset_name` → '' → invisible. Prompt now mandates `asset_name`; renderer falls back to `content` for resilience; loader scans spec elements (asset_needs was under-declared, e.g. omitted person_standing). |
| SVG channels dir resolved by walking up, not fixed `../../` | `../../channels` only resolved correctly from `test/fixtures/`; real specs at `output/<ch>/<job>/` landed on non-existent `output/channels`. `resolveChannelSvgDir` walks parents until it finds `channels/<id>/assets/svg`. |
| Audio trim is timestamp-driven; timestamps shifted to clean_audio timeline | Whisper runs on untrimmed audio; FFmpeg silenceremove cut ~5s of lead without adjusting timestamps → constant 5s desync + cutoff. Now `computeKeepWindow` derives the cut from the word timestamps, `trimToWindow` cuts sample-accurately, and `adjustTimestamps` subtracts the lead offset so words align with clean_audio. |
| `duration_seconds` = real clean_audio length (orchestrator override) | Was the spec generator's guess (untrimmed last word) → ffmpeg `-shortest` cut the video to the shorter clean_audio. Orchestrator now overrides `spec.duration_seconds` with the measured clean_audio duration. |
| Spec generator gets COMPLETE word timestamps, not a 40-word sample | `buildBoardSpecUserPrompt` sent only the first 40 words; specs >40 words (most) had un-timed tails → Sonnet guessed later reveals (front-loading/clustering). Now sends every word with start+end via `formatFullTimestamps`. |
| Combo/paired-noun rules live in channel config, not code (2026-06-11) | "Concrete nouns → assets" (#6) must be GENERIC across topics. The deterministic safety net hardcoded `hot_dog→soda`. Moved to `channelConfig.combo_rules` (optional); empty ⇒ no-op. Code is topic-agnostic; the hot_dog rule is now a sample config entry that won't fire on non-food topics. |
| Costco/hot-dog removed as prompt EXAMPLES, genericized (2026-06-11) | The spec system prompt used Costco/hot-dog/soda as illustrative nouns, biasing the model. Replaced with neutral examples (shipping container, gas pump, factory_exterior). Rules unchanged; only the example nouns are generic. Zero Costco hardcoding anywhere in code or prompts. |
| Deterministic font-floor over reject-and-retry (2026-06-11) | Legibility floor (#5) is enforced by bumping sub-floor `font_size` up in `specGenerator` (supporting 30 / headline 64), not by failing validation. Guarantees readable labels without burning a retry/regeneration. |
| Audio engine: categorized library + single trigger engine + config layer (2026-06-11) | Old SFX hardcoded swoosh/cha-ching cue logic. New: drop-in `assets/sfx/<category>/` + manifest, one `triggerEngine` keyed off event SHAPE (not nouns), tunable via `config.json"audio"` + per-job `options.json`. Generic across topics; adding a sound needs no code change. |
| Music bed selectable + ducked (2026-06-11) | UI/config can pick None / Auto (mood-shifting) / a specific track. Bed is ducked under narration via ffmpeg `sidechaincompress` so it drops under speech and swells in gaps. "None" is a valid choice. Music is still audio-only → re-mix + re-mux without re-render. |
| UI uploads MP4; server extracts audio with ffmpeg (2026-06-11) | Operator records on a phone/camera (MP4). The `inputs` endpoint runs `ffmpeg -vn -ac 1 pcm_s16le` on any uploaded media → `voiceover.wav`, so the existing Whisper/audio pipeline is unchanged. |
| E2E proven with a TTS stand-in voiceover (2026-06-11) | The real voiceover is a manual step. To prove the whole path autonomously, Phase 0 wrote a script and Windows SAPI synthesized a stand-in `voiceover.wav`, then the full pipeline ran end-to-end on a non-Costco topic. |

## Issue 4 Decision (2026-06-04 session 2): TARGETED REWRITE, not full rewrite

The board spec system prompt's scaffolding (canvas, colors, fonts, EXACT FIELD NAMES, minimal example) is correct and encodes hard-won fixes — a from-scratch rewrite risked regressing field-name discipline. The defects were localized to (a) two pipeline data-feed bugs and (b) the layout/timing RULE sections. So: the SECTION LAYOUT, TIMING, CAMERA, and SVG sections of `boardSpecSystemPrompt.ts` were rewritten in place; the user prompt now feeds full timestamps; and the audio/duration bugs were fixed at the source. The TIMING section now enforces the five rules: (1) reveal at the exact introducing word's start time, (2) punchlines never precede the voiceover, (3) ≥0.3-0.5s stagger / no shared timestamps, (4) supporting elements 0.5-1.0s after their parent headline, (5) real-time draw feel. **Validation still pending: requires a full pipeline re-run (Whisper + Sonnet) on a real voiceover.**

---

## Render-Feel Overhaul + Frontend (2026-06-05)

Addressed the "slideshow" feel, dead static scenes, SFX timing, the unrecognizable hot dog /
missing soda, and built the first web UI. Key changes (verified: both projects `tsc --noEmit`
clean; camera path numerically checked to have 0px dead canvas across all frames):

**Camera — full rewrite of `renderer/src/camera.ts` (#1/#2/#3).** The old model kept ONE static
keyframe per scene (`normalizeCameraKeyframes`) and held dead-still then snap-panned — and the
real cause of "black between scenes" was the camera ARRIVING at the next section *before* that
section's first element revealed (e.g. pan ended at t=10 but `c_eyebrow` revealed at 10.46),
so it sat framed on an empty/black section. New model: `buildCameraPath(sections, duration)`
derives the WHOLE path from section geometry + per-element reveal times (the sparse spec
keyframes are ignored except for ordering). It (1) glides section→section so it ARRIVES exactly
as the next section's first element reveals — never parks on black, previous section stays
partly visible during travel (overlap); (2) does ONE gentle centred push-in (Ken Burns,
`PUSH_ZOOM=0.93`) within each scene so nothing is dead-static — centred so the frame is always
inside the section (zero clip risk; the prompt's content band [x+80, x+1840] stays in frame);
(3) departs only after the section's last entrance + `MIN_DWELL_AFTER_ENTRANCE` so nothing
animates in as the camera leaves. `getCameraAtTime` is now a plain eased lerp over the dense
path (no dwell/clamp special-casing). `index.ts` calls `buildCameraPath`. `getCameraAtTime`
keeps its `(keyframes, sections, currentTime)` signature for `frameRenderer`/`debug` compat
(sections now unused).

**Motion + filler — `renderer/src/motion.ts` + `blueprint.ts` (#6).** `blueprint.ts` draws a
quiet schematic filler layer UNDER content (faint board grid + per-section corner registration
brackets + a baseline of measurement ticks, a couple slowly breathing), in camera space so it
moves with the board. `motion.ts` gives svg/png assets a slow per-id float/bob (≈6px, ~6s
period). `frameRenderer.ts` draws the blueprint layer then translates each asset by its bob.
Big text is untouched. Line charts already draw-on left-to-right via the `draw_on` clip-reveal.

**SFX — `pipeline/src/audio/sfx.ts` (#4).** (a) swoosh now PEAK-aligned: `detectPeakOffset`
decodes the file to PCM via ffmpeg and finds the loudest sample, and placement offsets by that
so the audible peak (not the soft head) lands `SWOOSH_LEAD=0.1s` BEFORE the event — it leads
the motion instead of trailing. (b) cha-ching gated on `moneyMagnitude(text) >= BIG_MONEY_MIN`
($100), so "$1.50"/"$0.50"/"50-cent" never trigger it (this test → 0 cha-chings, by design).
Still capped sparse (MAX_CUES 6, MIN spacing 2.5s, swooshes tied to scene establishment only).

**Hot dog + soda combo (#5).** Rewrote `channels/.../svg/hot_dog.svg` to a recognizable hot
dog (split bun side profile + sausage + mustard zigzag). Added `soda_cup.svg` and a combined
`hot_dog_combo.svg` (hot dog beside a cup+lid+straw). `config.json` library now lists hot_dog,
soda_cup, hot_dog_combo. Prompt gained a COMBOS/PAIRED-NOUNS rule. Deterministic safety net:
`pipeline/src/comboInsurance.ts` `ensureComboAssets(spec)` (called in `specGenerator`) swaps a
lone `hot_dog` for `hot_dog_combo` when the section text says "combo"/"soda" and the partner
isn't already drawn — so the opening ALWAYS shows both, regardless of LLM placement.

**Frontend (#8).** `ui/` = Vite + React + Tailwind app; `pipeline/src/server.ts` = Express API
that spawns the same `cli.ts process` the CLI uses and streams stdout/stderr to the browser
over SSE (no logic duplicated). Endpoints: channels, jobs (create/list), inputs (multer upload
of audio + script), process, events (SSE), status, video (range-served for inline preview +
download), assets (svg thumbnails). `npm run ui` (from pipeline/) builds the client + serves
everything on :5050. Dev: `npm run ui:server` + `cd ui && npm run dev` (5173 proxies /api).
First-time: `cd ui && npm install`.

**Housekeeping (#7).** SVG channel-path resolution confirmed working (assetGenerator writes to
`pipeline/../channels/<id>/assets/svg`; renderer `resolveChannelSvgDir` walks up to it).
`person_standing.svg` only auto-generates if a spec's `asset_needs` references it — test_001
doesn't, so it isn't generated; the generator itself is confirmed functional.

### Follow-up additions (2026-06-05, same session)

**Internal-silence removal** (`pipeline/src/audio/silence.ts`). The old trim only stripped
LEADING/TRAILING silence, so a long dead pause mid-take stayed in (test_001 had a 4.30s gap at
24.18→28.48s — "the long quiet section a little over halfway"). New: `computeKeepSegments`
builds keep-segments from word timestamps, cutting any internal gap > `GAP_MAX` (1.1s) down to
`GAP_KEEP` (0.45s) — natural sentence pauses stay; `trimToSegments` atrim+concats the segments;
`remapTimestamps` shifts every word onto the shorter timeline so audio/timestamps/spec stay in
sync. `audioProcessor.ts` now uses these instead of the single-window `computeKeepWindow`/
`trimToWindow`/`adjustTimestamps` (those remain in `trim.ts`, unused, as reference). On test_001
this removes ~3.85s (44.3s → ~40.5s) and the dead middle is gone.

**Mood-shifting music bed** (`pipeline/src/audio/music.ts`, `assets/music/`). Lays a minimal,
low (`MUSIC_VOL=0.18`) music bed under narration+SFX that SHIFTS MOOD per section: `SECTION_MOOD`
maps section_type → mood (hook=curious, comparison=tense, revelation=uplifting, conclusion=
reflective, others=neutral); `buildMoodTimeline(spec)` turns the section order into a mood
timeline (merging adjacent same-mood); `mixMusic` ffmpeg-crossfades each mood's track (fades
overlap by `CROSSFADE=2s`) under the narration, `-stream_loop -1` so short tracks cover any
segment. Tracks live in `assets/music/<mood>.mp3` (`.wav` ok); `<mood>_N` variants are picked
per-video by hashing video_id (different videos → different tracks). Wired into the orchestrator
right after the SFX pass (→ `clean_audio_music.wav`), non-fatal. NOTE: music is audio-only, so
level/track changes can be re-mixed + re-muxed onto existing frames (`ffmpeg -c:v copy`) with NO
re-render. **First synthetic drones were rejected ("doesn't sound like music") and REPLACED with
real Kevin MacLeod tracks (CC-BY) downloaded from archive.org** — tracks ~-17 dB so MUSIC_VOL was
retuned to 0.18 (bed ~-32 dB). `assets/music/README.md` lists the track→mood map and the
**required CC-BY attribution** (must credit Kevin MacLeod in video descriptions), plus a Pixabay
CC0 (no-attribution) alternative.

**Multi-frame SVG animation** (`renderer/src/motion.ts` `multiFrameState`, `elements/svgAsset.ts`,
`index.ts`, `assetGenerator.ts`). Assets can be a FLIPBOOK, not just a static draw-on: frame 1 =
`<name>.svg`, extra frames = `<name>__2.svg`, `<name>__3.svg`, … `index.ts` loads ALL frames into
`Map<string, Image[]>`. `svgAsset.ts`: frame 1 draws on as before, then the frames play —
`multiFrameState(elapsed, n)` holds each frame (`FRAME_HOLD`) then cross-dissolves (`FRAME_XFADE`)
to the next, running 0→N-1 ONCE (the progression) then ping-ponging the last two frames forever
(the idle, e.g. a wave). Frames must share an identical static outline so only the moving part
animates (clean dissolve). Demo: `costco_building` is now 4 hand-authored frames (doors closed →
sliding open → greeter in the doorway → waving) shown in the revelation beat. AUTOMATION: an
svg_asset can carry `anim_action` (+ optional `anim_frames`) in the spec; the orchestrator passes
those to `ensureAssets`, which calls `generateAnimatedFrames` (Opus → a JSON array of N frame
SVGs) and saves `<name>.svg` + `<name>__k.svg`. Schema gained `anim_action`/`anim_frames` in BOTH
`renderer/src/schema.ts` and `pipeline/src/types/specTypes.ts`, AND the Zod `ElementSchema` (it
strips unknown keys, so the fields had to be added or they'd vanish in validation). Prompt teaches
ONE animated hero per video, sparingly. New debug env `DEBUG_START_FRAME` (with `DEBUG_MAX_FRAMES`)
renders a contiguous window so you can eyeball an animation without a full render.

## Multi-Part Build — Phase 0, generic render rules, audio engine, full UI (2026-06-11)

Five-part work order (A render-quality generic-ness, B script gen, C audio engine, D frontend,
E e2e test). All pipeline + UI `tsc --noEmit` clean; UI `vite build` clean.

**PART A — render quality made GENERIC (zero topic hardcoding).** The render-feel systems from
2026-06-05 (continuous camera, intra-scene push, entrance dwell, blueprint filler, asset motion)
were already geometry-driven and topic-agnostic — verified, left intact (rule #4). The real
hardcoding was elsewhere and was removed:
  - **Combo/paired-noun safety net is now config-driven.** `comboInsurance.ts` no longer hardcodes
    `hot_dog→soda`; `ensureComboAssets(spec, rules)` takes rules from `channelConfig.combo_rules`
    (new optional `ComboRule[]` in specTypes + config.json). Empty/absent ⇒ complete no-op, so it
    never biases a non-food topic. The hot_dog rule now lives in `how_industries_work/config.json`
    as a sample (won't fire on other topics). `specGenerator` passes `channelConfig.combo_rules`.
  - **Costco examples removed from `boardSpecSystemPrompt.ts`** — the "Costco building + price tag"
    overlap example, the "costco_building at 'Costco'" timing example, and the hot dog/soda CONCRETE
    NOUNS + COMBOS examples were genericized to neutral, topic-agnostic phrasing (shipping
    container, gas pump, vending machine, factory_exterior). The rules are unchanged; only the
    illustrative nouns are now generic.
  - **Deterministic legibility floor (#5).** `enforceFontFloor(spec)` in `specGenerator` bumps any
    below-floor `font_size` up to the readable minimum (supporting 30, headline 64) — a generic
    safety net so tiny labels can never ship regardless of model output. (Overlap validation for
    block elements already existed in `validateSpec.ts` and is topic-agnostic — left as is.)

**PART B — Phase 0 script generation.** See Phase 0 above.

**PART C — audio engine rebuild (generic, config-driven).** Replaced the two-cue hardcoded SFX
logic with a real engine:
  - **Categorized drop-in SFX library.** `assets/sfx/` reorganized into `motion/ money/ impact/ ui/`
    subfolders + `manifest.json` (per-category volume / lead_ms / peak_align). `swoosh.wav`→motion,
    `cha-ching.wav`→money. `pipeline/src/audio/soundLibrary.ts` scans folders at run time (multiple
    files per category; `pickFile` deterministic per video). Adding a sound = drop a file, no code.
  - **Single trigger engine** `pipeline/src/audio/triggerEngine.ts`: takes spec events + script +
    word timestamps + tunable config → sparse prioritized cues, keyed off event SHAPE (never a
    noun/brand). motion = scene establishments (peak-aligned + pre-rolled lead so it ANTICIPATES
    the camera move); money = big dollar figures gated by `big_money_min` (default $100; small
    prices never fire; often 0/video); impact = the single biggest revelation; ui = list reveals.
    Priority (money>impact>motion>ui) resolves spacing conflicts; `intensity` scales the cap.
  - **`sfx.ts` rewritten** to realize cues from the library (per-category volume/peak-align/lead).
    No hardcoded swoosh/cha-ching logic remains. Peak detection (loudest-sample alignment) kept.
  - **`music.ts` rewritten** for a SELECTABLE, DUCKED bed: `track` = "none" (off) | null/"auto"
    (mood-shifting, the old behavior) | "<stem>" (one chosen track). Bed is ducked under narration
    via `sidechaincompress` (config `duck`) + fades. `listMusicStems()` powers the UI picker.
  - **Tunable config layer** `pipeline/src/audio/audioConfig.ts`: `resolveAudioConfig(channel, job)`
    merges channel `config.json"audio"` + per-job `options.json` over defaults. Orchestrator passes
    `audioCfg.sfx`/`audioCfg.music` into the mixers; reads `jobs/<ch>/<job>/options.json` if present.

**PART D — full web UI flow.** Extended the EXISTING `server.ts` + `ui/` (rule #4, no rebuild):
  - server: `POST .../script` (Phase 0 in-process), `GET .../script`, `GET /api/music`,
    `POST .../options` (writes options.json). The `inputs` upload now EXTRACTS audio from any
    uploaded media (MP4/MOV/…) to `voiceover.wav` via ffmpeg (`-vn -ac 1 pcm_s16le`).
  - UI (`ui/src/App.tsx`): numbered flow — 1 Generate Script (topic + minutes), 2 Script display,
    3 Audio options (music Auto/None/track + SFX on-off + intensity), 4 recorded `.mp4` upload,
    Run → live phases/logs → inline player + download link. Asset library panel unchanged.

**PART E — end-to-end test (autonomous, non-Costco).** Phase 0 generated a ~1min script on "How
vending machines really make money" (concrete nouns + money beats). A TTS stand-in voiceover was
synthesized with Windows SAPI (`System.Speech`) → `voiceover.wav`, then the FULL pipeline was run
(`npm run process how_industries_work e2e_001`): audio → spec (Opus) → assets → audio engine →
render → `output/.../e2e_001/video.mp4`. RESULT: ✅ status `ready_for_review`,
`video.mp4` = 65.75s, h264 + aac, audio_file `clean_audio_music.wav` (full clean→sfx→music
chain present). Audio engine fired correctly: SFX = 1 money cue on the $3,000 beat (gated — $75 /
$0.20 / $2 stayed silent) + 3 motion whooshes on scene establishments; music = mood bed
curious→uplifting→neutral→reflective, ducked. Spec drew GENERIC assets for the topic
(vending_machine, route_map_with_pins, factory_exterior) — concrete-noun mapping works with zero
Costco bleed. No combo/font-floor safety nets needed to fire (correct). Render took ~24.5 min.
The operator's REAL run is unchanged: generate script in the UI, drop their own MP4, get the link.

## Channel Format System + Channel Generator + Fish S1 voice (2026-06-12)

Made channels GENUINELY different (not reskins): a per-channel format spec drives visuals/voice/
style, plus a generator that creates one from a title + description. All renderer + pipeline +
UI `tsc --noEmit` clean; UI `vite build` clean. Regression-safe (blueprint_board reproduces the
original look; specs with no `style` fall back to it).

**PART 1 — ChannelSpec + token-driven renderer.**
  - `pipeline/src/types/channelSpec.ts` — Zod `ChannelSpec` (palette, typography, layout,
    assetStyle, cameraProfile, motionProfile, background, audioIdentity, scriptStyle, format,
    comboRules) + `RenderProfile` (the subset the renderer consumes). `ARCHETYPE_IDS`.
  - `pipeline/src/channelSpec.ts` — `ARCHETYPE_DEFAULTS` (4 archetypes), adapters
    `toRenderProfile()` (→ board_spec `style`) and `toChannelConfig()` (→ legacy ChannelConfig
    the spec/script/audio code still uses), `loadChannelSpec()` (reads channel.spec.json, or
    SYNTHESIZES a blueprint_board spec from a legacy config.json), `saveChannelSpec()` (writes
    channel.spec.json + a derived config.json + asset dirs).
  - Renderer refactor (regression-safe): `renderer/src/schema.ts` gained `RenderProfile` +
    optional `BoardSpec.style`. New `renderer/src/style.ts` = the 4 archetype presets +
    `resolveStyle(spec)` (merges spec.style over blueprint_board). `style.ts` BLUEPRINT_BOARD
    reproduces the OLD hardcoded constants exactly. Threaded the profile through:
    `fonts.ts` (`loadFonts(profile)` downloads whatever 3 Google-Fonts families the archetype
    needs, per-font failure non-fatal), `utils.ts` (`setFontMap` — active logical→real font map
    so all 14 element files map display/mono/body to the channel fonts w/o per-file threading),
    new `background.ts` (`drawBackground`: flat | board_grid | gradient-vignette | paper |
    dotted board-space dots), `frameRenderer.ts` (background + filler gating + grain alpha + bob
    amp all from the profile; `RendererContext.profile`), `blueprint.ts` (filler colors/grid/
    brackets gated by `profile.filler`), `camera.ts` (`buildCameraPath(sections,duration,cam)` —
    pushZoom/maxTravel/minDwell/easing from the profile; pushZoom=1 ⇒ a still hold), `motion.ts`
    (`assetBob(...,amp)`), `index.ts` (resolveStyle → loadFonts → setFontMap → buildCameraPath →
    rctx.profile; logs the style line).
  - Spec generator now palette-driven: `boardSpecSystemPrompt.ts` takes background/text colors +
    accents from the channel and tells the model "DARK ink on light bg" vs the reverse (an
    `isLight()` luminance test) — previously HARDCODED to #08090f + bright text, which would have
    put white text on a light-bg channel. `ChannelConfig.design_system` gained `text_primary/
    text_secondary`. The orchestrator embeds `spec.style = toRenderProfile(channelSpec)` and
    passes a per-channel SVG system prompt (`buildSvgAssetSystemPrompt` in svgAssetSystemPrompt.ts,
    keyed by assetStyle: blueprint-wireframe | flat-filled | line-illustration | isometric |
    hand-drawn) into `ensureAssets`. `comboInsurance`/font-floor unchanged.
  - Channel Generator (PART 1d): `pipeline/src/channelGenerator.ts` + `prompts/channelSpecPrompt
    .ts` — opus designs a complete validated ChannelSpec (picks/blends an archetype), `id` is
    slugified+de-duped in code (not trusted from the model). CLI `npm run channel:new "<title>"
    "<description>" [niche] [audience] [tone]`.

**PART 2 — Fish S1 voice (Phase 0.5 TTS adapter).** NOTE: the prior prompt claimed a TTS adapter
already existed — it did NOT (last session only shelled out to SAPI inline during the e2e test).
Built it: `pipeline/src/tts/` — `index.ts` `synthesizeVoiceover(text,outWav,opts)` (default
backend Fish S1 when FISH_API_KEY set, else falls back to the SAPI stand-in with a clear
message; converts to canonical mono-16k-PCM wav via ffmpeg), `backends/fish.ts` (HOSTED Fish API
— never self-host S1/S2, avoids the Research-License commercial limit; key from FISH_API_KEY,
header `model: s1`, `reference_id` = channel voice), `backends/sapi.ts` (Windows System.Speech).
Orchestrator `generateVoiceoverForJob()`, CLI `npm run voiceover <ch> <job> [fish|sapi] [voice]`.

**PART 3 — UI New Channel + one-command launch.** `server.ts` endpoints: `POST /api/channels/
generate` (opus, no save → editable preview), `POST /api/channels/save`, `GET /api/channels/:id/
spec`, `POST .../voiceover`, `GET /api/tts/status`; channels list now includes archetype+palette.
`ui/src/App.tsx`: header **+ New Channel** → `NewChannelModal` (form → generate → editable preview
with palette swatches/fonts/archetype/voice/length → Save), a channel style chip, and a **🔊
Generate voiceover** button (shows active TTS backend). `npm run ui` already builds + serves both
on ONE URL (:5050) — startup now prints a single clear clickable URL; ui:server+vite dev is
documented as optional.

**PART 4 — existing render behaviors preserved, now token-driven.** Continuous board / no fade to
black, intra-scene push, entrance→dwell→travel, no-overlap validation, font-floor + contrast,
concrete-noun→asset, motion+filler — all still hold; they now read the active channel's camera/
motion/filler/typography/background instead of fixed board values (blueprint_board = identical to
before).

**PART 5 — self-test.** `npm run channel:new "Tiny Kitchens" …` → landed on **notebook_sketch**
(cream paper #FBF3E2, hand-drawn assets dark-brown ink, Caveat handwriting, dotted bg) —
unmistakably non-blueprint. Generated a ~1min script + a TTS voiceover (Fish key absent → SAPI
stand-in, as designed). Rendered BOTH `tiny_kitchens/tk_001` and `how_industries_work/e2e_001`
(blueprint regression). RESULT ✅ BOTH rendered to `ready_for_review`:
  - `tiny_kitchens/tk_001/video.mp4` — 64.2s, 13.9MB. Render log style line:
    `bg=dotted grain=0.12 filler=false fonts=[Caveat/Quicksand/Space Mono]`. Frame check: cream
    paper, handwritten Caveat headline, dark-brown/green/terracotta ink (NO white), a hand-drawn
    cast-iron pan, no grid/brackets. 6 hand-drawn assets generated (2 animated). Spec element
    colors all dark-on-cream (palette-driven prompt verified). Audio: 2 motion SFX, 0 money cues
    (correct), mood music ducked.
  - `how_industries_work/e2e_001/video.mp4` — 65.75s, 21.4MB. Style line:
    `bg=board_grid grain=0.45 filler=true fonts=[Bebas Neue/Syne/IBM Plex Mono]`. Frame check:
    near-black board + faint grid + grain, cyan mono eyebrow, condensed white Bebas "$3,000",
    cyan rule line, Syne body — IDENTICAL to the original look. REGRESSION CONFIRMED.
  The two are UNMISTAKABLY different (palette, typography, asset style, background, filler, camera/
  motion). Differentiation goal met. (Frames were extracted for inspection then deleted.)
Regression also confirmed at unit level: a no-`style` test fixture logs
`bg=board_grid grain=0.45 Bebas/Syne/IBM push=0.93` (blueprint fallback = original).

## Auto-publish + Analytics Feedback Loop (2026-06-12 session 2)

Closed the loop from "renders a video" to "publishes on a schedule and improves itself from its
own analytics." All pipeline + renderer + UI `tsc --noEmit` clean; UI `vite build` clean. Built
WITHOUT new npm dependencies — YouTube + OAuth over global `fetch`, a tiny built-in `.env` loader
(no `dotenv`/`googleapis`). Node 24 in this env (global fetch confirmed).

**ISSUE A — TTS audit (no orphaned wiring found).** Searched the whole codebase for SAPI/
System.Speech/inline-PowerShell-TTS outside the adapter. The ONLY `System.Speech` implementation
is `tts/backends/sapi.ts`; every other hit (`server.ts`, `cli.ts`, `App.tsx`) is just a backend
LABEL (`fish|sapi` arg) or the `/api/tts/status` reporter. Everything already routes through
`synthesizeVoiceover` (orchestrator `generateVoiceoverForJob`). Nothing to consolidate/remove —
the adapter interface is clean: `synthesizeVoiceover(text, outWav, {backend, voice})` → canonical
mono-16k PCM wav, backends selectable by `opts.backend` / `TTS_BACKEND` env (default `fish`).

**ISSUE B — Fish S1 default, LIVE-VERIFIED.** `.gitignore` created FIRST (root had none) with
`.env` + `youtube.auth.json` + `.quota/` + raw analytics ignored. `.env.example` + `.env` scaffold
written. New `pipeline/src/config/env.ts` (zero-dep loader; real env wins) imported as a side
effect at the top of `cli.ts` + `server.ts`. With the user's real `FISH_API_KEY` present, a live
S1 call via `npm run voiceover how_industries_work s1_test fish` produced a valid 5.96s mono
16-bit PCM 48k wav (558 KB) via backend `fish` (NOT the SAPI fallback) — verified with ffprobe.
how_industries_work's `audioIdentity.voice` is a real Fish reference id (`a59228a4…`).

**PART 1 — publishing (`pipeline/src/publish/`).**
  - `youtubeClient.ts` — OAuth refresh-token store (`channels/<id>/youtube.auth.json`), access-token
    refresh + cache, authed `fetch` GET helpers, `getMyChannel`. Scopes: youtube.upload + readonly
    + yt-analytics.readonly.
  - `youtubeAuth.ts` — one-time loopback OAuth handshake (`npm run youtube:auth <ch>`): local http
    server on `OAUTH_REDIRECT_PORT` (4180), `access_type=offline&prompt=consent`, saves refresh
    token. Opens browser best-effort + prints the URL.
  - `upload.ts` — resumable `videos.insert` over fetch (single PUT; videos are ~10-25 MB) +
    `thumbnails.set`. Scheduling sets `status.publishAt` (RFC3339) with `privacyStatus:private`.
  - `schedule.ts` — `channels/<id>/schedule.json` (timezone, cadence days+times, autoPublish,
    privacy, categoryId, defaultTags, dailyQuota). `computeNextSlot` is **timezone+DST aware**
    (Intl offset trick, no dep) and skips slots already in the local ledger
    (`.schedule.state.json`) so it never double-books. VERIFIED: Fri 09:00 ET → `13:00Z`.
  - `quota.ts` — global per-day unit tally (`.quota/<date>.json`); `COST_UPLOAD=1600`,
    ceiling `YT_DAILY_QUOTA` (10000) or per-channel override; refuses+queues over-ceiling uploads.
  - `metadata.ts` — title from `jobs/<ch>/<job>/meta.json` topic (or `publish.json` override or
    jobId), description from script's first beat, tags/category from schedule. Finds `thumbnail.*`.
  - `index.ts` `publishJob(ch, job, {schedule, dryRun})` — confirmation gate: default private; with
    `--schedule` or `autoPublish:true` → next slot. No auth ⇒ **dry-run plan** (touches nothing).
    VERIFIED end-to-end as a dry run (correct title/slot/quota, no API call).
  - CLI: `youtube:auth`, `publish <ch> <job> [--schedule]`. UI: server endpoints
    `publish/status`, `POST schedule`, `POST jobs/:j/publish`; App.tsx video panel got
    *Upload (private)* / *Upload + schedule next slot* + auth/autoPublish chips.

**PART 2 — analytics + learnings (`pipeline/src/analytics/`).**
  - `learnings.ts` — `channels/<id>/learnings.json` schema (videoLog / hypotheses / appliedRules /
    dropoffNotes / changelog, version+thresholds). `formatLearningsForPrompt` (active rules +
    dropoff notes → prompt block) and `logInjectedRules` (job trace). learnings.json IS committed.
  - `youtubeAnalytics.ts` — Analytics API pull per video: views, avgViewDuration/Percentage,
    subscribersGained, retention curve (`elapsedVideoTimeRatio` × `audienceWatchRatio`/
    `relativeRetentionPerformance`). impressions/CTR attempted but recorded **null** when the API
    rejects them (frequently Studio-only — documented).
  - `pull.ts` — discovers published videos from `output/<ch>/*/publish.result.json`, pulls each,
    archives raw at `analytics/raw/<date>.json`, upserts videoLog. No auth ⇒ graceful skip (so the
    operator can keep testing — per the mid-session request).
  - `analyze.ts` + `prompts/analysisPrompt.ts` — Opus reads raw+learnings → evidence-gated JSON
    update; changelog is APPEND-ONLY (never silent). **Overfitting guardrail in the prompt AND a
    code-enforced gate**: promote a hypothesis to a rule only if sampleSize ≥ `promoteSampleSize`
    (default 3) AND confidence ≥ `minConfidence` (0.6); under-gate "newRules" are demoted to
    hypotheses. VERIFIED LIVE on a 4-video fixture: promoted the curiosity-hook pattern (n=4,
    conf 0.68) to a rule, correctly **HELD** the CTR-correlation hypothesis (conf 0.5 < 0.6) as
    open, added a 0-10% dropoff note.

**PART 2b — closed loop (VERIFIED).** `generateScriptForJob` loads learnings, injects the active
rules + dropoff notes into `generateScript`/`buildScriptUserPrompt`, logs `learnings_applied.json`
into the job. Also writes `meta.json` (topic) at script-gen time for the publisher. PROVEN: a
selftest script gen logged "Conditioning on 2 learned rule(s)", wrote the trace, and the generated
script OPENED with the prescribed curiosity-gap question ("Why does your gym have 6,000 members but
only 80 treadmills?").

**PART 3 — autorun (`pipeline/src/autopilot/`).** `autorun(ch, {minutes, topic})`:
pull→analyze→`nextTopic` (Opus, conditioned on niche + past titles; skippable if topic passed)
→script→voiceover(S1)→`processJob`→`publishJob` (per schedule.json). Each stage logged; non-
critical (analytics, publish) caught + reported, critical (topic/script/voiceover/render) abort
cleanly. CLI `npm run autorun <ch> [minutes] ["topic"]`. Task Scheduler wiring documented in
README (not installed — just the `Register-ScheduledTask` recipe + recommended pre-slot cadence).

**PART 4 — self-test results.** pipeline+renderer `tsc --noEmit` clean; UI `vite build` clean
(169 KB JS). Live: S1 voiceover ✓, analyze on fixture ✓ (gate held), closed-loop injection ✓,
publish dry-run + slot math ✓. Sample files saved at `test/fixtures/analytics/sample_learnings.json`
+ `sample_schedule.json`; `.env.example` at root. The disposable `selftest` channel used for the
live tests was removed afterward (channel list stays clean).

**COULD NOT run live (no credentials in this env) — exact verify commands:**
  - Real YouTube upload + real analytics pull: needs `GOOGLE_CLIENT_ID/SECRET` in `.env` (still
    blank) + `npm run youtube:auth <ch>`. Then: `npm run publish <ch> <job>` (private),
    `npm run analytics:pull <ch>`, `npm run analytics:analyze <ch>`. Until then publish/pull
    self-skip to dry-run/no-op (by design).
  - Full `npm run autorun <ch>` end-to-end was NOT run live (it triggers a ~24-min render +
    multiple Opus calls); every stage was verified independently instead.
  - Prompt-vs-reality note: the prompt said "resolve TWO outstanding issues" and implied the TTS
    adapter might have orphaned SAPI wiring — it did NOT (Issue A was already clean from the prior
    session). The adapter + Fish backend already existed and were correct; this session only added
    the `.env` loader/scaffold and live-verified the S1 path.

## Render Variety + Contrast Fixes (2026-06-12 session 3)

Three fixes that made output read as an "automated slideshow": low-contrast assets on light bgs,
uniform text-left/visual-right layout, and every transition a horizontal pan. All deterministic
given the job's `video_id`; both packages `tsc --noEmit` clean; blueprint_board regression-safe.

**FIX 1 — asset contrast (no more white-on-light).** Root causes were (a) `generateAnimatedFrames`
ignored its per-channel `systemPrompt` and used the hardcoded white-on-dark default + a user prompt
literally saying `stroke #FFFFFF/#E0E0E0` (that's why `egg_sliding_on_surface` was white on cream
while static `cast_iron_skillet` was correct ink), and (b) filename-only caching never invalidated
stale white assets. Changes:
  - `types/channelSpec.ts` — new optional `assetRules` { `minContrastRatio` (default 3.0),
    `forbidNearBackground` (true), `ink?` } on ChannelSpec (defaulted ⇒ existing specs unchanged).
  - `prompts/svgAssetSystemPrompt.ts` — takes `ink`; the prompt now says "draw like pen/pencil on
    this paper using the ink color, NEVER white/near-white/near-background." `generateAnimatedFrames`
    now USES the passed per-channel system prompt (the bug fix) and a color-neutral user prompt.
  - NEW `assetContrast.ts` — `normalizeSvgContrast(svg, {background, ink, minContrastRatio,
    forbidNearBackground})`: WCAG relative-luminance + contrast ratio; any failing stroke/fill is
    remapped TOWARD ink in 10% steps (keeps hue when a partial darken passes; e.g. terracotta
    `#E2703A`→`#d16937`, not flattened). Pure string→string, idempotent.
  - `assetGenerator.ts` — `ensureAssets(..., {contrast, paletteHash})`: runs the guard over EVERY
    touched asset (reused + generated, all frames) so legacy white assets are fixed in place; a
    `.assetmeta.json` sidecar records the palette hash per asset and REGENERATES any asset whose
    hash changed (cache bust — no manual deletion). `orchestrator.ts` passes `ink` + contrast rules
    + a sha1 palette hash (palette+assetStyle+assetRules).
  - VERIFIED: contrast guard fixed 12/12 tiny_kitchens assets (67 colors; white #FFFFFF=1.10 ratio
    remapped), idempotent re-scan = 0 remaining. A real render frame shows a clearly visible dark
    hand-drawn skillet on cream — zero white.

**FIX 2 — layout variety.** NEW `relayout.ts` carries a 7-template registry (`text_left_visual_
right`, `visual_left_text_right`, `text_top_visual_bottom`, `visual_top_text_bottom`, `visual_
center_text_caption`, `text_full_emphasis`, `visual_full_bleed`), each defining text/visual
regions in section-local 1920×1080 coords + a text anchor + a `maxText` (so a minimal-text template
like visual_center_text_caption is never assigned to a text-heavy section). Seeded assignment
(`assignTemplates`): never repeats within the last 2, never two "full" beats back-to-back (~1 per
4–6), weights splits common / fulls occasional, biases by `section_type`, and gates by text count.
Placement (corrected after first-pass bug reports — see below): the VISUAL hero is placed rigidly
(translate + scale-to-fit) into the visual region; the TEXT prose is RE-FLOWED as a clean vertical
stack into the text region (`reflowText` — sorted by source y, font sizes never shrunk, only gaps
compress if it overflows); a body_text that sat under the source hero is detected as a CAPTION and
placed directly UNDER the visual's rendered bottom (`placeCaption`).

**FIX 3 — 2-D snake layout + camera/motion variety.** `relayoutBoard(spec)` (called LAST in
`generateBoardSpec`, after combo/font-floor) places sections on a boustrophedon grid: `cols=3`,
`gx = row%2===0 ? col : cols-1-col`, `x=gx*1920`, `y=row*1080`; rebases every element to the new
origin; sets `board.width/height` to the grid. Section order stays linear (narration order).
  - Renderer was ALREADY viewport-only (per-frame 1920×1080 canvas, everything mapped via
    `toScreen`; background/blueprint/dots loop the viewport region) — NO full-board bitmap is
    allocated. The bigger snake board only enlarges abstract coords. Confirmed, left intact.
  - `camera.ts` `buildCameraPath(sections, duration, cam, seed)`: now visits sections in ARRAY
    order (NOT sorted by x_offset — snake breaks x-monotonicity). `getCameraAtTime` already lerped
    2-D, so up/down moves work for free. Added: seeded `restFrame` (varied resting zoom + bounded
    lateral drift, with a guaranteed ≥0.8% zoom so even pushZoom=1 archetypes never freeze) used
    for the in-section dwell (easing `idle`); per-transition travel easing chosen from {cinematic,
    ease_in_out, ease_out, overshoot, drift} avoiding the previous direction+easing combo; occasional
    mid-move zoom-out (`travelFrame`) for "crossing the board" feel. New easings (`ease_out`,
    `overshoot`, `drift`, `idle`) added to renderer `schema.ts` `CameraEasing` + `ease()`.
    `index.ts` passes `spec.video_id` as the seed.
  - VERIFIED on both real specs: 5 sections → 3×2 grid (rows {0,1}, cols {0,1,2}); horizontal AND
    vertical moves present; 0 consecutive identical direction+easing; longest fully-static interval
    = 0.00s; relayout deterministic across two runs; ≥4 distinct layouts; 0 elements out of frame.

**FIX 2/3 follow-up — two layout bugs fixed (same session).** First-pass renders showed (BUG 1)
text clipped at the left edge on panned (non-first-column) sections, and (BUG 2) the caption drawn
over the middle of the asset. Root cause of BOTH was the original RIGID-CLUSTER translation: it
preserved the LLM's sprawled geometry and just shifted whole clusters, so a caption stayed in its
far relative position (landing on the centred visual) and edge text could fall outside a drifting
viewport. Fixes: (a) `relayout.ts` now RE-FLOWS text into a compact vertical stack and places the
caption under the visual's rendered bottom (`asset_bottom + 20px`); minimal-text templates are gated
by `maxText`. (b) `camera.ts` `restFrame` is now HORIZONTALLY CENTRED with zoom capped to a
content-safe band (z ≥ 0.94) — the content band nearly fills the frame, so any horizontal idle
drift could crop edge-anchored text; idle drift is now vertical-only + zoom-breathing (still never
frozen, resting zoom still varies per section). Re-verified via `test_dumplayout.ts`: every caption
sits below its visual, text stacks cleanly, 0 elements out of frame; camera test still 0 consecutive
direction+easing and 0.00s static; a tiny_kitchens render of a panned section (S1, x_off=1920)
shows full, unclipped right-column text and the caption cleanly under the left visual.

**Files changed:** pipeline — `types/channelSpec.ts`, `prompts/svgAssetSystemPrompt.ts`,
`assetGenerator.ts`, `orchestrator.ts`, `specGenerator.ts`, NEW `assetContrast.ts`, NEW
`relayout.ts`, NEW `test_renderfixes.ts` (local verification harness). renderer — `schema.ts`,
`camera.ts`, `index.ts`, NEW `test_camerapath.ts`. Prompts/validation/schema CONTRACT untouched
(relayout runs post-validation; renderer overwrites spec camera_keyframes as before).

**NOT done / notes:** the optional "thin ink outline on filled shapes" enhancement from the FIX-1
brief was skipped (regex shape-injection is fragile; the color remap is the essential, safe part).
Full end-to-end pipeline runs (Opus spec-gen + audio) were NOT re-run this session — verification
used the existing cached board specs + audio (renders are API-free); a fresh `npm run process` will
exercise relayout + contrast + cache-bust on the real path. `cols=3` is fixed (could be seeded per
job later). The contrast guard mutated the 12 cached tiny_kitchens SVGs in place (idempotent).

## Rules for Claude Code / Antigravity Agents

1. Read this entire file before writing any code.
2. Build one phase per session. Do not start Phase N+1 in the same session as Phase N.
3. Do not change the board spec schema without updating both renderer and spec generator, and logging here.
4. DO NOT REGENERATE EXISTING SYSTEMS UNLESS THERE IS A SPECIFIC BUG.
5. At session end: mark completed phases ✅, update Current Sprint, log decisions, update "Last updated."

---

## Current Sprint

Just shipped (2026-06-13 session 8): **Go live** (see the session-8 block at the top). All operator
keys wired in `.env`; YouTube OAuth done; FIRST REAL UPLOAD succeeded (private, API-confirmed):
youtube.com/watch?v=6nzVEgJiqAE. Outlier research fixed + live (92 vids/46 outliers). Text-overlap
render bug root-caused + fixed (region-aware body wrap via `wrap_chars`; elBox line-count/line-height
now mirror the renderer) and verified on a re-rendered feeltest_s7 (now the REAL Fish voice). Posting
schedule set: 2 PM weekdays / 10 AM weekends ET (cadenceRules). New tests: test:overlap, test:schedule.

ALSO shipped s8 (operator-reported on the uploaded video — "text half off the bottom" + "feels too
inactive, 13s on the bottle with no camera movement"): **(A) camera-safe content area** — relayout's
`fitSectionToSafeArea` now contains every section's content within ~1520×825 centred (both axes),
scaling oversized heroes down + re-seating captions, so nothing sits at the frame edge (root cause:
content boxes were up to 2400px in a 1920 frame, spilling off; the conclusion caption sat at y=1030).
**(B) active content-framed camera** (renderer/src/camera.ts rewrite) — frames each section on its
CONTENT box (not the whole section) and, on a hold, TOURS the content: a move ~every 6.5s through a
pool of distinct "looks" (each major element framed with context + whole-content angles), each
guaranteed distinct, clamped to contain its focus AND stay inside the section (no clip, no neighbour
bleed). The old camera did a ~5% centred push (imperceptible, and content filling the frame left no
room to move) → now sections push/pan 7–35% and the longest static stretch dropped 36s→≤8s. The two
fixes are synergistic: contained content gives the camera room. Verified by frame inspection (hook
3s/8s/12s = 3 framings; the 36s diagram beat tours headline→list→visual; conclusion no longer cut)
and `npm run test:camera` (renderer). Iterated via direct renderer call (`ts-node src/index.ts <spec>
<out>`) — NO Whisper/Opus re-run needed since only camera/relayout changed.

ALSO shipped s8 round 2 (operator follow-up — "pushes in/out 5× with no other change", "push-ins
clip assets past the borders", "last quarter just reviewed everything", "repeats similar info"):
**(C) camera rewrite — directed visual tour, not zoom-oscillation.** holdKeyframes now PUSHES TO THE
VISUAL (a tight, clip-safe close-up on each asset) and PULLS BACK TO THE WHOLE, alternating for long
beats — directed lateral movement, never in/out on one spot. Clip-safety guarantees no asset is ever
half-cut (`clipSafeFrame` grows to contain any intersecting asset; `excludeSideText` shrinks/positions
the close-up so long text lines' tips don't hang at the border; titles shown whole in the wide frame,
not bisected). Wide-text sections with no separable visual do ONE gentle push (no fake oscillation).
Verified: pushes are directed to the hero, assets fully framed, headline no longer half-cut.
**(D) script anti-recap / anti-repetition.** scriptPrompt.ts gained a hard "NO REPETITION, NO RECAP"
rule (every beat new info; no summary section; the last quarter is the PEAK not a review; word count
is a CEILING — finish at ~80% rather than pad). The critic check #6 now cuts a repeated/recap last
quarter aggressively; the critic length floor relaxed 0.6→0.5 so a 40–50% trim of a padded draft is
accepted. Verified live on a fresh 4-min script ("dollar stores"): 569/600 words, zero recap, each
beat escalates, ends on a bridge question. NOTE: feeltest_s7's video.mp4 has the new camera but its
SCRIPT predates (D) — (D) applies to newly generated scripts. video.mp4 updated in place
(NOT re-uploaded yet — operator to confirm). New UI fix too: createJob now slugifies the job name
(spaces→hyphens) + checks the server response, fixing the "bad ids" loop from typing a job name with
a space; UI rebuilt.
**(E) music "2-3 overlapping tracks / overwhelming" fix.** ROOT CAUSE: `buildMoodTimeline` (music.ts)
sorted sections by `x_offset`, but the s3 snake-grid relayout made x_offset non-monotonic with time
→ mood segments got scrambled, overlapping time ranges (e.g. "uplifting" scheduled [13→78s] while
"tense"/"neutral" played underneath) → 2-3 beds stacked at once. FIX: order the mood timeline by
NARRATION ENTER TIME (first reveal), not x_offset, so segments are sequential + non-overlapping
(only the intended 2s mood crossfades overlap). Also softened: default music volume 0.18→0.13 and
stronger sidechain duck (threshold 0.04→0.025, ratio 8→12) so narration always sits on top. Since
music is audio-only, regenerated clean_audio_music.wav and RE-MUXED onto video.mp4 (`-c:v copy`) —
no re-render. Verified: mood timeline now sequential; final mix max_volume -1.8 dB (no clipping),
mean -23 dB (speech-forward). Re-uploaded private: youtube.com/watch?v=nnCW4RGgBGg.

ALSO shipped s8 round 3 (operator follow-up — "push-ins go way too far after the title of every
screen, then stuff animates in OFF camera, and it feels repetitive doing it every time"): **(F) the
camera is now REVEAL-DRIVEN, not schedule-driven** (renderer/src/camera.ts — `revealMoments` replaces
the old `holdKeyframes`/`sectionFrames`/visual-push). ROOT CAUSE: the camera moved on a fixed
schedule (push to the visual every N s) INDEPENDENT of reveal times, so it pushed in tight while text
animated in elsewhere off-frame, and every section ran the same push → repetitive. NOW: per section,
elements are clustered by reveal TIME into "moments"; the camera frames each cluster (+ the previous
one for continuity), clip-safe, at MODERATE zoom (`MOMENT_COVERAGE` 0.82, ≤~1.6×) and ARRIVES just
before that cluster animates in — so content is NEVER revealed off-camera, there's no hard push past
the title, and the motion SHAPE follows each section's own reveal structure (varied, not a repeated
pattern). Long no-reveal gaps get a gentle `driftFrames` breath (alternating tight/wide coverage so
even a near-full-width text section isn't frozen); text-dense sections may sit calm while the viewer
reads (intended). A final pass guarantees no two consecutive MOVES share direction+easing. Bug found
+ fixed mid-iteration: the depart-hold keyframe was dropped, making the camera leave a section into
empty board space the instant the last element revealed (empty frames) — restored. `npm run
test:camera` updated (motion = zoom≥7% OR pan≥250px per section; median zoom ≥12%; no static >14s).
Verified by frame inspection at reveal times (hook tag, diagram shelf, conclusion all on-camera, no
clipping, moderate framing). Re-uploaded private (camera + audio): see latest publish URL.

OPEN ITEMS for next session (small):
- **Custom thumbnails need account verification** — uploads 403 on thumbnails.set until the operator
  verifies the YouTube account (youtube.com/verify, phone). Video upload itself is unaffected; once
  verified, thumbnails attach automatically (publishJob already tries + warns). No code change needed.
- **autoPublish is OFF** in schedule.json — flip to `true` to let `autorun` schedule videos live at
  the next cadence slot; until then uploads are private/manual (deliberate, for first-run review).
- **Whisper re-runs on every `process`** — re-rendering a job to apply a spec/relayout fix re-runs
  the full audio pipeline (slow CPU FP32 transcribe). WORKAROUND for RENDERER-ONLY changes (camera,
  element draw, etc.): call the renderer directly on the existing spec —
  `cd renderer && npx ts-node --transpile-only src/index.ts ../output/<ch>/<job>/board_spec.json
  ../output/<ch>/<job>/video.mp4` — ~80s, no Whisper/Opus, no API cost (audio_file is resolved
  relative to the spec dir). A proper "re-spec+render from existing timestamps" CLI is still nice-to-have.
- Still untested live: `analytics:pull`/`analyze` (needs ≥1 video with watch data — now possible
  since a real video exists), and a full `npm run autorun` end-to-end.

Just shipped (2026-06-13 session 7): **Production OS — speed + video-feel + variety** (see that
section + GROWTH_ENGINE.md §4b). Streaming render (raw RGBA → per-chunk ffmpeg, no PNG/disk;
~8× on the fixture, ~13× on real content); voice-synced type_on + bold colored word reveals +
scale overshoot + a punch-beat; seeded narrative arcs + seeded reveal variety so no two videos
share structure/rhythm; UI thumbnail preview/regenerate + packaging card. Full pipeline
(packaging→arc→script→critic→spec→video-feel→streaming render→thumbnail) live-verified on a
hotel-minibar video. Reference render: `how_industries_work/feeltest_s7`.

Also shipped in s7 (bonus, beyond the 3 core asks): fact-check pass (Haiku hedges low-confidence
figures + factcheck.json paper trail), thumbnail A/B variants (3 layouts + UI gallery + set-
primary), outlier research module (data-driven topics via YOUTUBE_API_KEY, no-op without it,
unit-tested), count_up number reveal ($3,000 rolls from 0), and the learning loop closed on
narrative arc (analysis correlates arc→retention). All 3 render branches (multi/single-worker,
draft) verified. New offline tests: `npm run test:outliers`, renderer `npm run test:countup`.

Prior (2026-06-12 session 6): **Growth Engine — packaging-first + retention architecture** (see
that section). Scored packages (title/thumbnail/hook contract) BEFORE scripts, retention-
architected scripts with a critic pass, auto-generated channel-styled thumbnails, real
descriptions with chapters, retention drops attributed to the exact beat on screen, 8-min default.

Next session (remaining roadmap; the top items now need credentials this env lacks):
1. **Live-verify the credential-gated paths**: set `YOUTUBE_API_KEY` → `npm run research <ch>`
   (outlier demand), and `GOOGLE_CLIENT_ID/SECRET` → `npm run youtube:auth` → publish →
   analytics:pull → analyze (the real feedback loop) → a full `npm run autorun`.
2. **Per-beat voice prosody** (needs FISH_API_KEY to verify quality): vary speed/expressiveness by
   beat (energetic hook, deliberate revelation) so TTS isn't monotone. Skipped in s7 — boundary-
   artifact risk + unverifiable without the key; operator VO supersedes for flagship channels.
3. **Series engineering** + playlists (needs OAuth): recurring formats so bridge-endings have a
   natural next video; auto-log the winning thumbnail variant + arc to learnings once data exists.
4. **Visual pacing audit** — count visual events per 10s window of a spec (largely mitigated by
   type_on/count_up/voice-paced reveals keeping text in motion; a diagnostic guardrail is optional).
Also still pending from s2: real-credential verification (`npm run youtube:auth` → publish →
analytics:pull on live data) and a full `autorun` end-to-end with the new packaging stages.

Prior sprint (2026-06-12 session 3): **Render Variety + Contrast Fixes** (see that section above) —
asset contrast guard (light-bg channels no longer render white/invisible assets; palette-hash cache
bust), a 7-template layout registry with seeded per-section assignment, and a 2-D boustrophedon
(snake) board + camera with up/down+left/right moves, varied easing, idle drift and resting-zoom
variety. All deterministic per video_id; tsc clean; blueprint_board regression-safe. New modules:
`pipeline/src/{assetContrast,relayout}.ts`. To exercise on the real path: `npm run process <ch>
<job>` (relayout + contrast + cache-bust all run inside generate-spec / ensure-assets).

Prior sprint (2026-06-12 session 2): **Auto-publish + Analytics Feedback Loop** (see that section
above). YouTube upload (OAuth, scheduled/private, quota-aware), analytics pull + Opus-analyze →
per-channel `learnings.json` (sample-gated rules), closed-loop script conditioning, `npm run
autorun <ch>` passive loop, `.env` config loader. Fish S1 LIVE-VERIFIED. New CLI: `youtube:auth`,
`publish`, `analytics:pull`, `analytics:analyze`, `autorun`. New modules: `pipeline/src/{publish,
analytics,autopilot,config}/`. UI gained publish + learnings controls. All tsc/vite clean.

Next session / to verify with real Google credentials (GOOGLE_CLIENT_ID/SECRET still blank in
`.env`): `npm run youtube:auth <ch>` once per channel, then `npm run publish <ch> <job>` (live),
`npm run analytics:pull <ch>`, `npm run analytics:analyze <ch>`, and a full `npm run autorun <ch>`
(not run live this session — ~24-min render + multiple Opus calls; stages verified individually).

Prior sprint (2026-06-12 session 1): Channel Format System + Channel Generator + Fish S1 voice.

Open follow-ups / next session:
- Fish S1 was NOT live-tested (no FISH_API_KEY in this env → SAPI fallback used, as designed). To
  verify the real Fish path: `setx FISH_API_KEY "fa-..."`, set a channel's audioIdentity.voice to
  a Fish reference id, then `npm run voiceover <ch> <job> fish`.
- Only the 4 base archetypes' fonts are cached locally; a brand-new channel downloads its Google
  Fonts on first render (non-fatal if one fails — falls back to a default face).
- Prior (2026-06-11) work below: PARTS A–E (Phase 0, generic rules, audio engine, full UI, e2e).
  E2E job `how_industries_work/e2e_001` re-rendered this session as the regression test.

Open follow-ups:
- The operator's REAL run is the remaining manual step: in the UI, Generate Script → choose audio
  options → drop their own recorded `.mp4` → Run → download link.
- Optional: populate `assets/sfx/impact/` and `ui/` with real sounds (engine supports them, drop-in).
- Phase 4 (broader content pipeline) still not started; Phase 0 covers script writing.

## Phase 2.5 Notes
- `assetGenerator.ts` — `ensureAssets(channelId, assetNeeds[])`: skips existing, generates missing via claude-sonnet-4-6, validates XML + shape presence, retries once, logs reused/generated/failed
- SVG system prompt: outline-first path ordering so clip-reveal looks like a sketch draw-on
- All generated SVGs are permanently cached in `/channels/{id}/assets/svg/`
- Test: `cd pipeline && ANTHROPIC_API_KEY=... npm run test:phase25`
