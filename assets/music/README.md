# Background music — mood library

The pipeline lays a **minimal, low** music bed under the narration that **shifts mood with the
video**: each section maps to a mood, and at a mood change the outgoing track fades out while
the incoming mood's track fades in (a crossfade). Music sits far under speech (`MUSIC_VOL` in
[`pipeline/src/audio/music.ts`](../../pipeline/src/audio/music.ts)) so it never steals the show.

## How tracks are chosen

- Drop tracks here named by **mood**: `curious.mp3`, `tense.mp3`, `uplifting.mp3`,
  `reflective.mp3`, `neutral.mp3` (`.wav` also works).
- Multiple options per mood? Add numbered variants — `curious_1.mp3`, `curious_2.mp3`, … — and
  the pipeline picks one per video by hashing the `video_id`, so **different videos get
  different tracks** for the same mood.
- Section → mood mapping (`SECTION_MOOD` in `music.ts`):
  | section_type | mood |
  |---|---|
  | hook | curious |
  | comparison | tense |
  | revelation | uplifting |
  | conclusion | reflective |
  | diagram / flow_chart / list_reveal | neutral |
- Adjacent same-mood sections merge; a missing mood falls back to `neutral`; if **no** tracks
  exist here, the pipeline simply skips music (narration plays dry).

Example (the test video): `curious 0–6s → tense 6–19s → uplifting 19–33s → reflective 33–44s`.

## What's in here now — real tracks (ATTRIBUTION REQUIRED)

The five `*.mp3` files are real royalty-free tracks by **Kevin MacLeod (incompetech.com)**,
downloaded from the Internet Archive. They are licensed **CC-BY** (Creative Commons Attribution),
which means they're free to use — **including monetized YouTube** — **but you MUST credit the
author in each video's description.** Add a line like:

> Music: "Cottages", "Farm", "Manor", "Northern Glade", "Black Vortex" by Kevin MacLeod
> (incompetech.com) — licensed under Creative Commons: By Attribution 4.0 — http://creativecommons.org/licenses/by/4.0/

Current mood → track mapping:

| file | track | mood feel |
|---|---|---|
| `curious.mp3` | Cottages | gentle, light — sets up the hook |
| `tense.mp3` | Black Vortex | dark, dramatic — the contrast/problem |
| `uplifting.mp3` | Farm | brighter, pastoral — the reveal |
| `reflective.mp3` | Northern Glade | calm, contemplative — the close |
| `neutral.mp3` | Manor | even, unobtrusive |

If you'd rather have **no attribution obligation**, replace these with **Pixabay** tracks
(Pixabay Content License = free commercial use, no credit required) — just keep the filenames.
The four calm tracks come from KM's *"Magic Scout — A Calm Experience"* album; swap `uplifting`
/`curious` for more contrasting tracks if you want a stronger mood arc (e.g. KM's *"Inspired"*
for uplifting, *"Thinking Music"* for curious).

## Swapping in real, popular royalty-free tracks

To use polished, recognizable tracks instead, download from a royalty-free source and replace
the file for that mood (keep the filename). Two reliable sources (researched June 2026):

- **Pixabay Music** (https://pixabay.com/music/) — Pixabay Content License: free for YouTube &
  commercial use, **no attribution required** (closest to "copyright-free"). Search by mood and
  sort by popularity; good buckets: *ambient / minimal* (calm→`neutral`/`reflective`),
  *cinematic drone / dark ambient / tension* (→`tense`), *inspiring / corporate / uplifting*
  (→`uplifting`), *documentary / investigative* (intrigue →`curious`).
- **Incompetech / Kevin MacLeod** (https://incompetech.com/music/royalty-free/) — CC-BY 4.0:
  free but **requires crediting** "Kevin MacLeod (incompetech.com)" in the video description.
  Hugely popular, so each track's mood is well documented online. Minimal/ambient picks:
  *"Healing"*, *"Pin Eight"*, *"Heliograph"*, *"Almost in F (Tranquillity)"* (calm/reflective);
  *"Crypto"*, *"Echoes of Time"*, *"Anxiety"* (tense); *"Thinking Music"*, *"Investigations"*
  (curious); *"Inspired"*, *"Ascending the Vale"* (uplifting).

If you'd like, the pipeline can be pointed at per-mood track lists in the channel `config.json`
instead of this filename convention — say the word and I'll wire that up.
