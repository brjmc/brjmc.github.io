// ?debug: fps / frame time / draw calls overlay and a lil-gui panel for live tuning.
// The panel edits game.tune, a copy of the frozen DEFAULTS; shipped values never change.

import type { Game } from './game';
import type { Quality } from './render/quality';
import { TIERS, type Renderer } from './render/renderer';
import { DEFAULTS, type Tuning } from './sim/constants';

export async function startDebug(game: Game, renderer: Renderer, quality: Quality) {
  const { default: GUI } = await import('lil-gui');

  const box = document.createElement('pre');
  box.style.cssText =
    'position:fixed;left:8px;bottom:calc(max(12px, env(safe-area-inset-bottom)) + 44px);margin:0;padding:6px 8px;font:10px/1.5 ui-monospace,Menlo,monospace;color:#f3e6cf;background:rgba(13,10,12,.8);pointer-events:none;z-index:20;white-space:pre';
  document.body.appendChild(box);

  let frames = 0;
  let acc = 0;
  let last = performance.now();
  const tick = () => {
    const now = performance.now();
    acc += now - last;
    last = now;
    frames++;
    if (acc > 500) {
      const w = game.world;
      const s = w.main;
      box.textContent =
        `${Math.round((frames * 1000) / acc)} fps  ${(acc / frames).toFixed(1)} ms\n` +
        `cpu ${quality.cpuMs.toFixed(2)} ms\n` +
        `draws ${renderer.drawCalls}  tris ${(renderer.triangles / 1000).toFixed(1)}k\n` +
        `tier ${renderer.tier.name}${quality.forced ? ' (forced)' : ''}  dpr ${devicePixelRatio}\n` +
        `course ${game.course}  seed ${w.seed}  hits ${w.hits}/${w.course.hitsToWin}  hp ${w.hp}\n` +
        `sticks ${s.phase} ${s.timer.toFixed(2)}  lane ${(w.px - w.eyeX).toFixed(2)} cm\n` +
        `shot ${w.carry ? w.predict().outcome : '-'}`;
      frames = 0;
      acc = 0;
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);

  const gui = new GUI({ title: 'The Last Piece (debug)', width: 260 });
  gui.domElement.style.zIndex = '30';
  gui.close();

  const lv = { course: game.course, seed: 0, go: () => game.load(lv.course, 'play', lv.seed || undefined) };
  const fl = gui.addFolder('Course');
  fl.add(lv, 'course', 1, 30, 1);
  fl.add(lv, 'seed', 0, 9999, 1).name('seed (0 = random)');
  fl.add(lv, 'go').name('load');

  const q = { tier: renderer.tier.name };
  gui
    .add(q, 'tier', TIERS.map((t) => t.name))
    .name('quality tier')
    .onChange((n: string) => renderer.setTier(TIERS.find((t) => t.name === n)!));

  const t = game.tune;
  const groups: Record<string, (keyof Tuning)[]> = {
    Sushi: ['maxSpeed', 'accel', 'friction', 'bodyR', 'hitRX', 'hitRZ', 'pickRX', 'pickRZ', 'hurtTime', 'knockSpeed', 'soySlow', 'daikonSlow'],
    Eye: ['eyeY', 'laneHalf', 'lensZ'],
    Throw: ['throwG', 'throwSpeed', 'throwMinT', 'throwMaxT', 'blobR'],
    Wasabi: ['blobLife', 'clipLife', 'shedLife', 'moundRefill'],
    Chopsticks: ['hoverRest', 'restSepOpen', 'sepShut', 'aimHover', 'stabFloor', 'liftHover', 'fumbleHover', 'fumbleTime', 'dropTime', 'sweepTime', 'sweepLen', 'sweepHitR', 'feintAt', 'feintExtra'],
  };
  for (const [name, keys] of Object.entries(groups)) {
    const f = gui.addFolder(name);
    f.close();
    for (const k of keys) {
      const v = DEFAULTS[k];
      f.add(t, k, 0, Math.max(1, Math.abs(v) * 3)).listen();
    }
  }
  gui.add({ reset: () => Object.assign(t, DEFAULTS) }, 'reset').name('reset to shipped defaults');
}
