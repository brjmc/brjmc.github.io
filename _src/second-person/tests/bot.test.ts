import { expect, test } from 'vitest';
import { runSteadyBot } from '../src/sim/bot';
import { World } from '../src/sim/world';
import { levelCfg } from '../src/sim/levels';
import { SIM_DT } from '../src/sim/constants';

const SEEDS = Array.from({ length: 24 }, (_, i) => i + 1);

test('level 1: a steady heading toward the lens finishes, across 24 seeds', () => {
  const results = SEEDS.map((s) => ({ seed: s, ...runSteadyBot(1, s) }));
  const failed = results.filter((r) => r.outcome !== 'cleared');
  // Failures are a design finding, not something to tune the test around.
  if (failed.length) console.warn('DESIGN FINDING: steady bot failed level 1 on', failed);
  console.info(
    'level 1 steady bot:',
    results.map((r) => `s${r.seed}:${r.outcome}@${r.time.toFixed(1)}s gap>=${r.minGap.toFixed(1)}`).join(' '),
  );
  expect(failed).toEqual([]);
});

test('the same seed and input reproduce the same street', () => {
  const run = () => {
    const w = new World(levelCfg(3), 77);
    w.pointerDown(195, 790);
    for (let i = 0; i < 1200; i++) w.step(SIM_DT);
    return JSON.stringify([w.player.x, w.player.z, w.peds.map((q) => [q.x, q.z]), w.cars.map((c) => [c.x, c.z])]);
  };
  expect(run()).toBe(run());
});
