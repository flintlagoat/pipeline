# SFX library

Categorized, drop-in sound-effects library for the audio engine (Phase 3, PART C).

## Structure

```
assets/sfx/
  manifest.json     ← per-category mix defaults (volume, lead_ms, peak_align)
  motion/           ← whooshes/swooshes — camera travels + major scene entrances
  money/            ← cha-ching/register — LARGE money beats only
  impact/           ← thuds/accents — the single biggest revelation beat, sparingly
  ui/               ← ticks/clicks — list reveals (optional; off unless files present)
```

## Adding a sound

Drop a `.wav` or `.mp3` into the matching category folder. **No code change needed** — the
loader (`pipeline/src/audio/soundLibrary.ts`) scans each folder at run time. Multiple files
per category are supported; the trigger engine picks one per cue (stable per video, so the
same video reuses the same pick and different videos vary).

## Mix behaviour (per category, see `manifest.json`)

- `volume` — level under the narration (narration always stays full; SFX sit beneath it).
- `lead_ms` — how far the sound's audible PEAK is pre-rolled BEFORE the event. Motion sounds
  use ~100ms so the whoosh LEADS the camera move instead of trailing it.
- `peak_align` — align the file's loudest sample to the event (strips any soft/silent head).

## Triggers (generic across topics — see `triggerEngine.ts`)

- **motion** → each section's establishment (camera arrives / first reveal).
- **money** → spec/transcript money figures at or above the threshold (`big_money_min`,
  default $100). Small prices never trigger it. Often zero per video — that's correct.
- **impact** → the single biggest revelation/blur headline (optional).
- All cues are sparse, spaced, low in the mix, and scaled by the SFX `intensity` setting.
