# Build: "Second Person: the walk home" (stylized rebuild)

## What this is

A mobile-first web game. I have a working prototype: a 2D canvas with hand-rolled perspective projection. The mechanics and tuning are good and should stay as they are. Your job is to rebuild the game on a real 3D renderer and make it look and feel much more stylized and polished, without changing how it plays.

**Reference implementation:** `./reference/second-person-levels.html`. Read the whole file before doing anything else. If this prompt and the file disagree on a mechanic or a number, follow the file and tell me about the discrepancy.

Do not add menus, scores, unlocks, currencies, or new mechanics.

## The core idea (do not "fix" this)

The camera sits *in front of* the player character, looking back at them. The character walks toward the lens. These consequences are deliberate:

- The chaser is always in frame. The destination never is.
- The finish line is always behind the camera. Progress is shown by the top bar and by a warm glow that spills onto the pavement in the last 40 m.
- Near-lane cars drive at the camera, headlights first. Far-lane cars drive away from it.

Do not move the camera behind the character. Do not add a minimap. Do not reveal the destination.

## Mechanics to preserve exactly

Units are metres and seconds. The player advances toward −z.

**Street.** The near pavement spans x ∈ [−7.0, −0.15], followed by the kerb. The road spans x ∈ [0, 10], with one lane at x = 2.6 (traffic toward the camera) and one at x = 7.4 (traffic away). The far pavement spans x ∈ [10.15, 14]. Solid buildings wall both sides. Lamp posts on the kerb are obstacles.

**Camera.** Height 2.7, distance 7.5 in front of the player, pitch 0.21 rad. The follow deadzone is 0.55 in x and 0.4 in z. The follow tightens while a finger is down.

**Input.** Use pointer events so touch and mouse both work.

- **Steering:** hold anywhere on the ground. The pointer sets direction only. Speed stays at full while the pointer is held, with a 0.55 m deadzone. A pointer above the horizon clamps to a far ground point instead of dropping the input.
- **Shove:** touch within 1.5 m of the player's own character while the shove is off cooldown. The character plants and charges, reaching full charge in 0.55 s. Releasing with charge above 0.25 dashes toward the pointer at 11.5 m/s for 0.30 × (0.6 + 0.4 × charge) s. Cooldown is 1.9 s. Pedestrians hit during a dash are knocked aside and stagger for 0.9 s.
- **Aim ring:** an aim ring shows on the ground and turns red when aimed into the road.

**Movement.** Base speed is 4.5 m/s, scaled from 0.72 to 1.0 by direction: toward the lens is fastest, backing away is slowest. Acceleration is 26 m/s², or 90 during a dash. Turning is instant.

**Crowd collisions** are weighted by angle:

| Contact | Speed while slowed | Duration |
|---|---|---|
| Head-on (> 0.55) | 26% | 0.45 s |
| Partial (> 0.2) | 60% | 0.25 s |
| Glancing | 85% | 0.12 s |

**Cars.** Any overlap with a car is instant death. Light traffic spawns at random speeds of 15–23 m/s. Wave traffic sends convoys at a fixed period with countable gaps between them.

**Chaser.** Walks straight at the player at a constant speed. It shoves pedestrians within 0.8 m out of its way and catches the player at 0.95 m. It never stops and never speeds up within a level.

**Levels.** Keep the briefing card text from the reference.

| # | Title | Length | Crowd | Jams (distance range, density multiplier) | Traffic | Chaser speed |
|---|---|---|---|---|---|---|
| 1 | Walk | 130 | 0.22 | none | none | 3.15 |
| 2 | Traffic (shove tutorial) | 150 | 0.5 | none | light | 3.35 |
| 3 | The crush | 170 | 0.75 | 52–104 ×7 | light | 3.5 |
| 4 | The rhythm | 180 | 0.6 | none | waves every 5.4 s, 3 cars at 19 m/s | 3.6 |
| 5 | Both | 200 | 0.95 | 60–96 ×6, 132–168 ×6 | waves every 4.8 s, 3 cars at 20 m/s | 3.75 |
| 6 | Rush | 220 | 1.15 | 40–80 ×7, 120–190 ×5 | waves every 4.2 s, 4 cars at 22 m/s | 3.95 |
| 7+ | Block N | | | | | |

Levels 7 and up scale endlessly as in `levelCfg()`. The chaser speed caps at 4.35 and the wave period has a floor of 2.9 s.

**HUD.** Keep only these elements:

- the top progress bar (player dot, chaser dot, goal tick, metres remaining)
- the briefing, cleared, and failed cards
- a restart button
- one short status cue ("shove recharging", "it is on you")

## What to change

Change the rendering, art, animation, feedback, and audio.

### Art direction

> **Edit this section if you want a different look.** The default is to keep the prototype's identity and push it much further.

The prototype's identity:

- **Setting:** a street at dusk under a cold blue-grey haze.
- **Warm accent:** sodium yellow `#f2c53c` is the only warm colour. It is used for lamps, lit windows, the aim ring, and the finish glow.
- **Characters:** a bone-white player `#e9dfc7`, a near-black chaser with ember-red eyes `#e0552f`, and muted, desaturated pedestrians.
- **Mood:** quiet dread, not a horror movie.

Before writing any render code, write `ART_DIRECTION.md`. It should cover:

- the palette as named hex tokens, each with its role
- the shading model and lighting setup
- the post-processing stack
- the HUD type treatment
- the one signature visual element that everything else stays quiet around

Then review that document. If any part reads like the generic default you would produce for any "moody city at night" brief, revise it and note why.

Techniques to consider. Pick some; don't stack them all:

- stylized shading, such as a cel ramp or posterized light bands, with ink outlines from a depth/normal edge pass
- lamp cones and headlight beams that read as volumetric in the haze
- wet pavement with streaked light reflections. A cheap fake is fine, such as stretched reflection quads or a low-resolution planar reflection. Real screen-space reflections are too expensive on phones.
- rain or another atmospheric particle layer
- bloom restricted to emissive elements
- shopfront, signage, and window detail from procedural canvas textures

**Characters.** Build procedural low-poly humanoids with silhouettes that stay readable at small sizes. Give them a procedural walk cycle with visible weight, plus stagger and stumble animations. The chaser needs a gait and silhouette that are unmistakably different from everyone else.

### Feel and feedback (must not alter balance)

- **Bumps:** a brief squash on contact and a stumble on head-on hits. Glancing contact gets almost no reaction.
- **Shove:** an anticipation crouch while charging, smear or speed lines on release, and pedestrians tumbling away.
- **Near miss with a car:** a whoosh, a short camera shake, and a brief desaturation.
- **Death:** a freeze-frame or short slow-motion moment before the card appears. When the player is caught, the chaser's reach or shadow should visibly land on them.
- **Chaser proximity:** as the player's lead shrinks, a low drone or heartbeat rises and the vignette tightens.
- **Haptics:** use `navigator.vibrate` where it is supported, and degrade silently where it isn't.

### Audio

Use procedural Web Audio only, with no sample files unless I approve them:

- ambient city hum or rain
- footsteps synced to the walk phase
- doppler pass-bys for cars
- the chaser drone

Audio starts on first touch. Include a mute toggle.

## Technical constraints

- **Stack:** Vite + TypeScript + three.js, with exact versions pinned. The build output is static.
- **Self-contained:** no runtime network requests and no external assets unless I approve them. Everything is procedural.
- **Simulation:** keep it separate from rendering. Write it as pure TypeScript with a fixed timestep (around 120 Hz) and no three.js imports. The renderer interpolates between simulation states.
- **Randomness:** use a seedable RNG so crowds and traffic are reproducible in tests.
- **Performance:** the target is 60 fps on a mid-range phone (iPhone 12 or Pixel 6 class), with device pixel ratio capped at 1.5–2. Quality tiers are chosen automatically from measured frame time. Use instancing for the crowd, cars, and windows, and keep draw calls in check.
- **Mobile:** full screen, safe-area insets respected, no scrolling, zooming, or text selection. Portrait is the primary orientation; landscape should also work.
- **Debug mode:** `?debug` shows fps, frame time, and draw calls, plus a lil-gui panel for live tuning. Live tuning never changes the shipped defaults.

## How to work

1. Read the reference fully. Write a short `PLAN.md` covering the architecture, the module list, what gets ported as-is versus rewritten, and the main risks.
2. Port the simulation first, with greybox rendering, and prove parity before any art work. Required tests:
   - unit tests for the collision tiers, shove timings, chaser catch distance, and the level config table
   - a headless bot test where, on level 1, holding a steady heading toward the lens with no other input finishes the level across at least 20 seeds. If some seeds fail, report it as a design finding rather than adjusting the test.
3. Write the art direction document described above. Then do the visual passes one layer at a time: environment, characters, lighting and post-processing, atmosphere, feedback, audio.
4. After each pass, review screenshots before moving on:
   - Use Playwright to capture 390×844 (portrait) and 844×390 (landscape), at the start of level 1 and mid-level 4 with traffic on screen.
   - Look at the screenshots and fix what looks wrong before starting the next pass.
   - Keep a short log in `NOTES.md` of what you tried and what you rejected.
5. Check frame time after each visual pass, using the debug overlay or a Chrome performance profile with 4× CPU throttling. If a pass breaks the budget, cut it back before continuing.
6. If you think a tuning value or mechanic should change, don't change it. List it under "Suggestions" in your final summary.

## Done means

- `npm run dev -- --host` lets me open the game on my phone over the local network, and `npm run build` produces a static `dist/`.
- All six levels and the endless scaling are playable, and all tests pass.
- Final screenshots are saved in `screenshots/`.
- A short summary covering what changed, where the frame budget went, known issues, and suggestions.
