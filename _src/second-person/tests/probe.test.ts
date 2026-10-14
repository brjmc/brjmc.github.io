// Design probe, not a pass/fail test: how scripted strategies fare on each level.
// Run with: PROBE=1 npx vitest run tests/probe.test.ts --silent=false
import { test } from 'vitest';
import { runStrategy, type Strategy } from '../src/sim/bot';

test.runIf((globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env.PROBE)('strategy probe', () => {
  for (const st of ['steady', 'shover', 'median', 'nearlane'] as Strategy[]) {
    for (const lv of [1, 2, 3, 4, 5, 6, 7, 10]) {
      const rows = [];
      for (let s = 1; s <= 10; s++) {
        const r = runStrategy(lv, s, st);
        rows.push(`${r.outcome === 'cleared' ? 'C' : r.outcome === 'caught' ? 'x' : 'K'}${r.time.toFixed(0)}`);
      }
      console.log(st.padEnd(8), `L${lv}`.padEnd(4), rows.join(' '));
    }
  }
});
