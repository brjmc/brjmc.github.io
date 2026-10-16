// Particles: rice grains knocked off the sushi (they bounce and stay on the plate), bits of
// wasabi (from clips, landings, the eaten crunch), and soft sprites (pickup motes, stab dust,
// steam from the teacup). CPU-simulated, one instanced draw per kind.

import * as THREE from 'three';
import { HEX } from './palette';
import { pasteMaterial, wasabiGeometry } from './food';

const G = 600; // cm/s², a little light: the bits read better in the air

interface Body {
  p: THREE.Vector3;
  v: THREE.Vector3;
  r: THREE.Euler;
  w: THREE.Vector3;
  life: number;
  size: number;
  rest: boolean;
}

class Bodies {
  readonly mesh: THREE.InstancedMesh;
  private items: Body[] = [];
  private m4 = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private s = new THREE.Vector3();

  constructor(
    geo: THREE.BufferGeometry,
    mat: THREE.Material,
    private cap: number,
    private scale: THREE.Vector3,
    private fadeLife: number, // < 0: keep forever once at rest
  ) {
    this.mesh = new THREE.InstancedMesh(geo, mat, cap);
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
  }

  add(p: THREE.Vector3, v: THREE.Vector3, size = 1) {
    if (this.items.length >= this.cap) this.items.shift();
    this.items.push({
      p: p.clone(),
      v: v.clone(),
      r: new THREE.Euler(Math.random() * 6, Math.random() * 6, Math.random() * 6),
      w: new THREE.Vector3((Math.random() - 0.5) * 20, (Math.random() - 0.5) * 20, (Math.random() - 0.5) * 20),
      life: 0,
      size,
      rest: false,
    });
  }

  clear() {
    this.items = [];
    this.mesh.count = 0;
  }

  update(dt: number, floor: (x: number, z: number) => number) {
    let n = 0;
    for (const b of this.items) {
      b.life += dt;
      if (!b.rest) {
        b.v.y -= G * dt;
        b.p.addScaledVector(b.v, dt);
        b.r.x += b.w.x * dt;
        b.r.y += b.w.y * dt;
        b.r.z += b.w.z * dt;
        const f = floor(b.p.x, -b.p.z);
        if (b.p.y < f) {
          b.p.y = f;
          if (Math.abs(b.v.y) < 25) {
            b.rest = true;
            b.r.x = Math.PI / 2;
            b.r.z = 0;
          } else {
            b.v.y *= -0.32;
            b.v.x *= 0.6;
            b.v.z *= 0.6;
            b.w.multiplyScalar(0.5);
          }
        }
      }
      let k = 1;
      if (this.fadeLife > 0) k = Math.max(0, 1 - Math.max(0, b.life - this.fadeLife) / 0.4);
      if (k <= 0) continue;
      this.q.setFromEuler(b.r);
      this.s.copy(this.scale).multiplyScalar(b.size * k);
      this.m4.compose(b.p, this.q, this.s);
      this.mesh.setMatrixAt(n++, this.m4);
    }
    if (this.fadeLife > 0) this.items = this.items.filter((b) => b.life < this.fadeLife + 0.4);
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

// --- soft sprites ---------------------------------------------------------------------------

const SPRITE_VERT = /* glsl */ `
attribute float aSize;
attribute vec4 aColor;
varying vec4 vColor;
void main() {
  vColor = aColor;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = aSize * (300.0 / -mv.z) * uScale;
  gl_Position = projectionMatrix * mv;
}
`;
const SPRITE_FRAG = /* glsl */ `
varying vec4 vColor;
void main() {
  vec2 d = gl_PointCoord - 0.5;
  float a = smoothstep(0.5, 0.0, length(d));
  gl_FragColor = vec4(vColor.rgb, vColor.a * a * a);
}
`;

interface Sprite {
  p: THREE.Vector3;
  v: THREE.Vector3;
  life: number;
  max: number;
  size: number;
  grow: number;
  color: THREE.Color;
  alpha: number;
  drag: number;
  rise: number;
}

class Sprites {
  readonly points: THREE.Points;
  private items: Sprite[] = [];
  private pos: Float32Array;
  private size: Float32Array;
  private col: Float32Array;
  readonly mat: THREE.ShaderMaterial;

  constructor(
    private cap: number,
    blending: THREE.Blending,
  ) {
    const g = new THREE.BufferGeometry();
    this.pos = new Float32Array(cap * 3);
    this.size = new Float32Array(cap);
    this.col = new Float32Array(cap * 4);
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aColor', new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage));
    this.mat = new THREE.ShaderMaterial({
      vertexShader: SPRITE_VERT.replace('uScale', '1.0'),
      fragmentShader: SPRITE_FRAG,
      transparent: true,
      depthWrite: false,
      blending,
    });
    this.points = new THREE.Points(g, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 3;
  }

  add(s: Omit<Sprite, 'life'>) {
    if (this.items.length >= this.cap) this.items.shift();
    this.items.push({ ...s, life: 0 });
  }

  clear() {
    this.items = [];
  }

  update(dt: number, t: number, pxScale: number) {
    let n = 0;
    for (const s of this.items) {
      s.life += dt;
      if (s.life >= s.max) continue;
      s.v.multiplyScalar(Math.exp(-s.drag * dt));
      s.v.y += s.rise * dt;
      s.p.addScaledVector(s.v, dt);
      const k = s.life / s.max;
      const a = s.alpha * Math.sin(Math.PI * Math.min(1, k * 1.4 + 0.0)) * (1 - k);
      this.pos[n * 3] = s.p.x + Math.sin(t * 1.3 + s.p.y * 0.4) * 0.15 * s.grow;
      this.pos[n * 3 + 1] = s.p.y;
      this.pos[n * 3 + 2] = s.p.z;
      this.size[n] = s.size * (1 + s.grow * k) * pxScale;
      this.col[n * 4] = s.color.r;
      this.col[n * 4 + 1] = s.color.g;
      this.col[n * 4 + 2] = s.color.b;
      this.col[n * 4 + 3] = Math.max(0, a);
      n++;
    }
    this.items = this.items.filter((s) => s.life < s.max);
    const g = this.points.geometry;
    g.setDrawRange(0, n);
    (g.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    (g.getAttribute('aSize') as THREE.BufferAttribute).needsUpdate = true;
    (g.getAttribute('aColor') as THREE.BufferAttribute).needsUpdate = true;
  }
}

export class Fx {
  readonly group = new THREE.Group();
  private grains: Bodies;
  private bits: Bodies;
  private glow: Sprites; // additive
  private soft: Sprites; // normal blending (steam, dust)
  private steamAt: THREE.Vector3[] = [];
  private steamT = 0;
  floor: (x: number, z: number) => number = () => 0;
  pxScale = 1;

  constructor() {
    this.grains = new Bodies(
      new THREE.SphereGeometry(1, 7, 5),
      new THREE.MeshPhysicalMaterial({ color: HEX.rice, roughness: 0.5, sheen: 0.6, sheenColor: new THREE.Color('#ffffff') }),
      260,
      new THREE.Vector3(0.3, 0.14, 0.15),
      -1,
    );
    this.bits = new Bodies(wasabiGeometry(21, 0.6, 2), pasteMaterial(), 80, new THREE.Vector3(0.28, 0.28, 0.28), 1.6);
    this.glow = new Sprites(160, THREE.AdditiveBlending);
    this.soft = new Sprites(140, THREE.NormalBlending);
    this.group.add(this.grains.mesh, this.bits.mesh, this.glow.points, this.soft.points);
  }

  reset(steam: THREE.Vector3[]) {
    this.grains.clear();
    this.bits.clear();
    this.glow.clear();
    this.soft.clear();
    this.steamAt = steam;
  }

  /** Rice knocked off on a hit: thrown up and away from the strike. */
  grainsFrom(points: THREE.Vector3[], away: THREE.Vector3) {
    for (const p of points) {
      const v = new THREE.Vector3((Math.random() - 0.5) * 40 + away.x * 30, 30 + Math.random() * 45, (Math.random() - 0.5) * 40 + away.z * 30);
      this.grains.add(p, v, 0.9 + Math.random() * 0.3);
    }
  }

  /** A puff of bits: wasabi splatting off a stick, landing, or the final crunch. */
  splat(p: THREE.Vector3, n: number, speed = 30, up = 20) {
    for (let i = 0; i < n; i++) {
      const v = new THREE.Vector3((Math.random() - 0.5) * speed, up + Math.random() * up, (Math.random() - 0.5) * speed);
      this.bits.add(p, v, 0.5 + Math.random() * 0.8);
    }
  }

  /** Green motes rising: a pickup. */
  motes(p: THREE.Vector3, n = 14) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      this.glow.add({
        p: p.clone().add(new THREE.Vector3(Math.cos(a) * 1.2, Math.random() * 1.5, Math.sin(a) * 1.2)),
        v: new THREE.Vector3(Math.cos(a) * 3, 6 + Math.random() * 8, Math.sin(a) * 3),
        max: 0.7 + Math.random() * 0.4,
        size: 0.25 + Math.random() * 0.25,
        grow: 0.3,
        color: new THREE.Color(HEX.wasabiHi).multiplyScalar(2.2),
        alpha: 0.9,
        drag: 2,
        rise: 4,
      });
    }
  }

  /** Dust and a scatter of crumbs where the tips hit the plate. */
  dust(p: THREE.Vector3, hit: boolean) {
    for (let i = 0; i < (hit ? 10 : 6); i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 8 + Math.random() * 10;
      this.soft.add({
        p: p.clone().add(new THREE.Vector3(0, 0.3, 0)),
        v: new THREE.Vector3(Math.cos(a) * sp, 2 + Math.random() * 4, Math.sin(a) * sp),
        max: 0.45 + Math.random() * 0.3,
        size: 0.5 + Math.random() * 0.5,
        grow: 1.5,
        color: new THREE.Color(hit ? '#f6e9d0' : '#eadfca'),
        alpha: 0.35,
        drag: 6,
        rise: 1,
      });
    }
  }

  update(dt: number, t: number) {
    // steam from the teacup: slow, wavering, nearly invisible until a lantern sits behind it
    this.steamT += dt;
    for (const s of this.steamAt) {
      while (this.steamT > 0.14) {
        this.steamT -= 0.14;
        this.soft.add({
          p: s.clone().add(new THREE.Vector3((Math.random() - 0.5) * 2, 0, (Math.random() - 0.5) * 2)),
          v: new THREE.Vector3((Math.random() - 0.5) * 0.6, 2.5 + Math.random() * 1.5, (Math.random() - 0.5) * 0.6),
          max: 3.2 + Math.random() * 1.5,
          size: 1.6 + Math.random() * 1.2,
          grow: 2.2,
          color: new THREE.Color('#fff4e6'),
          alpha: 0.07,
          drag: 0.4,
          rise: 0.6,
        });
      }
    }
    this.grains.update(dt, this.floor);
    this.bits.update(dt, this.floor);
    this.glow.update(dt, t, this.pxScale);
    this.soft.update(dt, t, this.pxScale);
  }
}
