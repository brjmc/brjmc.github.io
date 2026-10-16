// Headless players for tests, tuning and screenshots. They drive World.input exactly the way the
// real input layer does.

import { SIM_DT, makeTuning, type Tuning } from './constants';
import { courseCfg, type CourseCfg } from './courses';
import { ellipseR, sdRRect, inset } from './shape';
import { World, type Sticks } from './world';

export type Strategy = 'good' | 'human' | 'idle' | 'spam' | 'dodger';

/** Per-bot memory between steps. */
export interface BotMem {
  cool: number;
  /** human: marks this bot didn't notice */
  lapsed: WeakSet<object>;
  noticed: WeakSet<object>;
  /** human: a throw decided on, released after a reaction delay */
  throwIn: number;
  /** human: deterministic noise */
  r: number;
}

export function makeMem(seed = 1): BotMem {
  return { cool: 0, lapsed: new WeakSet(), noticed: new WeakSet(), throwIn: -1, r: seed >>> 0 || 1 };
}

function rand(mem: BotMem) {
  // xorshift32: the bot must not consume the world's rng
  let x = mem.r;
  x ^= x << 13;
  x ^= x >>> 17;
  x ^= x << 5;
  mem.r = x >>> 0;
  return mem.r / 4294967296;
}

// human model: how a reasonable first-time player plays
const REACT = 0.35; // s from seeing "shot on" to the throw leaving
const LOOK_AHEAD = 0.42; // s before a strike that they start to move (perfect bot: 0.85)
const LAPSE = 0.22; // chance to miss a mark entirely

/** Seconds until mark m lands. */
function strikeIn(s: Sticks, i: number): number {
  const m = s.marks[i];
  return s.phase === 'aim' ? s.timer + m.start + m.fireAt : m.start + m.fireAt - s.burst;
}

function segPointDist(ax: number, az: number, bx: number, bz: number, x: number, z: number) {
  const ex = bx - ax;
  const ez = bz - az;
  const ll = ex * ex + ez * ez || 1;
  const u = Math.max(0, Math.min(1, ((x - ax) * ex + (z - az) * ez) / ll));
  const cx = ax + ex * u;
  const cz = az + ez * u;
  return { d: Math.hypot(x - cx, z - cz), cx, cz, ex, ez };
}

/** Sets w.input for one step. `mem` carries per-bot state between steps. */
export function botStep(w: World, strat: Strategy, mem: BotMem = makeMem()) {
  const inp = w.input;
  inp.mx = 0;
  inp.mz = 0;
  if (strat === 'idle' || w.phase !== 'play') return;
  const human = strat === 'human';
  if (human && mem.throwIn >= 0) {
    mem.throwIn -= SIM_DT;
    if (mem.throwIn < 0) inp.throwQueued = true;
  }

  // 1. get out of the way of anything landing soon
  let fx = 0;
  let fz = 0;
  let threat = 0;
  for (const s of w.sticks) {
    if (s.phase === 'aim' || s.phase === 'stab') {
      for (let i = 0; i < s.marks.length; i++) {
        const m = s.marks[i];
        if (m.fired) continue;
        const tIn = strikeIn(s, i);
        // moving early only drags chasing marks after you: wait, then step aside
        if (tIn > (human ? LOOK_AHEAD : 0.55)) continue;
        if (human && !mem.noticed.has(m)) {
          mem.noticed.add(m);
          if (rand(mem) < LAPSE) mem.lapsed.add(m);
        }
        if (human && mem.lapsed.has(m)) continue;
        // feints jump to where you are: stay put until the jump, then move
        if (m.feint && !m.retargeted && tIn > 0.3) continue;
        const r = ellipseR(m.x, m.z, w.px, w.pz, w.tune.hitRX + 1.6, w.tune.hitRZ + 1.6);
        if (r < 1) {
          let dx = w.px - m.x;
          let dz = w.pz - m.z;
          const l = Math.hypot(dx, dz);
          if (l < 0.2) {
            dx = w.px < w.plate.cx ? 1 : -1;
            dz = 0;
          } else {
            dx /= l;
            dz /= l;
          }
          const k = (1 - r) * (1.2 - tIn);
          fx += dx * k;
          fz += dz * k;
          threat = Math.max(threat, k);
        }
      }
    }
    const sw = s.sweep;
    if (sw && (s.phase === 'aim' || s.phase === 'sweep') && (s.phase === 'sweep' || s.timer < 0.9)) {
      const q = segPointDist(sw.ax, sw.az, sw.bx, sw.bz, w.px, w.pz);
      if (q.d < w.tune.sweepHitR + 3.2) {
        // step off the line, perpendicular to it
        const el = Math.hypot(q.ex, q.ez) || 1;
        let nx = -q.ez / el;
        let nz = q.ex / el;
        if ((w.px - q.cx) * nx + (w.pz - q.cz) * nz < 0) {
          nx = -nx;
          nz = -nz;
        }
        fx += nx * 1.5;
        fz += nz * 1.5;
        threat = Math.max(threat, 1);
      }
    }
  }
  if (threat > 0) {
    // don't flee into the plate edge: blend toward the middle when close to it
    const edge = sdRRect(inset(w.walk, 1.5), w.px + fx, w.pz + fz);
    if (edge > 0) {
      fx += (w.plate.cx - w.px) * 0.15;
      fz += (w.plate.cz - w.pz) * 0.15;
    }
    const l = Math.hypot(fx, fz) || 1;
    inp.mx = fx / l;
    inp.mz = fz / l;
    if (strat !== 'dodger' && w.carry && strat === 'spam') inp.throwQueued = true;
    return;
  }
  if (strat === 'dodger') return;

  // 2. no wasabi: go and get some
  if (!w.carry) {
    let best: { x: number; z: number } | null = null;
    let bd = Infinity;
    for (const b of w.blobs) {
      const d = Math.hypot(b.x - w.px, b.z - w.pz);
      if (d < bd) {
        bd = d;
        best = b;
      }
    }
    for (const m of w.mounds) {
      if (m.charge < 1) continue;
      const d = Math.hypot(m.x - w.px, m.z - w.pz) - 3;
      if (d < bd) {
        bd = d;
        best = m;
      }
    }
    if (best) steer(w, best.x, best.z);
    return;
  }

  // 3. armed: throw if the shot is on, otherwise line up with his eye
  if (strat === 'spam') {
    inp.throwQueued = true;
    return;
  }
  mem.cool -= SIM_DT;
  const p = w.predict();
  if (p.outcome === 'hit' && mem.cool <= 0 && mem.throwIn < 0) {
    if (human) mem.throwIn = REACT;
    else inp.throwQueued = true;
    mem.cool = 0.5;
    return;
  }
  const off = w.eyeX - w.px;
  if (Math.abs(off) > w.tune.laneHalf * 0.5) {
    inp.mx = Math.max(-1, Math.min(1, off / 3));
  }
}

function steer(w: World, x: number, z: number) {
  const dx = x - w.px;
  const dz = z - w.pz;
  const l = Math.hypot(dx, dz);
  if (l < 0.3) return;
  const s = Math.min(1, l / 2);
  w.input.mx = (dx / l) * s;
  w.input.mz = (dz / l) * s;
}

export interface BotResult {
  course: number;
  seed: number;
  won: boolean;
  eaten: boolean;
  time: number;
  hp: number;
  hits: number;
  throws: number;
  clips: number;
  wides: number;
  pickups: number;
}

export function runBot(
  course: number | CourseCfg,
  seed: number,
  strat: Strategy,
  maxT = 150,
  tune: Tuning = makeTuning(),
  onStep?: (w: World) => void,
): BotResult {
  const cfg = typeof course === 'number' ? courseCfg(course) : course;
  const w = new World(cfg, seed, tune);
  const mem = makeMem(seed * 2654435761);
  const n = Math.round(maxT / SIM_DT);
  for (let i = 0; i < n && w.phase === 'play'; i++) {
    botStep(w, strat, mem);
    w.step(SIM_DT);
    onStep?.(w);
    w.events.length = 0;
  }
  return {
    course: cfg.n,
    seed,
    won: w.phase === 'won',
    eaten: w.phase === 'eaten',
    time: w.stats.time,
    hp: w.hp,
    hits: w.hits,
    throws: w.stats.throws,
    clips: w.stats.clips,
    wides: w.stats.wides,
    pickups: w.stats.pickups,
  };
}
