// The game world: one piece of sushi, the diner's eye, his chopsticks (and on course 4 hers),
// wasabi on the plate and in the air. Pure TypeScript, fixed step, seeded randomness.

import { SIM_DT, approach, clamp, ease, lerp, type Tuning } from './constants';
import { stageFor, type CourseCfg, type PlateProp, type Stage } from './courses';
import { Rng } from './rng';
import { clampInside, ellipseR, inset, sdRRect, type RRect } from './shape';
import { arcAt, firstBlock, makeArc, type Arc, type StickPose, type V3 } from './throw';

export type Phase = 'play' | 'won' | 'eaten';
export type AttemptPhase = 'idle' | 'aim' | 'stab' | 'sweep' | 'fumble';
export type Who = 'main' | 'comp';
export type Outcome = 'hit' | 'clip' | 'wide';

export type SimEvent =
  | { t: 'step'; foot: number }
  | { t: 'pickup'; x: number; z: number; src: 'blob' | 'mound' }
  | { t: 'throw'; id: number; outcome: Outcome }
  | { t: 'clip'; id: number; x: number; y: number; z: number; who: Who }
  | { t: 'wide'; id: number; side: number }
  | { t: 'hit'; id: number; n: number; u: number; v: number }
  | { t: 'aim'; who: Who; n: number; sweep: boolean }
  | { t: 'feint'; who: Who; x: number; z: number }
  | { t: 'stab'; who: Who; x: number; z: number; hit: boolean; near: number }
  | { t: 'sweepDown'; who: Who }
  | { t: 'hurt'; hp: number; x: number; z: number; who: Who }
  | { t: 'fumble'; who: Who }
  | { t: 'drop'; who: Who }
  | { t: 'land'; x: number; z: number }
  | { t: 'expire'; x: number; z: number }
  | { t: 'blink' }
  | { t: 'guard'; on: boolean }
  | { t: 'soy' }
  | { t: 'hide'; on: boolean }
  | { t: 'moundReady' }
  | { t: 'empty' }
  | { t: 'won' }
  | { t: 'eaten' };

export interface Input {
  /** Desired direction and strength, |(mx, mz)| <= 1. mz > 0 = away from the diner. */
  mx: number;
  mz: number;
  /** Edge-triggered: set by input, consumed by the next step. */
  throwQueued: boolean;
}

export interface Mark {
  x: number;
  z: number;
  feint: boolean;
  retargeted: boolean;
  fired: boolean;
  start: number; // offset into the volley (s)
  len: number; // slot length (s)
  fireAt: number; // offset within the slot at which it lands (s)
}

export interface Sweep {
  ax: number;
  az: number;
  bx: number;
  bz: number;
  /** 0..1 progress of the drag; -1 before it touches down. */
  k: number;
  hit: boolean;
}

export interface Blob {
  id: number;
  x: number;
  z: number;
  life: number;
  max: number;
}

export interface Drop {
  x0: number;
  y0: number;
  z0: number;
  x1: number;
  z1: number;
  t: number;
  dur: number;
  life: number;
}

export interface Throw {
  id: number;
  arc: Arc;
  t: number;
  outcome: Outcome;
  /** For clips: when and where it meets the stick. */
  blockT: number;
  bx: number;
  by: number;
  bz: number;
  who: Who;
  done: boolean;
}

export interface Mound {
  x: number;
  z: number;
  r: number;
  charge: number; // 0..1, ready at 1
}

export interface Wall {
  x: number;
  z: number;
  r: number;
}

export class Sticks implements StickPose {
  // pose (StickPose)
  tx = 0;
  ty = 10;
  tz = 30;
  sep = 3.6;
  ax = 10;
  ay = 14;
  az = 5;
  // previous step, for render interpolation
  ptx = 0;
  pty = 10;
  ptz = 30;
  psep = 3.6;
  pax = 10;
  pay = 14;
  paz = 5;

  phase: AttemptPhase = 'idle';
  timer = 1.6;
  burst = 0;
  marks: Mark[] = [];
  sweep: Sweep | null = null;
  lob: { x: number; z: number } | null = null;
  holding = false;
  guarding = false;
  /** Closure 0 (open) .. 1 (shut), for the render. */
  close = 0;
  /** Seconds since this pair last hit the plate (for the render's impact flash). */
  sinceStab = 9;
  sweepHover = 0;

  constructor(readonly who: Who) {}

  savePrev() {
    this.ptx = this.tx;
    this.pty = this.ty;
    this.ptz = this.tz;
    this.psep = this.sep;
    this.pax = this.ax;
    this.pay = this.ay;
    this.paz = this.az;
  }

  /** Seconds until the next unfired mark lands, or Infinity. */
  nextStrikeIn(): number {
    let best = Infinity;
    for (const m of this.marks) {
      if (m.fired) continue;
      const at = this.phase === 'aim' ? this.timer + m.start + m.fireAt : m.start + m.fireAt - this.burst;
      if (at < best) best = at;
    }
    return best;
  }
}

export interface Stats {
  time: number;
  throws: number;
  hits: number;
  clips: number;
  wides: number;
  hurt: number;
  pickups: number;
}

export class World {
  private nextId = 1;
  readonly rng: Rng;
  readonly tune: Tuning;
  readonly course: CourseCfg;
  phase: Phase = 'play';
  time = 0;

  // the sushi
  px = 0;
  pz = 0;
  ppx = 0;
  ppz = 0;
  vx = 0;
  vz = 0;
  face = 1;
  hp = 5;
  hurt = 0;
  carry = false;
  throwAnim = 0;
  hidden = false;
  inSoy = false;
  stepPhase = 0;
  panic = 0;
  /** Last place the diner saw you (you are hidden in the daikon). */
  seenX = 0;
  seenZ = 0;

  // the diner's eye
  eyeX = 0;
  peyeX = 0;
  eyeV = 0;
  eyeY: number;
  eyeZ = 0;
  hits = 0;
  sting = 0;
  blinkT = 4;
  blink = 0; // 0 = open; 0..1 closing, 1..2 opening
  lurch = 0;

  readonly plate: RRect;
  readonly walk: RRect;
  readonly plateTop: number;
  readonly walls: Wall[] = [];
  readonly puddles: Extract<PlateProp, { kind: 'puddle' }>[] = [];
  readonly daikon: Extract<PlateProp, { kind: 'daikon' }>[] = [];
  readonly mounds: Mound[] = [];

  readonly main = new Sticks('main');
  readonly comp: Sticks | null;
  readonly sticks: Sticks[];

  blobs: Blob[] = [];
  drops: Drop[] = [];
  throws: Throw[] = [];
  events: SimEvent[] = [];
  readonly input: Input = { mx: 0, mz: 0, throwQueued: false };
  readonly stats: Stats = { time: 0, throws: 0, hits: 0, clips: 0, wides: 0, hurt: 0, pickups: 0 };

  constructor(course: CourseCfg, readonly seed: number, tune: Tuning) {
    this.course = course;
    this.tune = tune;
    this.rng = new Rng(seed);
    this.eyeY = tune.eyeY;
    this.hp = course.freshness;
    const p = course.plate;
    this.plate = { cx: 0, cz: p.cz, hx: p.hx, hz: p.hz, r: p.r };
    this.walk = inset(this.plate, p.rim + tune.bodyR);
    this.plateTop = p.top;
    for (const pr of course.props) {
      const x = pr.x;
      const z = p.cz + pr.z;
      if (pr.kind === 'dish' || pr.kind === 'gari') this.walls.push({ x, z, r: pr.r });
      else if (pr.kind === 'puddle') this.puddles.push({ ...pr, x, z });
      else if (pr.kind === 'daikon') this.daikon.push({ ...pr, x, z });
      else if (pr.kind === 'mound') {
        this.mounds.push({ x, z, r: pr.r, charge: 1 });
        this.walls.push({ x, z, r: pr.r * 0.8 });
      }
    }
    this.px = this.ppx = this.seenX = course.start.x;
    this.pz = this.ppz = this.seenZ = p.cz + course.start.z;
    this.eyeX = this.peyeX = this.px;
    this.comp = course.companion ? new Sticks('comp') : null;
    this.sticks = this.comp ? [this.main, this.comp] : [this.main];
    this.blinkT = this.rng.range(2, 5);
    // start the sticks somewhere sensible
    this.main.timer = 1.9;
    this.placeMainAnchor();
    this.restMain(1, 0);
    this.main.savePrev();
    if (this.comp) {
      this.comp.timer = this.rng.range(...course.companion!.idle) + 1.2;
      this.placeCompAnchor();
      this.restComp(1);
      this.comp.savePrev();
    }
  }

  get stage(): Stage {
    return stageFor(this.course, this.hits);
  }

  /* ------------------------------------------------------------------ step */

  step(dt = SIM_DT) {
    this.ppx = this.px;
    this.ppz = this.pz;
    this.peyeX = this.eyeX;
    for (const s of this.sticks) s.savePrev();
    this.time += dt;
    this.cosmetics(dt);
    if (this.phase !== 'play') {
      this.input.throwQueued = false;
      return;
    }
    this.stats.time += dt;
    this.movePlayer(dt);
    this.lean(dt);
    this.wasabiOnPlate(dt);
    if (this.input.throwQueued) this.tryThrow();
    this.input.throwQueued = false;
    this.flyThrows(dt);
    if (this.phase !== 'play') return;
    this.runMain(dt);
    if (this.comp) this.runComp(dt);
    this.fallDrops(dt);
    this.updatePanic(dt);
  }

  private emit(e: SimEvent) {
    this.events.push(e);
  }

  private cosmetics(dt: number) {
    if (this.sting > 0) this.sting = Math.max(0, this.sting - dt);
    if (this.lurch > 0) this.lurch = Math.max(0, this.lurch - dt * 2);
    if (this.throwAnim > 0) this.throwAnim = Math.max(0, this.throwAnim - dt);
    if (this.phase === 'won') return; // the finale drives the eyelid
    // blinking: more often once wasabi has landed in the eye (prototype: 1 + 0.8 per hit)
    this.blinkT -= dt * (1 + this.hits * 0.8);
    if (this.blinkT <= 0 && this.blink === 0) {
      const [a, b] = this.course.diner.blink;
      this.blinkT = this.rng.range(a, b);
      this.blink = 0.001;
      this.emit({ t: 'blink' });
    }
    if (this.blink > 0) {
      this.blink += dt * 7.5;
      if (this.blink >= 2) this.blink = 0;
    }
  }

  /* ---------------------------------------------------------------- player */

  private movePlayer(dt: number) {
    const t = this.tune;
    if (this.hurt > 0) this.hurt = Math.max(0, this.hurt - dt);
    let mx = this.input.mx;
    let mz = this.input.mz;
    const m = Math.hypot(mx, mz);
    if (m > 1) {
      mx /= m;
      mz /= m;
    }
    // slow zones
    let slow = 1;
    let soy = false;
    for (const p of this.puddles) if (ellipseR(this.px, this.pz, p.x, p.z, p.rx, p.rz, p.rot) < 1) soy = true;
    if (soy) slow = Math.min(slow, t.soySlow);
    let hid = false;
    for (const d of this.daikon) if (ellipseR(this.px, this.pz, d.x, d.z, d.rx, d.rz) < 0.85) hid = true;
    if (hid) slow = Math.min(slow, t.daikonSlow);
    if (soy && !this.inSoy) this.emit({ t: 'soy' });
    this.inSoy = soy;
    if (hid !== this.hidden) this.emit({ t: 'hide', on: hid });
    this.hidden = hid;

    const knocked = this.hurt > this.tune.hurtTime - 0.25; // the knock carries you for a moment
    if (m > 0.02 && !knocked) {
      const tvx = mx * t.maxSpeed * slow;
      const tvz = mz * t.maxSpeed * slow;
      const dvx = tvx - this.vx;
      const dvz = tvz - this.vz;
      const dl = Math.hypot(dvx, dvz);
      const step = t.accel * dt;
      if (dl <= step) {
        this.vx = tvx;
        this.vz = tvz;
      } else {
        this.vx += (dvx / dl) * step;
        this.vz += (dvz / dl) * step;
      }
      if (Math.abs(mx) > 0.2) this.face = mx > 0 ? 1 : -1;
    } else {
      const f = 1 - approach(t.friction, dt);
      this.vx *= f;
      this.vz *= f;
    }
    // soy also drags a sliding sushi
    const cap = t.maxSpeed * (knocked ? 1.4 : slow);
    const sp = Math.hypot(this.vx, this.vz);
    if (sp > cap) {
      this.vx *= cap / sp;
      this.vz *= cap / sp;
    }
    this.px += this.vx * dt;
    this.pz += this.vz * dt;

    for (const w of this.walls) {
      const dx = this.px - w.x;
      const dz = this.pz - w.z;
      const d = Math.hypot(dx, dz);
      const min = w.r + t.bodyR;
      if (d < min && d > 1e-6) {
        const nx = dx / d;
        const nz = dz / d;
        this.px = w.x + nx * min;
        this.pz = w.z + nz * min;
        const vn = this.vx * nx + this.vz * nz;
        if (vn < 0) {
          this.vx -= vn * nx;
          this.vz -= vn * nz;
        }
      }
    }
    const c = clampInside(this.walk, this.px, this.pz);
    if (c.hit) {
      this.px = c.x;
      this.pz = c.z;
      const vn = this.vx * c.nx + this.vz * c.nz;
      if (vn > 0) {
        this.vx -= vn * c.nx;
        this.vz -= vn * c.nz;
      }
    }

    const speed = Math.hypot(this.vx, this.vz);
    if (speed > 1.5) {
      const before = this.stepPhase;
      this.stepPhase += dt * (5 + speed * 0.42);
      if (Math.floor(before) !== Math.floor(this.stepPhase)) this.emit({ t: 'step', foot: Math.floor(this.stepPhase) & 1 });
    }
    if (!this.hidden) {
      this.seenX = this.px;
      this.seenZ = this.pz;
    }
  }

  /** The diner leans to keep you centred in the lens, and overshoots (prototype spring + wander). */
  private lean(dt: number) {
    const L = this.course.diner.lean;
    const amp = L.amp + L.ampPerHit * this.hits;
    const w = L.freq;
    const wander = amp * (Math.sin(this.time * w) + 0.35 * Math.sin(this.time * w * 2.3 + 1.7)) / 1.2;
    const want = this.seenX + wander;
    this.eyeV += (want - this.eyeX) * L.k * dt;
    this.eyeV *= Math.exp(-L.c * dt);
    this.eyeX += this.eyeV * dt;
    // he never lets you drift far off-centre
    const off = this.px - this.eyeX;
    if (off > L.maxOff) this.eyeX = this.px - L.maxOff;
    if (off < -L.maxOff) this.eyeX = this.px + L.maxOff;
  }

  /** |x - eyeX| < lane: lined up with his eye. */
  get inLane(): boolean {
    return Math.abs(this.px - this.eyeX) < this.tune.laneHalf;
  }

  /* ---------------------------------------------------------------- wasabi */

  private wasabiOnPlate(dt: number) {
    const t = this.tune;
    for (const b of this.blobs) {
      b.life -= dt;
      if (b.life <= 0) {
        this.emit({ t: 'expire', x: b.x, z: b.z });
        continue;
      }
      if (!this.carry && this.hurt <= 0 && ellipseR(b.x, b.z, this.px, this.pz, t.pickRX, t.pickRZ) < 1) {
        b.life = 0;
        this.carry = true;
        this.stats.pickups++;
        this.emit({ t: 'pickup', x: b.x, z: b.z, src: 'blob' });
      }
    }
    if (this.blobs.some((b) => b.life <= 0)) this.blobs = this.blobs.filter((b) => b.life > 0);
    for (const m of this.mounds) {
      if (m.charge < 1) {
        m.charge = Math.min(1, m.charge + dt / t.moundRefill);
        if (m.charge >= 1) this.emit({ t: 'moundReady' });
      }
      if (!this.carry && m.charge >= 1 && this.hurt <= 0 && Math.hypot(this.px - m.x, this.pz - m.z) < m.r + t.bodyR + 0.7) {
        m.charge = 0;
        this.carry = true;
        this.stats.pickups++;
        this.emit({ t: 'pickup', x: m.x, z: m.z, src: 'mound' });
      }
    }
  }

  /** Where a throw from the sushi's current spot would start and end. */
  throwEnds(): { from: V3; to: V3 } {
    return {
      from: { x: this.px, y: this.plateTop + 3.4, z: this.pz },
      to: { x: this.px, y: this.eyeY - 0.5, z: this.eyeZ + this.tune.lensZ },
    };
  }

  /** What a throw released right now would do. */
  predict(): { outcome: Outcome; arc: Arc; block: ReturnType<typeof firstBlock> } {
    const { from, to } = this.throwEnds();
    const arc = makeArc(this.tune, from, to);
    const block = firstBlock(this.tune, arc, this.sticks);
    const outcome: Outcome = block ? 'clip' : this.inLane ? 'hit' : 'wide';
    return { outcome, arc, block };
  }

  private tryThrow() {
    if (!this.carry) {
      this.emit({ t: 'empty' });
      return;
    }
    const { outcome, arc, block } = this.predict();
    this.carry = false;
    this.throwAnim = 0.28;
    this.stats.throws++;
    const id = this.nextId++;
    this.throws.push({
      id,
      arc,
      t: 0,
      outcome,
      blockT: block ? block.t : arc.T,
      bx: block?.x ?? 0,
      by: block?.y ?? 0,
      bz: block?.z ?? 0,
      who: block && block.pose === 1 ? 'comp' : 'main',
      done: false,
    });
    this.emit({ t: 'throw', id, outcome });
    // the diner flinches at a good one; guarding stops being useful once it's gone
    if (this.main.guarding) {
      this.main.guarding = false;
      this.emit({ t: 'guard', on: false });
    }
  }

  private flyThrows(dt: number) {
    for (const th of this.throws) {
      th.t += dt;
      if (th.done) continue;
      if (th.outcome === 'clip' && th.t >= th.blockT) {
        th.done = true;
        this.stats.clips++;
        this.emit({ t: 'clip', id: th.id, x: th.bx, y: th.by, z: th.bz, who: th.who });
        // it falls off the stick; if that's over the plate, it can be picked up again
        const land = clampInside(inset(this.walk, 0.5), th.bx, th.bz);
        this.drops.push({ x0: th.bx, y0: th.by, z0: th.bz, x1: land.x, z1: land.z, t: 0, dur: 0.45, life: this.tune.clipLife });
      } else if (th.t >= th.arc.T) {
        th.done = true;
        if (th.outcome === 'hit') {
          this.hits++;
          this.stats.hits++;
          this.sting = 2.6;
          this.lurch = 1;
          const p = arcAt(th.arc, th.arc.T);
          this.emit({ t: 'hit', id: th.id, n: this.hits, u: p.x - this.eyeX, v: p.y - this.eyeY });
          if (this.hits >= this.course.hitsToWin) {
            this.phase = 'won';
            this.blink = 0;
            for (const s of this.sticks) s.marks = [];
            this.emit({ t: 'won' });
          }
        } else {
          this.stats.wides++;
          this.emit({ t: 'wide', id: th.id, side: Math.sign(th.arc.x0 - this.eyeX) || 1 });
        }
      }
    }
    // keep finished throws a moment so the render can carry wide ones past the camera
    this.throws = this.throws.filter((th) => !th.done || th.t < th.arc.T + 0.3);
  }

  private fallDrops(dt: number) {
    for (const d of this.drops) {
      d.t += dt / d.dur;
      if (d.t >= 1) {
        this.blobs.push({ id: this.nextId++, x: d.x1, z: d.z1, life: d.life, max: d.life });
        this.emit({ t: 'land', x: d.x1, z: d.z1 });
      }
    }
    if (this.drops.some((d) => d.t >= 1)) this.drops = this.drops.filter((d) => d.t < 1);
  }

  /* ------------------------------------------------------------- chopsticks */

  private placeMainAnchor() {
    // his hand: below and to the right of his eye, a little forward, following his lean
    const s = this.main;
    s.ax = this.eyeX + 10.5 + (s.tx - this.eyeX) * 0.25;
    s.ay = this.eyeY - 9;
    s.az = this.eyeZ + 6 + (s.tz - 30) * 0.15;
  }

  private placeCompAnchor() {
    // across the counter from him
    const s = this.comp!;
    s.ax = -9 + s.tx * 0.2;
    s.ay = 19;
    s.az = this.plate.cz + 36;
  }

  /** A point on the throw arc from (x, z): where the tips park between attempts. */
  private restPoint(x: number, z: number, f: number): V3 {
    const from = { x, y: this.plateTop + 3.4, z };
    const to = { x, y: this.eyeY - 0.5, z: this.eyeZ + this.tune.lensZ };
    const arc = makeArc(this.tune, from, to);
    return arcAt(arc, arc.T * f);
  }

  private restMain(rate: number, dt: number) {
    const s = this.main;
    const st = this.stage;
    // a guarding diner keeps the tips shut on your line whenever he isn't going for you
    const guard = st.guard > 0 && s.phase === 'idle';
    if (guard !== s.guarding) {
      s.guarding = guard;
      this.emit({ t: 'guard', on: guard });
    }
    const p = this.restPoint(this.seenX, this.seenZ, this.tune.hoverRest);
    const k = dt === 0 ? 1 : approach(guard ? st.guard : rate, dt);
    s.tx = lerp(s.tx, p.x, k);
    s.ty = lerp(s.ty, p.y, k);
    s.tz = lerp(s.tz, p.z, k);
    const sep = guard ? this.tune.sepShut : this.tune.restSepOpen;
    s.sep = lerp(s.sep, sep, dt === 0 ? 1 : approach(guard ? 7 : 4, dt));
    s.close = guard ? 1 : 0;
  }

  private restComp(dt: number) {
    const s = this.comp!;
    const k = dt >= 1 ? 1 : approach(1.6, dt);
    s.tx = lerp(s.tx, -3 + Math.sin(this.time * 0.5) * 3, k);
    s.ty = lerp(s.ty, this.plateTop + 6.5, k);
    s.tz = lerp(s.tz, this.plate.cz + this.plate.hz * 0.55, k);
    s.sep = lerp(s.sep, 2.6, k);
    s.close = 0;
  }

  private runMain(dt: number) {
    const s = this.main;
    const st = this.stage;
    s.sinceStab += dt;
    switch (s.phase) {
      case 'idle':
        this.restMain(2, dt);
        s.timer -= dt;
        if (s.timer <= 0) this.beginAttempt(s, st.marks, st.spread, st.aim, st.slot, st.feint, st.sweep);
        break;
      case 'aim':
        this.aim(s, st.track, dt);
        break;
      case 'stab':
        this.stab(s, dt);
        if (s.burst >= this.volleyLength(s)) this.afterAttempt(s);
        break;
      case 'sweep':
        this.runSweep(s, dt);
        break;
      case 'fumble':
        if (this.fumble(s, dt)) {
          s.phase = 'idle';
          s.timer = st.idle;
        }
        break;
    }
    this.placeMainAnchor();
  }

  private runComp(dt: number) {
    const s = this.comp!;
    const c = this.course.companion!;
    s.sinceStab += dt;
    switch (s.phase) {
      case 'idle':
        this.restComp(dt);
        s.timer -= dt;
        if (s.timer <= 0) this.beginAttempt(s, 1, 6, c.aim, c.slot, 0, 0);
        break;
      case 'aim':
        this.aim(s, c.track, dt);
        break;
      case 'stab':
        this.stab(s, dt);
        if (s.burst >= this.volleyLength(s)) {
          if (this.rng.chance(c.dropChance)) this.beginFumble(s, 7);
          else {
            s.phase = 'idle';
            s.timer = this.rng.range(...c.idle);
            s.marks = [];
          }
        }
        break;
      case 'fumble':
        if (this.fumble(s, dt)) {
          s.phase = 'idle';
          s.timer = this.rng.range(...c.idle);
        }
        break;
      case 'sweep':
        s.phase = 'idle';
        break;
    }
    this.placeCompAnchor();
  }

  private volleyLength(s: Sticks): number {
    const last = s.marks[s.marks.length - 1];
    return last ? last.start + last.len : 0;
  }

  /** A random point on the plate, inside the walkable area, clear of walls. */
  private freeSpot(cx: number, cz: number, rMin: number, rMax: number): { x: number; z: number } {
    const area = inset(this.walk, 0.4);
    for (let i = 0; i < 24; i++) {
      const a = this.rng.range(0, Math.PI * 2);
      const r = this.rng.range(rMin, rMax);
      const x = cx + Math.cos(a) * r;
      const z = cz + Math.sin(a) * r * 0.85;
      if (sdRRect(area, x, z) > 0) continue;
      if (this.walls.some((w) => Math.hypot(x - w.x, z - w.z) < w.r + 1.6)) continue;
      return { x, z };
    }
    const c = clampInside(area, cx, cz);
    return { x: c.x, z: c.z };
  }

  private beginAttempt(s: Sticks, n: number, spread: number, aim: number, slot: number, feint: number, sweep: number) {
    s.marks = [];
    s.sweep = null;
    s.burst = 0;
    if (s.guarding) {
      s.guarding = false;
      this.emit({ t: 'guard', on: false });
    }
    if (s.who === 'main' && sweep > 0 && this.rng.chance(sweep)) {
      // a line through where you are, mostly across the plate
      const ang = this.rng.range(-0.6, 0.6) + (this.rng.chance(0.5) ? Math.PI : 0);
      const half = this.tune.sweepLen / 2;
      const off = this.rng.range(-1.5, 1.5);
      const cx = this.seenX - Math.sin(ang) * off;
      const cz = this.seenZ + Math.cos(ang) * off * 0.5;
      s.sweep = {
        ax: cx - Math.cos(ang) * half,
        az: cz - Math.sin(ang) * half * 0.6,
        bx: cx + Math.cos(ang) * half,
        bz: cz + Math.sin(ang) * half * 0.6,
        k: -1,
        hit: false,
      };
      s.phase = 'aim';
      s.timer = aim;
      this.emit({ t: 'aim', who: s.who, n: 1, sweep: true });
      return;
    }
    let start = 0;
    for (let i = 0; i < n; i++) {
      const p = this.freeSpot(this.seenX, this.seenZ, 0, spread);
      const isFeint = feint > 0 && this.rng.chance(feint);
      const len = isFeint ? slot * 1.12 + this.tune.feintExtra : slot;
      const fireAt = isFeint ? slot * 0.45 + this.tune.feintExtra + slot * 0.25 : slot * 0.5;
      s.marks.push({ x: p.x, z: p.z, feint: isFeint, retargeted: false, fired: false, start, len, fireAt });
      start += len;
    }
    s.phase = 'aim';
    s.timer = aim;
    this.emit({ t: 'aim', who: s.who, n, sweep: false });
  }

  private hoverAbove(s: Sticks, x: number, z: number, hover: number, sep: number, rate: number, dt: number) {
    const k = approach(rate, dt);
    s.tx = lerp(s.tx, x, k);
    s.tz = lerp(s.tz, z, k);
    s.ty = lerp(s.ty, this.plateTop + hover, k);
    s.sep = lerp(s.sep, sep, approach(8, dt));
  }

  private aim(s: Sticks, track: number, dt: number) {
    const visible = !this.hidden;
    if (s.sweep) {
      const sw = s.sweep;
      if (visible) {
        // the line slides to keep going through you
        const mx = (sw.ax + sw.bx) / 2;
        const mz = (sw.az + sw.bz) / 2;
        const k = approach(track * 0.8, dt);
        const dx = (this.px - mx) * k;
        const dz = (this.pz - mz) * k;
        sw.ax += dx;
        sw.bx += dx;
        sw.az += dz;
        sw.bz += dz;
      }
      this.hoverAbove(s, sw.ax, sw.az, this.tune.aimHover + 1, 1.2, 3, dt);
      s.close = 0.6;
    } else {
      if (visible)
        for (const m of s.marks) {
          const k = approach(track, dt);
          m.x += (this.px - m.x) * k;
          m.z += (this.pz - m.z) * k;
        }
      const m0 = s.marks[0];
      if (m0) this.hoverAbove(s, m0.x, m0.z, this.tune.aimHover, 2.8, 3, dt);
      s.close = 0.12;
    }
    s.timer -= dt;
    if (s.timer <= 0) {
      if (s.sweep) {
        s.phase = 'sweep';
        s.burst = 0;
      } else {
        s.phase = 'stab';
        s.burst = 0;
      }
    }
  }

  private stab(s: Sticks, dt: number) {
    const t = this.tune;
    s.burst += dt;
    let i = s.marks.findIndex((m) => s.burst < m.start + m.len);
    if (i < 0) i = s.marks.length - 1;
    const m = s.marks[i];
    if (!m) return;
    // later marks in a volley may keep following you until their turn comes
    const chase = s.who === 'main' ? this.stage.chase : 0;
    if (chase > 0 && !this.hidden) {
      const k = approach(chase, dt);
      for (let j = i + 1; j < s.marks.length; j++) {
        const o = s.marks[j];
        o.x += (this.px - o.x) * k;
        o.z += (this.pz - o.z) * k;
      }
    }
    const tau = s.burst - m.start;
    const L = m.len;
    let hover: number;
    let close: number;
    const fall = (from: number, to: number, k: number) => lerp(from, to, ease(clamp(k, 0, 1)));
    const top = i === 0 ? t.aimHover : t.liftHover;
    if (!m.feint) {
      if (tau < m.fireAt) {
        const k = tau / m.fireAt;
        hover = fall(top, t.stabFloor, k);
        close = 0.9 * ease(k);
      } else if (tau < m.fireAt + 0.12 * L) {
        hover = t.stabFloor;
        close = 1;
      } else {
        const k = (tau - m.fireAt - 0.12 * L) / (L - m.fireAt - 0.12 * L);
        hover = fall(t.stabFloor, t.liftHover, k);
        close = 1 - 0.8 * ease(clamp(k, 0, 1));
      }
    } else {
      const dip = (L - t.feintExtra) * 0.45 / 1.12; // the feint dip takes 45 % of the plain slot
      const slot = (L - t.feintExtra) / 1.12;
      if (tau < dip) {
        hover = fall(top, 1.9, tau / dip);
        close = 0.5 * ease(tau / dip);
      } else if (tau < dip + t.feintExtra) {
        if (!m.retargeted) {
          m.retargeted = true;
          if (!this.hidden) {
            // he looks again, and goes where you are now
            m.x = this.px + this.vx * 0.1;
            m.z = this.pz + this.vz * 0.1;
          }
          this.emit({ t: 'feint', who: s.who, x: m.x, z: m.z });
        }
        hover = 1.9;
        close = 0.5;
      } else if (tau < m.fireAt) {
        const k = (tau - dip - t.feintExtra) / (m.fireAt - dip - t.feintExtra);
        hover = fall(1.9, t.stabFloor, k);
        close = 0.5 + 0.5 * ease(k);
      } else if (tau < m.fireAt + 0.12 * slot) {
        hover = t.stabFloor;
        close = 1;
      } else {
        const k = (tau - m.fireAt - 0.12 * slot) / (L - m.fireAt - 0.12 * slot);
        hover = fall(t.stabFloor, t.liftHover, k);
        close = 1 - 0.8 * ease(clamp(k, 0, 1));
      }
    }
    const k = approach(14, dt);
    s.tx = lerp(s.tx, m.x, k);
    s.tz = lerp(s.tz, m.z, k);
    s.ty = this.plateTop + hover;
    s.close = close;
    s.sep = lerp(2.8, t.sepShut, close);
    if (!m.fired && tau >= m.fireAt) {
      m.fired = true;
      s.sinceStab = 0;
      // the strike lands where the tips are
      const near = ellipseR(s.tx, s.tz, this.px, this.pz, t.hitRX, t.hitRZ);
      const hit = near < 1 && this.hurt <= 0;
      this.emit({ t: 'stab', who: s.who, x: s.tx, z: s.tz, hit, near });
      if (hit) this.hurtPlayer(s.who, s.tx, s.tz);
    }
  }

  private runSweep(s: Sticks, dt: number) {
    const t = this.tune;
    const sw = s.sweep!;
    s.burst += dt;
    const down = 0.2;
    const lift = 0.28;
    if (s.burst < down) {
      const k = ease(s.burst / down);
      s.ty = this.plateTop + lerp(t.aimHover + 1, t.stabFloor, k);
      s.tx = lerp(s.tx, sw.ax, approach(20, dt));
      s.tz = lerp(s.tz, sw.az, approach(20, dt));
      s.close = 0.6 + 0.4 * k;
    } else if (s.burst < down + t.sweepTime) {
      if (sw.k < 0) {
        s.sinceStab = 0;
        this.emit({ t: 'sweepDown', who: s.who });
      }
      sw.k = (s.burst - down) / t.sweepTime;
      const e = sw.k; // constant speed reads best for a drag
      s.tx = lerp(sw.ax, sw.bx, e);
      s.tz = lerp(sw.az, sw.bz, e);
      s.ty = this.plateTop + t.stabFloor;
      s.close = 1;
      if (!sw.hit && this.hurt <= 0) {
        const d = ellipseR(s.tx, s.tz, this.px, this.pz, t.hitRX * 0.75 + t.sweepHitR * 0.5, t.hitRZ * 0.75 + t.sweepHitR * 0.5);
        if (d < 1) {
          sw.hit = true;
          this.emit({ t: 'stab', who: s.who, x: s.tx, z: s.tz, hit: true, near: d });
          this.hurtPlayer(s.who, s.tx, s.tz);
        }
      }
    } else if (s.burst < down + t.sweepTime + lift) {
      sw.k = 1;
      const k = ease((s.burst - down - t.sweepTime) / lift);
      s.ty = this.plateTop + lerp(t.stabFloor, t.liftHover, k);
      s.close = 1 - 0.7 * k;
    } else {
      s.sweep = null;
      this.afterAttempt(s);
      return;
    }
    s.sep = lerp(2.8, t.sepShut, s.close);
  }

  /** After a volley or a sweep: usually he goes for the wasabi and drops it; sometimes he just resets. */
  private afterAttempt(s: Sticks) {
    const st = this.stage;
    if (this.rng.chance(st.fumble)) this.beginFumble(s, st.dropNear);
    else {
      s.marks = [];
      s.sweep = null;
      s.phase = 'idle';
      s.timer = st.idle + 0.5;
    }
  }

  private beginFumble(s: Sticks, dropNear: number) {
    s.marks = [];
    s.sweep = null;
    s.phase = 'fumble';
    s.timer = this.tune.fumbleTime;
    s.holding = true;
    s.lob = this.freeSpot(this.seenX, this.seenZ, 2.6, Math.max(3.2, dropNear));
    this.emit({ t: 'fumble', who: s.who });
  }

  /** Carry a dab of wasabi over the lob point, then lose it. Returns true when done. */
  private fumble(s: Sticks, dt: number): boolean {
    const lob = s.lob!;
    this.hoverAbove(s, lob.x, lob.z, this.tune.fumbleHover, 0.6, 4, dt);
    s.close = 0.85;
    s.timer -= dt;
    if (s.timer > 0) return false;
    s.holding = false;
    this.drops.push({ x0: s.tx, y0: s.ty - 0.4, z0: s.tz, x1: lob.x, z1: lob.z, t: 0, dur: this.tune.dropTime, life: this.tune.blobLife });
    this.emit({ t: 'drop', who: s.who });
    s.lob = null;
    return true;
  }

  private hurtPlayer(who: Who, sx: number, sz: number) {
    const t = this.tune;
    this.hp--;
    this.stats.hurt++;
    this.emit({ t: 'hurt', hp: this.hp, x: this.px, z: this.pz, who });
    if (this.carry) {
      this.carry = false;
      const away = this.px < 0 ? 1 : -1;
      const c = clampInside(inset(this.walk, 0.4), this.px + away * 2.8, this.pz);
      this.drops.push({ x0: this.px, y0: this.plateTop + 2.5, z0: this.pz, x1: c.x, z1: c.z, t: 0, dur: 0.35, life: t.shedLife });
    }
    if (this.hp <= 0) {
      this.phase = 'eaten';
      this.vx = this.vz = 0;
      for (const s of this.sticks) {
        s.marks = [];
        s.sweep = null;
      }
      this.emit({ t: 'eaten' });
      return;
    }
    this.hurt = t.hurtTime;
    // knocked away from the tips
    let dx = this.px - sx;
    let dz = this.pz - sz;
    const l = Math.hypot(dx, dz);
    if (l < 0.3) {
      dx = this.px < 0 ? 1 : -1;
      dz = 0;
    } else {
      dx /= l;
      dz /= l;
    }
    this.vx = dx * t.knockSpeed;
    this.vz = dz * t.knockSpeed;
  }

  private updatePanic(dt: number) {
    // you can see it coming: a strike due soon and close by
    let p = 0;
    for (const s of this.sticks) {
      const tIn = s.nextStrikeIn();
      if (s.phase === 'stab' || (s.phase === 'aim' && tIn < 0.7)) {
        for (const m of s.marks) {
          if (m.fired) continue;
          const d = Math.hypot(m.x - this.px, m.z - this.pz);
          if (d < 4.5) p = 1;
        }
      }
      if (s.phase === 'sweep' || (s.phase === 'aim' && s.sweep)) p = Math.max(p, 0.6);
    }
    this.panic = p > this.panic ? p : Math.max(0, this.panic - dt * 3);
  }
}
