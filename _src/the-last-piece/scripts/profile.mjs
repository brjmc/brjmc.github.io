// CPU profile of update+render (4x throttle) to find where frame time goes.
// Usage: node scripts/profile.mjs [tier] [course]
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const tier = process.argv[2] ?? '1';
const course = Number(process.argv[3] ?? 6);
const server = await createServer({ root, logLevel: 'error', server: { port: 5284, hmr: false, watch: null } });
await server.listen();
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
const cdp = await page.context().newCDPSession(page);
await page.goto(`${server.resolvedUrls.local[0]}?test&q=${tier}`);
await page.waitForFunction(() => window.__lp && window.__lp.frames > 3);
await page.evaluate((c) => { const sp = window.__lp; sp.load(c, 5, 'play'); sp.play(6); sp.pause(true); }, course);
const f0 = await page.evaluate(() => window.__lp.frames);
await page.waitForFunction((f0) => window.__lp.frames > f0 + 8, f0, { timeout: 120000 });
await cdp.send('Profiler.enable');
await cdp.send('Profiler.setSamplingInterval', { interval: 100 });
await cdp.send('Profiler.start');
await page.evaluate(() => {
  const sp = window.__lp;
  for (let i = 0; i < 40; i++) {
    sp.game.paused = false;
    sp.game.update(1 / 60);
    sp.renderer.onEvents(sp.game.events, sp.game);
    sp.renderer.render(sp.game, 1 / 60);
    sp.game.events.length = 0;
    sp.game.paused = true;
  }
});
const { profile } = await cdp.send('Profiler.stop');
const self = new Map();
const byId = new Map(profile.nodes.map((n) => [n.id, n]));
const dt = profile.timeDeltas;
const counts = new Map();
for (const s of profile.samples) counts.set(s, (counts.get(s) ?? 0) + 1);
let total = 0;
for (const [id, c] of counts) {
  const n = byId.get(id);
  const key = `${n.callFrame.functionName || '(anon)'} ${n.callFrame.url.split('/').pop()}:${n.callFrame.lineNumber}`;
  self.set(key, (self.get(key) ?? 0) + c);
  total += c;
}
const top = [...self.entries()].sort((a, b) => b[1] - a[1]).slice(0, 28);
for (const [k, c] of top) console.log(((100 * c) / total).toFixed(1).padStart(5) + '%  ' + k);
void dt;
await browser.close(); await server.close();
