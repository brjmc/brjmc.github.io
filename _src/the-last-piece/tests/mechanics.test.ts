import { describe, expect, it } from 'vitest';
import { SIM_DT } from '../src/sim/constants';
import { sdRRect } from '../src/sim/shape';
import { hold, pinEye, run, world } from './helpers';

describe('movement', () => {
  it('reaches max speed and stops under friction', () => {
    const w = world(1);
    hold(w);
    run(w, 0.6, 1, 0);
    expect(Math.hypot(w.vx, w.vz)).toBeCloseTo(w.tune.maxSpeed, 1);
    run(w, 0.6, 0, 0);
    expect(Math.hypot(w.vx, w.vz)).toBeLessThan(0.1);
  });

  it('never leaves the walkable part of the plate', () => {
    const w = world(2);
    hold(w);
    for (const [mx, mz] of [[1, 0], [0, 1], [-1, 0], [0, -1], [0.7, 0.7], [-0.7, -0.7]]) {
      run(w, 3, mx, mz);
      expect(sdRRect(w.walk, w.px, w.pz)).toBeLessThan(0.01);
    }
  });

  it('walks round the soy dish, not through it', () => {
    const w = world(2);
    hold(w);
    const dish = w.walls[0];
    w.px = dish.x - 6;
    w.pz = dish.z;
    run(w, 2, 1, 0);
    expect(Math.hypot(w.px - dish.x, w.pz - dish.z)).toBeGreaterThanOrEqual(dish.r + w.tune.bodyR - 0.01);
  });

  it('soy slows you down', () => {
    const w = world(2);
    hold(w);
    const p = w.puddles[0];
    w.px = p.x;
    w.pz = p.z;
    run(w, 0.15, 1, 0);
    expect(w.inSoy).toBe(true);
    expect(Math.hypot(w.vx, w.vz)).toBeLessThanOrEqual(w.tune.maxSpeed * w.tune.soySlow + 1e-6);
  });
});

describe('daikon cover', () => {
  it('hides you: marks stop tracking and his lean holds the last place he saw you', () => {
    const w = world(3);
    const d = w.daikon[0];
    w.px = d.x;
    w.pz = d.z;
    run(w, 0.05);
    expect(w.hidden).toBe(true);
    const seen = [w.seenX, w.seenZ];
    // force an attempt and watch the marks
    w.main.timer = 0;
    run(w, 0.05);
    expect(w.main.phase).toBe('aim');
    const before = w.main.marks.map((m) => [m.x, m.z]);
    run(w, 0.3);
    expect(w.main.marks.map((m) => [m.x, m.z])).toEqual(before);
    expect([w.seenX, w.seenZ]).toEqual(seen);
  });
});

describe('wasabi', () => {
  it('is picked up by touching it, one at a time', () => {
    const w = world(1);
    hold(w);
    w.blobs.push({ id: 90, x: w.px + 1, z: w.pz, life: 5, max: 5 }, { id: 91, x: w.px - 1, z: w.pz, life: 5, max: 5 });
    const ev = run(w, SIM_DT);
    expect(w.carry).toBe(true);
    expect(ev.filter((e) => e.t === 'pickup')).toHaveLength(1);
    expect(w.blobs).toHaveLength(1);
  });

  it('expires', () => {
    const w = world(1);
    hold(w);
    w.blobs.push({ id: 90, x: w.px + 8, z: w.pz, life: 0.5, max: 0.5 });
    const ev = run(w, 0.6);
    expect(w.blobs).toHaveLength(0);
    expect(ev.some((e) => e.t === 'expire')).toBe(true);
  });

  it('the mound gives one dab, then refills', () => {
    const w = world(5);
    hold(w);
    const m = w.mounds[0];
    w.px = m.x - m.r - w.tune.bodyR - 0.2;
    w.pz = m.z;
    run(w, SIM_DT);
    expect(w.carry).toBe(true);
    expect(m.charge).toBe(0);
    w.carry = false;
    run(w, w.tune.moundRefill * 0.5);
    expect(w.carry).toBe(false);
    run(w, w.tune.moundRefill * 0.55);
    expect(w.carry).toBe(true);
  });
});

describe('stabs', () => {
  it('a stab that lands costs freshness, knocks you away and sheds your wasabi', () => {
    const w = world(1, 3);
    w.carry = true;
    w.main.timer = 0;
    run(w, SIM_DT);
    // put every mark on the sushi and stop them moving
    for (const m of w.main.marks) {
      m.x = w.px;
      m.z = w.pz;
    }
    w.course.diner.ramp.forEach((s) => (s.track = 0));
    const ev = run(w, 3);
    const hurt = ev.filter((e) => e.t === 'hurt');
    expect(hurt.length).toBeGreaterThanOrEqual(1);
    expect(w.hp).toBe(w.course.freshness - hurt.length);
    expect(w.carry).toBe(false);
    expect(w.blobs.length + w.drops.length).toBeGreaterThanOrEqual(1);
  });

  it('invulnerability after a hit: a second strike within the window does nothing', () => {
    const w = world(2, 5);
    w.main.timer = 0;
    run(w, SIM_DT);
    for (const m of w.main.marks) {
      m.x = w.px;
      m.z = w.pz;
    }
    w.course.diner.ramp.forEach((s) => (s.track = 0));
    // stand still so the volley's two strikes both land on the same spot
    const ev = run(w, 0.5 + w.main.marks.length * 0.6, 0, 0).filter((e) => e.t === 'stab');
    const hits = ev.filter((e) => e.t === 'stab' && e.hit);
    expect(hits).toHaveLength(1);
  });

  it('a stab that misses costs nothing', () => {
    const w = world(1, 3);
    w.main.timer = 0;
    run(w, SIM_DT);
    for (const m of w.main.marks) {
      m.x = w.px + 9;
      m.z = w.pz;
    }
    w.course.diner.ramp.forEach((s) => (s.track = 0));
    run(w, 3);
    expect(w.hp).toBe(w.course.freshness);
  });

  it('eaten at zero freshness', () => {
    const w = world(1);
    w.hp = 1;
    w.main.timer = 0;
    run(w, SIM_DT);
    for (const m of w.main.marks) {
      m.x = w.px;
      m.z = w.pz;
    }
    w.course.diner.ramp.forEach((s) => (s.track = 0));
    const ev = run(w, 3);
    expect(w.phase).toBe('eaten');
    expect(ev.some((e) => e.t === 'eaten')).toBe(true);
  });

  it('a feint dips, then re-targets to where you are', () => {
    const w = world(3, 1, (c) => {
      c.diner.ramp.forEach((s) => ((s.feint = 1), (s.track = 0)));
      return c;
    });
    w.main.timer = 0;
    run(w, SIM_DT);
    expect(w.main.marks[0].feint).toBe(true);
    // run until the first feint fires its re-target
    let fe: { x: number; z: number } | null = null;
    for (let i = 0; i < 600 && !fe; i++) {
      w.input.mx = 0.6; // you've moved since he aimed
      w.step(SIM_DT);
      const e = w.events.find((e) => e.t === 'feint');
      w.events.length = 0;
      if (e && e.t === 'feint') fe = e;
    }
    expect(fe).not.toBeNull();
    expect(Math.abs(fe!.x - w.px)).toBeLessThan(1.5);
  });
});

describe('sweep', () => {
  it('drags across the plate and catches a sushi standing on the line', () => {
    const w = world(5, 2, (c) => {
      c.diner.ramp.forEach((s) => (s.sweep = 1));
      return c;
    });
    w.main.timer = 0;
    run(w, SIM_DT);
    expect(w.main.sweep).not.toBeNull();
    const ev = run(w, 3);
    expect(ev.some((e) => e.t === 'sweepDown')).toBe(true);
    expect(ev.some((e) => e.t === 'hurt')).toBe(true);
  });
});

describe('throws', () => {
  it('in the lane with the way clear: a hit, counted when it arrives', () => {
    const w = world(1);
    hold(w);
    pinEye(w, w.px);
    // park the sticks well out of the way
    w.main.tx = w.px + 12;
    w.main.ty = 6;
    w.main.tz = w.pz + 4;
    w.main.phase = 'aim';
    w.main.timer = 1e9;
    w.carry = true;
    expect(w.predict().outcome).toBe('hit');
    w.input.throwQueued = true;
    const ev = run(w, 0.1);
    expect(ev.find((e) => e.t === 'throw')).toMatchObject({ outcome: 'hit' });
    expect(w.hits).toBe(0);
    run(w, 0.6);
    expect(w.hits).toBe(1);
    expect(w.sting).toBeGreaterThan(0);
  });

  it('out of the lane: it sails past his head', () => {
    const w = world(1);
    hold(w);
    pinEye(w, w.px + w.tune.laneHalf + 1);
    w.main.tx = w.px - 12;
    w.main.phase = 'aim';
    w.main.timer = 1e9;
    w.carry = true;
    w.input.throwQueued = true;
    const ev = run(w, 0.8);
    expect(ev.find((e) => e.t === 'throw')).toMatchObject({ outcome: 'wide' });
    expect(ev.some((e) => e.t === 'wide')).toBe(true);
    expect(w.hits).toBe(0);
  });

  it('tips shut on the line: clipped, and the wasabi falls back onto the plate', () => {
    const w = world(3);
    pinEye(w, w.px);
    w.carry = true;
    w.main.timer = 1e9;
    run(w, 2); // he guards: the tips park, shut, on your line
    expect(w.main.guarding).toBe(true);
    expect(w.predict().outcome).toBe('clip');
    w.input.throwQueued = true;
    const ev = run(w, 1.2);
    expect(ev.some((e) => e.t === 'clip')).toBe(true);
    expect(w.hits).toBe(0);
    expect(w.blobs.length).toBe(1);
  });

  it('tips open on the line (no guard): the throw goes between them', () => {
    const w = world(1);
    pinEye(w, w.px);
    w.carry = true;
    w.main.timer = 1e9;
    run(w, 2);
    expect(w.main.guarding).toBe(false);
    expect(w.predict().outcome).toBe('hit');
  });

  it('three hits win course one', () => {
    const w = world(1);
    hold(w);
    pinEye(w, w.px);
    w.main.tx = w.px + 12;
    w.main.phase = 'aim';
    w.main.timer = 1e9;
    for (let i = 0; i < 3; i++) {
      w.carry = true;
      w.input.throwQueued = true;
      run(w, 0.8);
    }
    expect(w.hits).toBe(3);
    expect(w.phase).toBe('won');
  });

  it('throwing with nothing in hand does nothing but say so', () => {
    const w = world(1);
    hold(w);
    w.input.throwQueued = true;
    const ev = run(w, SIM_DT);
    expect(ev.some((e) => e.t === 'empty')).toBe(true);
    expect(w.throws).toHaveLength(0);
  });
});

describe('her chopsticks (course 4)', () => {
  it('exist only on course 4, and can hurt you', () => {
    expect(world(1).comp).toBeNull();
    const w = world(4, 9);
    expect(w.comp).not.toBeNull();
    hold(w);
    w.comp!.timer = 0;
    run(w, SIM_DT);
    for (const m of w.comp!.marks) {
      m.x = w.px;
      m.z = w.pz;
    }
    w.course.companion!.track = 0;
    const ev = run(w, 3);
    expect(ev.some((e) => e.t === 'hurt' && e.who === 'comp')).toBe(true);
  });
});
