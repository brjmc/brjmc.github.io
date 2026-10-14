import { describe, expect, test } from 'vitest';
import { DEFAULTS, SIM_DT } from '../src/sim/constants';
import { screenAt } from '../src/sim/bot';
import { emptyWorld, steps, stepUntil, touchSelf } from './helpers';

const t = DEFAULTS;

function charged(seconds: number) {
  const w = emptyWorld();
  touchSelf(w);
  steps(w, seconds);
  return w;
}

function release(w: ReturnType<typeof emptyWorld>) {
  const s = screenAt(w, w.player.x, w.player.z - 5);
  w.pointerMove(s.x, s.y);
  w.pointerUp(s.x, s.y);
}

describe('shove', () => {
  test('touching your own character starts a charge and plants you', () => {
    const w = charged(0.1);
    expect(w.player.mode).toBe('charge');
    expect(w.player.speed).toBe(0);
  });

  test('a touch 1.5 m away still counts; 1.7 m away steers instead', () => {
    const w = emptyWorld();
    const near = screenAt(w, w.player.x + 1.45, w.player.z);
    w.pointerDown(near.x, near.y);
    steps(w, 0.05);
    expect(w.player.mode).toBe('charge');
    const w2 = emptyWorld();
    const far = screenAt(w2, w2.player.x + 1.7, w2.player.z);
    w2.pointerDown(far.x, far.y);
    steps(w2, 0.05);
    expect(w2.player.mode).toBe('free');
  });

  test('full charge takes 0.55 s', () => {
    expect(charged(0.275).player.charge).toBeCloseTo(0.5, 1);
    expect(charged(0.5).player.charge).toBeLessThan(1);
    expect(charged(0.56).player.charge).toBe(1);
  });

  test('releasing at charge <= 0.25 does not dash and costs no cooldown', () => {
    const w = charged(0.1); // 0.1 / 0.55 = 0.18
    release(w);
    steps(w, SIM_DT);
    expect(w.player.mode).toBe('free');
    expect(w.player.cooldown).toBe(0);
  });

  for (const [hold, charge] of [
    [0.6, 1],
    [0.275, 0.5],
  ] as const) {
    test(`dash at charge ${charge}: 11.5 m/s for 0.30 × (0.6 + 0.4 × ${charge}) s`, () => {
      const w = charged(hold);
      expect(w.player.charge).toBeCloseTo(charge, 1);
      release(w);
      w.step(SIM_DT); // the release is read on this step
      const c = w.player.charge;
      expect(w.player.mode).toBe('dash');
      let dashSteps = 1;
      let peak = 0;
      stepUntil(w, () => {
        if (w.player.mode === 'dash') dashSteps++;
        peak = Math.max(peak, w.player.speed);
        return w.player.mode === 'free';
      });
      const expected = t.dashBaseTime * (0.6 + 0.4 * c);
      expect(w.player.dashTotal).toBeCloseTo(expected, 9);
      expect(dashSteps * SIM_DT).toBeGreaterThanOrEqual(expected - SIM_DT * 1.01);
      expect(dashSteps * SIM_DT).toBeLessThanOrEqual(expected + SIM_DT * 1.01);
      expect(peak).toBeCloseTo(t.dashSpeed, 6);
      expect(w.player.dirZ).toBeLessThan(-0.95); // toward the pointer
    });
  }

  test('cooldown is 1.9 s', () => {
    const w = charged(0.6);
    release(w);
    steps(w, SIM_DT);
    expect(w.player.cooldown).toBeGreaterThan(t.shoveCooldown - 2 * SIM_DT);
    steps(w, 1.0);
    w.pointerUp();
    touchSelf(w);
    steps(w, 0.05);
    expect(w.player.mode).not.toBe('charge');
    w.pointerUp();
    steps(w, 0.9);
    expect(w.player.cooldown).toBe(0);
    touchSelf(w);
    steps(w, 0.05);
    expect(w.player.mode).toBe('charge');
  });

  test('pedestrians hit by a dash are knocked aside and stagger for 0.9 s', () => {
    const w = charged(0.6);
    const q = w.spawnPedAt(w.player.x + 0.1, w.player.z - 1.5);
    const x0 = q.x;
    release(w);
    let hitAt = -1;
    stepUntil(w, (ev) => {
      for (const e of ev) if (e.t === 'knock' && e.id === q.id) hitAt = w.time;
      return hitAt >= 0;
    });
    expect(hitAt).toBeGreaterThan(0);
    expect(q.stagger).toBeGreaterThan(t.staggerTime - 2 * SIM_DT);
    expect(w.player.slowT).toBe(0); // a dash is not slowed by the crowd
    steps(w, 0.5);
    expect(Math.abs(q.x - x0)).toBeGreaterThan(0.6);
    steps(w, 0.45);
    expect(q.stagger).toBe(0);
  });
});
