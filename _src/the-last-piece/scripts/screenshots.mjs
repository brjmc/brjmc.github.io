// Playwright screenshots at 390x844 and 844x390.
// Usage: node scripts/screenshots.mjs [label] [--states] [--only name,name] [--q tier]
// Needs a Chromium that Playwright can launch.
import { mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { createServer } from 'vite';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const label = args.find((a) => !a.startsWith('--') && !/^\d+$/.test(a) && args[args.indexOf(a) - 1] !== '--only' && args[args.indexOf(a) - 1] !== '--q') ?? 'latest';
const q = args.includes('--q') ? args[args.indexOf('--q') + 1] : '2';
const only = args.includes('--only') ? args[args.indexOf('--only') + 1].split(',') : null;
const outDir = join(root, 'screenshots', label);
mkdirSync(outDir, { recursive: true });

const server = await createServer({ root, logLevel: 'error', server: { port: 5281, strictPort: false, hmr: false, watch: null } });
await server.listen();
const base = server.resolvedUrls.local[0];
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });

const sizes = [
  { name: 'portrait', width: 390, height: 844 },
  { name: 'landscape', width: 844, height: 390 },
];

// js runs in the page with `sp` = window.__lp after load()
const shots = [
  { name: 'C1-brief', course: 1, seed: 11, stage: 'brief' },
  { name: 'C1-aim', course: 1, seed: 11, stage: 'play', js: "sp.until('w.main.phase===\"aim\" && w.main.timer < 0.5', 20)" },
  { name: 'C4-play', course: 4, seed: 5, stage: 'play', js: "sp.play(9); sp.until('w.carry || w.blobs.length > 0', 10)" },
];
const states = [
  { name: 'S-title', course: 0, seed: 3, stage: 'title' },
  { name: 'S-c2', course: 2, seed: 4, stage: 'play', js: 'sp.play(5)' },
  { name: 'S-c3-guard', course: 3, seed: 4, stage: 'play', js: "sp.until('w.carry && w.main.guarding', 30)" },
  { name: 'S-c5-sweep', course: 5, seed: 6, stage: 'play', js: "sp.until('w.main.phase===\"sweep\" && w.main.sweep && w.main.sweep.k > 0.3', 40)" },
  { name: 'S-c6', course: 6, seed: 2, stage: 'play', js: "sp.play(14)" },
  { name: 'S-throw', course: 1, seed: 11, stage: 'play', js: "sp.until('w.throws.length > 0 && w.throws[0].t > 0.12', 40)" },
  { name: 'S-splat', course: 2, seed: 9, stage: 'play', js: "sp.until('w.hits >= 2', 60); sp.play(0.5)" },
  { name: 'S-carry', course: 1, seed: 11, stage: 'play', js: "sp.until('w.carry && w.predict().outcome===\"hit\"', 40, 'human')" },
  { name: 'S-eaten', course: 1, seed: 11, stage: 'play', js: "sp.game.world.hp = 1; sp.until('w.phase===\"eaten\"', 60, 'idle'); sp.game.update(0.001); sp.game.stageT=0.9" },
  { name: 'S-eaten2', course: 1, seed: 11, stage: 'play', js: "sp.game.world.hp = 1; sp.until('w.phase===\"eaten\"', 60, 'idle'); sp.game.update(0.001); sp.game.stageT=1.75" },
  { name: 'S-finale', course: 1, seed: 11, stage: 'play', js: "sp.until('w.phase===\"won\"', 90, 'good'); sp.game.update(0.001); sp.game.stageT=0.9" },
  { name: 'S-cleared', course: 1, seed: 11, stage: 'play', js: "sp.until('w.phase===\"won\"', 90, 'good'); sp.game.update(0.001); sp.game.stageT=3; sp.game.update(0.001)" },
];
const withStates = args.includes('--states');
// --courses: one mid-attempt shot of every authored course
const courses = [1, 2, 3, 4, 5, 6].map((c) => ({ name: `K${c}`, course: c, seed: 20 + c, stage: 'play', js: "sp.play(3); sp.until('w.main.phase===\"aim\" && w.main.timer < 0.6', 20)" }));
if (args.includes('--courses')) shots.push(...courses);

for (const size of sizes) {
  const page = await browser.newPage({ viewport: { width: size.width, height: size.height }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') console.log(`[${size.name}] ${m.type()}: ${m.text()}`);
  });
  page.on('pageerror', (e) => console.log(`[${size.name}] pageerror: ${e.message}`));
  await page.goto(`${base}?test&q=${q}`);
  await page.waitForFunction(() => window.__lp && window.__lp.frames > 3, null, { timeout: 90000 });
  let list = size.name === 'portrait' && withStates ? [...shots, ...states] : shots;
  if (only) list = [...shots, ...states].filter((s) => only.includes(s.name));
  for (const s of list) {
    await page.evaluate((s) => {
      const sp = window.__lp;
      if (s.stage === 'title') sp.game.loadTitle();
      else sp.load(s.course, s.seed, s.stage);
      if (s.js) new Function('sp', s.js)(sp);
      sp.pause(true);
    }, s);
    const f0 = await page.evaluate(() => window.__lp.frames);
    await page.waitForFunction((f0) => window.__lp.frames > f0 + 4, f0, { timeout: 180000 });
    const file = join(outDir, `${s.name}-${size.name}.jpg`);
    await page.screenshot({ path: file, type: 'jpeg', quality: 84 });
    console.log('wrote', file);
    await page.evaluate(() => window.__lp.pause(false));
  }
  await page.close();
}

await browser.close();
await server.close();
