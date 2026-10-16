# PLAN — The Last Piece (three.js rebuild)

Inputs: `reference/BRIEF.md` (the request and what "same treatment" means) and the prototype
`reference/the-last-piece.html`.

## 1. Reading the prototype

One encounter on a 320×200 canvas. The camera is the diner's eye, low over a long plate,
looking through a spectacle lens. The core loop:

- **Move** on the plate (acceleration 1400, max 200 px-units/s, friction 13/s). The plate edge clamps you.
- **Diner lean.** A spring (k 9, damping 2.3, so ζ ≈ 0.38, about 27 % overshoot) keeps you
  centred, plus a slow wander of `sin(0.7 t) · 30 px`.
- **Attempt cycle:**
  - idle 1.5 / 1.25 / 1.05 s;
  - aim 1.35 / 1.15 / 0.95 s, with 2 / 3 / 4 marks scattered ±115 that track you at
    0.55 + 0.4·hits per second;
  - stab, at one slot of 0.42 / 0.38 / 0.34 s per mark: descend, close, lift;
  - fumble 0.7 s, then a 0.55 s drop of wasabi near you (±65 in x, anywhere in z).
- **Wasabi:** pick it up within 42 × 70 units of a blob. You carry one. Blobs live 11 s.
- **Throw:** counts if `|screen x − centre| < 34 px` and the tips were open at release. If you
  were in the lane but the tips were shut, the throw is clipped. Otherwise it misses.
- **Hit:** a splat on the lens that stays, tears, a sting, a recoil, and blinking 1.8× more per
  hit. Difficulty is indexed by hits (0, 1, 2).
- **Freshness 5.** A stab within 28 × 58 units costs 1, gives 1.2 s of invulnerability and a
  shove sideways, and drops what you carry. At 0 you are eaten.
- **Win** at 3 hits.

What's weak about it as a game:

1. **The lane is almost free.** The wander amplitude (30 px) is smaller than the lane half-width
   (34 px), and the lean keeps re-centring you, so you are in the lane most of the time. The
   only real condition is "tips open", which means "not mid-stab".
2. **"Open" is abstract.** It's a scalar, not where the sticks are. You can't see why a throw
   was clipped.
3. **One encounter**, a single difficulty ramp, and no level design.
4. **Desktop controls**: an on-screen d-pad is weak on phones.

## 2. Design for the rebuild

### Kept as is (the verbs)

Move, dodge telegraphed stabs, pick up fumbled wasabi, and throw it into the eye from the
lane. Also kept: the lens splat that stays and makes the game harder to see, freshness 5 /
win at 3, eaten / check-please endings, the hits-indexed difficulty ramp, the lean with
overshoot, and blinking.

### Made physical (same rule, now visible)

Everything is in centimetres. The diner's eye is the camera. He **leans** (translates sideways);
he doesn't turn his head. So "screen centre" and "lined up with his eye" are the same thing: `|x −
eyeX| < lane`.

A throw is a fast lob straight back toward his face. It arrives at its own x, so it hits if it
is in the lane and nothing is in the way. Off-lane throws veer out of frame past his head; on
screen they visibly slide toward the edge as they approach.

**Blocking is geometric.** At release, the throw's arc is tested against the two chopstick
shafts, which are tapered capsules. The prototype's rule still applies: "what the lane looked
like when you let go is what counts". With the tips hovering open over your line, the throw passes
between them. With them shut on your line, it's clipped. If they are down at the plate somewhere
else, the line may be clear. A blocked blob drops back onto the plate where it hit, so it
isn't wasted.

**The read.** The same test runs every frame while you carry wasabi. When the shot is on, you
get a green bracket on you and the throw button lights. The rule stays simple and the
geometry stays honest.

### Controls (phone first)

- **Drag anywhere to move.** A floating stick appears under your thumb; full speed at 46 px.
- **Throw:** tap anywhere (< 220 ms, < 14 px of movement), tap the throw button, or put a
  second finger down. That covers one thumb, two thumbs, and a lone tap.
- **Keyboard:** WASD / arrows, plus Space / J / K to throw. M mutes, R restarts. **Gamepad:**
  left stick plus A.

### Courses: one evening at the counter

Each course is a new diner (and so a new pair of glasses, which changes the lens shape and
frame, see ART_DIRECTION), a new plate, and **one** new idea.

| # | Course | Diner, glasses | Plate | New idea | Hits | Attacks |
|---|---|---|---|---|---|---|
| 1 | The regular | round wire frames | white rectangular plate (the prototype) | the basics; drops land close | 3 | single pecks → doubles |
| 2 | Soy | salaryman, black acetate squares | round blue-rim plate with a soy dish on it | obstacles you walk around, and a soy puddle that slows you | 3 | volleys of 2–3 |
| 3 | Daikon | critic, gold half-moon readers | wooden geta board | **guard**: tips sit shut on your line while you're armed, so you bait a stab first. A heap of shredded daikon hides you; his marks lose you | 3 | volleys + feints |
| 4 | Date night | tinted aviators, plus *her* chopsticks from across the table | black slate | a second pair of sticks that only stab; her fumbles drop wasabi too | 3 | volleys + her pecks |
| 5 | The chef | tortoiseshell cat-eye | long hinoki board | a wasabi mound to scoop from (refills); **sweeps**, where the tips drag in a line | 4 | sweeps + volleys |
| 6 | Last orders | the regular again, drunk | course 1's plate, now littered | everything; he sways hard | 5 | all |
| 7+ | Seconds | rotating | rotating | endless remix, stats scale | 5 | all |

The difficulty inside a course still ramps with hits, as in the prototype. Each course defines a
small `ramp[hits]` table: idle, aim, marks, slot, tracking, spread, feint, sweep, guard, drop
distance.

### Light meta

- **Course cards:** a briefing (kicker, title, one or two lines). On a win, a bill with time,
  freshness and throws; on a loss, a retry.
- **Progress** (the furthest course reached) is kept in localStorage. The title screen offers
  "continue". `?course=N` jumps straight to a course.
- No currencies, no unlocks beyond reaching the next course.

## 3. Architecture

```
src/
  sim/            pure TS, no three.js, no DOM. Fixed 120 Hz.
    constants.ts  frozen DEFAULTS (tuning) + geometry; INVENTED values flagged
    rng.ts        sfc32 + splitmix32 + hash (copied from the first game)
    courses.ts    course table 1-6 + endless scaling; plate shapes, props, diner ramps
    shape.ts      plate SDFs (rounded rect / ellipse), obstacle push-out, clamp
    sticks.ts     chopstick pose: tips, separation, hand; capsules for the throw test
    world.ts      World: player, eye, sticks (main + companion), marks, blobs, throws, events, step()
    throw.ts      ballistic arc + blocking test (shared by the throw and the "shot is on" read)
    bot.ts        headless strategies for tests (dodger, greedy, good) and screenshots
  game.ts         stages: title -> brief -> play -> finale/eaten -> cleared/failed
  input.ts        pointer (floating stick + tap) / keyboard / gamepad -> sim input
  render/         three.js; reads sim state, interpolates prev -> current
  audio/          procedural Web Audio (ambience, sfx, plucked-string music)
  ui/             DOM HUD + cards
  main.ts, debug.ts (?debug lil-gui), testhooks.ts (?test), haptics.ts
tests/            vitest: movement, stab hits, pickup, throw lane/blocking, guard, obstacles,
                  cover, companion, mound, sweeps, determinism, bots per course
scripts/          screenshots / filmstrip / perf / smoke / publish (Playwright, as in game 1)
```

Render space: sim `(x, y, z)` maps to render `(x, y, −z)`, so the camera looks down −z and +x is
screen right (the same convention as the first game).

## 4. Main risks

1. **Post-processing cost on phones.** DOF, bloom and the lens pass all run at full or half
   resolution. Mitigation: tiers. Low = DPR 1, no DOF gather (a pre-blurred backdrop only), no
   bloom, 512 shadow map. Auto-tiering from frame time.
2. **No GPU or phone here.** SwiftShader screenshots only. CPU frame cost is measurable;
   GPU cost isn't. Reported as such.
3. **Physical blocking could feel arbitrary.** Mitigation: the same function drives the
   "shot is on" read, so the player never has to guess. Bot tests check that clear windows
   exist on every course.
4. **Food can look gross up close** (rice grains as maggots, salmon as raw meat). Mitigation:
   review screenshots, keep proportions honest, keep warm light.
5. **Readability vs. shallow DOF.** Mitigation: focus always tracks the sushi. Marks and
   wasabi get saturated, unique hues that survive blur.
