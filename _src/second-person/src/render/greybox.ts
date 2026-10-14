// Greybox renderer: flat boxes and capsules, used to prove the sim port before any art.
// Kept behind ?greybox for comparison once the real renderer exists.

import * as THREE from 'three';
import { FAR_X0, FAR_X1, KERB_H, ROAD_X0, ROAD_X1, WALK_X0, WALK_X1 } from '../sim/constants';
import type { View } from '../sim/projection';
import { blocksInRange, type Block } from '../sim/props';
import type { Game } from '../game';

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const MAX_PEDS = 900;
const MAX_CARS = 48;
const MAX_BLDG = 64;
const MAX_POSTS = 64;

export class GreyboxRenderer {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera();
  private peds: THREE.InstancedMesh;
  private cars: THREE.InstancedMesh;
  private bldg: THREE.InstancedMesh;
  private posts: THREE.InstancedMesh;
  private player: THREE.Mesh;
  private chaser: THREE.Mesh;
  private ground = new THREE.Group();
  private ring: THREE.Mesh;
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private s = new THREE.Vector3();
  private p = new THREE.Vector3();
  private c = new THREE.Color();
  private blocks: Block[] = [];
  private view!: View;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.scene.background = new THREE.Color('#46525c');
    this.scene.fog = new THREE.Fog('#4f5c66', 12, 70);
    this.scene.add(new THREE.HemisphereLight('#9fb0bc', '#2a2f36', 1.6));
    const sun = new THREE.DirectionalLight('#ffffff', 0.8);
    sun.position.set(-3, 8, 4);
    this.scene.add(sun);

    const strip = (x0: number, x1: number, y: number, col: string) => {
      const g = new THREE.PlaneGeometry(x1 - x0, 400);
      g.rotateX(-Math.PI / 2);
      g.translate((x0 + x1) / 2, y, 0);
      this.ground.add(new THREE.Mesh(g, new THREE.MeshLambertMaterial({ color: col })));
    };
    strip(WALK_X0, WALK_X1, KERB_H, '#5c626a');
    strip(ROAD_X0 - 0.15, ROAD_X1 + 0.15, 0, '#23272c');
    strip(FAR_X0, FAR_X1, KERB_H, '#535962');
    strip(4.9, 5.1, 0.01, '#c9c2a6');
    this.scene.add(this.ground);

    const lam = (col: string) => new THREE.MeshLambertMaterial({ color: col });
    const capsule = new THREE.CapsuleGeometry(0.28, 1.1, 4, 8);
    capsule.translate(0, 0.83 + KERB_H, 0);
    this.peds = new THREE.InstancedMesh(capsule, lam('#ffffff'), MAX_PEDS);
    this.peds.frustumCulled = false;
    this.player = new THREE.Mesh(capsule, lam('#e9dfc7'));
    this.chaser = new THREE.Mesh(capsule, lam('#151a20'));
    this.chaser.scale.set(1, 1.12, 1);
    const box = new THREE.BoxGeometry(1, 1, 1);
    box.translate(0, 0.5, 0);
    this.cars = new THREE.InstancedMesh(box, lam('#ffffff'), MAX_CARS);
    this.bldg = new THREE.InstancedMesh(box, lam('#ffffff'), MAX_BLDG);
    this.posts = new THREE.InstancedMesh(box, lam('#31383e'), MAX_POSTS);
    for (const im of [this.cars, this.bldg, this.posts]) im.frustumCulled = false;
    const rg = new THREE.RingGeometry(0.22, 0.3, 32);
    rg.rotateX(-Math.PI / 2);
    this.ring = new THREE.Mesh(rg, new THREE.MeshBasicMaterial({ color: '#f2c53c' }));
    this.scene.add(this.peds, this.player, this.chaser, this.cars, this.bldg, this.posts, this.ring);
  }

  resize(view: View, dpr: number) {
    this.view = view;
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(view.W, view.H, false);
  }

  private setCamera(game: Game) {
    const w = game.world;
    const a = game.alpha;
    const v = this.view;
    const n = 0.1;
    const f = 200;
    this.camera.projectionMatrix.makePerspective(
      (-v.CX / v.F) * n,
      ((v.W - v.CX) / v.F) * n,
      (v.CY / v.F) * n,
      (-(v.H - v.CY) / v.F) * n,
      n,
      f,
    );
    this.camera.projectionMatrixInverse.copy(this.camera.projectionMatrix).invert();
    this.camera.position.set(lerp(w.cam.px, w.cam.x, a), w.cam.y, -lerp(w.cam.pz, w.cam.z, a));
    this.camera.rotation.set(-w.cam.pitch, 0, 0);
    this.camera.updateMatrixWorld();
  }

  private place(im: THREE.InstancedMesh, i: number, x: number, y: number, z: number, sx: number, sy: number, sz: number) {
    this.p.set(x, y, -z);
    this.s.set(sx, sy, sz);
    this.q.identity();
    this.m.compose(this.p, this.q, this.s);
    im.setMatrixAt(i, this.m);
  }

  render(game: Game) {
    const w = game.world;
    const a = game.alpha;
    this.setCamera(game);
    const camZ = lerp(w.cam.pz, w.cam.z, a);
    this.ground.position.z = -camZ - 150;

    let i = 0;
    for (const q of w.peds) {
      if (i >= MAX_PEDS) break;
      const z = lerp(q.pz, q.z, a);
      if (z < camZ - 2 || z > camZ + 90) continue;
      this.place(this.peds, i, lerp(q.px, q.x, a), q.far ? 0 : 0, z, q.scale, q.scale * (q.stagger > 0 ? 0.85 : 1), q.scale);
      this.c.setHSL((q.look % 8) / 8, 0.12, 0.45);
      this.peds.setColorAt(i, this.c);
      i++;
    }
    this.peds.count = i;
    this.peds.instanceMatrix.needsUpdate = true;
    if (this.peds.instanceColor) this.peds.instanceColor.needsUpdate = true;

    const p = w.player;
    this.player.position.set(lerp(p.px, p.x, a), 0, -lerp(p.pz, p.z, a));
    this.player.visible = true;
    const c = w.chaser;
    this.chaser.position.set(lerp(c.px, c.x, a), 0, -lerp(c.pz, c.z, a));

    i = 0;
    for (const car of w.cars) {
      if (i >= MAX_CARS) break;
      this.place(this.cars, i, lerp(car.px, car.x, a), 0.06, lerp(car.pz, car.z, a), car.w, car.h, car.d);
      this.c.setHSL(car.colour / 7, 0.3, 0.3);
      this.cars.setColorAt(i, this.c);
      i++;
    }
    this.cars.count = i;
    this.cars.instanceMatrix.needsUpdate = true;
    if (this.cars.instanceColor) this.cars.instanceColor.needsUpdate = true;

    this.blocks = blocksInRange(camZ - 4, camZ + 90, this.blocks);
    let bi = 0;
    let pi = 0;
    for (const b of this.blocks) {
      for (const bd of b.buildings) {
        if (bi >= MAX_BLDG) break;
        this.place(this.bldg, bi, (bd.x0 + bd.x1) / 2, 0, (bd.z0 + bd.z1) / 2, bd.x1 - bd.x0, bd.h, bd.z1 - bd.z0);
        this.c.set(['#2c343b', '#333a3f', '#2a3138', '#38393a', '#303a3e'][bd.colour]);
        this.bldg.setColorAt(bi, this.c);
        bi++;
      }
      for (const o of b.posts) {
        if (pi >= MAX_POSTS) break;
        if (o.kind === 'lamp') this.place(this.posts, pi, o.x, KERB_H, o.z, 0.12, 4.4, 0.12);
        else this.place(this.posts, pi, o.x, KERB_H, o.z, 0.7, 1.0, 0.7);
        pi++;
      }
    }
    this.bldg.count = bi;
    this.posts.count = pi;
    this.bldg.instanceMatrix.needsUpdate = true;
    this.posts.instanceMatrix.needsUpdate = true;
    if (this.bldg.instanceColor) this.bldg.instanceColor.needsUpdate = true;

    this.ring.visible = w.aimShown && game.stage === 'play';
    this.ring.position.set(w.aimX, 0.16, -w.aimZ);
    (this.ring.material as THREE.MeshBasicMaterial).color.set(w.aimOnRoad ? '#e0552f' : '#f2c53c');

    this.renderer.render(this.scene, this.camera);
  }
}
