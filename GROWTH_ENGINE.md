# GROWTH ENGINE — How This Pipeline Wins on YouTube
> The strategy layer for the YouTube Automation Project. CLAUDE.md describes HOW the machine
> works; this file describes WHY videos get views and what the machine must do about it.
> Written 2026-06-12 (session 6) after in-depth research into how the 2025–26 algorithm,
> retention science, and packaging actually work. Update this file when strategy-level
> assumptions change.

---

## 1. How YouTube actually decides who gets views (research summary)

The algorithm is not a mystery; it is a two-gate funnel measured per video:

```
IMPRESSION → (Gate 1: CTR — does the packaging earn a click?)
          → (Gate 2: retention/AVD — does the video keep the promise?)
          → satisfaction + session time → MORE IMPRESSIONS (compounding loop)
```

Key facts the pipeline is now built around:

- **The first 24–48h is a test.** New uploads are shown to subscribers + a small lookalike
  audience. Strong CTR + retention + satisfaction in that window → reach expands over the
  next 7–14 days. Weak early signals → the video is buried, often permanently.
- **Benchmarks:** CTR 5–10% baseline (>10% = strong topic–audience fit). Average view
  percentage 40–55% is healthy for long-form; >60% is excellent. The steepest drop-off on
  almost every video happens in the **first 15–30 seconds**.
- **Watch time is the primary currency** — total minutes, not views. A 12-min video at 60%
  retention beats a 30-min video people abandon at 5 min. **Session time** matters too:
  videos that lead viewers to *another* video (yours or not) get boosted; dead-end outros
  are punished.
- **Open loops measurably work:** videos that plant unresolved questions see on the order of
  **+32% watch time**. A hook must do three jobs in the first 15s: (1) signal "this is for
  you" (relevance), (2) open a curiosity gap, (3) state the concrete value contract.
- **Packaging-first is how top channels operate** (Paddy Galloway / MrBeast school): the
  title + thumbnail + hook are designed BEFORE the content, and the content is built to pay
  them off. Top creators spend ~30% of effort on ideation/packaging; small creators spend
  ~5% — that gap, not production value, is most of the outcome gap. A title/thumbnail swap
  alone has turned 500K-view videos into 12M-view videos. Titles: under ~50–60 chars,
  concrete, emotionally loaded, no vagueness.
- **Length:** 8–15 minutes is the long-form sweet spot — ≥8 min unlocks mid-roll ads
  (roughly 2–3× RPM vs a single pre-roll) and gives the algorithm enough watch-time per
  view to rank you. **Our previous 2-minute default was leaving most of the money and all
  of the ranking power on the table.**
- **Retention editing:** a visual change every 10–20s in the first minute, every 25–40s
  after; a *scripted* pattern interrupt (new stat, direct question, stakes shift, tone
  shift) every 30–45s; re-hooks placed just before known drop-off zones.
- **Topic selection is the single biggest lever.** "Outlier" research — finding videos that
  massively overperform their channel's baseline, especially on small channels, and
  clustering the patterns — is the highest-signal idea source. A proven-demand topic with
  mediocre execution beats a beautiful video nobody wanted.

### ⚠️ The existential constraint: YouTube's "inauthentic content" policy (July 15, 2025)

YouTube renamed "repetitious content" to **"inauthentic content"** and is enforcing it at
scale against mass-produced AI channels. Channels with 500K+ subs and $30K/mo have been
fully demonetized; thousands of faceless AI channels lost YPP. What gets hit: template
clones, AI narration with no original insight, slideshow content, identical structure
video after video. What survives: **original analysis, real research, distinct visual
identity, human perspective, structural variety.**

This project's posture against that risk (already partially built, now explicit policy):
1. **The custom renderer is a moat** — every frame is original synthetic art in a
   channel-specific visual language, not stock footage or slideshows. Keep investing here.
2. **Scripts must contain original synthesis** — specific numbers, named entities,
   non-obvious connections, an actual thesis. The script prompt now enforces this.
3. **Structural variety is mandatory** — layout registry, camera variety, per-channel
   archetypes, varied episode structures. Never let two videos feel templated.
4. **The operator's real voiceover is the strongest protection.** TTS is fine for testing
   and acceptable for production with high-quality prosody, but the original plan (operator
   records ~34 min/day) is also a policy shield — keep it in the loop for flagship channels.
5. Disclose synthetic media where required; never present AI-generated stories as fact.

---

## 2. Gap analysis — current system vs top-1% (what session 6 found)

| # | Gap | Severity | Status |
|---|-----|----------|--------|
| 1 | **No thumbnail at all** — publish attached one only if hand-made; nothing generated it. Gate 1 (CTR) was unmanned. | CRITICAL | ✅ Fixed s6 (thumbnail generator) |
| 2 | **Title = raw topic string; description = first script beat.** No packaging design, no keyword thinking, no chapters. | CRITICAL | ✅ Fixed s6 (packaging engine + metadata) |
| 3 | **2-minute default video length** — no mid-rolls, negligible watch time per view. | CRITICAL | ✅ Fixed s6 (default 8 min) |
| 4 | **Script prompt had no retention architecture** — generic hook/beats/revelation; no open loops, no re-hooks, no payoff scheduling, no packaging contract. | CRITICAL | ✅ Fixed s6 (rewritten + critic pass) |
| 5 | **Topic picker asked Opus for "an interesting topic"** with zero demand signal. | HIGH | ◐ Partial s6 (packaging engine scores ideas on demand proxies; true outlier research is next) |
| 6 | **Analytics loop couldn't see WHERE viewers left** — retention curve was channel-level %, never mapped to the actual script beat on screen. | HIGH | ✅ Fixed s6 (retention→beat attribution) |
| 7 | **No session-time strategy** — scripts ended with a clean close (dead end). No end-screen bridge, no series logic. | HIGH | ◐ Partial s6 (scripted bridge ending; series/playlists are an operator task) |
| 8 | **Policy exposure** (see above) — full-auto TTS pipeline trending toward exactly what YouTube demonetizes. | HIGH | ◐ Mitigated s6 (originality requirements in prompts; visual moat; operator VO recommended) |
| 9 | Visual change rate not measured against the 10–20s rule; voice prosody defaults untuned; no fact-check pass. | MEDIUM | Backlog (see roadmap) |

**Verdict on the whiteboard/board format itself:** KEEP IT. Margins are exceptional
(~$0.50–2 of API cost per video), the per-channel format system means it doesn't look like
the generic "AI whiteboard" genre, and original rendered visuals are policy-safe in a way
stock-footage automation never will be. The format's ceiling is a *pacing* ceiling, and
that's addressable in the spec/camera layer (roadmap), not a reason to scrap the renderer.

---

## 3. The new content OS (what ships in session 6)

The pipeline now runs **packaging-first**, the way top channels do:

```
1. PACKAGING  (autopilot/packaging.ts — Opus designs N candidate packages:
               title ≤60 chars + thumbnail concept + hook promise + open loops
               + payoff map, each scored on curiosity/demand/fit; best one wins)
        ↓     meta.json gets the full winning package
2. SCRIPT     (scriptGenerator — the script is written TO PAY OFF the package:
               hook = the title's promise restated harder in 15s, open loops planted,
               re-hook every ~45s, payoffs scheduled, bridge ending. Then a CRITIC
               pass grades hook/loops/payoff-alignment/filler and rewrites once.)
        ↓
3. VOICEOVER  (Fish S1 / operator recording — unchanged)
        ↓
4. VIDEO      (spec → assets → render — unchanged this session)
        ↓
5. THUMBNAIL  (renderer/thumbnailCli.ts — 1280×720 in the channel's visual language:
               ≤4-word big text ≠ title text, hero SVG asset, accent color, glow)
        ↓
6. PUBLISH    (metadata.ts — real description: hook line + chapters derived from the
               actual board sections/timestamps + keywords + attribution + soft CTA)
        ↓
7. LEARN      (analytics pull → retention curve mapped to the EXACT beat/section
               on screen at each dip → Opus analysis → gated rules → next script)
```

Every stage is still per-channel generic (no topic/niche hardcoding) and the whole loop
still runs with `npm run autorun <channel>`.

---

## 4. Benchmarks the loop optimizes toward

| Metric | Floor | Target | Where it's controlled |
|--------|-------|--------|----------------------|
| CTR (first 48h) | 4% | >8% | packaging engine, thumbnail |
| 30-second retention | 60% | >75% | hook section of script prompt |
| Average view percentage | 40% | >55% | open loops, re-hooks, critic pass |
| Video length | 8 min | 10–14 min | format.minutes per channel |
| End-screen click-through | — | >2% | scripted bridge ending |
| Upload cadence | 2/wk | 3–5/wk per channel | queue + scheduler (s5) |

The analytics loop should *demote* any rule that stops correlating with these numbers —
that machinery (sample-gated learnings) already exists and now receives beat-level evidence.

---

## 4b. Production OS (what ships in session 7) — speed + "feels like a video"

Three problems were attacked: render cost (an 8-min video on the old PNG-per-frame path meant
tens of GB of temp PNGs + huge encode CPU), the "slideshow" feel, and pattern fatigue.

- **Streaming render (no PNG, no disk).** Each worker now pipes raw RGBA frames straight into
  its own ffmpeg `libx264` process (one chunk per worker), then the chunks are concatenated
  (stream-copy, no re-encode) and audio is muxed in one pass. The 20s fixture went **118s →
  ~15s wall (~8×)**; long videos benefit even more because PNG encode + disk I/O was the whole
  bottleneck. A worker-count heuristic stops over-parallelizing short clips. Visual output is
  unchanged (same pixels; PNG was only ever a lossless intermediate). `renderer/src/encoder.ts`,
  rewritten `index.ts`/`renderWorker.ts`/`renderSetup.ts`/`ffmpeg.ts`.
- **Video-feel pack (makes it read as a video, not a board).** (1) **Voice-synced type-on** —
  headlines/eyebrows/body can type in left-to-right over a span matched to the narration pace
  (`reveal_duration_seconds`), with a smooth leading-char fade. (2) **Bold colored word reveals**
  — `emphasis_words` render in the channel accent (the reference channel's signature look). (3)
  Subtle **overshoot** on `scale_in` so reveals land instead of fade. (4) A prompt-level **"punch
  beat"**: one full-frame typed title-card section per video that breaks the left-text/right-
  visual rhythm. All driven by a deterministic `videoFeel.ts` pass so the model can't forget them.
- **Anti-pattern variety (so it's never the same video twice).** Every reveal-level choice is
  **seeded per `video_id`** — which beats type vs fade, the resting camera zoom, the layout
  template (s3), and now a **seeded narrative arc** (`scriptArcs.ts`: mechanism-reveal, myth-bust,
  follow-the-money, peel-the-layers, expectation-gap, origin-to-now) that reshapes the script body
  and rotates per channel so consecutive uploads never share a structure. Verified: three video_ids
  type three different sets of beats; the same topic on different slots draws different arcs.

## 5. Roadmap (highest leverage first)

1. ~~**Outlier research module**~~ ✅ DONE (s7): `pipeline/src/research/outliers.ts` searches the
   niche (YouTube Data API, simple `YOUTUBE_API_KEY` — no OAuth), scores videos by how far they
   beat their OWN channel's subscriber baseline (a 4k-sub channel at 400k views = a clean signal),
   clusters the winning title/format patterns, and feeds a PROVEN DEMAND block into `designPackages`.
   No-ops without the key (topics stay taste-based). Scoring + clustering unit-tested offline
   (`npm run test:outliers`); preview with `npm run research <channel>`. STILL TODO: the live API
   path is unverified here (no key in this env) — add `YOUTUBE_API_KEY` and run `npm run research`
   to confirm. This converts topic selection from taste to data — the single biggest lever.
2. ~~**Visual pacing audit**~~ ✅ DONE (s7, diagnostic): `pipeline/src/pacingAudit.ts` measures the
   longest "no new reveal" window per spec and logs a `⚠ DEAD WINDOW` warning in spec-gen when a
   spec front-loads its reveals (threshold 14s). Diagnostic only — it never mutates the spec
   (that would desync reveals from the voice). Unit-tested (`npm run test:pacing`). Future: feed
   the warning back into the spec prompt as a regeneration hint, or auto-redistribute trailing
   reveals. (type_on/count_up/voice-paced durations already keep content in motion longer.)
3. ~~**Packaging A/B**~~ ✅ DONE (s7): the thumbnail generator now renders 3 distinct layouts per
   video (hero-right / hero-left / text-only) as thumbnail.png + _v2 + _v3; the UI shows a gallery
   and "use as primary" promotes one to the upload thumbnail for Studio Test & Compare. Still TODO:
   auto-log the winning variant back into learnings once retention/CTR data exists.
4. ~~**Fact-check pass**~~ ✅ DONE (s7): a Haiku audit (`pipeline/src/factCheck.ts`) runs after the
   critic, rates every checkable claim high/medium/low, hedges ONLY the low-confidence over-precise
   ones (verified: "forty rooms an hour" → "dozens", "most hotels lose money" → "many struggle to
   break even"; strong claims untouched), and saves `factcheck.json` as a due-diligence paper
   trail. `FACT_CHECK=off` disables.
5. **Voice direction**: per-beat prosody (speed/temperature shifts on hook vs revelation) through
   the existing Fish params; an excited hook reads differently than a reflective close.
6. **Series engineering**: recurring formats inside a channel so bridge-endings have a natural next
   video; playlists per series for session time.
7. **Multi-channel scaling rules**: a new channel only launches when its niche passes a demand
   check and its RPM profile is known; kill-or-double after 20 videos based on the loop's numbers.

---

## 6. Sources (research, session 6)

- [vidIQ — How the YouTube Algorithm Works in 2026](https://vidiq.com/blog/post/understanding-youtube-algorithm/)
- [Hootsuite — How the YouTube algorithm works in 2025](https://blog.hootsuite.com/youtube-algorithm/)
- [ScriptStorm — YouTube algorithm 2025 ranking factors](https://scriptstorm.ai/blog/youtube-algorithm-2025-ranking-playbook)
- [OutlierKit — YouTube Algorithm Updates: every confirmed change](https://outlierkit.com/resources/youtube-algorithm-updates/)
- [TubeAnalytics — What makes a hook in the first 30 seconds](https://www.tubeanalytics.net/blog/youtube-video-hook-first-30-seconds)
- [Overseer — The YouTube Hook Framework / Retention Loops](https://www.overseeros.com/blog/youtube-hook-framework-7-openings-that-keep-viewers-watching)
- [Retention Rabbit — 10 proven hook strategies](https://www.retentionrabbit.com/blog/youtube-hook-strategy-to-keep-viewers-watching)
- [Colin & Samir — The New Rules of YouTube from Paddy Galloway](https://www.colinandsamir.com/resources/the-new-rules-of-youtube-from-paddy-galloway)
- [Creator Science podcast — Paddy Galloway interviews](https://podcast.creatorscience.com/paddy-galloway/)
- [AIR Media-Tech — Best length for a YouTube video / retention editing past minute 8](https://air.io/en/youtube-hacks/what-is-the-best-length-for-a-youtube-video)
- [StudioBinder — YouTube monetization requirements 2026](https://www.studiobinder.com/blog/youtube-monetization-requirements/)
- [vidIQ — Can you monetize AI-generated videos in 2026?](https://vidiq.com/blog/post/youtube-ai-monetization/)
- [SEO Sherpa — YouTube's monetization crackdown](https://seosherpa.com/youtube-changes-monetization-policy/)
- [MilX — Why YouTube suspended thousands of AI channels](https://milx.app/en/news/why-youtube-just-suspended-thousands-of-ai-channels-and-how-to-protect-yours)
- [Overseer — YouTube outlier analysis](https://www.overseeros.com/blog/youtube-outlier-analysis)
- [OpusClip — Retention graphs explained](https://www.opus.pro/blog/youtube-retention-graphs-explained)
