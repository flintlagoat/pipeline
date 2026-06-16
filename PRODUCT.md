# Inkwell — Product Overview & Handoff

> Read this FIRST for the product/website/cloud side. `CLAUDE.md` is the deep log of the video
> ENGINE (pipeline + renderer) and its session history; `GROWTH_ENGINE.md` is the content strategy.
> Last updated: 2026-06-16 (overnight engine + website hardening — see "Overnight update" before §7).

---

## 1. What Inkwell is

**Inkwell** is a productized version of the YouTube automation pipeline in this repo — sold as the
**anti-slop** alternative to faceless-video tools. Positioning (from market research, see
`memory/productization-pivot`): every competitor (AutoShorts, Faceless.so, Pictory, HeyGen, etc.)
makes short-form, stock-footage, templated content that YouTube's July-2025 "inauthentic content"
policy now demonetizes. Inkwell's moat: **long-form, custom-RENDERED vector animation** (not gen-AI
video), **retention-engineered scripts**, a **distinct look per channel**, and a **self-improving
analytics loop**. The empty market quadrant = long-form + distinct/engineered.

**Business model:** free cloud demo → cloud credit subscription → paid local app (renderer runs
local, the spec/script "brain" stays a hosted API so the prompt IP never ships). Billing is the last
piece (not built yet — operator's call).

---

## 2. The two halves

1. **The engine** (pre-existing, see `CLAUDE.md`): `pipeline/` (channel/script/spec/asset/audio
   generation + orchestration) and `renderer/` (@napi-rs/canvas + ffmpeg frame renderer). Plus
   `ui/` — a LOCAL operator studio (Vite/React) talking to `pipeline/src/server.ts` (Express, :5050).
2. **The product** (built session 9): `website/` — a Next.js 14 + Tailwind + Supabase app deployed
   on Vercel (the customer-facing marketing site, free demo, accounts, dashboard), plus a **cloud
   render worker** (`pipeline/src/renderService.ts` + root `Dockerfile`) deployed on Render that runs
   the full pipeline for one video and stores the MP4 in Supabase Storage.

---

## 3. Live infrastructure (all provisioned + verified 2026-06-14)

| Thing | Value |
|---|---|
| **Production site** | https://inkwell-silk-seven.vercel.app (demo verified live) |
| **GitHub repo** | https://github.com/flintlagoat/pipeline (branch `main`) |
| **Vercel project** | `inkwell` · id `prj_IT7lo5jIRiKIta2ueXXM1jrfjpAE` · team `flint-projects` · rootDir `website` · framework `nextjs` · repoId `1269220832` |
| **Render worker** | `inkwell-render` · id `srv-d8nko6ho3t8c73cthcvg` · https://inkwell-render.onrender.com · team `tea-d8nkd0bbc2fs73f56bd0` · **FREE plan (needs upgrade)** · `/health` returns ok |
| **Supabase** | project ref `lundkydfijkkqaaxrvrz` · https://lundkydfijkkqaaxrvrz.supabase.co |

**Operator-provided tokens** (used via REST APIs; NOT stored in the repo — re-ask each session):
Supabase PAT `sbp_…` (Management API, schema migrations), Vercel token `vcp_…` (env + deploys),
Render API key `rnd_…` (service + env), plus the product API keys below.

### Supabase tables (RLS on all; service role bypasses RLS)
- `leads` — waitlist (service-role only).
- `profiles` — one per auth user; `credits` (3 starter via on-signup trigger `handle_new_user`); owner select/update.
- `channels` — saved channel looks (`spec` jsonb); owner select/insert/delete.
- `videos` — render jobs (`status` queued|rendering|ready|failed, `storage_path`); owner select/insert, worker updates via service role.
- `demo_runs` — per-IP demo rate-limit ledger (service-role only).
- **Storage bucket** `videos` (private) — holds `<user_id>/<video_id>.mp4`; playback via signed URLs.
- Migration records: `website/supabase/migrations/0001–0005`. Auth **autoconfirm is ON** (no email
  verification yet — toggle in Supabase dashboard). DDL gotcha: after a schema change run
  `notify pgrst, 'reload schema';` or PostgREST 404s on the new table.

### Environment variables
- **Vercel** (`inkwell`): `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
  `SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY`, `NEXT_PUBLIC_SITE_URL`, `RENDER_API_URL`
  (= the Render worker URL), `RENDER_SECRET` (shared with the worker).
- **Render** (`inkwell-render`): `RENDER_SECRET`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`,
  `ANTHROPIC_API_KEY`, `FISH_API_KEY`, `TRANSCRIBE_BACKEND=cloud`, `TRANSCRIBE_API_KEY` (Groq).
- **Local** (`.env` at root, gitignored): all engine keys (ANTHROPIC, FISH, GOOGLE OAuth, YOUTUBE).
  `website/.env.local` (gitignored) mirrors the website's vars. `*.example` files document both.

---

## 4. The customer funnel (end-to-end, all live except final render)

1. **Landing** (`website/app/page.tsx`) → anti-slop pitch, pricing, waitlist. CTAs → `/demo`.
2. **Free demo** (`/demo` + `/api/demo/channel`) — type a channel idea → Anthropic (sonnet-4-6)
   returns a channel look + a sample frame in its voice → rendered instantly as a CSS "channel look"
   (`components/ChannelDemo.tsx`). Per-IP rate-limited via `demo_runs`. **Verified live.**
3. **Sign up** (`/login`, Supabase email/password) → 3 starter credits → gated `/app` dashboard. **Verified.**
4. **Save to studio** — logged-in users save a demo channel (`/api/channels`); dashboard lists them. **Verified (RLS).**
5. **Generate a video** (`/api/videos/generate`) — credit-gated → inserts a `videos` row → dispatches
   `{videoId,userId,channelId,topic}` to the Render worker (`RENDER_API_URL/render`, Bearer `RENDER_SECRET`).
6. **Render worker** (`pipeline/src/renderService.ts`) — fetches the channel spec from Supabase →
   `saveChannelSpec` → `generateScriptForJob` → `generateVoiceoverForJob` (Fish) →
   `processJob` (audio→spec→assets→render; transcription via Groq cloud) → uploads `video.mp4` to
   Storage → sets `videos.status=ready`. **Deployed + reachable; a full render NOT yet verified (see §6).**
7. **Watch** (`/api/videos/[id]/url`) — signed URL; dashboard "Your videos" + Watch button.

---

## 5. Running things

- **Website (local):** `cd website && npm install && npm run dev` (→ :3000). Needs `website/.env.local`.
- **Website (prod):** auto-deploys on push to `main` (Vercel). `vercel.json` pins framework=nextjs.
- **Operator studio (local):** from `pipeline/` → `npm run ui` (builds `ui/` + serves on :5050).
- **Engine CLIs** (from `pipeline/`): `channel:new`, `channel:preview`, `script`, `voiceover`,
  `process`, `publish`, `autorun`, `research`, plus tests (`test:distinct`, etc.). See `CLAUDE.md`.
- **Render worker:** Docker (root `Dockerfile`), auto-deploys on push. CMD runs `renderService.ts`.
  Transcription is the cloud backend so the image has NO Python (`TRANSCRIBE_BACKEND=cloud`).

---

## 6. What's DONE vs WHAT'S LEFT (next session, start here)

**Done + verified this session:** dependency fix (pluggable transcription, DeepFilterNet removed),
per-channel distinctness, the website, Supabase (5 tables + storage), free demo, accounts/credits,
save-to-studio, demo rate-limit, SEO (robots/sitemap/OG/favicon), channel-look preview (CLI +
operator studio), **live production**, and the **cloud render backend built + deployed** (worker
healthy on Render, Groq transcription key set).

**Left to do:**
1. **Verify a real end-to-end render.** Needs the Render upgrade first → the FREE plan is 512 MB +
   spins down on idle; a 1080p canvas render will likely OOM / be killed. **Operator is upgrading
   Render to a paid plan (Standard 2 GB) in the morning.** After that: log in on the live site,
   save a channel, "Generate a video," watch `videos.status` go queued→rendering→ready, then Watch.
   If it fails, check the Render logs (likely OOM → bigger plan, or a missing asset/font at runtime).
2. **Billing (Stripe)** — operator said do this LAST. Build: checkout + webhook + credit top-ups +
   gate the demo/metering. Needs the operator's Stripe account + keys.
3. **Transcription "choose at setup" onboarding UI** (engine supports local|cloud|auto via env/opts).
4. **Custom domain** (currently the `*.vercel.app` URL) + email verification (autoconfirm is ON).
5. **Hosted-brain anti-piracy split** for the eventual paid local app (keep prompts server-side).
6. Nice-to-haves: auto-refresh the dashboard while a video renders; per-channel "generate" inline;
   thumbnails/series; the operator studio's render-worker reuse.

**Known caveats:** free Render tier won't reliably render (RAM/spin-down) — upgrade required. The
website's local server may be stale across restarts — prod (Vercel) is the source of truth. The
render worker materializes user channels from Supabase to disk each job (ephemeral FS — fine since
the MP4 is uploaded to Storage).

---

## Overnight update — 2026-06-16 (engine + website hardening)

**Engine (committed):** root-caused + fixed an OOM cascade in the local render queue — a 20-core box
defaulted to **19 render workers** and exhausted RAM, so renders died (`exit 1` / Windows
`0xC0000142`) and the queue burned through the rest in seconds. Fixes: `RENDER_WORKERS=1` in local
`.env` (single-process; reliable when free RAM is low); a real `pauseUntil` cooldown in
`pipeline/src/server.ts` (the `setInterval` drain was bypassing the per-job cooldown — now 90s after a
failure); and a **memory-aware default worker cap** in `renderer/src/index.ts`
(`min(cores-1, freeRAM/1.2GB)`, `RENDER_WORKERS` still overrides). **This memory-aware cap also
protects the cloud render worker** (§6.1): on a small Render instance it will no longer over-spawn and
OOM — worth keeping in mind alongside the plan upgrade. Also improved SVG asset legibility (one iconic,
read-at-a-glance subject) in `pipeline/src/prompts/svgAssetSystemPrompt.ts`.

**Website (COMMITTED LOCALLY — NOT pushed; review, then push to deploy):**
- Dashboard **auto-refresh while videos render** (`components/AutoRefresh.tsx`) — the §6 nice-to-have;
  re-fetches every 6s only while a video is pending, with a live pending indicator.
- **One-click example-idea chips** on the demo (`components/ChannelDemo.tsx`) to lower friction.
- Verify with `cd website && npm run build`, then `git push` to auto-deploy (Vercel).

---

## 7. Key files
- Website: `website/app/{page,demo,login,app}.tsx`, `website/app/api/{demo/channel,waitlist,channels,videos/*}`,
  `website/components/{ChannelDemo,WaitlistForm,GenerateVideo,WatchButton}.tsx`, `website/lib/supabase/*`.
- Render worker: `pipeline/src/renderService.ts`, root `Dockerfile` + `.dockerignore`.
- Channel preview: `renderer/src/preview.ts`, `pipeline/src/channelPreview.ts`.
- Distinctness: `pipeline/src/channelDistinct.ts` (+ `test_distinct`).
- Transcription: `pipeline/src/audio/transcribe/{index,backends/localWhisper,backends/cloud}.ts`.
- Engine: see `CLAUDE.md` "File Structure".
