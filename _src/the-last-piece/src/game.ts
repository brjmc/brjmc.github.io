// Course flow around a World: title -> brief -> play -> finale | eaten -> cleared | failed.
// No three.js. The main loop feeds it real time; it steps the sim at a fixed rate.

import { SIM_DT, makeTuning, type Tuning } from './sim/constants';
import { courseCfg, LAST_AUTHORED, type CourseCfg } from './sim/courses';
import { botStep, makeMem, type BotMem } from './sim/bot';
import { World, type SimEvent } from './sim/world';

export type Stage = 'title' | 'brief' | 'play' | 'finale' | 'eaten' | 'cleared' | 'failed';

export const FINALE_TIME = 2.4; // the eye squeezes shut, the chopsticks go down
export const EATEN_TIME = 2.9; // lifted, carried to the mouth, gone
const CARD_GUARD = 0.45; // ignore touches this soon after a card appears
const MAX_STEPS = 12;

export interface Progress {
  reached: number;
  best: Record<number, { time: number; fresh: number }>;
}

function loadProgress(): Progress {
  try {
    const p = JSON.parse(localStorage.getItem('tlp-progress') ?? '');
    if (p && typeof p.reached === 'number') return { reached: p.reached, best: p.best ?? {} };
  } catch {
    /* none yet, or storage blocked */
  }
  return { reached: 1, best: {} };
}

export class Game {
  course = 1;
  stage: Stage = 'title';
  world!: World;
  cfg!: CourseCfg;
  tune: Tuning;
  /** 0..1 interpolation factor between the last two sim states. */
  alpha = 1;
  stageT = 0;
  attempt = 0;
  fixedSeed: number | null = null;
  paused = false;
  /** Hit-stop: real seconds left with the sim held. */
  freeze = 0;
  events: SimEvent[] = [];
  progress: Progress = loadProgress();
  /** The title screen plays itself. */
  private demo: BotMem | null = null;
  private acc = 0;
  onStage: (s: Stage) => void = () => {};

  constructor(course?: number, tune?: Tuning) {
    this.tune = tune ?? makeTuning();
    if (course) this.load(course, 'brief');
    else this.loadTitle();
  }

  get seed() {
    return this.world.seed;
  }

  loadTitle() {
    this.load(1, 'title');
    this.demo = makeMem(7);
  }

  load(course: number, stage: Stage = 'brief', seed?: number) {
    this.course = Math.max(1, Math.floor(course));
    this.cfg = courseCfg(this.course);
    this.attempt++;
    const s = seed ?? this.fixedSeed ?? (Math.random() * 2 ** 31) | 0;
    this.world = new World(this.cfg, s, this.tune);
    this.acc = 0;
    this.alpha = 1;
    this.freeze = 0;
    this.demo = null;
    this.setStage(stage);
  }

  /** Real time the current stage began (the card guard uses wall time, not game time). */
  private stageAt = 0;

  private setStage(s: Stage) {
    this.stage = s;
    this.stageT = 0;
    this.stageAt = typeof performance !== 'undefined' ? performance.now() : 0;
    this.onStage(s);
  }

  /** Start / continue / retry from a card. Returns true if the touch was consumed. */
  advance(): boolean {
    const since = typeof performance !== 'undefined' ? (performance.now() - this.stageAt) / 1000 : this.stageT;
    if (since < CARD_GUARD && this.stage !== 'title') return false;
    switch (this.stage) {
      case 'title':
        this.load(Math.min(this.progress.reached, LAST_AUTHORED + 20), 'brief');
        return true;
      case 'brief':
        this.setStage('play');
        return true;
      case 'failed':
        this.load(this.course, 'play');
        return true;
      case 'cleared':
        this.load(this.course + 1, 'brief');
        return true;
      default:
        return false;
    }
  }

  restart() {
    if (this.stage === 'title') return;
    this.load(this.course, 'play');
  }

  private saveProgress() {
    const w = this.world;
    const p = this.progress;
    p.reached = Math.max(p.reached, this.course + 1);
    const prev = p.best[this.course];
    if (!prev || w.stats.time < prev.time) p.best[this.course] = { time: w.stats.time, fresh: w.hp };
    try {
      localStorage.setItem('tlp-progress', JSON.stringify(p));
    } catch {
      /* storage blocked: progress lasts for this visit only */
    }
  }

  update(realDt: number) {
    if (this.paused) return;
    this.stageT += realDt;
    const w = this.world;
    switch (this.stage) {
      case 'brief':
      case 'cleared':
      case 'failed':
        // the world idles behind the card: breathing, blinking, nothing attacks
        this.stepCosmetic(realDt);
        return;
      case 'finale':
        this.stepSim(realDt);
        if (this.stageT >= FINALE_TIME) this.setStage('cleared');
        return;
      case 'eaten':
        this.stepSim(realDt);
        if (this.stageT >= EATEN_TIME) this.setStage('failed');
        return;
      case 'title':
        if (w.phase !== 'play' || w.stats.time > 70) this.loadTitle();
        this.stepSim(realDt, this.demo ?? undefined);
        return;
      case 'play':
        if (this.freeze > 0) {
          this.freeze = Math.max(0, this.freeze - realDt);
          return;
        }
        this.stepSim(realDt);
        for (const e of this.events) {
          if (e.t === 'hit') this.freeze = Math.max(this.freeze, 0.09);
          if (e.t === 'hurt') this.freeze = Math.max(this.freeze, 0.07);
        }
        if (w.phase === 'won') {
          this.saveProgress();
          this.setStage('finale');
        } else if (w.phase === 'eaten') this.setStage('eaten');
        return;
    }
  }

  private stepSim(realDt: number, demo?: BotMem) {
    const w = this.world;
    this.acc += realDt;
    let n = 0;
    while (this.acc >= SIM_DT && n < MAX_STEPS) {
      if (demo) botStep(w, 'dodger', demo);
      w.step(SIM_DT);
      this.events.push(...w.events);
      w.events.length = 0;
      this.acc -= SIM_DT;
      n++;
    }
    if (n === MAX_STEPS) this.acc = 0;
    this.alpha = Math.min(1, this.acc / SIM_DT);
  }

  /** Behind a card: keep time moving for the eye and the breathing, but not the attack. */
  private stepCosmetic(realDt: number) {
    const w = this.world;
    const time = w.stats.time;
    for (const s of w.sticks) if (s.phase === 'idle') s.timer = Math.max(s.timer, 1);
    this.stepSim(realDt);
    w.stats.time = time;
  }
}
