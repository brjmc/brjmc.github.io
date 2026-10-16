// three.js renderer. Reads the sim (never writes it), interpolating between sim steps.

import * as THREE from 'three';
import type { Game } from '../game';
import type { SimEvent, World } from '../sim/world';
import { EyeCam } from './view';
import { makeLights, type Lights } from './env';
import { buildRoom, type Room } from './room';
import { buildPlate, type PlateView } from './plate';
import { buildDecor } from './decor';
import { SushiView } from './sushi';
import { ChopsticksView } from './chopsticks';
import { MarksView } from './marks';
import { WasabiView } from './wasabi';
import { Post, type PostTier } from './post';
import { GLASSES } from './lens';
import { Fx } from './fx';
import { Sequences } from './sequences';
import { sdRRect } from '../sim/shape';

export interface Tier {
  name: 'low' | 'mid' | 'high';
  dpr: number;
  post: PostTier;
  shadow: number;
}

export const TIERS: Tier[] = [
  { name: 'low', dpr: 1, post: { dof: 0, bloom: false, fxaa: true, msaa: 0 }, shadow: 512 },
  { name: 'mid', dpr: 1.5, post: { dof: 24, bloom: true, fxaa: false, msaa: 4 }, shadow: 1024 },
  { name: 'high', dpr: 2, post: { dof: 40, bloom: true, fxaa: false, msaa: 4 }, shadow: 1024 },
];

export class Renderer {
  readonly gl: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly eye = new EyeCam();
  tier: Tier = TIERS[1];
  drawCalls = 0;
  triangles = 0;
  private world: World | null = null;
  private course = new THREE.Group();
  private lights: Lights;
  private room: Room | null = null;
  private plate: PlateView | null = null;
  readonly sushi = new SushiView();
  private sticks: ChopsticksView[] = [];
  readonly marks = new MarksView();
  readonly wasabi = new WasabiView();
  readonly post: Post;
  readonly fx = new Fx();
  private seq = new Sequences();
  private lastStage = '';
  private t = 0;
  private w = 1;
  private h = 1;
  private flash = new THREE.Vector4();
  private fwd = new THREE.Vector3();
  private tmp = new THREE.Vector3();

  constructor(readonly canvas: HTMLCanvasElement) {
    this.gl = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
    this.gl.shadowMap.enabled = true;
    this.gl.shadowMap.type = THREE.PCFShadowMap;
    this.gl.toneMapping = THREE.NoToneMapping;
    this.post = new Post(this.gl);
    this.scene.background = new THREE.Color('#120b0d');
    this.lights = makeLights(this.gl, this.scene, 1024);
    this.scene.add(this.course, this.sushi.root, this.marks.group, this.wasabi.group, this.fx.group);
  }

  setTier(t: Tier) {
    this.tier = t;
    this.post.setTier(t.post);
    const sz = t.shadow;
    if (this.lights.key.shadow.mapSize.x !== sz) {
      this.lights.key.shadow.mapSize.set(sz, sz);
      this.lights.key.shadow.map?.dispose();
      this.lights.key.shadow.map = null;
    }
    this.resize(this.w, this.h);
  }

  resize(w: number, h: number) {
    this.w = w;
    this.h = h;
    const dpr = Math.min(this.tier.dpr, window.devicePixelRatio || 1);
    this.gl.setPixelRatio(dpr);
    this.gl.setSize(w, h, false);
    this.post.setSize(Math.round(w * dpr), Math.round(h * dpr));
    if (this.world) this.eye.resize(w / h, this.world);
  }

  private buildCourse(w: World) {
    this.course.clear();
    for (const s of this.sticks) this.scene.remove(s.group);
    const cfg = w.course;
    this.room = buildRoom(cfg);
    this.plate = buildPlate(cfg, w, cfg.n * 101 + 5);
    const decor = buildDecor(cfg);
    this.course.add(this.room.group, this.plate.group, decor.group);
    this.fx.reset(decor.steam);
    const plate = w.plate;
    const top = w.plateTop;
    this.fx.floor = (x, z) => (sdRRect(plate, x, z) < -0.3 ? top : 0);
    this.sticks = [new ChopsticksView(cfg.diner.sticks)];
    if (cfg.companion) this.sticks.push(new ChopsticksView(cfg.companion.sticks));
    for (const s of this.sticks) this.scene.add(s.group);
    this.sushi.restore();
    this.post.lens.clear();
    this.eye.resize(this.w / this.h, w);
  }

  /** Rebuild course-dependent parts when the game has loaded a new world. */
  sync(game: Game) {
    if (game.world !== this.world) {
      this.world = game.world;
      this.buildCourse(game.world);
    }
  }

  onEvents(ev: SimEvent[], game: Game) {
    this.sync(game);
    for (const e of ev) {
      switch (e.t) {
        case 'hit':
          this.eye.shake = Math.max(this.eye.shake, 1.4);
          this.post.lens.addSplat(e.u, e.v, e.n);
          this.flash.set(0.55, 0.85, 0.25, 0.35);
          break;
        case 'hurt': {
          this.eye.shake = Math.max(this.eye.shake, 0.8);
          this.sushi.onHurt();
          this.sushi.root.updateMatrixWorld(true);
          this.sushi.loseGrains(12, Math.floor(e.x * 100 + e.z * 7 + this.t * 10));
          this.fx.grainsFrom(this.sushi.shed.splice(0), new THREE.Vector3(Math.sign(e.x) || 1, 0, 0));
          break;
        }
        case 'stab':
          this.eye.shake = Math.max(this.eye.shake, 0.35);
          this.marks.impact(e.x, e.z, e.hit);
          this.fx.dust(new THREE.Vector3(e.x, game.world.plateTop, -e.z), e.hit);
          break;
        case 'throw':
          this.sushi.onThrow();
          break;
        case 'pickup':
          this.fx.motes(new THREE.Vector3(game.world.px, game.world.plateTop + 1.5, -game.world.pz));
          break;
        case 'clip':
          this.fx.splat(new THREE.Vector3(e.x, e.y, -e.z), 9, 40, 15);
          this.eye.shake = Math.max(this.eye.shake, 0.4);
          break;
        case 'land':
          this.fx.splat(new THREE.Vector3(e.x, game.world.plateTop + 0.2, -e.z), 3, 14, 8);
          break;
      }
    }
  }

  /** The sushi's bounding box on screen (CSS px), for the HUD's brackets. */
  sushiRect(w: World): { x0: number; y0: number; x1: number; y1: number } {
    const cam = this.eye.cam;
    const p = this.sushi.root.position;
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    for (const [dx, dy] of [[-3.3, 0], [3.3, 0], [-3.3, 3.1], [3.3, 3.1]]) {
      this.tmp.set(p.x + dx, p.y + dy, p.z + 1.2).project(cam);
      const sx = (this.tmp.x * 0.5 + 0.5) * this.w;
      const sy = (-this.tmp.y * 0.5 + 0.5) * this.h;
      x0 = Math.min(x0, sx);
      x1 = Math.max(x1, sx);
      y0 = Math.min(y0, sy);
      y1 = Math.max(y1, sy);
    }
    void w;
    return { x0, y0, x1, y1 };
  }

  /** The nearest thing coming down, for the sushi's eyes. */
  private threat(w: World): { x: number; z: number } | null {
    let best: { x: number; z: number } | null = null;
    let bd = Infinity;
    for (const s of w.sticks) {
      if (s.phase === 'aim' || s.phase === 'stab' || s.phase === 'sweep') {
        const d = Math.hypot(s.tx - w.px, s.tz - w.pz);
        if (d < bd) {
          bd = d;
          best = { x: s.tx, z: s.tz };
        }
      }
    }
    return bd < 9 ? best : null;
  }

  render(game: Game, dt: number) {
    this.sync(game);
    const w = game.world;
    this.t += dt;
    const a = game.alpha;
    this.room?.update(this.t);
    this.plate?.update(w, this.t);
    // scripted endings override parts of the scene
    this.sticks[0]?.update(w.main, a);
    const seq = this.sticks[0] ? this.seq.update(game, w, this.sticks[0].tips, this.eye.cam) : null;
    if (seq?.shake) this.eye.shake = Math.max(this.eye.shake, seq.shake);
    if (game.stage === 'finale' && game.stageT < 0.05 && this.lastStage !== 'finale') {
      // he's crying now
      for (let i = 0; i < 6; i++) this.post.lens.addTear((Math.random() - 0.5) * 1.4, 0.7 + Math.random() * 0.3);
    }
    this.lastStage = game.stage;
    if (seq?.chomp) {
      this.fx.splat(seq.sushi.pos!.clone(), 12, 60, 10);
    }
    this.eye.update(w, a, this.t, dt, { lurch: w.lurch, recoil: w.lurch * w.lurch, drunk: game.course === 6 ? 1 : 0, look: seq?.look ?? null });
    this.sushi.update(w, a, this.t, dt, this.threat(w), seq?.sushi);
    this.sushi.root.visible = !(seq?.lid !== null && seq?.lid !== undefined && seq.lid > 0.98 && game.stage !== 'finale');
    if (seq?.sticks) this.sticks[0]?.update(null, a, seq.sticks);
    w.sticks.forEach((s, i) => {
      if (i > 0) this.sticks[i]?.update(s, a);
    });
    this.fx.pxScale = this.post.height / (2 * Math.tan((this.eye.cam.fov * Math.PI) / 360)) / 300;
    this.fx.update(dt, this.t);
    this.marks.update(w, this.t, dt);
    this.wasabi.update(w, a, this.t);

    // focus on the sushi (view-space depth)
    const cam = this.eye.cam;
    cam.updateMatrixWorld();
    cam.getWorldDirection(this.fwd);
    if (seq?.focus) this.tmp.copy(seq.focus).sub(cam.position);
    else this.tmp.set(w.px, w.plateTop + 1.3, -w.pz).sub(cam.position);
    const focus = Math.max(4, this.tmp.dot(this.fwd));
    this.post.lens.update(dt);
    this.flash.w = Math.max(0, this.flash.w - dt * 2.5);
    const k = w.blink <= 1 ? w.blink : 2 - w.blink;
    const cfg = w.course;
    this.gl.info.reset();
    this.gl.info.autoReset = false;
    this.post.render(this.scene, cam, {
      near: cam.near,
      far: cam.far,
      focus,
      aspect: this.w / this.h,
      glasses: GLASSES[cfg.diner.glasses],
      tint: cfg.diner.tint ? new THREE.Color(cfg.diner.tint) : null,
      lid: seq?.lid ?? k,
      lidRed: seq?.lidRed ?? 0.25, // a quick blink is dark; only a long squeeze glows red
      sting: Math.min(1, w.sting / 2.6),
      flash: this.flash,
      desat: 0,
      exposure: 1,
      time: this.t,
      drunk: game.course === 6 ? 0.6 + w.hits * 0.1 : 0,
      shake: this.eye.shake,
    });
    this.gl.info.autoReset = true;
    this.drawCalls = this.gl.info.render.calls;
    this.triangles = this.gl.info.render.triangles;
  }
}
