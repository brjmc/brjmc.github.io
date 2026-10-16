// Smoke test in a real browser: title -> brief -> play by touch, drag the stick, tap to throw,
// toggle sound, restart, play a bot run to the bill; report errors.
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
await page.goto(server.resolvedUrls.local[0] + '?debug&q=0&seed=5');
await page.waitForFunction(() => window.__lp && window.__lp.frames > 2);
const stage = () => page.evaluate(() => window.__lp.game.stage);
const log = [];
log.push(['start', await stage()]);
await page.mouse.click(195, 500); // title -> brief (also wakes audio)
await page.waitForTimeout(700);
log.push(['after tap 1', await stage()]);
await page.mouse.click(195, 500); // brief -> play
await page.waitForTimeout(400);
log.push(['after tap 2', await stage()]);
// drag the floating stick to the right for a second
await page.mouse.move(150, 650);
await page.mouse.down();
await page.mouse.move(210, 650, { steps: 6 });
await page.waitForTimeout(900);
const moved = await page.evaluate(() => window.__lp.game.world.px);
await page.mouse.up();
log.push(['moved px', +moved.toFixed(2)]);
// a quick tap throws (nothing in hand -> 'empty')
await page.mouse.click(200, 600);
await page.waitForTimeout(200);
// sound toggle and restart
await page.click('#mute');
const muted = await page.evaluate(() => document.querySelector('#mute').getAttribute('aria-pressed'));
await page.click('#mute');
await page.click('#restart');
log.push(['after restart', await stage(), await page.evaluate(() => window.__lp.game.world.stats.time.toFixed(2))]);
// let a bot finish the course and see the bill
await page.evaluate(() => window.__lp.until('w.phase!=="play"', 120, 'good'));
await page.waitForTimeout(3500);
log.push(['end', await stage(), await page.evaluate(() => window.__lp.game.world.phase)]);
const audio = await page.evaluate(() => typeof AudioContext !== 'undefined');
const gui = await page.evaluate(() => !!document.querySelector('.lil-gui'));
console.log(JSON.stringify({ log, muted, audio, gui, errs }, null, 1));
await browser.close(); await server.close();
