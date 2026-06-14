# YouTube Automation Pipeline

Automated YouTube video production. Drop a voiceover and script, get back a ready-to-upload video.

---

## Prerequisites

### Node.js tools (install once)

```bash
# Node.js 20+ required
node --version

# FFmpeg (for video assembly)
winget install ffmpeg          # Windows
brew install ffmpeg            # Mac
```

### Python tools (install once)

```bash
# Python 3.10+ required
python --version

# DeepFilterNet — audio denoising
pip install deepfilternet

# Whisper — word-level transcription
pip install openai-whisper

# auto-editor — silence removal
pip install auto-editor
```

### Environment variables (`.env`)

Copy [`.env.example`](.env.example) → `.env` (project root) and fill in your keys. `.env` is
**gitignored** and loaded automatically at startup (a tiny built-in loader — no `dotenv` package).
Real shell env vars still take precedence over `.env`.

```ini
ANTHROPIC_API_KEY=sk-ant-...        # required: script/spec/channel/analysis generation
FISH_API_KEY=fa-...                 # default TTS (Fish Audio S1); blank → Windows SAPI fallback
GOOGLE_CLIENT_ID=...                # YouTube OAuth (publishing + analytics)
GOOGLE_CLIENT_SECRET=...
# Optional: TTS_BACKEND=fish | sapi   ·   OAUTH_REDIRECT_PORT=4180   ·   YT_DAILY_QUOTA=10000
```

---

## How to drop a job

Create a folder under `jobs/` with your channel ID and a job ID of your choice:

```
jobs/
  how_industries_work/
    my_video_001/
      voiceover.wav     ← your raw recording
      script.txt        ← the script you read (plain text)
```

Both files must be present before the watcher will pick it up.

---

## Channels & formats (per-channel house style)

Each channel has a **ChannelSpec** (`channels/<id>/channel.spec.json`) that drives its whole
look + voice: palette, typography, asset style, camera/motion feel, background, audio identity,
script voice, and format. The renderer, spec generator, and SVG generator all consume these
tokens, so two channels look **genuinely different**, not reskinned.

Four **archetypes** ship (the generator picks/blends one and customizes it):

| Archetype | Look |
|-----------|------|
| `blueprint_board` | dark near-black board, neon accents, condensed UPPERCASE type, wireframe assets, faint grid, slow cinematic push (the original How Industries Work look) |
| `flat_motion_explainer` | bright flat-fill color blocks, bold heavy sans, no grain, minimal snappy camera |
| `documentary_slate` | muted cinematic gradient, elegant serif, line-illustration assets, slow deliberate moves |
| `notebook_sketch` | warm paper + dotted grid, hand-drawn assets, handwritten type, gentle bouncy motion |

### Create a channel

```bash
cd pipeline
npm run channel:new "<title>" "<description>" [niche] [audience] [tone]
# e.g.
npm run channel:new "Tiny Kitchens" "Cozy hand-illustrated explainers about home cooking"
```

The Channel Generator (claude-opus-4-8) designs a complete, validated ChannelSpec — choosing a
fitting archetype and customizing every token — and saves it to `channels/<id>/`. You can also
do this in the Web UI via **+ New Channel** (with an editable preview before saving). Generic
across any niche. Existing channels without a `channel.spec.json` keep working (they synthesize
a `blueprint_board` spec from their legacy `config.json`).

---

## Voiceover (TTS — Phase 0.5)

Generate the narration audio from the script with the swappable TTS adapter. The **default
backend is Fish Audio S1** (hosted API); set `FISH_API_KEY` to use it. If the key is missing it
**falls back to a Windows SAPI stand-in** with a clear message (so it always works locally).

```bash
# uses the channel's audioIdentity.voice as the S1 voice
setx FISH_API_KEY "fa-..."     # Windows (persists) — or set for the session
cd pipeline
npm run voiceover <channel> <job> [fish|sapi] [voiceId]
```

Also available in the Web UI as **🔊 Generate voiceover**. The voiceover is written as the job's
`voiceover.wav`, ready for `npm run process`.

---

## Generate a script (Phase 0 — optional)

Don't have a script yet? Generate one in the channel's voice from just a topic and a target
length in minutes. The script is saved to the job's `script.txt`, ready for you to read while
recording.

```bash
cd pipeline
npm run script how_industries_work my_video_001 2 "How vending machines really make money"
#                <channel>          <job>          <minutes> "<topic/title>"
```

Target length ≈ `minutes × 150 words` (the words-per-minute constant is tunable in
`scriptGenerator.ts`). The **final video length is set by your actual recording**, not this
number — the minutes selector only controls how much script to generate. Also available as the
first step in the Web UI (Option C). Generic across any topic/channel.

---

## How to run

### Option A — Auto-watch (recommended)

```bash
cd pipeline
npm run watch
```

The watcher monitors `jobs/` continuously. When both `voiceover.wav` and `script.txt` appear in a job folder, it runs the full pipeline automatically.

### Option B — Manual trigger

```bash
cd pipeline
npm run process how_industries_work my_video_001
```

### Check status of all jobs

```bash
cd pipeline
npm run status
```

Status values: `queued → processing_audio → generating_spec → generating_assets → rendering → ready_for_review → approved → uploaded`

### Option C — Web UI (browser)

A local web app that drives the full pipeline end-to-end from the browser:

0. **+ New Channel** → describe a channel → the generator proposes a ChannelSpec → tweak the
   editable preview (archetype, palette, fonts, voice, length) → **Save & create**.
1. Pick a channel (its style chip shows in the header) + create a job.
2. Enter a topic/title and target length in **minutes** → **Generate Script** (Phase 0); the
   script displays so you can read it while recording.
3. Choose **audio options** — a background-music bed (Auto mood-shifting / None / a specific
   track) and SFX on-off + intensity.
4. Provide the voiceover: **🔊 Generate voiceover** (TTS — Fish S1, or SAPI stand-in), or upload
   your recorded **`.mp4`** / `.wav` (the server extracts the audio with FFmpeg).
5. **Run pipeline** → live per-phase status (audio → spec → assets → render) + streaming logs.
6. On completion: an inline video player plus a download link.
7. Browse the channel's SVG asset library (thumbnails) on the right.

**One command to launch** (builds the UI, then runs backend + UI on a single server):

```bash
cd pipeline
npm run ui     # then open the single URL it prints: http://localhost:5050
```

First time only, install the UI deps: `cd ui && npm install`.

- The server is a thin Express wrapper that runs the **same** orchestrator the CLI uses and
  streams its logs to the browser over SSE — no pipeline logic is duplicated.
- `ANTHROPIC_API_KEY` must be set in the shell you launch it from (same as the CLI).
  `FISH_API_KEY` is optional (enables Fish S1 voiceover; otherwise the SAPI stand-in is used).
- Optional hot-reload dev mode (React on :5173 proxying the API on :5050):
  `cd pipeline && npm run ui:server` in one terminal, `cd ui && npm run dev` in another. For
  normal use you do **not** need this — `npm run ui` serves everything on the one URL above.

Architecture: `ui/` is a Vite + React + Tailwind app; `pipeline/src/server.ts` is the API
server (it serves the built `ui/dist` in production).

---

## How to review and approve

When a job reaches `ready_for_review`, the output video is at:

```
output/how_industries_work/my_video_001/video.mp4
```

Watch it. If it looks good:

```bash
cd pipeline
npm run approve how_industries_work my_video_001
```

This marks the job `approved` (a local state mark). Actual uploading is done by the **publish**
module below (`npm run publish`), which replaces the old upload stub.

---

## Publishing to YouTube (Part 1)

Real uploads via the **YouTube Data API v3** (OAuth2, per-channel refresh tokens). Implemented
over `fetch` — no `googleapis` dependency.

### One-time setup per channel

1. In [Google Cloud Console](https://console.cloud.google.com/): create an **OAuth 2.0 Client ID**
   (type *Desktop app*), and **enable** the *YouTube Data API v3* + *YouTube Analytics API*. Add
   `http://localhost:4180/oauth2callback` as an authorized redirect URI. Put the client id/secret
   in `.env`.
2. Authorize each channel once (opens a browser, saves a refresh token to
   `channels/<id>/youtube.auth.json`, gitignored):

```bash
cd pipeline
npm run youtube:auth <channel>
```

### Upload a rendered job

```bash
npm run publish <channel> <job>              # upload PRIVATE, print the URL (you publish manually)
npm run publish <channel> <job> --schedule   # upload private + auto-schedule the next open slot
```

**Confirmation gate (uploads are hard to undo):** the default is always **private** (or
*scheduled-private*) and the video URL is printed — nothing goes public without either you
flipping it, or a scheduled `publishAt` arriving. Per-channel **`autoPublish`** in
`schedule.json` controls the passive behavior: `false` ⇒ upload private and wait for you; `true`
⇒ schedule live at the next cadence slot. Without a saved auth token, publish runs as a **dry
run** (prints the exact plan, touches nothing).

### Scheduling — `channels/<id>/schedule.json`

```jsonc
{
  "timezone": "America/New_York",
  "cadence": { "days": ["mon", "wed", "fri"], "times": ["09:00", "17:00"] },
  "autoPublish": false,
  "privacyStatus": "private",
  "categoryId": "27",                 // 27 = Education
  "defaultTags": ["how it works", "business explained"],
  "dailyQuota": 10000
}
```

The orchestrator computes the next open slot from the cadence (timezone + DST aware), sets
`status.publishAt` (RFC3339), and **never double-books** a slot already assigned to a
scheduled-but-unpublished video (tracked in a local ledger). Video title/description/tags come
from the job's `meta.json` (topic) + `script.txt` + `schedule.json`, overridable per job via
`jobs/<ch>/<job>/publish.json`. A `thumbnail.{jpg,png}` in the job/output folder is uploaded too.

**Quota awareness.** An upload costs ~1,600 of the default 10,000 daily units. A local per-day
tally (`.quota/<date>.json`) is tracked and uploads that would exceed the ceiling are **refused
and queued** with a clear log line (ceiling configurable via `YT_DAILY_QUOTA` or
`schedule.dailyQuota`).

Also available in the **Web UI** on the job's video panel: *Upload (private)* / *Upload +
schedule next slot*, with the channel's auth + autoPublish status shown.

---

## Analytics feedback loop (Part 2) — the passive-improvement engine

The channel learns from its own performance and conditions every new script on what has actually
worked.

```bash
npm run analytics:pull <channel>      # pull per-video views/CTR/retention → archive + videoLog
npm run analytics:analyze <channel>   # Opus updates learnings.json (evidence-gated)
```

- **Pull** (YouTube Analytics API): per published video — views, impressions/CTR *(when exposed;
  often Studio-only → recorded as null)*, average view duration + percentage, subscribers gained,
  and the **audience-retention curve** (relative retention by elapsed-time bucket — the hook +
  drop-off signal). Raw pulls are archived at `channels/<id>/analytics/raw/<date>.json`.
- **Learnings** (`channels/<id>/learnings.json`, committed — this is the channel's memory):
  - `videoLog[]` — every video + final metrics + the hook/approach used.
  - `hypotheses[]` — candidate patterns, each with a sample size + confidence.
  - `appliedRules[]` — patterns **promoted** to active rules (gated: need **N≥3** supporting
    videos *and* confidence ≥ 0.6 before promotion — prevents overfitting to one viral fluke).
    Demotable if later data contradicts them.
  - `dropoffNotes[]` — recurring retention-crater zones mapped to script structure.
  - `changelog[]` — **append-only**; every analysis change is recorded (date/what/why/evidence),
    never a silent overwrite.
- **Analyze** (claude-opus-4-8): reads raw + current learnings, proposes evidence-gated updates,
  and writes back with a changelog entry. The prompt explicitly avoids overfitting (require sample
  size + confidence, prefer structural insights, **default to no change when data is thin**); the
  sample/confidence gate is **also enforced in code** so an over-eager model can't promote a weak
  rule.
- **Closed loop:** `generateScript` loads `learnings.json` and injects the active rules +
  dropoff notes into its prompt. Which rules conditioned a given script is logged to the job at
  `jobs/<ch>/<job>/learnings_applied.json`.

---

## Hands-off autopilot (Part 3)

One command runs the whole loop for a channel:

```bash
npm run autorun <channel> [minutes] ["topic"]
```

Stages (each logged; analytics/publish failures are caught and reported, not silent):

```
pull analytics → analyze + update learnings → pick next topic (or use the one you pass)
   → generate script (conditioned on learnings) → synthesize voiceover (Fish S1)
   → render video → publish per schedule.json (respecting autoPublish + quota)
```

If you omit `topic`, an on-brand one is generated (conditioned on the niche + past titles to
avoid repeats). `minutes` defaults to the channel's `format.minutes`.

### Wire it to a cron for true hands-off operation (Windows Task Scheduler)

`autorun` is the single command to schedule — **this just documents it; nothing is installed.**
Recommended cadence: run it a few hours **before** your earliest `schedule.json` slot so a video
is rendered and queued in time (e.g. daily at 06:00 if your first slot is 09:00).

```powershell
# Create a daily 06:00 task that runs autorun for one channel (run once, in an elevated shell):
$root = "C:\Users\ywait\OneDrive\Desktop\Youtube Automation Project\pipeline"
$action  = New-ScheduledTaskAction -Execute "npm.cmd" -Argument "run autorun how_industries_work" -WorkingDirectory $root
$trigger = New-ScheduledTaskTrigger -Daily -At 6:00am
Register-ScheduledTask -TaskName "yt-autorun-how_industries_work" -Action $action -Trigger $trigger -Description "Daily passive video autorun"
```

Use one task per channel. Inspect runs in **Task Scheduler**; `autorun` logs every stage to
stdout (redirect to a file with `... -Argument 'run autorun <ch> *> autorun.log'` if you want a
persistent log). Goal: **95% passive** — you only do the one-time `youtube:auth` per channel and
occasionally review the scheduled-private uploads (or set `autoPublish: true` to go fully live).

---

## Output folder structure

```
output/
  how_industries_work/
    my_video_001/
      clean_audio.wav      ← denoised + silence-trimmed audio
      timestamps.json      ← word-level timestamps (adjusted for trim)
      board_spec.json      ← full board layout spec generated by Claude
      video.mp4            ← final rendered video
      status.json          ← job status (machine-readable)
      audio_work/          ← intermediate files (denoised.wav, whisper output)
```

---

## Pipeline phases

### Audio engine (config-driven, PART C)

The audio pass is a real, generic, config-driven engine — nothing is hardcoded per topic.

**SFX — categorized, drop-in library.** Sounds live in category folders under
[`assets/sfx/`](assets/sfx/): `motion/` (whooshes), `money/` (cha-ching), `impact/` (accents),
`ui/` (ticks). Adding a sound is just dropping a `.wav`/`.mp3` in a folder — no code change; see
[`assets/sfx/README.md`](assets/sfx/README.md) and `manifest.json` for per-category mix settings.
A single **trigger engine** (`pipeline/src/audio/triggerEngine.ts`) decides which category fires
when, keyed off event *shape*: **motion** on camera travels/scene establishment (peak-aligned and
pre-rolled so the whoosh *leads* the move); **money** only on large/emphasized dollar figures
(threshold-gated — small prices never trigger it, often zero per video); **impact** on the single
biggest revelation. All cues are sparse, spaced, and sit under the narration.

**Background music — selectable bed, ducked.** Choose **Auto** (mood-shifting: hook→curious,
comparison→tense, revelation→uplifting, conclusion→reflective, crossfaded at each shift), a
**specific track**, or **None**. The bed is **ducked** under the narration (sidechain compression)
so it drops while words play and swells in the gaps, with gentle fades. Drop tracks in
[`assets/music/`](assets/music/) (`<mood>.mp3` or any `<stem>.mp3`, plus `<stem>_N` variants); see
[`assets/music/README.md`](assets/music/README.md). **The bundled tracks are Kevin MacLeod (CC-BY)
— you must credit him in each video's description.**

**Tunable config.** Defaults live in the channel's `config.json` under `"audio"` (SFX
`enabled`/`intensity`/`max_cues`/`min_spacing_seconds`/`big_money_min`, music
`enabled`/`track`/`volume`/`duck`). The Web UI writes per-job overrides to the job's
`options.json`, merged over the channel defaults at run time.

### Animated SVG assets

A hero SVG can be a small animation instead of a static drawing. Give it frames named
`<name>.svg`, `<name>__2.svg`, `<name>__3.svg`, …; the renderer draws frame 1, then flipbooks
through the rest (progression once, then a gentle looping idle). The spec generator can request
one by adding `"anim_action": "<what moves>"` to an `svg_asset`, and Phase 2.5 generates the
frames automatically. (Example shipped: `costco_building` — doors open and a greeter waves.)

| Phase | What it does |
|-------|-------------|
| Channel Generator | Design a per-channel ChannelSpec (palette/type/asset-style/camera/voice/format) from a title + description; picks an archetype |
| Phase 0 — Script (optional) | Generate a narration script from a topic + target minutes, in the channel voice |
| Phase 0.5 — Voiceover (optional) | Synthesize the voiceover from the script via the TTS adapter (Fish S1 default, SAPI stand-in fallback) |
| Phase 3 — Audio | Transcribe → trim leading/trailing **and long internal** silences → categorized SFX (trigger engine) → ducked music bed → adjusted timestamps |
| Phase 2 — Spec Generator | Claude Haiku (structure) + Sonnet (full board spec JSON) |
| Phase 2.5 — Asset Generator | Generate missing SVG wireframe assets via Claude |
| Phase 1 — Renderer | @napi-rs/canvas frame loop + FFmpeg assembly |
| Phase 5 — Orchestrator | Watches jobs/, chains all phases, manages status |
| Publish (Part 1) | OAuth upload to YouTube, scheduled/private, quota-aware (`publish/`) |
| Analytics (Part 2) | Pull metrics + retention, Opus-analyze → `learnings.json`, condition scripts (`analytics/`) |
| Autorun (Part 3) | One command runs the whole loop passively (`autopilot/`) |

### New per-channel + per-job files

```
channels/<id>/
  youtube.auth.json   ← OAuth refresh token (gitignored)        [Part 1]
  schedule.json       ← cadence + autoPublish + category/tags   [Part 1]
  learnings.json      ← accumulated memory (committed)          [Part 2]
  analytics/raw/<date>.json  ← raw metric pulls (gitignored)    [Part 2]
jobs/<id>/<job>/
  meta.json               ← topic/minutes (titles the upload)
  learnings_applied.json  ← which learned rules conditioned this script  [closed loop]
output/<id>/<job>/
  publish.result.json     ← upload result / dry-run plan        [Part 1]
```

---

## Troubleshooting

**"Missing Python dependencies"** — Run the pip install commands in Prerequisites above.

**auto-editor JSON parse error** — auto-editor's JSON format varies by version. The pipeline logs the raw JSON keys — if chunks are missing, try upgrading: `pip install --upgrade auto-editor`.

**Whisper takes a long time** — Normal for the `small` model on first run (model download). Subsequent runs are faster. For faster transcription: install `openai-whisper` with `pip install openai-whisper[torch]` and use a GPU.

**Renderer fails** — Run the acceptance test directly: `cd renderer && npx ts-node src/index.ts ../test/fixtures/test_board_spec.json test_out.mp4`

**ANTHROPIC_API_KEY not set** — Set it as a Windows environment variable (System Properties → Environment Variables) so it persists across sessions.
