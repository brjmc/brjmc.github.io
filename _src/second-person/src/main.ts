import './style.css';
import { Game } from './game';
import { makeView } from './sim/projection';
import { Hud } from './ui/hud';
import { GreyboxRenderer } from './render/greybox';
import { runTestHooks } from './testhooks';

const params = new URLSearchParams(location.search);
const canvas = document.getElementById('c') as HTMLCanvasElement;
const startLevel = Number(params.get('level')) || 1;

const game = new Game(startLevel, makeView(innerWidth, innerHeight));
if (params.has('seed')) game.fixedSeed = Number(params.get('seed')) | 0;
if (params.has('seed')) game.load(startLevel, 'brief');

const hud = new Hud();
game.onStage = (s) => hud.showStage(game, s);
hud.showStage(game, game.stage);

const renderer = new GreyboxRenderer(canvas);

function resize() {
  const v = makeView(innerWidth, innerHeight);
  game.setView(v);
  renderer.resize(v, Math.min(2, devicePixelRatio || 1));
}
addEventListener('resize', resize);
resize();

/* ---------- input ---------- */
let activePointer = -1;
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
for (const ev of ['gesturestart', 'contextmenu', 'dblclick'] as const) document.addEventListener(ev, (e) => e.preventDefault());
document.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });

/* ---------- loop ---------- */
let last = performance.now();
function frame(now: number) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  game.update(dt);
  game.events.length = 0;
  hud.update(game);
  renderer.render(game);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

if (params.has('test') || params.has('debug')) runTestHooks(game);
