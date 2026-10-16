// Frame-cost check: Chromium (software GL here), 4x CPU throttle, a course with a bot playing.
// Reports CPU-side ms per frame (sim + render submission), rAF frame time, draw calls and triangles.
// Without a GPU the rAF time is dominated by the software rasteriser and is NOT a phone GPU
// estimate; the CPU-side number is the useful one here.
// Usage: node scripts/perf.mjs [tier 0|1|2] [course] [seconds]
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const tier = process.argv[2] ?? '1';
const course = Number(process.argv[3] ?? 4);
const secs = Number(process.argv[4] ?? 6);
const server = await createServer({ root, logLevel: 'error', server: { port: 5283, hmr: false, watch: null } });
await server.listen();
const base = server.resolvedUrls.local[0];
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
const cdp = await page.context().newCDPSession(page);
await page.goto(`${base}?test&q=${tier}`);
await page.waitForFunction(() => window.__lp && window.__lp.frames > 3);
await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
const res = await page.evaluate(async ([course, secs]) => {
  const sp = window.__lp;
  sp.load(course, 5, 'play');
  sp.play(secs);
  sp.pause(true); // the loop keeps rendering; we drive update+render ourselves below
  // warm up: let the first frames compile every shader before measuring
  const f0 = sp.frames;
  await new Promise((r) => { const w = () => (sp.frames > f0 + 8 ? r() : requestAnimationFrame(w)); w(); });
  const cpu = [];
  const frame = [];
  let last = performance.now();
  let calls = 0;
  let tris = 0;
  await new Promise((done) => {
    let n = 0;
    const tick = () => {
      const now = performance.now();
      frame.push(now - last);
      last = now;
      const t0 = performance.now();
      sp.game.paused = false;
      sp.game.update(1 / 60);
      sp.renderer.onEvents(sp.game.events, sp.game);
      sp.renderer.render(sp.game, 1 / 60);
      sp.game.events.length = 0;
      sp.game.paused = true;
      cpu.push(performance.now() - t0);
      calls = sp.renderer.drawCalls;
      tris = sp.renderer.triangles;
      if (++n < 60) requestAnimationFrame(tick);
      else done();
    };
    requestAnimationFrame(tick);
  });
  const med = (a) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];
  const p90 = (a) => [...a].sort((x, y) => x - y)[Math.floor(a.length * 0.9)];
  return { cpuMed: +med(cpu).toFixed(2), cpuP90: +p90(cpu).toFixed(2), frameMed: +med(frame).toFixed(1), calls, tris };
}, [course, secs]);
console.log(JSON.stringify({ tier, course, throttle: '4x', ...res }));
await browser.close();
await server.close();
