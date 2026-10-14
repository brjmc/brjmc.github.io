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

## 3. Lighting and post

- Kept: one post pass. Ink lines come from the Laplacian of 1/z on the depth buffer, which is zero on
  any plane, so the ground at grazing angles doesn't ink itself the way a first-difference
  depth edge would. Line weight fades into the haze between 18 m and 62 m.
- The finish pool was too faint to tell apart from an ordinary lamp. The spill now scales
  linearly (not squared) over the last 40 m, rises to 42 % of the frame in three stepped bands,
  and arches slightly as if its centre were just behind the lens. The finish light follows the
  camera's x.
- **Rejected:** dithering away people close to the lens. In a jam it covered the bottom of the
  frame in screen-door noise. Replaced with flat ink silhouettes between 4.4 m and 2.4 m of the
  lens (culled closer), like the framing figures in a print. It also sells the crush.
- Near miss: everything goes grey except the two warm inks, for about half a second. Proximity:
  the vignette closes toward ink and pulses with the heartbeat.
- Preview states (`--states`): finish, dread, jam, near miss. The near-miss preview has to run
  last, or its desaturation bleeds into the next shot.
- Perf: CPU 2.1 ms median, 5.9 ms p90 on level 4; **level 6 jam: 483 people, 3.1 ms median,
  7.3 ms p90, 80k triangles**, still 16 draw calls.

## 4. Atmosphere

- Drizzle was nearly invisible: about 1.7 drops per lamp cone. The drop volume shrank from 22×9×48 m to
  16×6×32 m, centred where the cones are, giving about 6 drops per cone. Drops are lit only by
  sodium cones and headlight beams. Headlight drizzle was cut back hard because it filled the
  whole road with white streaks.
- Lamp cones raised to 7.5 % alpha. They stay quieter than the pools, as the art direction says.
- Fog keeps its five soft steps. On stills it reads as layered paper. Motion can't be judged on
  this machine; if the steps crawl on a phone, set `uFogP.z` higher (smoother).

## 5. Feedback

- Bumps: squash scaled by tier (0.16 / 0.08 / 0.02) plus a short shake. Head-on adds a recoil and
  side stumble. Glancing contact is nearly invisible, as asked.
- Shove: crouch with a charge ring filling around the aim point, a line from you to the landing
  point (ember if it lands in the road), speed lines and a stretch on release. Knocked people
  tumble away.
- Near miss: whoosh panned to the car's side, a 0.28 s shake, desaturation, haptic double tap.
- Death: car = freeze-frame, ember flash, shake, thrown clear; caught = slow crawl, reach, shadow,
  the player drains to ink. Card after 1.1 s; touches in the first 0.35 s of a card are ignored
  so a held finger doesn't skip it.
- Haptics through `navigator.vibrate`, silently absent on iOS. Muting sound also mutes haptics.

## 6. Audio

- All procedural, starting on the first touch: city hum (filtered noise + 55 Hz), drizzle
  (band-passed noise with a slow LFO), footsteps on each footfall of the walk phase (noise click +
  low thump), four Doppler car voices assigned to the nearest cars (tyre noise + engine saw, pitch
  from radial speed toward the camera, panned by x), chaser drone (three detuned saws, the filter
  opens with proximity) and a heartbeat that also drives the vignette pulse. One-shots for bump,
  post, dash, knock, near miss, both deaths, clear and shove-ready.
- Far-lane cars approach from behind the lens and can't be seen until they pass the camera.
  Their engine is audible before that, and it's the only warning you get.
- Not verified by ear (no audio output here). `npm run smoke` drives a real browser session and
  confirms the audio graph, mute and restart run without errors.

## Final: where the frame budget goes

Measured here (no GPU, so CPU only):

| | Level 4, mid-walk | Level 6, inside a jam |
|---|---|---|
| People / cars live | 100 / 12 | 483 / 19 |
| Sim per 60 fps frame (two 120 Hz steps, Node, unthrottled) | 0.10 ms | 0.42 ms |
| Whole CPU frame, Chromium 4x throttle, median / p90 | 2.1 / 5.9 ms | 3.1 / 7.3 ms |
| Draw calls | 16 | 16 |
| Triangles | 38k | 80k |

- CPU is not the risk: at 4x throttle the p90 is about 7 ms in the worst crowd. The
  render-side share (posing up to 520 figures into instance buffers, uploads, three.js
  submission) is about the same as the sim.
- **GPU is the unmeasured risk.** The expensive fragments are the street shader (up to 8 lamp +
  6 headlight terms, plus 14 wet-streak terms over a large share of the screen), the facade shader,
  and the post pass (5 depth taps). Tiers cut exactly these: low = DPR 1, 4 lamps, 3 headlights,
  no drizzle, no cones. Mid = DPR 1.5, 6/4, drizzle 500. High = DPR 2, 8/6, drizzle 900. Auto-tiering
  drops a tier when a 2 s window averages over 21 ms, and raises once (never oscillates) after 6 s
  under 13.5 ms. A phone with DPR ≥ 1.5 starts on mid.
- Bundle: 170 kB gzip main (three.js is most of it); debug, lil-gui and greybox are lazy chunks.
