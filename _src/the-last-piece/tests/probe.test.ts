// Opt-in: PROBE=1 npx vitest run tests/probe.test.ts --silent=false
// Prints how each scripted strategy does on each course. Used for tuning, not as a gate.
import { describe, it } from 'vitest';

declare const process: { env: Record<string, string | undefined> };
import { runBot, type Strategy } from '../src/sim/bot';

const on = !!process.env.PROBE;
const courses = (process.env.COURSES ?? '1,2,3,4,5,6,7,10').split(',').map(Number);
const strats = (process.env.STRATS ?? 'good,spam,dodger,idle').split(',') as Strategy[];
const seeds = Number(process.env.SEEDS ?? 20);

describe.runIf(on)('probe', () => {
  it('strategies x courses', () => {
    const rows: string[] = [];
    for (const c of courses)
      for (const s of strats) {
        let carry = 0;
        let open = 0;
        const rs = Array.from({ length: seeds }, (_, i) =>
          runBot(c, 1000 + i * 7919, s, 180, undefined, (w) => {
            if (!w.carry || w.phase !== 'play') return;
            carry++;
            if (w.predict().outcome === 'hit') open++;
          }),
        );
        const won = rs.filter((r) => r.won);
        const avg = (f: (r: (typeof rs)[number]) => number, a = rs) => (a.length ? a.reduce((x, r) => x + f(r), 0) / a.length : NaN);
        rows.push(
          `c${String(c).padEnd(3)} ${s.padEnd(7)} won ${String(won.length).padStart(2)}/${seeds}  eaten ${rs.filter((r) => r.eaten).length}` +
            `  t(won) ${avg((r) => r.time, won).toFixed(1).padStart(5)}  hp(won) ${avg((r) => r.hp, won).toFixed(1)}` +
            `  throws ${avg((r) => r.throws).toFixed(1).padStart(4)} clip ${avg((r) => r.clips).toFixed(1)} wide ${avg((r) => r.wides).toFixed(1)} picks ${avg((r) => r.pickups).toFixed(1)}  shot-on ${((100 * open) / Math.max(1, carry)).toFixed(0)}%`,
        );
      }
    console.log('\n' + rows.join('\n'));
  }, 600000);
});
