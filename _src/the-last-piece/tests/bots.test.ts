// Design gates: every course can be won by careful play, standing still always loses, careless
// throwing is punished later on, and the sim is deterministic.
import { describe, expect, it } from 'vitest';
import { runBot } from '../src/sim/bot';
import { LAST_AUTHORED } from '../src/sim/courses';

const SEEDS = Array.from({ length: 16 }, (_, i) => 500 + i * 104729);
// how many of the 16 seeds careful play must win: the last courses are meant to bite even then
const MIN_WINS = [0, 15, 15, 15, 15, 14, 13];

describe('bots', () => {
  for (let c = 1; c <= LAST_AUTHORED; c++) {
    it(`course ${c}: careful play wins, standing still is eaten`, () => {
      const good = SEEDS.map((s) => runBot(c, s, 'good', 180));
      expect(good.filter((r) => r.won).length).toBeGreaterThanOrEqual(MIN_WINS[c]);
      const idle = SEEDS.slice(0, 6).map((s) => runBot(c, s, 'idle', 120));
      expect(idle.every((r) => r.eaten)).toBe(true);
    });
  }

  it('course 1 is forgiving: the human-like bot always wins', () => {
    const rs = SEEDS.map((s) => runBot(1, s, 'human', 180));
    expect(rs.every((r) => r.won)).toBe(true);
  });

  it('last orders punishes throwing without looking', () => {
    const human = SEEDS.map((s) => runBot(6, s, 'human', 180)).filter((r) => r.won).length;
    const spam = SEEDS.map((s) => runBot(6, s, 'spam', 180)).filter((r) => r.won).length;
    expect(spam).toBeLessThan(human);
  });

  it('is deterministic for a seed', () => {
    const a = runBot(4, 77, 'human', 60);
    const b = runBot(4, 77, 'human', 60);
    expect(a).toEqual(b);
  });
});
