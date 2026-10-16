# NOTES: what was tried, kept and rejected

Screenshots for each pass are in `screenshots/<pass>/`. Perf numbers come from `npm run perf`:
Chromium with a 4× CPU throttle at 390×844 @2×. This machine has no GPU (SwiftShader), so only the
CPU-side cost (sim + render submission) means anything. Balance numbers come from
`PROBE=1 npx vitest run tests/probe.test.ts --silent=false`.

## 0. Sim, courses, bots

- Kept: a pure-TS sim at 120 Hz in centimetres, with the diner's eye in the sim, because "in the
  lane" is a sim fact: `|x − eyeX| < lane`. The render camera adds breathing, tremor and shake
  on top.
- **Bug:** a finished throw was kept for 0.3 s so the renderer could carry wide throws past the
  camera, and it was resolved again on every step. One throw won a course. Fixed with a `done`
  guard.
- **Design finding (fixed):** the prototype's lane is almost free. With the first numbers
  (lane 2.6 cm, sway 1.8 cm), a bot that throws the instant it picks up landed about 75 % of
  throws, and nothing in the game punished not looking. The lane is now 2.0 cm and sway is
  2.2–3.6 cm, plus more per hit. A blind thrower now misses more than half the time on later
  courses, and "shot is on" goes from about 79 % of carrying time on course 1 down to about
  42 % on course 6.
- **Design finding (fixed):** the attack cycle was too slow to threaten a careful player, and
  every course took about 15 s. Added two things:
  - **chase:** marks waiting their turn in a volley keep following you;
  - a **fumble chance:** some attempts end without a drop, so wasabi is scarcer.

  Both are per-course `Stage` values (`chase: 0` and `fumble: 1` reproduce the prototype).
- **Design finding (fixed):** the first version of the guard (tips shut on your line *while
  you're armed*) did nothing against a thrower who picks up and throws in the same instant. The
  tips were already resting open on your line and only had to close. Now a guarding diner keeps
  them shut on your line whenever he is between attempts, so the only reliable window is while
  he commits to a strike. A careless thrower's clips on course 3 went from 0.8 to 3.5 per
  course.
- **Design finding (kept):** against chasing marks, dodging early is worse than dodging late,
  because moving early drags the marks after you. The careful bot was beaten by the "human" bot
  until it was made to wait (0.85 s → 0.55 s look-ahead). This reads as the intended skill:
  wait, then step aside.
- The course 6 gate is 13/16 seeds for the careful bot (courses 1–4: 15/16, course 5: 14/16).
  The last course is meant to cost even perfect play occasionally.
- Rejected: three strategies for estimating difficulty. "good" (perfect information) is too
  optimistic, and "spam" (throw on pickup) is a floor. "human" (0.35 s reaction, 0.42 s
  look-ahead, 22 % chance to miss a mark) is the one the tuning targets.

Final probe, 30–40 seeds:

| Course | human wins | human freshness left | spam wins | shot is on (human, while carrying) |
|---|---|---|---|---|
| 1 | 100 % | 4.2 | 100 % | 78 % |
| 2 | 98–100 % | 3.9 | 85 % | 52 % |
| 3 | 98–100 % | 3.6 | 93 % | 49 % |
| 4 | 93–95 % | 3.3 | 100 % | 55 % |
| 5 | 100 % | 4.1 | 83 % | 59 % |
| 6 | 95–100 % | 2.5 | 30 % | 41 % |

Real players will do worse than the "human" bot: they have to read depth in perspective,
through depth of field and a smeared lens. That gap is deliberate and unmeasured.

## 1. Environment

- Kept:
  - a procedural PMREM room (a pendant, lanterns, the neta-case strip) for reflections and
    fill;
  - one warm spot over the plate with a 1024 PCF shadow map, because its shadows of the tips
    are part of the telegraph;
  - plates built from a rounded-rect outline swept along a profile, with `aProf` driving the
    sometsuke brushwork;
  - wood, glaze and slate shaders injected into three's PBR materials (`render/util.ts:inject`).
- **Bug:** the outline sampler bailed out of the corner arcs early (a `len === last` test
  meant to clamp the final segment), so plates came out folded. **Bug:** the plate floor's
  triangle fan was wound backwards and faced the table.
- **The rice face was muddy:** a front-facing surface lit only from straight above gets almost
  nothing. Added a soft frontal fill (the room behind the diner bouncing back). Food photography
  does the same thing with a reflector.
- The first framing had the sushi at about 13 % of the screen width. The field of view now fits
  62 % (portrait) / 74 % (landscape) of the plate width. The eye follows you anyway.

## 2. Characters

- Kept:
  - a superellipsoid rice core with 300 instanced grains placed Poisson-style on its visible
    surface (sparser and flatter where the face is);
  - a salmon slab with a bias cut, drape and twist, diagonal waving fat lines, and a
    grazing-angle emissive term for the light that gets through the flesh;
  - a face of real geometry (glossy black eyes that pick up the room's lights, white sclera when
    scared, rice-grain brows, a mouth that changes shape);
  - pupils that track the nearest tips.
- Chopsticks: one tapered 8-sided shaft per stick, with a material per diner (lacquer with gold
  fleck, black, hinoki, gold, steel-tipped moribashi, waribashi) and grooved, rougher tips.
- Rejected: gari as sphere caps (pink blobs). It is now twelve thin, curled, irregular slices,
  merged into one mesh. The daikon heap started at 420 strands and read as straw; it is now 1,700
  brighter, glossier strands.

## 3. Post and lens

- **DOF ghosting:** 32 taps over a 15 px radius left visible copies of every edge. Fixed with:
  - a per-pixel rotated spiral (interleaved gradient noise);
  - a post-filter whose radius follows the CoC;
  - for the largest blurs, a crossfade into the blur pyramid, which is smooth and costs nothing
    extra.
- **Horizontal smear in landscape** was the chromatic fringe, which scaled with the aspect
  ratio. It is now normalised to the short side.
- **The first wasabi splat looked like a sticker.** Something 1.6 cm from the eye is badly out
  of focus. It is now a soft smear:
  - lime and translucent where thin (backlit, refracting the blurred room);
  - dark and opaque where thick;
  - a broad wet glint;
  - drips that creep for about 2.6 s.
- **Then it covered the sushi in portrait:** the splat is now sized against the screen's short
  side and lands off to one side, high. It is meant to get in the way, not end the game.
- **Tears read as dark drops:** the refraction offset was large enough to pull dark pixels in.
  It is now small, with a glint and a slight lift.
- The background had nothing for the DOF to turn into bokeh, because the lanterns hung above the
  frame. Added bulbs over the neta case and bright points beyond the counter, all in one
  instanced draw. The first ones blew out to white and were pulled down and warmed.
- Each diner's glasses are an SDF in the composite. Outside the lens is the naked eye (heavy
  blur). The half-moon readers put the top third of the screen there.

## 4. Feedback

- Kept:
  - grains knocked off on a hit; they bounce and stay on the plate for the rest of the course;
  - dust puffs where a strike lands;
  - green motes on pickup;
  - a burst of bits when a throw clips a stick;
  - steam from the teacup;
  - corner brackets around the sushi while you're armed: green = the shot is on, red = the tips
    are in the way, white with an arrow = off the lane, move this way;
  - hit-stop: 90 ms on a hit, 70 ms when you're hurt.
- Endings, as render-only overrides on the frozen sim:
  - **Eaten**, with the prototype's beats: the tips close, lift, bring you to the mouth with a
    rack focus that follows, then a chomp.
  - **Finale:** the eye squeezes nearly shut, with red light through the lids, leaving a slit
    where the sushi celebrates. Tears run, and the chopsticks drop and bounce.
- **Bug:** the card guard used game time. At very low frame rates, `dt` is clamped and taps
  were swallowed. It uses wall time now.
- Eyelids were curved by screen x, so in landscape a blink looked like an oval mask. The curve
  is now normalised to the short side and much softer.
- **Close focus:** at 8 cm, the dead zone that keeps the plate sharp was far too thin to hold
  the sushi. The dead zone now scales with 1/focus.

- Between attempts the tips rested 42 % of the way along your throw arc toward his eye. That's
  about 13 cm from the camera, so two huge blurred red bars crossed the frame most of the time.
  They now rest at 12 %, a few centimetres in front of and above the sushi, where they frame it.
  The guard still works anywhere on the arc, and balance didn't move.
- Blinks glowed red, as if lit through the lids. That's only right for the finale's long
  squeeze. An ordinary blink is now dark.

## 5. Audio

All procedural, starting on the first touch:

- **Room:** crowd murmur (four formant bands of noise, slowly modulated at syllable rate),
  dish clinks (inharmonic partials), distant laughter, kitchen hiss.
- **Music:** koto/shamisen plucks from Karplus-Strong buffers on the miyako-bushi scale, with
  a small bend into each note. Phrases come more often while he's attacking. Wins and losses
  get a flourish.
- **Him:** a pained vowel from formant synthesis (sawtooth through three bandpasses sliding
  from "a" toward "u", with vibrato and breath), a taiko hit under it.
- **Foley:** chopstick taps and clacks, a ceramic "tok", a squelch on pickup, a whoosh on a
  throw, a scrape for sweeps, a crunch for the end.
- A heartbeat when freshness is 2 or less.

Not verified by ear (no audio output here). `npm run smoke` confirms the graph builds and the
toggles work without errors.

## Final: where the frame budget goes

| | Course 4 (two pairs) | Course 6 (heaviest plate) |
|---|---|---|
| Whole CPU frame, 4× throttle, median / p90 | 13.2 / 23.4 ms | 11.9 / 21.1 ms |
| Draw calls (scene + post) | 100 → 80 after merges | 80 |
| Triangles | 64k | 126k (the daikon heap is 1,700 strands) |

- **CPU:** about 3 ms unthrottled.
  - Most of it is three.js submitting about 80 draws, the shadow pass and about 12
    full-screen passes.
  - The sim is under 0.2 ms.
  - A CPU profile here is useless: SwiftShader compiles shaders in its GPU process and the
    renderer thread just waits.
- **GPU is the unmeasured risk.** The expensive parts:
  - the composite (about 25 fetches at full resolution);
  - the DOF gather (40 taps at half resolution on high, 24 on mid, none on low);
  - MSAA on the HDR scene target;
  - the physical materials (clearcoat + sheen) on the food.
- **Tiers:**

  | Tier | DPR | DOF | Bloom | AA | Shadow map |
  |---|---|---|---|---|---|
  | low | 1 | pyramid-only blur | no | FXAA | 512 |
  | mid | 1.5 | 24 taps | yes | MSAA 4 | 1024 |
  | high | 2 | 40 taps | yes | MSAA 4 | 1024 |

  Auto-tiering is the same as the first game: drop a tier when a 2 s window averages over
  21 ms; raise once after 6 s under 13.5 ms.
