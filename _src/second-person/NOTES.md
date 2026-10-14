# NOTES — what was tried, kept and rejected

Screenshots for each pass are in `screenshots/<pass>/`. Perf numbers come from `npm run perf`:
Chromium, 4x CPU throttle, level 4 mid-walk, 390x844 @2x. This machine has no GPU (SwiftShader),
so only the CPU-side cost (sim + render submission) means anything. rAF frame time there is
software rasterisation, and it isn't recorded as a phone estimate.

## 0. Sim port + greybox

- Kept: the sim in pure TS at 120 Hz, interpolated by the renderer; render space is sim with z negated.
- **Design finding (fixed with an invented mechanic):** with the street file's push-apart contact,
  walking straight into a person deadlocks: both creep forward at about 0.5 m/s (45 % of 26 %
  of 4.5). The steady bot was caught on 11/20 seeds of level 1. Added a *yield*: a bumped
  pedestrian side-steps out of your heading line at 1.6 m/s for 0.45 s. Now 24/24.
- **Design finding (not changed):** the road has two strips that no car can reach: the gutter
  (x ≈ 0–1.07) and the centre line (x ≈ 4.13–5.87). A bot that walks either strip clears every
  level, including Block 10 (`PROBE=1 npx vitest run tests/probe.test.ts`).
- **Design finding (not changed):** jams are close to impassable on foot. A scripted shover
  averages about 2 m/s through the level 3 jam against a 3.5 m/s chaser.
- Rejected: spawning the whole level's crowd at load (about 1,000 people on level 6). Instead the
  crowd is generated per 1 m cell with a per-cell seed, 32 m ahead of the player, so the layout
  depends only on the seed and not on how fast you walk.

## 1. Environment

- Kept: one shader each for the street strips, buildings (instanced boxes) and posts. Windows,
  shopfronts, paving, paint and puddles are all procedural. Signs come from one canvas atlas.
- Lamp light as a point light with distance falloff → **rejected**: the pools were 10 m wide,
  overlapped into one continuous wash, and banded light climbed the facades in large curves.
  Replaced with a downward cone (cos θ 0.74 → 1), giving distinct pools about 7.6 m across.
- Ambient lowered (sky 0.62 → 0.47). The first frames sat in the light-mid band, not mid-dark.
- **Bug:** lit windows were speckled. The building seed was an interpolated varying, so float
  error flipped a hash per pixel. Fixed with `flat` varyings and integer seeds.
- **Bug:** sign text was upside down, because CanvasTexture defaults to `flipY`. Text on the far side
  also had to run the other way along the facade.
- Mullions and window crosses aliased into noise at grazing angles. They now use derivative-AA lines
  that fade to an average once they are thinner than a pixel.
- Cold display windows read as white panels against dark walls, even though they measured 36 %
  grey. Dimmed to about 26 % and gave them shelves and stock in silhouette.
- Rejected: missing letters on signs ("BOO MAK RS" read as a bug, not wear). Wear is now just
  the odd faded letter.
- Rejected: wet streaks on every surface. They read as random yellow capsules. Streaks are now
  limited to puddles.
- Perf: CPU 2.5 ms median, 5.6 ms p90; 14 draw calls; 38k triangles; 98 people and 12 cars live.
