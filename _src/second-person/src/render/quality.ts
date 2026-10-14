// Automatic quality tiers from measured frame time. Drops quickly, raises at most once.

import { TIERS, type Renderer } from './renderer';

export class Quality {
  private idx: number;
  private acc = 0;
  private frames = 0;
  private window = 0;
  private raised = false;
  private fastFor = 0;
  readonly forced: boolean;
  /** Recent averages, for the debug overlay. */
  frameMs = 16.7;
  cpuMs = 0;

  constructor(
    private r: Renderer,
    forced: number | null,
  ) {
    this.forced = forced !== null;
    const dpr = window.devicePixelRatio || 1;
    this.idx = forced ?? (dpr >= 1.5 ? 1 : 2);
    r.setTier(TIERS[this.idx]);
  }

  get tier() {
    return this.idx;
  }

  sample(dt: number, cpuMs: number, playing: boolean) {
    this.frameMs = this.frameMs * 0.95 + dt * 1000 * 0.05;
    this.cpuMs = this.cpuMs * 0.95 + cpuMs * 0.05;
    if (this.forced || !playing || dt > 0.09) return; // ignore hitches and tab switches
    this.acc += dt;
    this.frames++;
    this.window += dt;
    if (this.window < 2) return;
    const avg = (this.acc / this.frames) * 1000;
    this.acc = 0;
    this.frames = 0;
    this.window = 0;
    if (avg > 21 && this.idx > 0) {
      this.idx--;
      this.r.setTier(TIERS[this.idx]);
      this.fastFor = 0;
    } else if (avg < 13.5 && this.idx < TIERS.length - 1 && !this.raised) {
      this.fastFor += 2;
      if (this.fastFor >= 6) {
        this.idx++;
        this.raised = true;
        this.r.setTier(TIERS[this.idx]);
      }
    } else this.fastFor = 0;
  }
}
