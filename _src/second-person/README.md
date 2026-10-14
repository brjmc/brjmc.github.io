# Second Person: the walk home

Mobile-first web game. Vite + TypeScript + three.js. Everything (art, sound) is procedural:
no runtime network requests, no asset files.

- Live path on the site: `/second-person/` (built output, committed in the repo root's
  `second-person/` folder). This folder (`_src/`) is skipped by Jekyll, so none of the source
  or docs below are published.
- Brief: `reference/BRIEF.md`. Prototype: `reference/second-person-street.html`.
- Docs: `PLAN.md` (architecture), `ART_DIRECTION.md`, `NOTES.md` (what was tried and rejected,
  with perf numbers), screenshots in `screenshots/`.

## Commands

```sh
npm install
npm run dev -- --host     # play on a phone over the local network
npm test                  # unit tests + 24-seed level 1 bot
npm run build             # typecheck + static build into dist/
npm run publish:site      # build, then copy dist/ into ../../second-person/ (what GitHub Pages serves)

npm run shots -- <label> [--states]   # Playwright screenshots, 390x844 + 844x390
npm run filmstrip -- <walk|chaser|crowd|shove|bump|caught|hit> out.png
npm run perf -- [tier] [level] [walkSeconds]   # 4x CPU throttle; CPU-side ms, draw calls
npm run smoke             # real-browser run: touch to start, walk, mute, restart
PROBE=1 npx vitest run tests/probe.test.ts --silent=false   # scripted strategies per level
```

`shots`, `filmstrip`, `perf` and `smoke` need a Chromium that Playwright can launch
(`npx playwright install chromium` on a fresh machine).

## URL parameters

- `?debug`: fps, frame time, CPU time, draw calls, triangles, quality tier, plus a lil-gui panel for
  live tuning. The panel edits a copy of the frozen defaults in `src/sim/constants.ts`.
- `?level=N`, `?seed=N`: start on a level, with a fixed crowd and traffic seed.
- `?q=0|1|2`: force a quality tier (low/mid/high). Otherwise it is chosen from frame time.
- `?greybox`: the sim-parity greybox renderer.
- `?test`: exposes `window.__sp` for the Playwright scripts.

## Layout

```
src/sim/      pure TS simulation (no three.js, no DOM), fixed 120 Hz
src/render/   three.js renderer, shaders, post pass, quality tiers
src/audio/    procedural Web Audio
src/ui/       DOM HUD
src/game.ts   level flow: briefing -> play -> dying/clearing -> card
```
