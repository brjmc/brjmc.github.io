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

## 2. Characters

- Kept: one procedural low-poly figure, posed entirely in the vertex shader from a handful of
  per-instance numbers (phase, stride, crouch, squash, lean, reach, tilt). The whole crowd is
  one draw call. Reviewed with `scripts/filmstrip.mjs` (walk, chaser, shove, bump, caught, hit).
- First walk read as stiff and from the front looked like a figure skating on the spot.
  Increased thigh swing (0.46 → 0.58 rad), arm swing, bob, shoulder counter-twist and hip sway
  over the stance foot. From the camera's front-on view, the side-to-side weight shift is what
  sells the walk.
- Faces were present but read as hair: their normals point down at the street, so they got
  about 25 % light. They now get a lighting floor. Checked with a red-face debug render.
- Chaser: taller, narrow, arms to below the knee, unlit ink with ember eyes. Lean alone didn't
  read from the front. Added a metronome-like side rock (0.085 rad), a tilted and drooping head
  and a shorter coat so the stiff stride shows.
- **Problem found:** people between the lens and the player hide the player, which is exactly where you're
  walking. Rejected dithering them away, because then you can't see who you're about to hit. Kept
  a dithered bone x-ray of the player, drawn (GreaterDepth) before the player itself so its own
  limbs never show through.
- Death by car in slow motion let the car roll over the player and hide them. A car hit is now a
  hard freeze-frame with the player thrown clear (render-only; the sim stops). Being caught is a
  short slow crawl: the chaser's arms rise over you, its shadow lands, and the bone drains out
  of the player to ink.
- Shove: anticipation crouch with arms drawn in, then a stretch, arms thrown forward and speed
  lines. Knocked people tip up to 0.95 rad toward the knock direction, flail and recover over
  the 0.9 s stagger.
- Perf: CPU 2.5 ms median, 6.3 ms p90; 16 draw calls (+2: player and x-ray split out of the crowd).
