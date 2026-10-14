// Animation review: step the sim by hand and tile crops around one figure.
// Usage: node scripts/filmstrip.mjs <scenario> <out.png> [portrait|landscape]
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const [scenario, out, orient = 'portrait'] = process.argv.slice(2);

// Each scenario: setup (runs once), per-frame steps, number of frames, target figure, crop size (m).
const S = {
  walk: { setup: `sp.load(1, 4, 'play'); sp.walk(2); const w = sp.game.world; const p = sp.project(w.player.x, 0, w.player.z - 5); w.pointerDown(p.x, p.y);`, steps: 5, frames: 10, target: 'player', size: 2.6 },
  chaser: { setup: `sp.load(1, 4, 'play'); const w = sp.game.world; w.chaser.x = w.player.x + 0.9; w.chaser.z = w.player.z + 3.2;`, steps: 6, frames: 10, target: 'chaser', size: 3.0 },
  crowd: { setup: `sp.load(3, 2, 'play'); sp.walk(9);`, steps: 6, frames: 8, target: 'player', size: 7 },
  shove: { setup: `sp.load(1, 4, 'play'); sp.walk(1.5); const w = sp.game.world; for (let i = 0; i < 5; i++) w.spawnPedAt(w.player.x + (i - 2) * 0.55, w.player.z - 1.6 - (i % 2) * 0.5); const p = sp.project(w.player.x, 0.14, w.player.z); w.pointerDown(p.x, p.y); window.__phase = 0;`,
    steps: 8, frames: 14, target: 'player', size: 5,
    each: `window.__phase++; if (window.__phase === 9) { const p = sp.project(w.player.x, 0, w.player.z - 6); w.pointerMove(p.x, p.y); w.pointerUp(p.x, p.y); }` },
  bump: { setup: `sp.load(1, 4, 'play'); sp.walk(1.5); const w = sp.game.world; w.spawnPedAt(w.player.x, w.player.z - 2.2); const p = sp.project(w.player.x, 0, w.player.z - 5); w.pointerDown(p.x, p.y);`, steps: 5, frames: 10, target: 'player', size: 3 },
  caught: { setup: `sp.load(1, 4, 'play'); sp.walk(1); const w = sp.game.world; w.chaser.x = w.player.x + 0.3; w.chaser.z = w.player.z + 2.0;`, steps: 0, frames: 10, target: 'player', size: 4.5, real: 160 },
  hit: { setup: `sp.load(2, 9, 'play'); const w = sp.game.world; w.player.x = 1.6; sp.walk(0.2); w.cars.length = 0; w.player.x = 2.4; w.player.px = 2.4;`, steps: 0, frames: 10, target: 'player', size: 6, real: 160,
    pre: `const w = sp.game.world; if (w.phase === 'play') { w.cars.push({ id: 999, x: 2.6, z: w.player.z + 9, px: 2.6, pz: w.player.z + 9, dir: -1, spd: 20, w: 1.95, d: 4.4, h: 1.42, long: false, colour: 1, lane: 0, side: 1, missed: false }); }` },
};

const sc = S[scenario];
if (!sc) throw new Error('unknown scenario ' + scenario);
const vp = orient === 'landscape' ? { width: 844, height: 390 } : { width: 390, height: 844 };
const server = await createServer({ root, logLevel: 'error', server: { port: 5185, hmr: false, watch: null } });
await server.listen();
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: vp, deviceScaleFactor: 2 });
page.on('pageerror', (e) => console.log('pageerror', e.message));
await page.goto(server.resolvedUrls.local[0] + '?test&q=2');
await page.waitForFunction(() => window.__sp && window.__sp.frames > 3);
await page.evaluate(`{ const sp = window.__sp; { ${sc.setup} } { ${sc.pre ?? ''} } sp.pause(${sc.real ? 'false' : 'true'}); }`);
const dir = mkdtempSync(join(tmpdir(), 'strip-'));
const files = [];
for (let i = 0; i < sc.frames; i++) {
  if (sc.real) await page.waitForTimeout(sc.real);
  const rect = await page.evaluate(`(() => { const sp = window.__sp; const w = sp.game.world; ${sc.each ?? ''} sp.step(${sc.steps});
    const t = ${sc.target === 'chaser' ? 'w.chaser' : 'w.player'};
    const feet = sp.project(t.x, 0.1, t.z); const head = sp.project(t.x, 1.9, t.z);
    const s = Math.abs(feet.y - head.y) / 1.8; const h = s * ${sc.size}; const wpx = h * 0.75;
    return { x: feet.x - wpx / 2, y: feet.y - h * 0.8, w: wpx, h };
  })()`);
  const f0 = await page.evaluate(() => window.__sp.frames);
  await page.waitForFunction((f0) => window.__sp.frames > f0 + 2, f0);
  const file = join(dir, `f${String(i).padStart(2, '0')}.png`);
  const clip = { x: Math.max(0, rect.x), y: Math.max(0, rect.y), width: Math.min(rect.w, vp.width - Math.max(0, rect.x)), height: Math.min(rect.h, vp.height - Math.max(0, rect.y)) };
  await page.screenshot({ path: file, clip });
  files.push(file);
}
await browser.close();
await server.close();
execFileSync('python3', ['-c', `
import sys
from PIL import Image
fs = sys.argv[2:]
ims = [Image.open(f).convert('RGB') for f in fs]
h = 420
ims = [im.resize((max(1, int(im.width * h / im.height)), h)) for im in ims]
cols = 5
rows = (len(ims) + cols - 1) // cols
W = max(im.width for im in ims)
out = Image.new('RGB', (W * cols, h * rows), (0, 0, 0))
for i, im in enumerate(ims):
    out.paste(im, ((i % cols) * W, (i // cols) * h))
out.save(sys.argv[1])
`, out, ...files]);
console.log('wrote', out);
