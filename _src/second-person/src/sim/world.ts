// The simulation. Pure TypeScript: no three.js, no DOM. Step it at SIM_HZ.
// Every moving thing keeps its previous position (px, pz) so the renderer can interpolate.

import {
  FAR_X0,
  FAR_X1,
  LANE_FAR,
  LANE_NEAR,
  WALK_X0,
  WALK_X1,
  inRoad,
  makeTuning,
  type Tuning,
} from './constants';
import { jamAt, type LevelCfg } from './levels';
import { makeView, rayHitsFigure, unproject, type CamPose, type View } from './projection';
import { blocksInRange, type Block, type Post } from './props';
import { Rng } from './rng';

export type Mode = 'free' | 'charge' | 'dash';
export type Phase = 'play' | 'dead' | 'cleared';
export type DeathCause = 'car' | 'caught';
export type Tier = 0 | 1 | 2; // head-on, partial, glancing

export type SimEvent =
  | { t: 'bump'; tier: Tier; x: number; z: number; id: number }
  | { t: 'post'; tier: Tier; x: number; z: number }
  | { t: 'chargeStart' }
  | { t: 'chargeCancel' }
  | { t: 'dash'; charge: number; dirX: number; dirZ: number }
  | { t: 'knock'; id: number; x: number; z: number; by: 'player' | 'chaser' }
  | { t: 'nearMiss'; id: number; x: number; z: number; dx: number }
  | { t: 'death'; cause: DeathCause; x: number; z: number; id: number }
  | { t: 'cleared' }
  | { t: 'shoveReady' };

export interface Player {
  x: number;
  z: number;
  px: number;
  pz: number;
  speed: number; // current speed along (dirX, dirZ)
  dirX: number; // heading (unit)
  dirZ: number;
  mode: Mode;
  charge: number; // 0..1
  chargeT: number;
  dashT: number;
  dashTotal: number;
  cooldown: number;
  cooldownWas: number;
  slowFactor: number;
  slowT: number;
  slowTier: Tier | -1;
  phase: number; // walk cycle, radians
  pphase: number;
  bumpT: number; // time since last bump (for squash)
  bumpTier: Tier;
  steering: boolean;
}

export interface Ped {
  id: number;
  x: number;
  z: number;
  px: number;
  pz: number;
  dir: 1 | -1;
  spd: number;
  wobble: number;
  phase: number;
  pphase: number;
  scale: number;
  look: number; // palette index for the renderer
  seed: number; // 0..1, renderer variety
  far: boolean;
  jamLo: number; // z bounds while milling in a jam, NaN otherwise
  jamHi: number;
  stagger: number; // seconds left
  kvx: number; // knock velocity
  kvz: number;
  knockDirX: number; // which way it was knocked (for the tumble pose)
  knockDirZ: number;
  contact: boolean;
  dashHit: boolean;
  bumpT: number;
  bz: number; // bucket row this step
  anchored: boolean; // stands still without wobbling (tests, debug)
  yieldT: number; // seconds left stepping aside after being bumped
  yvx: number;
  yvz: number;
}

export interface Car {
  id: number;
  x: number;
  z: number;
  px: number;
  pz: number;
  dir: 1 | -1; // -1 = toward the camera (near lane)
  spd: number;
  w: number;
  d: number;
  h: number;
  long: boolean;
  colour: number;
  lane: 0 | 1;
  side: number; // sign of (car.z - player.z) last step, for near misses
  missed: boolean;
}

export interface Chaser {
  x: number;
  z: number;
  px: number;
  pz: number;
  dirX: number;
  dirZ: number;
  phase: number;
  pphase: number;
  speed: number;
}

export interface Cam extends CamPose {
  px: number;
  pz: number;
}

interface PointerState {
  down: boolean;
  sx: number;
  sy: number;
  pendingDown: boolean;
  pendingUp: boolean;
  downX: number;
  downY: number;
}

const AHEAD = 32; // crowd is generated this far ahead (-z) of the player
const BEHIND = 78; // and this far behind (+z), which is what the camera sees
const DESPAWN_BEHIND = 92;
const DESPAWN_AHEAD = 60;
const GOAL_OVERRUN = 14; // crowd keeps going a little past the goal
const CAR_COLOURS = 7;

export class World {
  readonly cfg: LevelCfg;
  readonly seed: number;
  readonly tune: Tuning;
  view: View;

  time = 0;
  phase: Phase = 'play';
  deathCause: DeathCause | null = null;
  deathT = 0; // seconds since death or clear
  killerId = -1;

  player: Player;
  chaser: Chaser;
  cam: Cam;
  peds: Ped[] = [];
  cars: Car[] = [];
  events: SimEvent[] = [];

  private input: PointerState = { down: false, sx: 0, sy: 0, pendingDown: false, pendingUp: false, downX: 0, downY: 0 };
  private rng: Rng;
  private nextId = 1;
  private genFront: number; // most negative z already populated
  private pedPool: Ped[] = [];
  private buckets = new Map<number, Ped[]>();
  private bucketPool: Ped[][] = [];
  private blocks: Block[] = [];
  private nextNear: number;
  private nextFar: number;
  private waveNear = 0;
  private waveFar = 0;

  aimX = 0;
  aimZ = 0;
  aimShown = false;
  aimOnRoad = false;

  constructor(cfg: LevelCfg, seed: number, tune?: Tuning, view?: View) {
    this.cfg = cfg;
    this.seed = seed >>> 0;
    this.tune = tune ?? makeTuning();
    this.view = view ?? makeView(390, 844);
    this.rng = new Rng(this.seed ^ Math.imul(cfg.n, 0x9e3779b1));
    const t = this.tune;

    const x0 = -3.5;
    this.player = {
      x: x0, z: 0, px: x0, pz: 0, speed: 0, dirX: 0, dirZ: -1, mode: 'free', charge: 0, chargeT: 0,
      dashT: 0, dashTotal: 0, cooldown: 0, cooldownWas: 0, slowFactor: 1, slowT: 0, slowTier: -1, phase: 0, pphase: 0,
      bumpT: 9, bumpTier: 2, steering: false,
    };
    this.chaser = {
      x: x0, z: t.chaserStartGap, px: x0, pz: t.chaserStartGap, dirX: 0, dirZ: -1, phase: 0, pphase: 0,
      speed: cfg.chaserSpeed,
    };
    this.cam = { x: x0, y: t.camHeight, z: -t.camDist, pitch: t.camPitch, px: x0, pz: -t.camDist };

    // Populate the street the camera can see, then keep generating ahead as the player walks.
    this.genFront = Math.floor(BEHIND);
    this.generateCrowd(-AHEAD);

    this.nextNear = this.rng.range(0.4, 2.0);
    this.nextFar = this.rng.range(0.8, 2.6);
    if (cfg.traffic.kind === 'waves') {
      this.waveNear = 0.6;
      this.waveFar = 0.6 + cfg.traffic.period / 2; // INVENTED: far lane runs half a period out of phase
    }
  }

  /* ---------------- input ---------------- */

  pointerDown(sx: number, sy: number) {
    const i = this.input;
    i.down = true;
    i.sx = sx;
    i.sy = sy;
    i.downX = sx;
    i.downY = sy;
    i.pendingDown = true;
  }

  pointerMove(sx: number, sy: number) {
    if (!this.input.down) return;
    this.input.sx = sx;
    this.input.sy = sy;
  }

  pointerUp(sx?: number, sy?: number) {
    const i = this.input;
    if (sx !== undefined && sy !== undefined) {
      i.sx = sx;
      i.sy = sy;
    }
    if (!i.down && !i.pendingDown) return;
    i.down = false;
    i.pendingUp = true;
  }

  get pointerHeld() {
    return this.input.down;
  }

  /* ---------------- derived ---------------- */

  get distance() {
    return -this.player.z;
  }

  get remaining() {
    return Math.max(0, this.cfg.length - this.distance);
  }

  get chaserGap() {
    return Math.hypot(this.chaser.x - this.player.x, this.chaser.z - this.player.z);
  }

  /** Total ground covered by a dash at this charge, including the glide after it. */
  dashReach(charge: number): number {
    const t = this.tune;
    const T = t.dashBaseTime * (0.6 + 0.4 * charge);
    const ramp = t.dashSpeed / t.dashAccel;
    const d1 = T > ramp ? t.dashSpeed * T - (t.dashSpeed * ramp) / 2 : 0.5 * t.dashAccel * T * T;
    const vEnd = Math.min(t.dashSpeed, t.dashAccel * T);
    return d1 + (vEnd * vEnd) / (2 * t.accel);
  }

  dirScale(dirZ: number): number {
    // toward the lens (-z) is fastest, backing away (+z) slowest
    const m = this.tune.dirScaleMin;
    return m + (1 - m) * (0.5 - 0.5 * dirZ);
  }

  /* ---------------- step ---------------- */

  step(dt: number) {
    this.time += dt;
    const p = this.player;
    const c = this.chaser;
    p.px = p.x;
    p.pz = p.z;
    p.pphase = p.phase;
    c.px = c.x;
    c.pz = c.z;
    c.pphase = c.phase;
    this.cam.px = this.cam.x;
    this.cam.pz = this.cam.z;
    for (const q of this.peds) {
      q.px = q.x;
      q.pz = q.z;
      q.pphase = q.phase;
    }
    for (const car of this.cars) {
      car.px = car.x;
      car.pz = car.z;
    }

    const playing = this.phase === 'play';
    if (playing) this.updatePlayer(dt);
    else {
      this.deathT += dt;
      p.speed = Math.max(0, p.speed - this.tune.accel * dt * 2);
      this.input.pendingDown = false;
      this.input.pendingUp = false;
    }

    this.blocks = blocksInRange(p.z - 12, p.z + 12, this.blocks);
    this.updatePeds(dt);
    if (playing) {
      this.collidePlayer(dt);
      this.updateChaser(dt);
    }
    this.updateTraffic(dt);
    this.updateCamera(dt);

    if (this.phase === 'play' && this.distance >= this.cfg.length) {
      this.phase = 'cleared';
      this.deathT = 0;
      this.events.push({ t: 'cleared' });
    }
  }

  private updatePlayer(dt: number) {
    const p = this.player;
    const t = this.tune;
    const inp = this.input;

    p.cooldown = Math.max(0, p.cooldown - dt);
    if (p.cooldown === 0 && p.cooldownWas > 0) this.events.push({ t: 'shoveReady' });
    p.cooldownWas = p.cooldown;
    p.slowT = Math.max(0, p.slowT - dt);
    if (p.slowT === 0) {
      p.slowFactor = 1;
      p.slowTier = -1;
    }
    p.bumpT += dt;

    // pointer down: steer, or start a charge if the touch is on the character
    if (inp.pendingDown) {
      inp.pendingDown = false;
      if (p.mode === 'free' && p.cooldown <= 0 && this.touchesPlayer(inp.downX, inp.downY)) {
        p.mode = 'charge';
        p.chargeT = 0;
        p.charge = 0;
        this.events.push({ t: 'chargeStart' });
      }
    }

    const g = unproject(this.view, this.cam, inp.sx, inp.sy);

    if (p.mode === 'charge') {
      p.chargeT += dt;
      p.charge = Math.min(1, p.chargeT / t.chargeTime);
      const dx = g.x - p.x;
      const dz = g.z - p.z;
      const d = Math.hypot(dx, dz);
      if (d > 0.3) {
        p.dirX = dx / d;
        p.dirZ = dz / d;
      }
      if (inp.pendingUp) {
        inp.pendingUp = false;
        if (p.charge > t.minCharge) {
          p.mode = 'dash';
          p.dashTotal = t.dashBaseTime * (0.6 + 0.4 * p.charge);
          p.dashT = p.dashTotal;
          p.cooldown = t.shoveCooldown;
          p.cooldownWas = p.cooldown;
          for (const q of this.peds) q.dashHit = false;
          this.events.push({ t: 'dash', charge: p.charge, dirX: p.dirX, dirZ: p.dirZ });
        } else {
          p.mode = 'free';
          this.events.push({ t: 'chargeCancel' });
        }
      }
    } else if (inp.pendingUp) {
      inp.pendingUp = false;
    }

    let target = 0;
    let accel = t.accel;
    p.steering = false;
    if (p.mode === 'dash') {
      p.dashT -= dt;
      target = t.dashSpeed;
      accel = t.dashAccel;
      if (p.dashT <= 0) p.mode = 'free';
    } else if (p.mode === 'charge') {
      target = 0;
      accel = t.dashAccel; // plant
    } else if (inp.down) {
      const dx = g.x - p.x;
      const dz = g.z - p.z;
      const d = Math.hypot(dx, dz);
      if (d > t.steerDeadzone) {
        p.dirX = dx / d; // turning is instant
        p.dirZ = dz / d;
        target = t.baseSpeed * this.dirScale(p.dirZ) * p.slowFactor;
        p.steering = true;
      }
    }

    if (p.mode !== 'dash' && p.slowT > 0) {
      const cap = t.baseSpeed * this.dirScale(p.dirZ) * p.slowFactor;
      if (p.speed > cap) p.speed = cap;
    }
    if (p.speed < target) p.speed = Math.min(target, p.speed + accel * dt);
    else p.speed = Math.max(target, p.speed - accel * dt);

    const step = p.speed * dt;
    p.x += p.dirX * step;
    p.z += p.dirZ * step;
    p.phase += step * 2.6;

    // aim ring
    if (p.mode === 'charge') {
      const reach = this.dashReach(Math.max(p.charge, t.minCharge));
      this.aimX = p.x + p.dirX * reach;
      this.aimZ = p.z + p.dirZ * reach;
      this.aimShown = true;
    } else if (inp.down) {
      this.aimX = g.x;
      this.aimZ = g.z;
      this.aimShown = true;
    } else this.aimShown = false;
    this.aimOnRoad = inRoad(this.aimX);
  }

  private touchesPlayer(sx: number, sy: number): boolean {
    const p = this.player;
    const t = this.tune;
    const g = unproject(this.view, this.cam, sx, sy, 0.14);
    if (Math.hypot(g.x - p.x, g.z - p.z) <= t.shoveTouchR) return true;
    return rayHitsFigure(this.view, this.cam, sx, sy, p.x, p.z, 0, 1.85, t.shoveBodyR);
  }

  private applySlow(tier: Tier) {
    const p = this.player;
    const t = this.tune;
    const factor = tier === 0 ? t.tierHeadFactor : tier === 1 ? t.tierPartialFactor : t.tierGlanceFactor;
    const time = tier === 0 ? t.tierHeadTime : tier === 1 ? t.tierPartialTime : t.tierGlanceTime;
    if (p.slowT > 0 && factor > p.slowFactor) return; // a weaker contact never overrides a stronger one
    p.slowT = p.slowT > 0 && factor === p.slowFactor ? Math.max(p.slowT, time) : time;
    p.slowFactor = factor;
    p.slowTier = tier;
    if (p.mode !== 'dash') p.speed = Math.min(p.speed, t.baseSpeed * this.dirScale(p.dirZ) * factor);
  }

  /** Contact tier from the angle between the heading and the direction to the obstacle. */
  contactTier(nx: number, nz: number): Tier {
    const p = this.player;
    const t = this.tune;
    if (p.speed < 0.05 && !this.input.down) return 2;
    const dot = p.dirX * nx + p.dirZ * nz;
    return dot > t.tierHeadDot ? 0 : dot > t.tierPartialDot ? 1 : 2;
  }

  /* ---------------- crowd ---------------- */

  private generateCrowd(toZ: number) {
    const t = this.tune;
    const goalZ = -this.cfg.length - GOAL_OVERRUN;
    const p0x = this.player.x;
    while (this.genFront > toZ) {
      const z1 = this.genFront;
      const z0 = z1 - 1;
      this.genFront = z0;
      if (z1 < goalZ) continue;
      const cell = Math.round(z0);
      const r = new Rng((this.seed * 2654435761) ^ Math.imul(cell, 40503) ^ Math.imul(this.cfg.n, 97));
      const dist = -(z0 + 0.5);
      const jam = jamAt(this.cfg, dist);
      const mult = jam ? jam.mult : 1;
      const nearCount = r.poisson(this.cfg.crowd * mult);
      const farCount = r.poisson(this.cfg.crowd * t.farPavementShare * mult);
      for (let i = 0; i < nearCount + farCount; i++) {
        const far = i >= nearCount;
        const x = far ? r.range(FAR_X0 + 0.6, FAR_X1 - 0.5) : r.range(WALK_X0 + 0.5, WALK_X1 - 0.5);
        const z = r.range(z0, z1);
        // keep the start clear around the player and the chaser
        if (!far && Math.abs(x - p0x) < 1.6 && ((z > -2 && z < 2.5) || Math.abs(z - t.chaserStartGap) < 1.5)) {
          r.next();
          continue;
        }
        this.spawnPed(r, x, z, far, jam ? -jam.to : NaN, jam ? -jam.from : NaN);
      }
    }
  }

  private spawnPed(r: Rng, x: number, z: number, far: boolean, jamLo: number, jamHi: number) {
    const t = this.tune;
    const q = this.pedPool.pop() ?? ({} as Ped);
    q.id = this.nextId++;
    q.x = q.px = x;
    q.z = q.pz = z;
    q.dir = r.chance(0.5) ? 1 : -1;
    const jam = !Number.isNaN(jamLo);
    q.spd = r.chance(t.pedStillChance) ? 0 : jam ? r.range(0, t.jamSpeedMax) : r.range(t.pedSpeedMin, t.pedSpeedMax);
    q.wobble = r.range(0, 6.28);
    q.phase = q.pphase = r.range(0, 6.28);
    q.scale = r.range(0.9, 1.08);
    q.look = r.int(64);
    q.seed = r.next();
    q.far = far;
    q.jamLo = jamLo;
    q.jamHi = jamHi;
    q.stagger = 0;
    q.kvx = q.kvz = 0;
    q.knockDirX = 0;
    q.knockDirZ = 0;
    q.contact = false;
    q.dashHit = false;
    q.bumpT = 9;
    q.bz = Math.floor(z);
    q.yieldT = 0;
    q.yvx = q.yvz = 0;
    q.anchored = false;
    this.peds.push(q);
  }

  /** Place a standing pedestrian (tests, debug). */
  spawnPedAt(x: number, z: number, far = false): Ped {
    const r = new Rng(this.nextId * 31 + 7);
    this.spawnPed(r, x, z, far, NaN, NaN);
    const q = this.peds[this.peds.length - 1];
    q.spd = 0;
    q.anchored = true;
    return q;
  }

  private bucketKey(far: boolean, z: number) {
    return (Math.floor(z) << 1) | (far ? 1 : 0);
  }

  private updatePeds(dt: number) {
    const p = this.player;
    const t = this.tune;

    if (this.genFront > p.z - AHEAD) this.generateCrowd(p.z - AHEAD);

    // move
    for (let i = this.peds.length - 1; i >= 0; i--) {
      const q = this.peds[i];
      if (q.z > p.z + DESPAWN_BEHIND || q.z < p.z - DESPAWN_AHEAD) {
        this.peds[i] = this.peds[this.peds.length - 1];
        this.peds.pop();
        this.pedPool.push(q);
        continue;
      }
      q.bumpT += dt;
      if (q.stagger > 0) {
        q.stagger = Math.max(0, q.stagger - dt);
        q.x += q.kvx * dt;
        q.z += q.kvz * dt;
        const drag = Math.exp(-5 * dt);
        q.kvx *= drag;
        q.kvz *= drag;
      } else if (q.yieldT > 0) {
        q.yieldT = Math.max(0, q.yieldT - dt);
        q.x += q.yvx * dt;
        q.z += q.yvz * dt;
      } else {
        q.z += q.dir * q.spd * dt;
        q.wobble += dt * 1.4;
        if (!q.anchored) q.x += Math.sin(q.wobble) * 0.22 * dt;
        q.phase += q.spd * dt * 2.4;
        if (!Number.isNaN(q.jamLo)) {
          if (q.z < q.jamLo && q.dir < 0) q.dir = 1;
          else if (q.z > q.jamHi && q.dir > 0) q.dir = -1;
        }
      }
      this.clampPed(q);
    }

    // separation, bucketed by 1 m of z and by pavement
    for (const list of this.buckets.values()) {
      list.length = 0;
      this.bucketPool.push(list);
    }
    this.buckets.clear();
    for (const q of this.peds) {
      q.bz = Math.floor(q.z);
      const k = this.bucketKey(q.far, q.z);
      let list = this.buckets.get(k);
      if (!list) {
        list = this.bucketPool.pop() ?? [];
        this.buckets.set(k, list);
      }
      list.push(q);
    }
    const minD = 0.65;
    for (const q of this.peds) {
      const kz = q.bz;
      for (let dz = 0; dz <= 1; dz++) {
        const list = this.buckets.get(((kz + dz) << 1) | (q.far ? 1 : 0));
        if (!list) continue;
        for (const o of list) {
          if (o.id <= q.id && dz === 0) continue;
          if (dz === 1 && o === q) continue;
          const ddx = o.x - q.x;
          const ddz = o.z - q.z;
          const d2 = ddx * ddx + ddz * ddz;
          if (d2 > minD * minD || d2 < 1e-8) continue;
          const d = Math.sqrt(d2);
          const push = (minD - d) * 0.5;
          const ux = ddx / d;
          const uz = ddz / d;
          q.x -= ux * push;
          q.z -= uz * push;
          o.x += ux * push;
          o.z += uz * push;
        }
      }
    }
    for (const q of this.peds) {
      // posts are solid for pedestrians too
      if (!q.far && q.x > WALK_X1 - 1.4) this.pushFromPosts(q, t.pedR);
      if (!q.far && q.x < WALK_X0 + 1.6) this.pushFromPosts(q, t.pedR);
      this.clampPed(q);
    }
  }

  private pushFromPosts(q: { x: number; z: number }, r: number): Post | null {
    let hit: Post | null = null;
    for (const b of this.blocks) {
      for (const o of b.posts) {
        const dx = q.x - o.x;
        const dz = q.z - o.z;
        const min = o.r + r;
        const d2 = dx * dx + dz * dz;
        if (d2 < min * min && d2 > 1e-8) {
          const d = Math.sqrt(d2);
          q.x += (dx / d) * (min - d);
          q.z += (dz / d) * (min - d);
          hit = o;
        }
      }
    }
    return hit;
  }

  private clampPed(q: Ped) {
    const lo = q.far ? FAR_X0 + 0.35 : WALK_X0 + 0.35;
    const hi = q.far ? FAR_X1 - 0.35 : WALK_X1 - 0.35;
    if (q.x < lo) q.x = lo;
    if (q.x > hi) q.x = hi;
  }

  private collidePlayer(_dt: number) {
    const p = this.player;
    const t = this.tune;
    const min = t.pedR + t.playerR;
    const dashing = p.mode === 'dash';
    const kz = Math.floor(p.z);
    for (let dz = -1; dz <= 1; dz++) {
      for (let side = 0; side <= 1; side++) {
        const list = this.buckets.get(((kz + dz) << 1) | side);
        if (!list) continue;
        for (const q of list) {
          const dx = q.x - p.x;
          const dzz = q.z - p.z;
          const d2 = dx * dx + dzz * dzz;
          const touching = d2 < min * min && d2 > 1e-8;
          if (!touching) {
            q.contact = false;
            continue;
          }
          const d = Math.sqrt(d2);
          const nx = dx / d;
          const nz = dzz / d;
          const o = min - d;
          if (dashing) {
            q.x += nx * o;
            q.z += nz * o;
            if (!q.dashHit) {
              q.dashHit = true;
              this.knock(q, p.dirX, p.dirZ, nx, nz, 'player');
            }
          } else {
            const share = t.playerPushShare;
            p.x -= nx * o * share;
            p.z -= nz * o * share;
            q.x += nx * o * (1 - share);
            q.z += nz * o * (1 - share);
            const tier = this.contactTier(nx, nz);
            this.applySlow(tier);
            if (q.yieldT <= 0 && q.stagger <= 0) this.yieldPed(q);
            if (!q.contact) {
              q.contact = true;
              q.bumpT = 0;
              p.bumpT = 0;
              p.bumpTier = tier;
              this.events.push({ t: 'bump', tier, x: q.x, z: q.z, id: q.id });
            }
          }
          this.clampPed(q);
        }
      }
    }

    const post = this.pushFromPosts(p, t.playerR);
    if (post) {
      const nx = post.x - p.x;
      const nz = post.z - p.z;
      const d = Math.hypot(nx, nz) || 1;
      const tier = this.contactTier(nx / d, nz / d);
      if (p.mode !== 'dash') this.applySlow(tier);
      if (p.bumpT > 0.25) {
        p.bumpT = 0;
        p.bumpTier = tier;
        this.events.push({ t: 'post', tier, x: post.x, z: post.z });
      }
    }
    // buildings are solid
    p.x = Math.max(WALK_X0 + 0.35, Math.min(FAR_X1 - 0.35, p.x));
  }

  /** A bumped pedestrian steps out of the player's line. INVENTED: see NOTES.md. */
  private yieldPed(q: Ped) {
    const p = this.player;
    const t = this.tune;
    // perpendicular to the heading, on the side the pedestrian already leans toward
    const cross = p.dirX * (q.z - p.z) - p.dirZ * (q.x - p.x);
    let side = cross > 0.02 ? 1 : cross < -0.02 ? -1 : q.seed > 0.5 ? 1 : -1;
    const lo = q.far ? FAR_X0 + 0.5 : WALK_X0 + 0.5;
    const hi = q.far ? FAR_X1 - 0.5 : WALK_X1 - 0.5;
    let vx = -p.dirZ * side;
    if ((q.x <= lo && vx < 0) || (q.x >= hi && vx > 0)) {
      side = -side;
      vx = -vx;
    }
    q.yvx = vx * t.yieldSpeed;
    q.yvz = p.dirX * side * t.yieldSpeed;
    q.yieldT = t.yieldTime;
  }

  /** Knock a pedestrian aside from a line moving along (mx, mz). */
  private knock(q: Ped, mx: number, mz: number, nx: number, nz: number, by: 'player' | 'chaser') {
    // sideways component away from the mover's line, plus some carry along it
    const side = mx * nz - mz * nx >= 0 ? 1 : -1;
    const lx = -mz * side;
    const lz = mx * side;
    const power = by === 'player' ? 4.2 : 2.6;
    q.kvx = lx * power + mx * power * 0.45;
    q.kvz = lz * power + mz * power * 0.45;
    const kd = Math.hypot(q.kvx, q.kvz) || 1;
    q.knockDirX = q.kvx / kd;
    q.knockDirZ = q.kvz / kd;
    q.stagger = this.tune.staggerTime;
    q.bumpT = 0;
    this.events.push({ t: 'knock', id: q.id, x: q.x, z: q.z, by });
  }

  /* ---------------- chaser ---------------- */

  private updateChaser(dt: number) {
    const c = this.chaser;
    const p = this.player;
    const t = this.tune;
    const dx = p.x - c.x;
    const dz = p.z - c.z;
    const d = Math.hypot(dx, dz) || 1;
    c.dirX = dx / d;
    c.dirZ = dz / d;
    const step = c.speed * dt;
    c.x += c.dirX * step;
    c.z += c.dirZ * step;
    c.phase += step * 2.2;

    // shove pedestrians out of its way
    const r2 = t.chaserShoveR * t.chaserShoveR;
    const kz = Math.floor(c.z);
    for (let k = -1; k <= 1; k++) {
      for (let side = 0; side <= 1; side++) {
        const list = this.buckets.get(((kz + k) << 1) | side);
        if (!list) continue;
        for (const q of list) {
          const qx = q.x - c.x;
          const qz = q.z - c.z;
          const q2 = qx * qx + qz * qz;
          if (q2 >= r2) continue;
          const qd = Math.sqrt(q2) || 1e-3;
          const nx = qx / qd;
          const nz = qz / qd;
          q.x = c.x + nx * t.chaserShoveR;
          q.z = c.z + nz * t.chaserShoveR;
          if (q.stagger < 0.3) this.knock(q, c.dirX, c.dirZ, nx, nz, 'chaser');
          this.clampPed(q);
        }
      }
    }

    if (Math.hypot(p.x - c.x, p.z - c.z) < t.chaserCatchR) this.kill('caught', -1);
  }

  /* ---------------- traffic ---------------- */

  private spawnCar(lane: 0 | 1, zOffset: number, spd: number, convoy: boolean) {
    const t = this.tune;
    const r = this.rng;
    const toward = lane === 0;
    const long = !convoy && r.chance(t.carLongChance);
    const jitter = convoy ? 0 : r.range(-t.laneJitter, t.laneJitter);
    const p = this.player;
    const z = toward ? p.z + t.nearSpawnAhead + zOffset : p.z - t.farSpawnBehind - zOffset;
    this.cars.push({
      id: this.nextId++,
      x: (toward ? LANE_NEAR : LANE_FAR) + jitter,
      z,
      px: (toward ? LANE_NEAR : LANE_FAR) + jitter,
      pz: z,
      dir: toward ? -1 : 1,
      spd,
      w: t.carW,
      d: long ? t.carLongLen : t.carLen,
      h: long ? t.carLongH : t.carH,
      long,
      colour: r.int(CAR_COLOURS),
      lane,
      side: Math.sign(z - p.z) || 1,
      missed: false,
    });
  }

  private updateTraffic(dt: number) {
    const t = this.tune;
    const tr = this.cfg.traffic;
    const p = this.player;
    if (this.phase === 'play') {
      if (tr.kind === 'light') {
        this.nextNear -= dt;
        this.nextFar -= dt;
        if (this.nextNear <= 0) {
          this.spawnCar(0, 0, this.rng.range(t.lightSpeedMin, t.lightSpeedMax), false);
          this.nextNear = this.rng.range(t.nearGapMin, t.nearGapMax);
        }
        if (this.nextFar <= 0) {
          this.spawnCar(1, 0, this.rng.range(t.lightSpeedMin, t.lightSpeedMax), false);
          this.nextFar = this.rng.range(t.farGapMin, t.farGapMax);
        }
      } else if (tr.kind === 'waves') {
        this.waveNear -= dt;
        this.waveFar -= dt;
        if (this.waveNear <= 0) {
          for (let i = 0; i < tr.cars; i++) this.spawnCar(0, i * t.waveSpacing, tr.speed, true);
          this.waveNear += tr.period;
        }
        if (this.waveFar <= 0) {
          for (let i = 0; i < tr.cars; i++) this.spawnCar(1, i * t.waveSpacing, tr.speed, true);
          this.waveFar += tr.period;
        }
      }
    }

    for (let i = this.cars.length - 1; i >= 0; i--) {
      const c = this.cars[i];
      c.z += c.dir * c.spd * dt;
      if (c.z < p.z - 46 - t.waveSpacing * 5 || c.z > p.z + 96 + t.waveSpacing * 5) {
        this.cars.splice(i, 1);
        continue;
      }
      if (this.phase !== 'play') continue;
      const hw = c.w / 2 + t.carHitMargin;
      const hd = c.d / 2 + t.carHitMargin;
      const ax = Math.abs(p.x - c.x);
      if (ax < hw && Math.abs(p.z - c.z) < hd) {
        this.kill('car', c.id);
        continue;
      }
      const side = Math.sign(c.z - p.z) || c.side;
      if (side !== c.side) {
        if (!c.missed && ax < hw + t.nearMissMargin) {
          c.missed = true;
          this.events.push({ t: 'nearMiss', id: c.id, x: c.x, z: c.z, dx: p.x - c.x });
        }
        c.side = side;
      }
    }
  }

  private kill(cause: DeathCause, id: number) {
    if (this.phase !== 'play') return;
    this.phase = 'dead';
    this.deathCause = cause;
    this.deathT = 0;
    this.killerId = id;
    const p = this.player;
    p.mode = 'free';
    this.events.push({ t: 'death', cause, x: p.x, z: p.z, id });
  }

  /* ---------------- camera ---------------- */

  private updateCamera(dt: number) {
    const t = this.tune;
    const cam = this.cam;
    const p = this.player;
    const mul = this.input.down ? t.camHeldMul : 1;
    let tx = cam.x;
    const ex = p.x - cam.x;
    if (ex > t.camDeadX) tx = p.x - t.camDeadX;
    else if (ex < -t.camDeadX) tx = p.x + t.camDeadX;
    const rz = p.z - t.camDist;
    let tz = cam.z;
    const ez = rz - cam.z;
    if (ez > t.camDeadZ) tz = rz - t.camDeadZ;
    else if (ez < -t.camDeadZ) tz = rz + t.camDeadZ;
    cam.x += (tx - cam.x) * (1 - Math.exp(-t.camRateX * mul * dt));
    cam.z += (tz - cam.z) * (1 - Math.exp(-t.camRateZ * mul * dt));
    cam.y = t.camHeight;
    cam.pitch = t.camPitch;
  }

  /** Lamps and bins near a z range, for the renderer. */
  blocksNear(zMin: number, zMax: number, out: Block[]) {
    return blocksInRange(zMin, zMax, out);
  }

  drainEvents(out: SimEvent[]) {
    for (const e of this.events) out.push(e);
    this.events.length = 0;
    return out;
  }
}
