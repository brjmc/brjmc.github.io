import { describe, expect, test } from 'vitest';
import { CHASER_SPEED_CAP, WAVE_PERIOD_FLOOR, levelCfg } from '../src/sim/levels';

describe('level config', () => {
  test('table for levels 1–6 matches the brief', () => {
    const rows = [1, 2, 3, 4, 5, 6].map((n) => {
      const c = levelCfg(n);
      return [c.title, c.length, c.crowd, c.jams.map((j) => [j.from, j.to, j.mult]), c.traffic, c.chaserSpeed];
    });
    expect(rows).toEqual([
      ['Walk', 130, 0.22, [], { kind: 'none' }, 3.15],
      ['Traffic', 150, 0.5, [], { kind: 'light' }, 3.35],
      ['The crush', 170, 0.75, [[52, 104, 7]], { kind: 'light' }, 3.5],
      ['The rhythm', 180, 0.6, [], { kind: 'waves', period: 5.4, cars: 3, speed: 19 }, 3.6],
      ['Both', 200, 0.95, [[60, 96, 6], [132, 168, 6]], { kind: 'waves', period: 4.8, cars: 3, speed: 20 }, 3.75],
      ['Rush', 220, 1.15, [[40, 80, 7], [120, 190, 5]], { kind: 'waves', period: 4.2, cars: 4, speed: 22 }, 3.95],
    ]);
  });

  test('every level has briefing text', () => {
    for (let n = 1; n <= 20; n++) expect(levelCfg(n).brief.length).toBeGreaterThan(0);
  });

  test('levels 7+ are "Block N" and scale endlessly', () => {
    let prev = levelCfg(6);
    for (let n = 7; n <= 60; n++) {
      const c = levelCfg(n);
      expect(c.title).toBe(`Block ${n}`);
      expect(c.chaserSpeed).toBeGreaterThanOrEqual(prev.chaserSpeed);
      expect(c.length).toBeGreaterThanOrEqual(prev.length);
      expect(c.crowd).toBeGreaterThanOrEqual(prev.crowd);
      expect(c.traffic.kind).toBe('waves');
      if (c.traffic.kind === 'waves' && prev.traffic.kind === 'waves') {
        expect(c.traffic.period).toBeLessThanOrEqual(prev.traffic.period);
      }
      for (const j of c.jams) expect(j.to).toBeLessThan(c.length);
      prev = c;
    }
  });

  test('chaser speed caps at 4.35 and the wave period floors at 2.9 s', () => {
    const speeds = [];
    const periods = [];
    for (let n = 1; n <= 500; n++) {
      const c = levelCfg(n);
      speeds.push(c.chaserSpeed);
      if (c.traffic.kind === 'waves') periods.push(c.traffic.period);
    }
    expect(Math.max(...speeds)).toBe(CHASER_SPEED_CAP);
    expect(CHASER_SPEED_CAP).toBe(4.35);
    expect(Math.min(...periods)).toBe(WAVE_PERIOD_FLOOR);
    expect(WAVE_PERIOD_FLOOR).toBe(2.9);
  });
});
