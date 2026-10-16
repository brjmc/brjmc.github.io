import './style.css';
import { Game } from './game';
import { Hud } from './ui/hud';
import { Input } from './input';
import { Renderer } from './render/renderer';
import { Quality } from './render/quality';
import { runTestHooks } from './testhooks';
import { Cues } from './ui/cues';
import { Sound } from './audio/audio';
import { haptics } from './haptics';

const params = new URLSearchParams(location.search);
const canvas = document.getElementById('c') as HTMLCanvasElement;
const startCourse = Number(params.get('course')) || 0;

const game = new Game(startCourse || undefined);
if (params.has('seed')) {
  game.fixedSeed = Number(params.get('seed')) | 0;
  if (startCourse) game.load(startCourse, 'brief');
}

const hud = new Hud();
const cues = new Cues(hud);
const sound = new Sound();
hud.setMuted(sound.isMuted);
game.onStage = (s) => {
  hud.showStage(game, s);
  cues.onStage(game, s);
  sound.onStage(s);
};
hud.showStage(game, game.stage);

const renderer = new Renderer(canvas);
const forcedTier = params.has('q') ? Math.max(0, Math.min(2, Number(params.get('q')) | 0)) : null;
const quality = new Quality(renderer, forcedTier);

function resize() {
  renderer.resize(innerWidth, innerHeight);
}
addEventListener('resize', resize);
resize();

/* ---------- input ---------- */
const input = new Input(document.getElementById('touch')!, hud.throwBtn);
input.onPress = () => {
  if (game.stage === 'play') return false;
  game.advance();
  return true;
};
input.onKey = (c) => {
  if (c === 'KeyR') game.restart();
  if (c === 'KeyM') {
    sound.setMuted(!sound.isMuted);
    hud.setMuted(sound.isMuted);
  }
};
hud.restart.addEventListener('click', () => game.restart());
hud.mute.addEventListener('click', () => {
  sound.start();
  sound.setMuted(!sound.isMuted);
  hud.setMuted(sound.isMuted);
});
// audio may only start inside a user gesture
const wake = () => sound.start();
addEventListener('pointerdown', wake, { capture: true });
addEventListener('keydown', wake, { capture: true });
for (const ev of ['gesturestart', 'contextmenu', 'dblclick'] as const) document.addEventListener(ev, (e) => e.preventDefault());
document.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });

/* ---------- loop ---------- */
let last = performance.now();
function frame(now: number) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  const t0 = performance.now();
  input.poll();
  const w = game.world;
  if (game.stage === 'play') {
    w.input.mx = input.mx;
    w.input.mz = input.mz;
    if (input.takeThrow()) w.input.throwQueued = true;
  } else input.takeThrow();
  game.update(dt);
  const wNow = game.world;
  const shot = wNow.carry && game.stage === 'play' ? wNow.predict().outcome : null;
  hud.update(game, input, dt, shot === 'hit');
  cues.update(game, game.events, dt);
  sound.onEvents(game.events, game);
  haptics(game.events, sound.isMuted);
  sound.update(game, dt);
  renderer.onEvents(game.events, game);
  renderer.render(game, dt);
  hud.updateShot(game, shot, shot ? renderer.sushiRect(wNow) : null, Math.sign(wNow.eyeX - wNow.px));
  game.events.length = 0;
  quality.sample(dt, performance.now() - t0, game.stage === 'play');
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

if (params.has('test') || params.has('debug')) runTestHooks(game, renderer);
if (params.has('debug')) void import('./debug').then((m) => m.startDebug(game, renderer, quality));
