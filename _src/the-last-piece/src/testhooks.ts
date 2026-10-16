// window.__lp: hooks for Playwright screenshots and perf runs (?test or ?debug only).

import type { Game, Stage } from './game';
import type { Renderer } from './render/renderer';
import { botStep, makeMem, type Strategy } from './sim/bot';
import { SIM_DT } from './sim/constants';

export interface TestHooks {
  game: Game;
  renderer: Renderer;
  load(course: number, seed: number, stage?: Stage): void;
  /** Step the sim synchronously with a scripted player. */
  play(seconds: number, strat?: Strategy): void;
  /** Step until a predicate holds (or `max` seconds), with a scripted player. */
  until(pred: string, max: number, strat?: Strategy): boolean;
  pause(p: boolean): void;
  step(n: number): void;
  frames: number;
}

declare global {
  interface Window {
    __lp?: TestHooks;
  }
}

export function runTestHooks(game: Game, renderer: Renderer) {
  let mem = makeMem(3);
  const hooks: TestHooks = {
    game,
    renderer,
    frames: 0,
    load(course, seed, stage = 'play') {
      game.fixedSeed = seed;
      game.load(course, stage, seed);
      mem = makeMem(seed);
    },
    play(seconds, strat = 'human') {
      const w = game.world;
      const n = Math.round(seconds / SIM_DT);
      for (let i = 0; i < n && w.phase === 'play'; i++) {
        botStep(w, strat, mem);
        w.step(SIM_DT);
        game.events.push(...w.events);
        w.events.length = 0;
      }
      w.input.mx = w.input.mz = 0;
    },
    until(pred, max, strat = 'human') {
      const w = game.world;
      const f = new Function('w', 'g', `return (${pred});`) as (w: unknown, g: Game) => boolean;
      const n = Math.round(max / SIM_DT);
      for (let i = 0; i < n && w.phase === 'play'; i++) {
        if (f(w, game)) return true;
        botStep(w, strat, mem);
        w.step(SIM_DT);
        game.events.push(...w.events);
        w.events.length = 0;
      }
      return f(w, game);
    },
    pause(p) {
      game.paused = p;
    },
    step(n) {
      for (let i = 0; i < n; i++) game.world.step(SIM_DT);
    },
  };
  window.__lp = hooks;
  const tick = () => {
    hooks.frames++;
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}
