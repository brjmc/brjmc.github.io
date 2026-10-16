# Brief: "The Last Piece" (rebuild)

## The request, verbatim

> OK, that turned out Pretty pretty good. Here's another HTML demo. Please give it the same
> treatment and add it to the webpage. We're looking for a game with the same mechanics, but
> more polished gameplay, better level design, more impressive visuals, and overall something
> that is just a better demonstration of your technical ability. You have my permission to
> merge whatever you do to main or master or whatever the trunk branch is called.

The prototype is `reference/the-last-piece.html`: a 320×200 pixel canvas, one encounter, keyboard
plus an on-screen d-pad.

## What "the same treatment" means here

These points come from the brief for the first game (`_src/second-person/reference/BRIEF.md`).
Where the request above conflicts with that brief, the request wins. It asks for better level
design, so this time the levels are allowed to change, but the core verbs must stay.

- Stack: Vite + TypeScript + three.js, versions pinned, static build, no runtime network requests,
  no asset files. Art and audio are procedural.
- The simulation is pure TypeScript with no three.js and no DOM, running at a fixed timestep,
  with a seedable RNG. The renderer interpolates between sim states.
- Mobile first: full screen, safe-area insets, no scrolling, zooming or text selection. Portrait
  is the primary orientation and landscape must also work.
- Performance: 60 fps on a mid-range phone, with quality tiers picked automatically from
  measured frame time.
- `?debug`: fps, frame time and draw calls, plus a lil-gui panel that edits a copy of the
  shipped defaults.
- Process:
  - write `PLAN.md` and `ART_DIRECTION.md` before render code;
  - port the sim first with tests and a headless bot;
  - do the visual passes one layer at a time, reviewing Playwright screenshots at 390×844 and
    844×390 after each;
  - keep `NOTES.md` of what was tried and rejected;
  - check frame time after each visual pass.
- Done means: `npm run dev -- --host` works on a phone, `npm run build` produces `dist/`, all tests
  pass, final screenshots are saved, and there is a short summary.
- Publish: the build goes in the site repo under its own path (`/the-last-piece/`), with source
  under `_src/` (Jekyll skips it). Merging to `main` is pre-approved.

## Mechanics to keep (from the prototype)

1. You are the sushi. You move freely on the plate, with acceleration and friction, and the
   plate's edge clamps you.
2. The camera is the diner's eye behind his glasses. He leans to keep you in the middle of
   the lens and overshoots.
3. The chopsticks run an attempt cycle: hover, line up (marks that track you), a sequence of
   stabs, then a fumble that drops a dab of wasabi on the plate.
4. Telegraph: two tip shadows slide together where a stab will land.
5. Pick wasabi up by touching it. You carry one at a time, and blobs expire.
6. Throw: the throw counts only if you are in the lane (lined up with his eye) and the tips
   are not shut in the way at the moment you let go.
7. A hit puts a wasabi splat on the lens that stays for the rest of the course, plus tears,
   a sting, a recoil, and more frequent blinking. Each hit also makes him harder (shorter aim
   time, more stabs, faster tracking).
8. Freshness is 5. A stab that lands costs 1, gives brief invulnerability and knockback, and
   makes you drop what you carry. At 0 you are eaten: lifted and brought to the mouth.
9. Three hits win (the eye squeezes shut, "CHECK, PLEASE"). Losing shows "ITADAKIMASU".

## What the request asks to improve

- Gameplay polish: phone controls that feel good, readable telegraphs, a clear "shot is
  on" read, juice.
- Level design: more than one encounter, with a difficulty curve, each level teaching or
  twisting one idea.
- Visuals: a real 3D renderer, more impressive than the first game.
- An overall better demonstration of technical ability.
