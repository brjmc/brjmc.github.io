// One short line of text at a time: the course-one tutorial, a word when a course's new idea
// first shows up, and reactions (prototype: "HIS EYES ARE WATERING", "HE CAN BARELY SEE").

import type { Game, Stage } from '../game';
import type { SimEvent } from '../sim/world';
import type { Hud } from './hud';

const HIT_LINES = ['His eyes are watering', 'He can barely see', 'He is crying into his tea', 'He is reaching for a napkin'];

export class Cues {
  private seen = new Set<string>();
  private course = 0;
  private moved = 0;

  constructor(private hud: Hud) {}

  onStage(game: Game, s: Stage) {
    if (game.course !== this.course || s === 'brief') {
      this.course = game.course;
      this.seen.clear();
      this.moved = 0;
    }
    if (s === 'play') {
      if (game.cfg.tutorial) this.once('move', 'Drag anywhere to move', '', 4);
      else if (game.course === 6) this.once('c6', 'Last orders', '', 2);
    }
  }

  private once(key: string, text: string, cls = '', ttl = 2) {
    if (this.seen.has(key)) return;
    this.seen.add(key);
    this.hud.say(text, cls, ttl);
  }

  update(game: Game, events: SimEvent[], dt: number) {
    if (game.stage !== 'play') return;
    const w = game.world;
    const tut = !!game.cfg.tutorial;
    this.moved += Math.hypot(w.vx, w.vz) * dt;
    if (tut && this.moved > 3 && this.seen.has('move') && !this.seen.has('moved')) {
      this.seen.add('moved');
      this.hud.say('', '', 0);
    }
    for (const e of events) {
      switch (e.t) {
        case 'aim':
          if (tut) this.once('aim', e.n > 1 ? 'Two at once. Keep moving' : 'Get out from under the tips', 'bad', 1.8);
          if (e.who === 'comp') this.once('comp', 'Her chopsticks, from across the table', 'bad', 2.2);
          if (e.sweep) this.once('sweep', 'A sweep. Get off the line', 'bad', 2);
          break;
        case 'land':
          if (tut && !w.carry) this.once('land', 'He dropped the wasabi. Grab it', 'good', 2.4);
          break;
        case 'pickup':
          if (tut) this.once('pickup', 'Throw when the corners turn green', 'good', 3);
          break;
        case 'throw':
          if (e.outcome === 'wide') this.hud.say(tut ? 'Wide. Line up with his eye' : 'Wide', 'bad', 1.6);
          else if (e.outcome === 'clip') this.hud.say(tut ? 'The chopsticks were in the way' : 'Clipped the chopsticks', 'bad', 1.6);
          break;
        case 'hit': {
          const left = game.cfg.hitsToWin - e.n;
          if (left > 0) this.hud.say(tut && e.n === 1 ? `In the eye. ${left === 2 ? 'Two' : left} more` : HIT_LINES[Math.min(HIT_LINES.length - 1, e.n - 1)], 'good', 1.8);
          break;
        }
        case 'guard':
          if (e.on) this.once('guard', 'He is guarding his eye. Make him strike first', 'bad', 2.6);
          break;
        case 'soy':
          this.once('soy', 'Soy. Slow going', '', 1.6);
          break;
        case 'hide':
          if (e.on) this.once('hide', 'Hidden in the daikon', 'good', 1.8);
          break;
        case 'moundReady':
          break;
        case 'empty':
          this.hud.say('Nothing to throw', '', 1);
          break;
      }
    }
  }
}
