// Ties the render pieces together: reads the sim (interpolated), poses people, picks the
// lights, plays visual feedback, renders the scene into a target and runs the post pass.

import * as THREE from 'three';
import type { Game } from '../game';
import { FAR_X0, KERB_H, WALK_X1 } from '../sim/constants';
import type { View } from '../sim/projection';
import { blocksInRange, type Block } from '../sim/props';
import type { Car as SimCar, SimEvent } from '../sim/world';
import { Buildings } from './buildings';
import { Cars } from './cars';
import { AimRing, Drizzle, Segments, Shadows, Sky } from './fx';
import { Beams, Halos } from './glows';
import { MAX_HEADS, MAX_LAMPS, shared } from './lighting';
import { CARS, CROWD, P, mix, type RGB } from './palette';
import { People, defaultPose, resetPose, type Pose } from './people';
import { Post } from './post';
import { Posts } from './posts';
import { Street } from './street';

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

export interface Tier {
  name: string;
  dpr: number;
  lamps: number;
  heads: number;
  drizzle: number;
  cones: boolean;
  ink: boolean;
}

export const TIERS: Tier[] = [
  { name: 'low', dpr: 1, lamps: 4, heads: 3, drizzle: 0, cones: false, ink: true },
  { name: 'mid', dpr: 1.5, lamps: 6, heads: 4, drizzle: 500, cones: true, ink: true },
  { name: 'high', dpr: 2, lamps: MAX_LAMPS, heads: MAX_HEADS, drizzle: 900, cones: true, ink: true },
];

interface Fx {
  shake: number; // seconds of shake left
  shakeAmp: number;
  desat: number;
  flash: number;
  dashAt: number; // sim time of the last dash
  dashDirX: number;
  dashDirZ: number;
  stumbleSide: number;
}

export class Renderer {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera();
  readonly post = new Post();
  private sky = new Sky();
  private street = new Street();
  private buildings = new Buildings();
  private posts = new Posts();
  private people = new People();
  private cars = new Cars();
  private halos = new Halos();
  private beams = new Beams();
  private shadows = new Shadows();
  private aim = new AimRing();
  private segs = new Segments();
  private drizzle = new Drizzle(TIERS[2].drizzle);
  private blocks: Block[] = [];
  private view!: View;
  private pose: Pose = defaultPose();
  private fx: Fx = { shake: 0, shakeAmp: 0, desat: 0, flash: 0, dashAt: -9, dashDirX: 0, dashDirZ: -1, stumbleSide: 1 };
  private time = 0;
  private lampSort: { x: number; y: number; z: number; d: number }[] = [];
  private carOrder: SimCar[] = [];
  tier: Tier = TIERS[1];
  /** 0..1, how close the chaser is (for vignette + audio). */
  dread = 0;
  beat = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', stencil: false });
    this.renderer.autoClear = true;
    this.renderer.setClearColor(new THREE.Color().setRGB(...P.haze, THREE.SRGBColorSpace));
    this.renderer.info.autoReset = false;
    this.people.xray.mesh.renderOrder = 5;
    this.people.player.mesh.renderOrder = 6;
    this.scene.add(
      this.sky.mesh,
      this.street.mesh,
      this.buildings.mesh,
      this.posts.lamps.mesh,
      this.posts.bins.mesh,
      this.shadows.mesh,
      this.aim.mesh,
      this.people.crowd.mesh,
      this.people.xray.mesh,
      this.people.player.mesh,
      this.people.chaser.mesh,
      this.cars.sedans.mesh,
      this.cars.vans.mesh,
      this.beams.mesh,
      this.halos.mesh,
      this.segs.mesh,
      this.drizzle.mesh,
    );
  }

  setTier(t: Tier) {
    this.tier = t;
    if (this.view) this.resize(this.view);
  }

  resize(view: View) {
    this.view = view;
    const dpr = Math.min(this.tier.dpr, window.devicePixelRatio || 1);
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(view.W, view.H, false);
    const w = Math.max(1, Math.round(view.W * dpr));
    const h = Math.max(1, Math.round(view.H * dpr));
    this.post.setSize(w, h);
    this.post.uniforms.uInkW.value = Math.max(1, dpr * 0.85);
    this.post.uniforms.uAspect.value = view.W / view.H;
    this.post.uniforms.uCentre.value.set(view.CX / view.W, 1 - view.CY / view.H);
    this.segs.uniforms.uRes.value.set(view.W, view.H);
    this.drizzle.uniforms.uRes.value.set(view.W, view.H);
    this.sky.uniforms.uRes.value.set(w, h);
  }

  /** React to sim events (visual side only). */
  private simTime = 0;

  onEvents(events: SimEvent[], simTime: number) {
    this.simTime = simTime;
    for (const e of events) {
      switch (e.t) {
        case 'nearMiss':
          this.fx.shake = Math.max(this.fx.shake, 0.28);
          this.fx.shakeAmp = 0.07;
          this.fx.desat = 1;
          break;
        case 'dash':
          this.fx.dashAt = this.simTime;
          this.fx.dashDirX = e.dirX;
          this.fx.dashDirZ = e.dirZ;
          this.fx.shake = Math.max(this.fx.shake, 0.12);
          this.fx.shakeAmp = 0.03;
          break;
        case 'bump':
          if (e.tier === 0) {
            this.fx.shake = Math.max(this.fx.shake, 0.1);
            this.fx.shakeAmp = 0.02;
            this.fx.stumbleSide = Math.random() < 0.5 ? -1 : 1;
          }
          break;
        case 'death':
          this.fx.shake = 0.35;
          this.fx.shakeAmp = e.cause === 'car' ? 0.16 : 0.05;
          this.fx.flash = 1;
          break;
      }
    }
  }

  render(game: Game, realDt: number) {
    const w = game.world;
    const a = game.alpha;
    const v = this.view;
    this.time += realDt;
    const fx = this.fx;
    fx.shake = Math.max(0, fx.shake - realDt);
    fx.desat = Math.max(0, fx.desat - realDt * 2.2);
    fx.flash = Math.max(0, fx.flash - realDt * 3);
    const dashT = w.time - fx.dashAt;

    /* ---------- camera ---------- */
    const camX = lerp(w.cam.px, w.cam.x, a);
    const camZ = lerp(w.cam.pz, w.cam.z, a);
    let sx = 0;
    let sy = 0;
    if (fx.shake > 0) {
      const k = fx.shakeAmp * Math.min(1, fx.shake / 0.15);
      sx = Math.sin(this.time * 71) * k;
      sy = Math.sin(this.time * 53 + 1.3) * k * 0.7;
    }
    const n = 0.1;
    const f = 220;
    this.camera.projectionMatrix.makePerspective(
      (-v.CX / v.F) * n,
      ((v.W - v.CX) / v.F) * n,
      (v.CY / v.F) * n,
      (-(v.H - v.CY) / v.F) * n,
      n,
      f,
    );
    this.camera.projectionMatrixInverse.copy(this.camera.projectionMatrix).invert();
    this.camera.position.set(camX + sx, w.cam.y + sy, -camZ);
    this.camera.rotation.set(-w.cam.pitch, 0, 0);
    this.camera.updateMatrixWorld();
    shared.uCamPos.value.copy(this.camera.position);
    shared.uTime.value = this.time;
    this.sky.uniforms.uHorizon.value = 1 - (v.CY - v.F * Math.tan(w.cam.pitch)) / v.H;
    this.sky.uniforms.uSpan.value = 0.55;

    /* ---------- environment ---------- */
    this.street.follow(-camZ);
    this.buildings.update(camZ);
    this.blocks = blocksInRange(camZ - 12, camZ + 110, this.blocks);
    this.posts.update(this.blocks, camZ);

    // lamps: nearest first, faded out toward the end of the list so they don't pop
    const ls = this.lampSort;
    ls.length = 0;
    for (const h of this.posts.heads) ls.push({ x: h.x, y: h.y, z: h.z, d: h.simZ - camZ });
    ls.sort((p, q) => Math.abs(p.d + 4) - Math.abs(q.d + 4));
    const nl = Math.min(this.tier.lamps, ls.length);
    for (let i = 0; i < MAX_LAMPS; i++) {
      if (i < nl) {
        shared.uLamp.value[i].set(ls[i].x, ls[i].y, ls[i].z);
        shared.uLampOn.value[i] = 1 - THREE.MathUtils.smoothstep(ls[i].d, 46, 62);
      } else shared.uLampOn.value[i] = 0;
    }
    shared.uLampCount.value = nl;

    /* ---------- glows ---------- */
    this.halos.begin();
    this.beams.begin();
    for (const h of this.posts.heads) {
      this.halos.add(h.x, h.y - 0.08, h.z, 1.25, P.sodium, 0.9);
      if (this.tier.cones) this.beams.add(h.x, h.y - 0.06, h.z, 0, -1, 0, h.y - 0.05, 2.4, P.sodium, 0.05);
    }

    /* ---------- cars ---------- */
    this.cars.sedans.n = 0;
    this.cars.vans.n = 0;
    this.shadows.begin();
    let nh = 0;
    const order = this.carOrder;
    order.length = 0;
    for (const c of w.cars) order.push(c);
    order.sort((p, q) => Math.abs(p.z - camZ - 10) - Math.abs(q.z - camZ - 10));
    for (const c of order) {
      const z = lerp(c.pz, c.z, a);
      const x = lerp(c.px, c.x, a);
      const rz = -z;
      const toward = c.dir < 0; // render +z
      const yaw = toward ? 0 : Math.PI;
      const body = CARS[c.colour % CARS.length];
      (c.long ? this.cars.vans : this.cars.sedans).add(x, 0, rz, yaw, body, 1);
      this.shadows.add(x, 0, rz, -(c.long ? 1.95 : 1.7));
      const fwd = toward ? 1 : -1;
      const front = rz + (fwd * c.d) / 2;
      const back = rz - (fwd * c.d) / 2;
      const ly = c.long ? 0.72 : 0.68;
      const lx = c.long ? 0.7 : 0.62;
      if (z > camZ - 30 && z < camZ + 100) {
        for (const s of [-1, 1]) {
          this.halos.add(x + s * lx, ly, front + fwd * 0.05, toward ? 1.1 : 0.7, P.cold, toward ? 1 : 0.5);
          this.halos.add(x + s * lx, ly + 0.04, back - fwd * 0.05, 0.55, P.ember, 0.85);
          if (this.tier.cones) this.beams.add(x + s * lx, ly, front, 0, -0.07, fwd, 18, 2.0, P.cold, 0.035);
        }
      }
      if (nh < this.tier.heads && z > camZ - 40 && z < camZ + 80) {
        shared.uHead.value[nh].set(x, ly, front);
        shared.uHeadDir.value[nh].set(0, -0.09, fwd).normalize();
        shared.uHeadOn.value[nh] = 1;
        nh++;
      }
    }
    for (let i = nh; i < MAX_HEADS; i++) shared.uHeadOn.value[i] = 0;
    shared.uHeadCount.value = nh;
    this.cars.sedans.end();
    this.cars.vans.end();

    /* ---------- finish pool ---------- */
    const remaining = w.remaining;
    const fin = clamp01(1 - remaining / w.tune.finishGlowDist);
    shared.uFinish.value.set(-3.5, 3.5, w.cfg.length + 3, fin);
    this.post.uniforms.uSpill.value = fin * fin;

    /* ---------- people ---------- */
    this.posePeople(game);

    /* ---------- aim ring and lines ---------- */
    this.segs.begin();
    const p = w.player;
    const px = lerp(p.px, p.x, a);
    const pz = lerp(p.pz, p.z, a);
    if (w.aimShown && game.stage === 'play') {
      const onRoad = w.aimOnRoad;
      const col = onRoad ? P.ember : P.sodium;
      const pulse = 0.5 + 0.5 * Math.sin(this.time * 6);
      const gy = w.aimX < WALK_X1 || w.aimX > FAR_X0 ? KERB_H : 0;
      const charging = p.mode === 'charge';
      this.aim.set(w.aimX, gy, -w.aimZ, col, pulse, charging ? p.charge : -1, 1);
      this.aim.mesh.visible = true;
      if (charging) this.segs.add(px, 0.2, -pz, w.aimX, gy + 0.05, -w.aimZ, 2, col, 0.65);
    } else this.aim.mesh.visible = false;

    // speed lines behind a dash
    if (dashT < 0.45) {
      const k = 1 - dashT / 0.45;
      const dx = fx.dashDirX;
      const dz = -fx.dashDirZ;
      for (let i = 0; i < 7; i++) {
        const hgt = 0.35 + i * 0.22;
        const side = (i % 2 ? 1 : -1) * (0.15 + 0.06 * i);
        const ox = px - dz * side;
        const oz = -pz + dx * side;
        const len = (1.2 + 0.25 * ((i * 7) % 3)) * k;
        this.segs.add(ox - dx * 0.4, hgt, oz - dz * 0.4, ox - dx * (0.4 + len), hgt, oz - dz * (0.4 + len), 2.5, P.bone, 0.7 * k, 0.1);
      }
    }

    // the chaser's shadow lands on you
    if (game.stage === 'dying' || game.stage === 'failed') {
      if (w.deathCause === 'caught') {
        const c = w.chaser;
        const k = clamp01(game.stage === 'failed' ? 1 : game.stageT / 0.5);
        const cx = c.x;
        const cz = -c.z;
        this.segs.add(cx, 0.17, cz, lerp(cx, px, k * 1.6), 0.17, lerp(cz, -pz, k * 1.6), 70, P.ink, 0.75 * k);
      }
    }
    this.segs.end();
    this.halos.end();
    this.beams.end();
    this.shadows.end();

    /* ---------- drizzle ---------- */
    this.drizzle.mesh.visible = this.tier.drizzle > 0;
    this.drizzle.setCount(this.tier.drizzle);
    this.drizzle.uniforms.uBox.value.set(camX, 0, -camZ, 1);

    /* ---------- post ---------- */
    const gap = w.chaserGap;
    const targetDread = clamp01((9 - gap) / 7.5);
    this.dread = lerp(this.dread, targetDread, 1 - Math.exp(-realDt * 3));
    const pu = this.post.uniforms;
    pu.uVig.value = this.dread;
    pu.uBeat.value = this.beat;
    pu.uDesat.value = fx.desat;
    pu.uFlash.value = fx.flash;
    const dying = game.stage === 'dying' ? clamp01(game.stageT / 0.35) : game.stage === 'failed' ? 1 : 0;
    pu.uDeath.value = dying * 0.85;
    pu.uInkOn.value = this.tier.ink ? 1 : 0;

    this.renderer.info.reset();
    this.renderer.setRenderTarget(this.post.target);
    this.renderer.render(this.scene, this.camera);
    this.renderer.setRenderTarget(null);
    this.renderer.render(this.post.scene, this.post.camera);
  }

  private groundY(x: number) {
    if (x < WALK_X1 - 0.05 || x > FAR_X0 + 0.05) return KERB_H;
    if (x > WALK_X1 + 0.05 && x < FAR_X0 - 0.05) return 0;
    return x < 5 ? lerp(KERB_H, 0, (x - (WALK_X1 - 0.05)) / 0.1) : lerp(0, KERB_H, (x - (FAR_X0 - 0.05)) / 0.1);
  }

  private posePeople(game: Game) {
    const w = game.world;
    const a = game.alpha;
    const camZ = lerp(w.cam.pz, w.cam.z, a);
    const crowd = this.people.crowd;
    const pose = this.pose;
    crowd.begin();

    for (const q of w.peds) {
      const z = lerp(q.pz, q.z, a);
      const dz = z - camZ;
      if (dz < 0.6 || dz > 92) continue;
      const x = lerp(q.px, q.x, a);
      resetPose(pose);
      pose.x = x;
      pose.y = KERB_H;
      pose.z = -z;
      pose.yaw = q.dir > 0 ? Math.PI : 0;
      const walking = q.spd > 0.05 && q.stagger <= 0;
      pose.phase = lerp(q.pphase, q.phase, a);
      pose.stride = q.stagger > 0 ? 0.25 : q.yieldT > 0 ? 0.55 : walking ? Math.min(1.05, 0.35 + q.spd / 2.4) : 0;
      if (q.yieldT > 0) pose.phase = this.time * 9 + q.seed * 6;
      pose.lean = walking ? 0.05 * pose.stride : 0;
      const bump = q.bumpT < 0.3 ? 1 - q.bumpT / 0.3 : 0;
      pose.squash = 0.1 * bump * bump;
      if (q.stagger > 0) {
        const k = 1 - q.stagger / w.tune.staggerTime;
        const arc = Math.sin(Math.PI * Math.pow(k, 0.55));
        pose.tilt = 0.95 * arc;
        pose.tiltYaw = Math.atan2(q.knockDirX, -q.knockDirZ);
        pose.reach = 0.55 * arc;
        pose.crouch = 0.25 * arc;
      }
      const look = q.look;
      pose.coat = CROWD[look % CROWD.length];
      pose.legs = mix(pose.coat, P.ink, 0.5);
      pose.head = (look >> 3) % 6;
      pose.coatLen = [0, 0.35, 0.35, 0.9][(look >> 2) % 4];
      pose.scale = q.scale;
      pose.armSwing = 0.8 + 0.4 * q.seed;
      pose.fade = THREE.MathUtils.smoothstep(dz, 1.3, 3.8);
      crowd.add(pose);
      this.shadows.add(x, KERB_H, -z, 0.42 * q.scale);
    }

    /* player */
    const p = w.player;
    const fx = this.fx;
    const px = lerp(p.px, p.x, a);
    const pz = lerp(p.pz, p.z, a);
    resetPose(pose);
    pose.x = px;
    pose.y = this.groundY(px);
    pose.z = -pz;
    pose.yaw = Math.atan2(p.dirX, -p.dirZ);
    pose.phase = lerp(p.pphase, p.phase, a);
    pose.stride = Math.min(1.1, p.speed / w.tune.baseSpeed);
    pose.bob = 0.055;
    pose.coatLen = 0.7;
    pose.coat = P.bone;
    pose.legs = P.boneTrim;
    pose.head = 4;
    pose.lean = 0.13 * pose.stride;
    const bumpEnv = p.bumpT < 0.24 ? Math.pow(1 - p.bumpT / 0.24, 2) : 0;
    pose.squash = [0.16, 0.08, 0.02][p.bumpTier] * bumpEnv;
    if (p.bumpTier === 0 && p.bumpT < 0.4) {
      // stumble: a recoil back and to one side
      const s = Math.sin(Math.PI * (p.bumpT / 0.4));
      pose.lean -= 0.42 * s;
      pose.leanSide = 0.16 * s * fx.stumbleSide;
    }
    if (p.mode === 'charge') {
      const c = 1 - Math.pow(1 - p.charge, 2);
      pose.crouch = 0.85 * c;
      pose.reach = 0.3 * c;
      pose.squash = 0.06 * c;
      pose.stride = 0;
    }
    const dashT = w.time - fx.dashAt;
    if (dashT < 0.45) {
      const k = 1 - dashT / 0.45;
      pose.reach = Math.max(pose.reach, k);
      pose.lean = Math.max(pose.lean, 0.38 * k);
      pose.squash = Math.min(pose.squash, -0.12 * k);
    }
    if (game.stage === 'dying' || game.stage === 'failed') {
      const k = clamp01(game.stage === 'failed' ? 1 : game.stageT / 0.55);
      const e = 1 - Math.pow(1 - k, 3);
      if (w.deathCause === 'car') {
        // the world freezes; only you are thrown clear of the car
        const killer = w.cars.find((c) => c.id === w.killerId);
        const side = killer ? (px < killer.x ? -1 : 1) : -1;
        const fwd = killer ? (killer.dir < 0 ? 1 : -1) : 1;
        pose.x += side * 1.5 * e;
        pose.z += fwd * 1.1 * e;
        pose.y += Math.sin(Math.PI * k) * 0.35;
        pose.tilt = 1.45 * e;
        pose.tiltYaw = Math.atan2(side, fwd * 0.6);
        pose.reach = 0.9 * e;
        pose.stride = 0;
      } else {
        // its reach lands on you: you fold, and the bone drains out of you
        pose.crouch = 0.55 * e;
        pose.lean = 0.55 * e;
        pose.stride = 0;
        pose.coat = mix(P.bone, P.ink, 0.88 * e);
        pose.legs = mix(P.boneTrim, P.ink, 0.88 * e);
      }
    }
    crowd.end();
    const pl = this.people.player;
    pl.begin();
    pl.add(pose);
    pl.end();
    this.people.xray.copyFrom(pl);
    this.people.xray.end();
    this.shadows.add(px, pose.y, -pz, 0.46);

    /* chaser */
    const ch = this.people.chaser;
    ch.begin();
    const c = w.chaser;
    const cx = lerp(c.px, c.x, a);
    const cz = lerp(c.pz, c.z, a);
    resetPose(pose);
    pose.x = cx;
    pose.y = this.groundY(cx);
    pose.z = -cz;
    pose.yaw = Math.atan2(c.dirX, -c.dirZ);
    pose.phase = lerp(c.pphase, c.phase, a);
    pose.stride = 1;
    pose.armSwing = 0.1;
    pose.kneeAmp = 0.3;
    pose.bob = 0.01;
    pose.lean = 0.2;
    pose.coatLen = 0.45;
    const gap = w.chaserGap;
    pose.reach = clamp01((2.8 - gap) / 1.8) * 0.85;
    if (w.deathCause === 'caught' && (game.stage === 'dying' || game.stage === 'failed')) {
      const k = clamp01(game.stage === 'failed' ? 1 : game.stageT / 0.45);
      pose.reach = 0.85 + 0.85 * k; // arms rise over you, then come down on your shoulders
      pose.lean = 0.2 + 0.35 * k;
      pose.stride = 0;
    }
    pose.coat = P.ink;
    pose.legs = P.ink;
    ch.add(pose);
    ch.end();
    this.shadows.add(cx, pose.y, -cz, 0.5);
  }

  get drawCalls() {
    return this.renderer.info.render.calls;
  }
  get triangles() {
    return this.renderer.info.render.triangles;
  }
}

export type { RGB };
