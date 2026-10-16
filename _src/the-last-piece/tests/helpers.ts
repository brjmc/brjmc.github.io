import { SIM_DT, makeTuning } from '../src/sim/constants';
import { courseCfg, type CourseCfg } from '../src/sim/courses';
import { World } from '../src/sim/world';

export function world(course: number | CourseCfg = 1, seed = 1, edit?: (c: CourseCfg) => CourseCfg) {
  // always a copy: tests may tweak the diner, and the course table is shared
  let cfg = structuredClone(typeof course === 'number' ? courseCfg(course) : course);
  if (edit) cfg = edit(cfg);
  return new World(cfg, seed, makeTuning());
}

/** Step for `sec` seconds with a fixed input; returns all events. */
export function run(w: World, sec: number, mx = 0, mz = 0) {
  const all: World['events'] = [];
  const n = Math.round(sec / SIM_DT);
  for (let i = 0; i < n; i++) {
    w.input.mx = mx;
    w.input.mz = mz;
    w.step(SIM_DT);
    all.push(...w.events);
    w.events.length = 0;
  }
  return all;
}

/** Keep the main chopsticks idle (no attempts) so a test can look at one thing. */
export function hold(w: World) {
  w.main.phase = 'idle';
  w.main.timer = 1e9;
  if (w.comp) {
    w.comp.phase = 'idle';
    w.comp.timer = 1e9;
  }
}

/** Freeze the diner's lean exactly on x (no wander, no spring). */
export function pinEye(w: World, x: number) {
  const l = w.course.diner.lean;
  l.amp = 0;
  l.ampPerHit = 0;
  w.eyeX = x;
  w.eyeV = 0;
}
