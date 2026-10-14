import { describe, expect, test } from 'vitest';
import { DEFAULTS } from '../src/sim/constants';
import type { SimEvent, Tier } from '../src/sim/world';
import { emptyWorld, holdTowardLens, stepUntil } from './helpers';

const t = DEFAULTS;
const CONTACT = t.pedR + t.playerR;

/** Walk straight toward the lens into a standing pedestrian whose contact normal makes `deg` with the heading. */
function bumpAt(deg: number) {
  const w = emptyWorld();
  const lateral = CONTACT * Math.sin((deg * Math.PI) / 180);
  w.spawnPedAt(w.player.x + lateral, w.player.z - 1.6);
  holdTowardLens(w);
  let bump: Extract<SimEvent, { t: 'bump' }> | null = null;
  stepUntil(w, (ev) => {
    for (const e of ev) if (e.t === 'bump') bump = e;
    return bump !== null;
  });
  return { w, bump: bump as Extract<SimEvent, { t: 'bump' }> | null };
}

describe('crowd collision tiers', () => {
  const cases: [number, Tier, number, number][] = [
    [0, 0, t.tierHeadFactor, t.tierHeadTime], // dead centre
    [50, 0, t.tierHeadFactor, t.tierHeadTime], // cos 50° = 0.64 > 0.55
    [65, 1, t.tierPartialFactor, t.tierPartialTime], // cos 65° = 0.42
    [80, 2, t.tierGlanceFactor, t.tierGlanceTime], // cos 80° = 0.17
  ];
  for (const [deg, tier, factor, time] of cases) {
    test(`${deg}° contact is tier ${tier}: ${factor * 100}% for ${time}s`, () => {
      const { w, bump } = bumpAt(deg);
      expect(bump).not.toBeNull();
      expect(bump!.tier).toBe(tier);
      expect(w.player.slowTier).toBe(tier);
      expect(w.player.slowFactor).toBeCloseTo(factor, 6);
      expect(w.player.slowT).toBeGreaterThan(time - 0.02);
      expect(w.player.slowT).toBeLessThanOrEqual(time);
      // speed is capped to the slowed speed straight away
      expect(w.player.speed).toBeLessThanOrEqual(t.baseSpeed * w.dirScale(w.player.dirZ) * factor + 1e-9);
    });
  }

  test('tier thresholds sit at 0.55 and 0.2', () => {
    const w = emptyWorld();
    holdTowardLens(w);
    stepUntil(w, () => w.player.speed > 1);
    // heading is (0, -1); contact normal (nx, nz) gives dot = -nz
    const at = (dot: number) => w.contactTier(Math.sqrt(1 - dot * dot), -dot);
    expect(at(0.56)).toBe(0);
    expect(at(0.55)).toBe(1);
    expect(at(0.21)).toBe(1);
    expect(at(0.2)).toBe(2);
    expect(at(-0.5)).toBe(2);
  });

  test('slow wears off after its duration', () => {
    const { w } = bumpAt(0);
    const left = w.player.slowT;
    stepUntil(w, () => w.player.slowT === 0, 2);
    expect(w.player.slowFactor).toBe(1);
    expect(left).toBeLessThanOrEqual(t.tierHeadTime);
  });

  test('a glancing contact does not override a head-on slow', () => {
    const { w } = bumpAt(0);
    expect(w.player.slowTier).toBe(0);
    w.spawnPedAt(w.player.x + CONTACT * 0.99, w.player.z - 0.05);
    stepUntil(w, () => true);
    expect(w.player.slowFactor).toBeCloseTo(t.tierHeadFactor, 6);
  });
});
