# The Last Piece

Mobile-first web game. Vite + TypeScript + three.js. Everything, art and sound, is procedural:
no runtime network requests, no asset files.

You are the last piece of salmon nigiri on the plate, and the camera is the diner's eye behind his
glasses. Dodge his chopsticks, pick up the wasabi he fumbles, and throw it into his eye from the
lane. Six courses (six diners, six pairs of glasses, six plates), then endless seconds.

- Live path on the site: `/the-last-piece/`. That's the built output, committed in the repo
  root's `the-last-piece/` folder. Jekyll skips this `_src/` folder, so none of the source or
  docs below are published.
- Brief: `reference/BRIEF.md`. Prototype: `reference/the-last-piece.html`.
- Docs: `PLAN.md` (design and architecture), `ART_DIRECTION.md`, `NOTES.md` (what was tried and
  rejected, balance and perf numbers). Screenshots are in `screenshots/`.

## Controls

- **Touch:** drag anywhere to move (a floating stick). Tap, tap the throw button, or put a
  second finger down to throw.
- **Keyboard:** WASD / arrows to move. Space, J or K throws. M toggles sound, R restarts.
- **Gamepad:** left stick, A to throw.

## Commands

```sh
npm install
npm run dev -- --host     # play on a phone over the local network
npm test                  # mechanics, course table, bots on every course, determinism
npm run build             # typecheck + static build into dist/
npm run publish:site      # build, then copy dist/ into ../../the-last-piece/ (what GitHub Pages serves)

npm run shots -- <label> [--states] [--courses] [--only a,b] [--q 0|1|2]   # 390x844 + 844x390
npm run perf -- [tier] [course] [seconds]   # 4x CPU throttle; CPU-side ms, draw calls
npm run smoke             # real browser: title, brief, drag, throw, sound, restart, a bot to the bill
node scripts/views.mjs 1 2 3 4               # post-stack debug views (CoC, DOF, blur, heavy blur)
PROBE=1 npx vitest run tests/probe.test.ts --silent=false   # bot strategies x courses
```

`shots`, `perf`, `smoke` and `views` need a Chromium that Playwright can launch.

## URL parameters

- `?debug`: fps, frame time, CPU time, draw calls, triangles, tier, lane offset and the
  predicted throw outcome, plus a lil-gui panel for live tuning. The panel edits a copy of the
  frozen defaults in `src/sim/constants.ts`.
- `?course=N`, `?seed=N`: start on a course, with a fixed seed.
- `?q=0|1|2`: force a quality tier (low/mid/high). Otherwise it is chosen from frame time.
- `?view=1..4`: post-stack debug views.
- `?test`: exposes `window.__lp` for the Playwright scripts.

## Layout

```
src/sim/      pure TS simulation (no three.js, no DOM), fixed 120 Hz, centimetres
src/render/   three.js scene, procedural materials, post stack (DOF, bloom, lens), FX, endings
src/audio/    procedural Web Audio
src/ui/       DOM HUD, cards, cues
src/game.ts   course flow: title -> brief -> play -> finale | eaten -> bill | retry
src/input.ts  touch stick + tap, keyboard, gamepad
```
