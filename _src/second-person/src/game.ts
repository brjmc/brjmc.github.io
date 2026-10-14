// Level flow around a World: briefing -> play -> dying/clearing -> failed/cleared card.
// No three.js. The main loop feeds it real time; it steps the sim at a fixed rate.

import { SIM_DT, makeTuning, type Tuning } from './sim/constants';
import { levelCfg, type LevelCfg } from './sim/levels';
import { makeView, type View } from './sim/projection';
import { World, type SimEvent } from './sim/world';

export type Stage = 'brief' | 'play' | 'dying' | 'failed' | 'clearing' | 'cleared';

const DYING_TIME = 1.1; // real seconds of slow motion before the failed card
const CLEARING_TIME = 0.9;
const CARD_GUARD = 0.35; // ignore touches this soon after a card appears
const MAX_STEPS = 12; // never try to catch up more than 0.1 s of sim in one frame

export class Game {
  level = 1;
  stage: Stage = 'brief';
  world!: World;
  cfg!: LevelCfg;
  tune: Tuning;
  view: View;
  /** 0..1 interpolation factor between the last two sim states. */
  alpha = 1;
  /** Sim seconds per real second (slow motion on death). */
  timeScale = 1;
  stageT = 0;
  attempt = 0;
  fixedSeed: number | null = null;
  paused = false;
  events: SimEvent[] = [];
  private acc = 0;
  onStage: (s: Stage) => void = () => {};

  constructor(level = 1, view?: View, tune?: Tuning) {
    this.tune = tune ?? makeTuning();
    this.view = view ?? makeView(390, 844);
    this.load(level, 'brief');
  }

  get seed() {
    return this.world.seed;
  }

  load(level: number, stage: Stage = 'brief', seed?: number) {
    this.level = Math.max(1, Math.floor(level));
    this.cfg = levelCfg(this.level);
    this.attempt++;
    const s = seed ?? this.fixedSeed ?? (Math.random() * 2 ** 31) | 0;
    this.world = new World(this.cfg, s, this.tune, this.view);
    this.acc = 0;
    this.alpha = 1;
    this.timeScale = 1;
    this.setStage(stage);
  }

  setView(v: View) {
    this.view = v;
    this.world.view = v;
  }

  private setStage(s: Stage) {
    this.stage = s;
    this.stageT = 0;
    this.onStage(s);
  }

  /** A touch on the canvas. Returns true if it should also reach the world as input. */
  touch(): boolean {
    switch (this.stage) {
      case 'brief':
        this.setStage('play');
        return true;
      case 'failed':
        if (this.stageT < CARD_GUARD) return false;
        this.load(this.level, 'play');
        return true;
      case 'cleared':
        if (this.stageT < CARD_GUARD) return false;
        this.load(this.level + 1, 'brief');
        return false;
      case 'play':
        return true;
      default:
        return false;
    }
  }

  restart() {
    this.load(this.level, 'play');
  }

  /** Advance by real seconds. Drains sim events into this.events. */
  update(realDt: number) {
    this.stageT += realDt;
    const w = this.world;

    if (this.stage === 'dying') {
      // a hard stop, then a slow crawl, then freeze
      // a car freezes the frame outright; being caught is a short slow crawl, then a freeze
      if (this.world.deathCause === 'car') this.timeScale = 0;
      else this.timeScale = this.stageT < 0.08 ? 0 : this.stageT < 0.9 ? 0.12 : 0;
      if (this.stageT >= DYING_TIME) this.setStage('failed');
    } else if (this.stage === 'clearing') {
      this.timeScale = 0.6;
      if (this.stageT >= CLEARING_TIME) this.setStage('cleared');
    } else if (this.stage === 'play') this.timeScale = 1;
    else this.timeScale = this.stage === 'failed' ? 0 : 1;

    const stepping = !this.paused && (this.stage === 'play' || this.stage === 'dying' || this.stage === 'clearing');
    if (stepping) {
      this.acc += realDt * this.timeScale;
      let n = 0;
      while (this.acc >= SIM_DT && n < MAX_STEPS) {
        w.step(SIM_DT);
        this.acc -= SIM_DT;
        n++;
        if (this.stage === 'play' && w.phase !== 'play') {
          this.setStage(w.phase === 'dead' ? 'dying' : 'clearing');
          break;
        }
      }
      if (n === MAX_STEPS) this.acc = 0;
      this.alpha = Math.min(1, this.acc / SIM_DT);
    } else this.alpha = 1;
    w.drainEvents(this.events);
  }

  /** Step the sim directly (tests, screenshots). */
  advance(seconds: number) {
    const n = Math.round(seconds / SIM_DT);
    for (let i = 0; i < n && this.world.phase === 'play'; i++) this.world.step(SIM_DT);
    this.acc = 0;
    this.alpha = 1;
  }
}
