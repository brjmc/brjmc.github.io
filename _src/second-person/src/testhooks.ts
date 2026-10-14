// window.__sp: hooks for Playwright screenshots and perf runs (?test or ?debug only).

import type { Game, Stage } from './game';
import type { Renderer } from './render/renderer';
import { lensPoint } from './sim/bot';
import { project } from './sim/projection';
import { SIM_DT } from './sim/constants';

export interface TestHooks {
  game: Game;
  renderer: Renderer | null;
  load(level: number, seed: number, stage?: Stage): void;
  /** Hold the pointer toward the lens and step the sim synchronously. */
  walk(seconds: number): void;
  /** Step until a car is between `near` and `far` metres in front of the camera, up to `max` seconds. */
  walkUntilCar(near: number, far: number, max: number): boolean;
  pause(p: boolean): void;
  /** Screen position of a sim point (CSS px). */
  project(x: number, y: number, z: number): { x: number; y: number };
  /** Step the sim by n fixed steps without the game loop. */
  step(n: number): void;
  frames: number;
}

declare global {
  interface Window {
    __sp?: TestHooks;
  }
}

export function runTestHooks(game: Game, renderer: Renderer | null) {
  const hooks: TestHooks = {
    game,
    renderer,
    frames: 0,
    load(level, seed, stage = 'play') {
      game.fixedSeed = seed;
      game.load(level, stage, seed);
    },
    walk(seconds) {
      const w = game.world;
      const pt = lensPoint(w.view);
      if (!w.pointerHeld) w.pointerDown(pt.x, pt.y);
      const n = Math.round(seconds / SIM_DT);
      for (let i = 0; i < n && w.phase === 'play'; i++) w.step(SIM_DT);
      w.pointerUp();
      w.step(SIM_DT);
    },
    walkUntilCar(near, far, max) {
      const w = game.world;
      const pt = lensPoint(w.view);
      w.pointerDown(pt.x, pt.y);
      const n = Math.round(max / SIM_DT);
      let found = false;
      for (let i = 0; i < n && w.phase === 'play'; i++) {
        w.step(SIM_DT);
        const near1 = w.cars.filter((c) => c.z - w.cam.z > near && c.z - w.cam.z < far).length;
        if (near1 >= 2) {
          found = true;
          break;
        }
      }
      w.pointerUp();
      w.step(SIM_DT);
      return found;
    },
    pause(p) {
      game.paused = p;
    },
    project(x, y, z) {
      const w = game.world;
      const r = project(w.view, w.cam, x, y, z);
      return { x: r.sx, y: r.sy };
    },
    step(n) {
      for (let i = 0; i < n; i++) game.world.step(SIM_DT);
    },
  };
  window.__sp = hooks;
  const tick = () => {
    hooks.frames++;
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}
