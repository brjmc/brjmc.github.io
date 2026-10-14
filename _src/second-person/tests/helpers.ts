import { SIM_DT } from '../src/sim/constants';
import { levelCfg, type LevelCfg } from '../src/sim/levels';
import { makeView } from '../src/sim/projection';
import { lensPoint, screenAt } from '../src/sim/bot';
import { World, type SimEvent } from '../src/sim/world';

/** An empty street: no crowd, no traffic, chaser parked far behind. */
export function emptyWorld(over: Partial<LevelCfg> = {}): World {
  const cfg = { ...levelCfg(1), crowd: 0, jams: [], traffic: { kind: 'none' as const }, ...over };
  const w = new World(cfg, 1, undefined, makeView(390, 844));
  w.chaser.z = w.chaser.pz = 1e4;
  return w;
}

export function holdTowardLens(w: World) {
  const pt = lensPoint(w.view);
  w.pointerDown(pt.x, pt.y);
}

export function touchSelf(w: World) {
  const s = screenAt(w, w.player.x, w.player.z);
  w.pointerDown(s.x, s.y);
}

export function steps(w: World, seconds: number, onEvent?: (e: SimEvent) => void) {
  const n = Math.round(seconds / SIM_DT);
  const ev: SimEvent[] = [];
  for (let i = 0; i < n; i++) {
    w.step(SIM_DT);
    ev.length = 0;
    w.drainEvents(ev);
    if (onEvent) for (const e of ev) onEvent(e);
  }
}

/** Step until a predicate holds; returns elapsed seconds or -1. */
export function stepUntil(w: World, pred: (e: SimEvent[]) => boolean, maxSeconds = 10): number {
  const ev: SimEvent[] = [];
  const t0 = w.time;
  while (w.time - t0 < maxSeconds) {
    w.step(SIM_DT);
    ev.length = 0;
    w.drainEvents(ev);
    if (pred(ev)) return w.time - t0;
  }
  return -1;
}
