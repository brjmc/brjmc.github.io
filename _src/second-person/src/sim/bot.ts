// Headless helpers: run a level with a scripted pointer. Used by tests and screenshots.

import { SIM_DT, type Tuning } from './constants';
import { levelCfg } from './levels';
import { makeView, project, type View } from './projection';
import { World, type SimEvent } from './world';

export interface BotResult {
  outcome: 'cleared' | 'car' | 'caught' | 'timeout';
  time: number;
  minGap: number;
  bumps: [number, number, number];
}

/** Screen point that steers straight toward the lens: bottom centre of the view. */
export function lensPoint(v: View): { x: number; y: number } {
  return { x: v.W / 2, y: v.H * 0.93 };
}

/** Hold one screen point from the first frame and never let go. */
export function runSteadyBot(level: number, seed: number, opts: { maxTime?: number; view?: View; tune?: Tuning } = {}): BotResult {
  const view = opts.view ?? makeView(390, 844);
  const w = new World(levelCfg(level), seed, opts.tune, view);
  const pt = lensPoint(view);
  w.pointerDown(pt.x, pt.y);
  const maxTime = opts.maxTime ?? 240;
  let minGap = Infinity;
  const bumps: [number, number, number] = [0, 0, 0];
  const ev: SimEvent[] = [];
  while (w.phase === 'play' && w.time < maxTime) {
    w.step(SIM_DT);
    minGap = Math.min(minGap, w.chaserGap);
    ev.length = 0;
    for (const e of w.drainEvents(ev)) if (e.t === 'bump') bumps[e.tier]++;
  }
  const outcome = w.phase === 'cleared' ? 'cleared' : w.phase === 'dead' ? (w.deathCause ?? 'car') : 'timeout';
  return { outcome, time: w.time, minGap, bumps };
}

/** Screen point over a ground position. */
export function screenAt(w: World, x: number, z: number): { x: number; y: number } {
  const pr = project(w.view, w.cam, x, 0, z);
  return { x: pr.sx, y: pr.sy };
}

export type Strategy = 'steady' | 'median' | 'shover' | 'nearlane';

/** Scripted players used to check that levels are beatable. Not part of the game. */
export function runStrategy(level: number, seed: number, strategy: Strategy, maxTime = 240): BotResult {
  const view = makeView(390, 844);
  const w = new World(levelCfg(level), seed, undefined, view);
  let minGap = Infinity;
  const bumps: [number, number, number] = [0, 0, 0];
  const ev: SimEvent[] = [];
  let held = false;
  let chargeUntil = -1;
  while (w.phase === 'play' && w.time < maxTime) {
    const p = w.player;
    let tx = p.x;
    if (strategy === 'median') tx = 5.0; // centre line: out of both lanes' hit boxes
    else if (strategy === 'nearlane') tx = 1.0; // gutter: inside the road, outside the near lane's hit box
    else tx = -3.5;
    if (strategy === 'shover' && p.mode === 'free' && p.cooldown <= 0 && p.slowT > 0 && p.slowTier === 0 && chargeUntil < 0) {
      // brace on yourself, then release toward the lens
      if (held) w.pointerUp();
      const s = screenAt(w, p.x, p.z);
      w.pointerDown(s.x, s.y);
      held = true;
      chargeUntil = w.time + 0.5;
    }
    if (chargeUntil >= 0) {
      const s = screenAt(w, p.x, p.z - 5);
      w.pointerMove(s.x, s.y);
      if (w.time >= chargeUntil) {
        w.pointerUp(s.x, s.y);
        held = false;
        chargeUntil = -1;
      }
    } else if (p.mode !== 'dash') {
      const s = screenAt(w, tx, p.z - 5);
      if (!held) {
        w.pointerDown(s.x, s.y);
        held = true;
      } else w.pointerMove(s.x, s.y);
    }
    w.step(SIM_DT);
    minGap = Math.min(minGap, w.chaserGap);
    ev.length = 0;
    for (const e of w.drainEvents(ev)) if (e.t === 'bump') bumps[e.tier]++;
  }
  const outcome = w.phase === 'cleared' ? 'cleared' : w.phase === 'dead' ? (w.deathCause ?? 'car') : 'timeout';
  return { outcome, time: w.time, minGap, bumps };
}
