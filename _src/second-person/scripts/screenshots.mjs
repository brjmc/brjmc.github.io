// Playwright screenshots at 390x844 and 844x390: start of level 1, mid level 4 with traffic.
// Usage: node scripts/screenshots.mjs [label] [--url http://...]   (default: starts a Vite dev server)
// Needs a Chromium that Playwright can launch (`npx playwright install chromium` on a fresh machine).
import { mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { createServer } from 'vite';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const label = args.find((a) => !a.startsWith('--')) ?? 'latest';
const urlArg = args.includes('--url') ? args[args.indexOf('--url') + 1] : null;
const extra = args.includes('--q') ? args[args.indexOf('--q') + 1] : '';
const outDir = join(root, 'screenshots', label);
mkdirSync(outDir, { recursive: true });

let server = null;
let base = urlArg;
if (!base) {
  server = await createServer({ root, logLevel: 'error', server: { port: 5181, strictPort: false } });
  await server.listen();
  base = server.resolvedUrls.local[0];
}

const browser = await chromium.launch({
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});

const sizes = [
  { name: 'portrait', width: 390, height: 844 },
  { name: 'landscape', width: 844, height: 390 },
];

const shots = [
  { name: 'L1-brief', level: 1, seed: 11, stage: 'brief', walk: 0 },
  { name: 'L1-start', level: 1, seed: 11, stage: 'play', walk: 1.6 },
  { name: 'L4-mid', level: 4, seed: 5, stage: 'play', walk: 18, car: true },
];

for (const size of sizes) {
  const page = await browser.newPage({ viewport: { width: size.width, height: size.height }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') console.log(`[${size.name}] ${m.type()}: ${m.text()}`);
  });
  page.on('pageerror', (e) => console.log(`[${size.name}] pageerror: ${e.message}`));
  await page.goto(`${base}?test${extra ? '&' + extra : ''}`);
  await page.waitForFunction(() => window.__sp && window.__sp.frames > 3, null, { timeout: 60000 });
  for (const s of shots) {
    await page.evaluate((s) => {
      const sp = window.__sp;
      sp.load(s.level, s.seed, s.stage);
      if (s.walk) sp.walk(s.walk);
      if (s.car) sp.walkUntilCar(4, 26, 12);
      sp.pause(true);
    }, s);
    const f0 = await page.evaluate(() => window.__sp.frames);
    await page.waitForFunction((f0) => window.__sp.frames > f0 + 4, f0, { timeout: 120000 });
    const file = join(outDir, `${s.name}-${size.name}.png`);
    await page.screenshot({ path: file });
    console.log('wrote', file);
    await page.evaluate(() => window.__sp.pause(false));
  }
  await page.close();
}

await browser.close();
if (server) await server.close();
