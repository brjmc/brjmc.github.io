// Debug views of the post stack: node scripts/views.mjs 1 2 3  (1 CoC, 2 DOF buffer, 3 blur pyramid)
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = process.env.OUT ?? join(root, 'screenshots', 'debug');
import { mkdirSync } from 'node:fs';
mkdirSync(out, { recursive: true });
const views = process.argv.slice(2).filter((a) => /^\d+$/.test(a));
const js = process.env.JS ?? "sp.until('w.main.phase===\"aim\" && w.main.timer < 0.5', 20)";
const course = Number(process.env.COURSE ?? 1);
const server = await createServer({ root, logLevel: 'error', server: { port: 5291, hmr: false, watch: null } });
await server.listen();
const base = server.resolvedUrls.local[0];
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 2 });
page.on('pageerror', (e) => console.log('pageerror', e.message));
page.on('console', (m) => { if (m.type() === 'error') console.log('console', m.text()); });
for (const v of views) {
  await page.goto(`${base}?test&q=2&view=${v}`);
  await page.waitForFunction(() => window.__lp && window.__lp.frames > 3, null, { timeout: 90000 });
  await page.evaluate(([js, course]) => { const sp = window.__lp; sp.load(course, 11, 'play'); new Function('sp', js)(sp); sp.pause(true); }, [js, course]);
  const f0 = await page.evaluate(() => window.__lp.frames);
  await page.waitForFunction((f0) => window.__lp.frames > f0 + 3, f0);
  await page.screenshot({ path: join(out, `view${v}.png`) });
}
await browser.close(); await server.close();
