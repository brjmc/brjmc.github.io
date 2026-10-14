# PLAN — Second Person: the walk home (three.js rebuild)

## Inputs and the gap

- `reference/BRIEF.md` is the build brief.
- `reference/second-person-street.html` is the only prototype available. The brief points at
  `second-person-levels.html`, which was not provided. The street file is an earlier sandbox:
  no levels, shove, wave traffic, jams, briefing text, progress bar or `levelCfg()`.
- Decision (confirmed with the owner): the brief's tables are the source of truth. Where the
  brief and the street file disagree, the brief wins (it describes the newer levels build).
  Where the brief is silent, the street file is used. Where both are silent, a value is
  invented and listed in `src/sim/constants.ts` under `// INVENTED` and in the final summary.

### Discrepancies between brief and street file (brief wins)

| Item | Street file | Brief |
|---|---|---|
| Camera height / distance / pitch | 2.55 / 6.2 / 0.20 | 2.7 / 7.5 / 0.21 |
| Camera follow | exp smoothing, no deadzone | deadzone 0.55 x, 0.4 z, tighter while held |
| Player speed | 4.4, no direction scaling | 4.5 × [0.72..1.0] by direction |
| Movement | walk to a target point, stop on arrival | pointer is direction only, 0.55 m deadzone |
| Crowd slow | flat 32 % for 0.4 s | three angle tiers (26/60/85 %) |
| Light traffic speed | 15–24 | 15–23 |
| Chaser | toggle, teleports back on contact | always on, catch at 0.95 m = fail |

### Invented (brief and file both silent)

Briefing/cleared/failed text, chaser start gap, crowd-density unit, jam behaviour, wave
convoy spacing and lane phase, level 7+ scaling, shove cooldown start, what "touching the
character" means on screen, field of view, near-miss threshold, finish-glow shape.

## Architecture

```
src/
  sim/            pure TypeScript, no three.js, no DOM. Fixed 120 Hz step.
    constants.ts  street layout, tuning DEFAULTS (frozen) + invented values flagged
    rng.ts        seedable PRNG (sfc32) + hash
    levels.ts     levelCfg(n): table for 1–6, endless scaling for 7+
    projection.ts screen <-> ground math shared by input and renderer
    props.ts      deterministic buildings, lamps, bins per 9 m block
    world.ts      World: player, crowd, traffic, chaser, camera, events, step()
    bot.ts        headless input helpers for tests and screenshots
  render/         three.js only reads sim state; interpolates prev->current
  audio/          procedural Web Audio
  ui/             DOM HUD (progress bar, cards, restart, mute, status cue)
  main.ts         loop: accumulate real time, step sim at 120 Hz, render with alpha
  debug.ts        ?debug overlay + lil-gui (dynamic import, edits a clone of DEFAULTS)
tests/            vitest: tiers, shove, chaser, level table, 20+ seed bot run
scripts/          screenshots.mjs (Playwright), perf.mjs, publish.mjs
```

Render coordinates: three.js is right-handed, the prototype is left-handed. The renderer
maps sim `(x, y, z)` to render `(x, y, -z)` so the camera looks down render −z and the
road stays on screen right, as in the prototype.

## Ported as-is vs rewritten

- **Ported (numbers and logic):** street layout, lane x, block/lamp/bin hash generation,
  pedestrian walk/wobble/separation, player–ped push split (55/45), car spawn distances,
  despawn bounds, long-vehicle odds, light-traffic spawn intervals, palette.
- **Rewritten from the brief:** movement (direction-only steering, acceleration, direction
  scaling), collision tiers, shove/charge/dash, chaser, levels, waves, jams, camera
  deadzone, HUD.
- **New:** everything visual and audible.

## Main risks

1. **Missing reference.** Feel may differ from the levels build. Mitigation: all invented
   values in one place, flagged.
2. **Phone GPU cost.** Custom lit shaders with many lights + post pass on a 2× DPR screen.
   Mitigation: one post pass, lights capped per tier, auto-tiering from frame time, instancing
   everywhere, no shadow maps.
3. **No real phone here.** Headless Chromium uses a software GL renderer, so GPU frame time
   can't be measured; only CPU-side frame cost and draw calls. Reported as such.
4. **Crowd cost.** Up to ~700 pedestrians in jams: spatial hash for separation; only
   on-screen ones are uploaded to the GPU.
5. **GitHub Pages runs Jekyll.** Source lives under `_src/` (Jekyll skips `_` folders) and
   the built game is committed to `/second-person/`.
