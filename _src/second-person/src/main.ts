import './style.css';
import { Game } from './game';
import { makeView } from './sim/projection';
import { Hud } from './ui/hud';
import { Renderer } from './render/renderer';
import { Quality } from './render/quality';
import type { GreyboxRenderer } from './render/greybox';
import { runTestHooks } from './testhooks';
import { Sound } from './audio/audio';
import { haptics } from './haptics';

const params = new URLSearchParams(location.search);
const canvas = document.getElementById('c') as HTMLCanvasElement;
const startLevel = Number(params.get('level')) || 1;

const game = new Game(startLevel, makeView(innerWidth, innerHeight));
if (params.has('seed')) {
  game.fixedSeed = Number(params.get('seed')) | 0;
  game.load(startLevel, 'brief');
}

const hud = new Hud();
const sound = new Sound();
hud.setMuted(sound.isMuted);
game.onStage = (s) => hud.showStage(game, s);
hud.showStage(game, game.stage);

const grey = params.has('greybox');
const renderer = grey ? null : new Renderer(canvas);
// ?greybox: the sim-parity renderer, kept for comparison
let greybox: GreyboxRenderer | null = null;
if (grey)
  void import('./render/greybox').then((m) => {
    greybox = new m.GreyboxRenderer(canvas);
    resize();
  });
const forcedTier = params.has('q') ? Math.max(0, Math.min(2, Number(params.get('q')) | 0)) : null;
const quality = renderer ? new Quality(renderer, forcedTier) : null;

function resize() {
  const v = makeView(innerWidth, innerHeight);
  game.setView(v);
  renderer?.resize(v);
  greybox?.resize(v, Math.min(2, devicePixelRatio || 1));
}
addEventListener('resize', resize);
resize();

/* ---------- input ---------- */
let activePointer = -1;
// audio may only start inside a user gesture
const wake = () => sound.start();
addEventListener('pointerdown', wake, { capture: true });
addEventListener('keydown', wake, { capture: true });

canvas.addEventListener('pointerdown', (e) => {
  if (activePointer !== -1 && e.pointerId !== activePointer) return;
  if (!game.touch()) return;
  activePointer = e.pointerId;
  canvas.setPointerCapture(e.pointerId);
  game.world.pointerDown(e.clientX, e.clientY);
});
canvas.addEventListener('pointermove', (e) => {
  if (e.pointerId !== activePointer) return;
  game.world.pointerMove(e.clientX, e.clientY);
});
const up = (e: PointerEvent) => {
  if (e.pointerId !== activePointer) return;
  activePointer = -1;
  game.world.pointerUp(e.clientX, e.clientY);
};
canvas.addEventListener('pointerup', up);
canvas.addEventListener('pointercancel', up);
document.getElementById('card')!.addEventListener('pointerdown', () => {
  game.touch();
});
hud.restart.addEventListener('click', () => game.restart());
hud.mute.addEventListener('click', () => {
  sound.setMuted(!sound.isMuted);
  hud.setMuted(sound.isMuted);
});
for (const ev of ['gesturestart', 'contextmenu', 'dblclick'] as const) document.addEventListener(ev, (e) => e.preventDefault());
document.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });

/* ---------- loop ---------- */
let last = performance.now();
function frame(now: number) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  const t0 = performance.now();
  game.update(dt);
  hud.update(game);
  sound.onEvents(game.events, game);
  haptics(game.events, sound.isMuted);
  if (renderer) {
    renderer.onEvents(game.events, game.world.time);
    renderer.beat = sound.beat;
    renderer.render(game, dt);
    sound.update(game, renderer.dread, game.world.cam.x, game.world.cam.z, dt);
  } else greybox?.render(game);
  game.events.length = 0;
  quality?.sample(dt, performance.now() - t0, game.stage === 'play');
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

if (params.has('test') || params.has('debug')) runTestHooks(game, renderer);
if (params.has('debug')) void import('./debug').then((m) => m.startDebug(game, renderer, quality));
