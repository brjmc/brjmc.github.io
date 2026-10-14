// Smoke test in a real browser: start a level by touch, walk, toggle mute, restart; report errors.
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { createServer } from 'vite';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const server = await createServer({ root, logLevel: 'error', server: { port: 5191, hmr: false, watch: null } });
await server.listen();
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
const errs = [];
page.on('pageerror', (e) => errs.push('pageerror ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errs.push('console ' + m.text()); });
await page.goto(server.resolvedUrls.local[0] + '?debug&level=4&seed=5&q=0');
await page.waitForFunction(() => window.__sp && window.__sp.frames > 2);
await page.mouse.click(195, 700); // begin (card) -> also wakes audio
await page.mouse.move(195, 790);
await page.mouse.down();
await page.waitForTimeout(6000);
await page.mouse.up();
const st = await page.evaluate(() => ({ stage: window.__sp.game.stage, dist: window.__sp.game.world.distance.toFixed(1), gui: !!document.querySelector('.lil-gui'), overlay: [...document.querySelectorAll('pre')].map(p => p.textContent).join('|') }));
// toggle mute and restart
await page.click('#mute');
const muted = await page.evaluate(() => document.querySelector('#mute').getAttribute('aria-pressed'));
await page.click('#restart');
const after = await page.evaluate(() => ({ stage: window.__sp.game.stage, dist: window.__sp.game.world.distance }));
console.log(JSON.stringify({ st, muted, after, errs }, null, 1));
await browser.close(); await server.close();
