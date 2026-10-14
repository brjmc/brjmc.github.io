// Frame-cost check: Chromium (software GL here), 4x CPU throttle, level 4 with traffic, steady walking.
// Reports CPU-side ms per frame (sim + render submission), rAF frame time, draw calls and triangles.
// On a machine without a GPU the rAF time is dominated by the software rasteriser and is NOT a
// phone GPU estimate; the CPU-side number is the useful one there.
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const tier = process.argv[2] ?? '1';
const level = Number(process.argv[3] ?? 4);
const walk = Number(process.argv[4] ?? 16);
const server = await createServer({ root, logLevel: 'error', server: { port: 5183, hmr: false, watch: null } });
await server.listen();
const base = server.resolvedUrls.local[0];
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
const cdp = await page.context().newCDPSession(page);
await page.goto(`${base}?test&q=${tier}`);
await page.waitForFunction(() => window.__sp && window.__sp.frames > 3);
await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
const res = await page.evaluate(async ([level, walk]) => {
  const sp = window.__sp;
  sp.load(level, 5, 'play');
  sp.walk(walk);
  const w = sp.game.world;
  w.pointerDown(195, 790);
  const cpu = [];
  const frame = [];
  let calls = 0;
  let tris = 0;
  let last = performance.now();
  await new Promise((done) => {
    let n = 0;
    const tick = () => {
      const now = performance.now();
      frame.push(now - last);
      last = now;
      const t0 = performance.now();
      // measure one extra update+render the way main.ts does (sim + submit)
      sp.game.update(1 / 60);
      sp.renderer.onEvents(sp.game.events, w.time);
      sp.renderer.render(sp.game, 1 / 60);
      sp.game.events.length = 0;
      cpu.push(performance.now() - t0);
      calls = sp.renderer.drawCalls;
      tris = sp.renderer.triangles;
      if (++n < 90) requestAnimationFrame(tick);
      else done();
    };
    requestAnimationFrame(tick);
  });
  const med = (a) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];
  const p90 = (a) => [...a].sort((x, y) => x - y)[Math.floor(a.length * 0.9)];
  return { cpuMed: med(cpu), cpuP90: p90(cpu), frameMed: med(frame), calls, tris, peds: w.peds.length, cars: w.cars.length };
}, [level, walk]);
console.log(JSON.stringify({ tier, level, walk, throttle: '4x', ...res }, null, 0));
await browser.close();
await server.close();
