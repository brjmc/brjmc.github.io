import { describe, expect, test } from 'vitest';
import { DEFAULTS, SIM_DT } from '../src/sim/constants';
import { levelCfg } from '../src/sim/levels';
import { emptyWorld, holdTowardLens, steps, stepUntil } from './helpers';

const t = DEFAULTS;

describe('chaser', () => {
  test('catches at 0.95 m, not before', () => {
    const w = emptyWorld();
    w.chaser.x = w.player.x;
    w.chaser.z = w.player.z + 1.3;
    let gapAtCatch = -1;
    stepUntil(w, (ev) => {
      for (const e of ev) if (e.t === 'death' && e.cause === 'caught') gapAtCatch = w.chaserGap;
      if (w.phase === 'play') expect(w.chaserGap).toBeGreaterThanOrEqual(t.chaserCatchR);
      return gapAtCatch >= 0;
    });
    expect(w.deathCause).toBe('caught');
    expect(gapAtCatch).toBeLessThan(t.chaserCatchR);
    expect(gapAtCatch).toBeGreaterThan(t.chaserCatchR - w.chaser.speed * SIM_DT - 1e-9);
  });

  test('walks straight at the player at a constant speed', () => {
    for (const n of [1, 4, 6, 9]) {
      const w = emptyWorld({ chaserSpeed: levelCfg(n).chaserSpeed });
      w.chaser.z = w.player.z + 30;
      w.chaser.x = w.player.x + 4;
      holdTowardLens(w);
      for (let i = 0; i < 600; i++) {
        const x = w.chaser.x;
        const z = w.chaser.z;
        w.step(SIM_DT);
        // the player moves first in a step, the chaser then heads for where it is now
        const tx = w.player.x - x;
        const tz = w.player.z - z;
        const d = Math.hypot(w.chaser.x - x, w.chaser.z - z);
        expect(d).toBeCloseTo(levelCfg(n).chaserSpeed * SIM_DT, 9);
        // moved along the line to where the player was at the start of the step
        const cross = (w.chaser.x - x) * tz - (w.chaser.z - z) * tx;
        expect(Math.abs(cross)).toBeLessThan(1e-9);
      }
    }
  });

  test('shoves pedestrians within 0.8 m out of its way and never slows', () => {
    const w = emptyWorld();
    w.chaser.x = w.player.x;
    w.chaser.z = w.player.z + 6;
    const q = w.spawnPedAt(w.player.x + 0.2, w.player.z + 3);
    let knocked = false;
    let minD = Infinity;
    const z0 = w.chaser.z;
    steps(w, 1.2, (e) => {
      if (e.t === 'knock' && e.id === q.id && e.by === 'chaser') knocked = true;
    });
    minD = Math.hypot(q.x - w.chaser.x, q.z - w.chaser.z);
    expect(knocked).toBe(true);
    expect(minD).toBeGreaterThanOrEqual(t.chaserShoveR - 1e-6);
    expect(z0 - w.chaser.z).toBeCloseTo(w.chaser.speed * 1.2, 1);
  });
});
