import { describe, expect, it } from 'vitest';
import { COURSES, LAST_AUTHORED, courseCfg, stageFor } from '../src/sim/courses';

describe('course table', () => {
  it('has six authored courses, numbered in order', () => {
    expect(LAST_AUTHORED).toBe(6);
    COURSES.forEach((c, i) => expect(c.n).toBe(i + 1));
  });

  it('keeps the prototype rules on course one: 3 hits, freshness 5, no guard, no sweeps', () => {
    const c = courseCfg(1);
    expect(c.hitsToWin).toBe(3);
    expect(c.freshness).toBe(5);
    expect(c.diner.ramp.every((s) => s.guard === 0 && s.sweep === 0 && s.fumble === 1)).toBe(true);
  });

  it('each course adds its idea', () => {
    expect(courseCfg(2).props.some((p) => p.kind === 'dish')).toBe(true);
    expect(courseCfg(2).props.some((p) => p.kind === 'puddle')).toBe(true);
    expect(courseCfg(3).props.some((p) => p.kind === 'daikon')).toBe(true);
    expect(courseCfg(3).diner.ramp.every((s) => s.guard > 0)).toBe(true);
    expect(courseCfg(4).companion).toBeDefined();
    expect(courseCfg(5).props.some((p) => p.kind === 'mound')).toBe(true);
    expect(courseCfg(5).diner.ramp.every((s) => s.sweep > 0)).toBe(true);
    expect(courseCfg(6).hitsToWin).toBe(5);
  });

  it('gets harder within a course as he takes hits', () => {
    for (const c of COURSES) {
      for (let h = 1; h < c.hitsToWin; h++) {
        const a = stageFor(c, h - 1);
        const b = stageFor(c, h);
        expect(b.aim).toBeLessThanOrEqual(a.aim);
        expect(b.slot).toBeLessThanOrEqual(a.slot);
        expect(b.track).toBeGreaterThanOrEqual(a.track);
      }
    }
  });

  it('seconds keep scaling past course six and stay within limits', () => {
    const a = courseCfg(7);
    const b = courseCfg(30);
    expect(a.title).toMatch(/Seconds/);
    expect(stageFor(b, 4).slot).toBeGreaterThanOrEqual(0.3);
    expect(stageFor(b, 4).marks).toBeLessThanOrEqual(4);
    expect(stageFor(b, 0).aim).toBeLessThanOrEqual(stageFor(a, 0).aim + 1e-9);
  });
});
