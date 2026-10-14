// Sim cost per frame (two 120 Hz steps at 60 fps). Run with: PROBE=1 npx vitest run tests/bench.test.ts --silent=false
import { test } from 'vitest';
import { SIM_DT } from '../src/sim/constants';
import { levelCfg } from '../src/sim/levels';
import { World } from '../src/sim/world';

test.runIf((globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env.PROBE)('sim bench', () => {
  for (const [lv, walk] of [[4, 16], [6, 10]] as const) {
    const w = new World(levelCfg(lv), 5);
    w.pointerDown(195, 790);
    for (let i = 0; i < walk / SIM_DT; i++) w.step(SIM_DT);
    const n = 1200;
    const t0 = performance.now();
    for (let i = 0; i < n; i++) w.step(SIM_DT);
    const per = (performance.now() - t0) / n;
    console.log(`L${lv}: ${w.peds.length} peds, ${w.cars.length} cars, ${(per * 1000).toFixed(0)} µs/step, ${(per * 2).toFixed(3)} ms per 60 fps frame`);
  }
});
