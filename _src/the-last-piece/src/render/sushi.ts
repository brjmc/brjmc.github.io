// The hero: a pillow of rice made of a few hundred instanced grains over a soft core, a draped
// slice of salmon with procedural fat lines and a fake-subsurface glow, and a face made of real
// geometry (glossy eyes catch the room's lights). Squash, lean, walk, panic, throw and hurt are
// all procedural.

import * as THREE from 'three';
import type { World } from '../sim/world';
import { HEX } from './palette';
import { inject, prng } from './util';
import { pasteMaterial, wasabiGeometry } from './food';

// rice body half-extents (cm) and superellipse exponent
const A = 2.4;
const B = 0.95;
const Cz = 1.18;
const N = 2.7;
const RICE_Y = 1.0; // centre height of the core
const FISH_Y = RICE_Y + B - 0.06;

function superPoint(dx: number, dy: number, dz: number) {
  const t = Math.pow(Math.pow(Math.abs(dx / A), N) + Math.pow(Math.abs(dy / B), N) + Math.pow(Math.abs(dz / Cz), N), -1 / N);
  return [dx * t, dy * t, dz * t];
}

function superNormal(x: number, y: number, z: number, out: THREE.Vector3) {
  const g = (v: number, a: number) => (N / a) * Math.pow(Math.abs(v / a), N - 1) * Math.sign(v);
  return out.set(g(x, A), g(y, B), g(z, Cz)).normalize();
}

function coreGeometry() {
  const g = new THREE.SphereGeometry(1, 48, 32);
  const p = g.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const [x, y, z] = superPoint(p.getX(i), p.getY(i), p.getZ(i));
    // the base sits flat on the plate
    p.setXYZ(i, x, Math.max(y, -B * 0.88), z);
  }
  g.computeVertexNormals();
  return g;
}

/** Grain placements on the visible surface of the rice: Poisson-ish, tangent to the surface. */
function grainMatrices(seed: number, count: number) {
  const rnd = prng(seed);
  const pts: THREE.Vector3[] = [];
  const mats: THREE.Matrix4[] = [];
  const n = new THREE.Vector3();
  const t = new THREE.Vector3();
  const b = new THREE.Vector3();
  const r = new THREE.Vector3();
  const basis = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  for (let tries = 0; tries < 20000 && pts.length < count; tries++) {
    // random direction
    const u = rnd() * 2 - 1;
    const a = rnd() * Math.PI * 2;
    const s = Math.sqrt(1 - u * u);
    const [x, y, z] = superPoint(s * Math.cos(a), u, s * Math.sin(a));
    if (y < -B * 0.8) continue; // underneath
    if (y > B * 0.62 && Math.abs(z) < Cz * 0.9 && Math.abs(x) < A * 0.92) continue; // under the fish
    // keep the face readable: fewer, flatter grains where the eyes and mouth sit
    const face = z > Cz * 0.7 && Math.abs(x) < 1.45 && y > -0.6 && y < 0.55;
    if (face && rnd() < 0.55) continue;
    const p = new THREE.Vector3(x, y, z);
    if (pts.some((o) => o.distanceToSquared(p) < 0.36 * 0.36)) continue;
    pts.push(p);
    superNormal(x, y, z, n);
    r.set(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5).normalize();
    t.crossVectors(n, r).normalize();
    // grains on the sides lie mostly horizontal, as pressed rice does
    if (Math.abs(n.y) < 0.7) t.lerp(new THREE.Vector3(-n.z, 0, n.x).normalize(), 0.55).normalize();
    b.crossVectors(t, n).normalize();
    basis.makeBasis(t, n, b);
    q.setFromRotationMatrix(basis);
    const len = 0.3 + rnd() * 0.06;
    const thick = face ? 0.11 : 0.14 + rnd() * 0.03;
    const pos = p.clone().addScaledVector(n, thick * 0.35);
    pos.y += RICE_Y;
    mats.push(new THREE.Matrix4().compose(pos, q, new THREE.Vector3(len, thick, 0.15 + rnd() * 0.03)));
  }
  return mats;
}

function salmonGeometry() {
  const L = 6.5;
  const W = 2.9;
  const T = 0.6;
  const g = new THREE.BoxGeometry(L, T, W, 48, 3, 14);
  const p = g.getAttribute('position') as THREE.BufferAttribute;
  const uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i);
    let y = p.getY(i);
    let z = p.getZ(i);
    const u = x / (L / 2);
    const v = z / (W / 2);
    uv[i * 2] = x;
    uv[i * 2 + 1] = z;
    // rounded edges: thinner toward the long edges and the tips
    const thin = (1 - 0.45 * Math.pow(Math.abs(v), 4)) * (1 - 0.35 * Math.pow(Math.abs(u), 6));
    y = y * thin + (y > 0 ? 0 : 0.05 * Math.pow(Math.abs(v), 2));
    // the slice is cut on the bias: the ends are oblique
    x += z * 0.22;
    // plan shape: a little narrower at the tips
    z *= 1 - 0.12 * Math.pow(Math.abs(u), 3);
    // drape over the ends of the rice
    const over = Math.max(0, Math.abs(u) - 0.5);
    y -= over * over * 4.2 + Math.pow(Math.abs(v), 2) * 0.08;
    // a slight twist
    y += u * v * 0.06;
    p.setXYZ(i, x, y, z);
  }
  g.setAttribute('aSal', new THREE.BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return g;
}

/** Overrides for the scripted moments (eaten, finale). */
export interface SushiOverride {
  pos?: THREE.Vector3; // render space
  rotZ?: number;
  rotX?: number;
  scale?: number;
  expr?: 'happy' | 'scared';
  kick?: boolean;
  hop?: number;
}

export class SushiView {
  readonly root = new THREE.Group();
  /** Everything that squashes and leans (feet stay planted). */
  private body = new THREE.Group();
  private grains: THREE.InstancedMesh;
  private grainBase: THREE.Matrix4[];
  private lost = new Set<number>();
  private fishMat: THREE.MeshPhysicalMaterial;
  private fishU = {
    uFat: { value: new THREE.Color(HEX.salmonFat) },
    uDeep: { value: new THREE.Color(HEX.salmonDeep) },
    uFresh: { value: 1 },
  };
  private eyes: { g: THREE.Group; sclera: THREE.Mesh; pupil: THREE.Mesh; brow: THREE.Mesh }[] = [];
  private mouthSmile: THREE.Mesh;
  private mouthO: THREE.Mesh;
  private sweat: THREE.Mesh;
  private feet: THREE.Mesh[] = [];
  private arms: THREE.Group[] = [];
  private held: THREE.Mesh;
  private contact: THREE.Mesh;
  private squash = 0;
  private hurtFlash = 0;
  private yaw = 0;
  private lean = new THREE.Vector2();
  private look = new THREE.Vector2();
  private blinkT = 2;
  /** Exposed for FX: world-space positions of grains that just came off. */
  shed: THREE.Vector3[] = [];

  constructor() {
    const riceMat = new THREE.MeshPhysicalMaterial({ color: HEX.rice, roughness: 0.5, sheen: 0.7, sheenRoughness: 0.4, sheenColor: new THREE.Color('#fffaf0') });
    const core = new THREE.Mesh(coreGeometry(), new THREE.MeshPhysicalMaterial({ color: '#e6dcc8', roughness: 0.65 }));
    core.position.y = RICE_Y;
    core.scale.setScalar(0.97);
    core.castShadow = core.receiveShadow = true;

    this.grainBase = grainMatrices(77, 300);
    const grainGeo = new THREE.SphereGeometry(1, 9, 6);
    this.grains = new THREE.InstancedMesh(grainGeo, riceMat, this.grainBase.length);
    const rnd = prng(5);
    const col = new THREE.Color();
    this.grainBase.forEach((m, i) => {
      this.grains.setMatrixAt(i, m);
      const k = 0.94 + rnd() * 0.08;
      col.set(HEX.rice).multiplyScalar(k);
      col.b *= 0.97 + rnd() * 0.04;
      this.grains.setColorAt(i, col);
    });
    this.grains.castShadow = this.grains.receiveShadow = true;

    this.fishMat = inject(
      new THREE.MeshPhysicalMaterial({ color: HEX.salmon, roughness: 0.4, clearcoat: 0.75, clearcoatRoughness: 0.1, sheen: 0.3, sheenColor: new THREE.Color('#ffd0b0') }),
      {
        uniforms: this.fishU,
        vertexDecl: 'attribute vec2 aSal; varying vec2 vSal;',
        vertex: 'vSal = aSal;',
        fragmentDecl: /* glsl */ `
          uniform vec3 uFat; uniform vec3 uDeep; uniform float uFresh; varying vec2 vSal;
          float lpFatLine = 0.0;
        `,
        albedo: /* glsl */ `
          {
            // fat lines run across the slice on a diagonal, gently waving
            vec2 q = vSal;
            float s = q.x * 0.82 + q.y * 0.57;
            s += 0.22 * sin(q.y * 2.3 + q.x * 0.6) + (lpNoise(q * 1.6) - 0.5) * 0.35;
            float f = fract(s * 1.45);
            float line = smoothstep(0.0, 0.05, f) * (1.0 - smoothstep(0.1, 0.2, f));
            float seg = lpHash(vec2(floor(s * 1.45), 2.0));
            vec3 c = mix(diffuseColor.rgb, uDeep, 0.12 + seg * 0.22);
            c = mix(c, uFat, line * 0.85);
            // the belly side (toward the diner) is paler
            c = mix(c, uFat, smoothstep(0.6, 1.4, q.y) * 0.25);
            // losing freshness: duller, a little grey
            float g = dot(c, vec3(0.3, 0.55, 0.15));
            c = mix(vec3(g) * vec3(1.0, 0.9, 0.85), c, 0.55 + 0.45 * uFresh);
            diffuseColor.rgb = c;
            lpFatLine = line;
          }
        `,
        roughness: 'roughnessFactor = mix(roughnessFactor, 0.25, lpFatLine);',
        emissive: /* glsl */ `
          // light scattering through the flesh: a warm glow at grazing angles and on thin edges
          {
            float edge = pow(1.0 - clamp(abs(dot(normalize(normal), normalize(vViewPosition))), 0.0, 1.0), 2.0);
            totalEmissiveRadiance += vec3(1.0, 0.38, 0.18) * (0.05 + edge * 0.22) * (0.5 + 0.5 * uFresh);
          }
        `,
      },
      'salmon',
    );
    const fish = new THREE.Mesh(salmonGeometry(), this.fishMat);
    fish.position.y = FISH_Y + 0.28;
    fish.rotation.y = 0.04;
    fish.castShadow = fish.receiveShadow = true;

    // --- face -----------------------------------------------------------------------------
    const white = new THREE.MeshPhysicalMaterial({ color: '#fbf8f2', roughness: 0.25, clearcoat: 1, clearcoatRoughness: 0.05 });
    const black = new THREE.MeshPhysicalMaterial({ color: '#140d09', roughness: 0.18, clearcoat: 1, clearcoatRoughness: 0.03 });
    const sphere = new THREE.SphereGeometry(1, 20, 14);
    for (const sx of [-1, 1]) {
      const g = new THREE.Group();
      g.position.set(sx * 0.82, RICE_Y + 0.14, Cz + 0.02);
      const sclera = new THREE.Mesh(sphere, white);
      sclera.scale.set(0.36, 0.44, 0.1);
      const pupil = new THREE.Mesh(sphere, black);
      pupil.scale.set(0.24, 0.32, 0.1);
      pupil.position.z = 0.04;
      const brow = new THREE.Mesh(sphere, riceMat);
      brow.scale.set(0.3, 0.09, 0.08);
      brow.position.set(0, 0.62, 0.02);
      g.add(sclera, pupil, brow);
      this.body.add(g);
      this.eyes.push({ g, sclera, pupil, brow });
    }
    const mouthMat = new THREE.MeshPhysicalMaterial({ color: '#3a120a', roughness: 0.35, clearcoat: 0.6 });
    this.mouthSmile = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.045, 8, 20, Math.PI), mouthMat);
    this.mouthSmile.rotation.z = Math.PI;
    this.mouthSmile.position.set(0, RICE_Y - 0.36, Cz + 0.05);
    this.mouthO = new THREE.Mesh(sphere, mouthMat);
    this.mouthO.scale.set(0.2, 0.25, 0.06);
    this.mouthO.position.set(0, RICE_Y - 0.4, Cz + 0.03);
    this.sweat = new THREE.Mesh(sphere, new THREE.MeshPhysicalMaterial({ color: '#dff0ff', roughness: 0.02, transparent: true, opacity: 0.7, clearcoat: 1 }));
    this.sweat.scale.set(0.14, 0.22, 0.1);
    this.sweat.position.set(1.62, RICE_Y + 0.62, Cz - 0.05);

    // --- limbs: rice-grain feet and arms ----------------------------------------------------
    const limbMat = new THREE.MeshPhysicalMaterial({ color: '#efe8da', roughness: 0.5, sheen: 0.6, sheenColor: new THREE.Color('#ffffff') });
    for (const sx of [-1, 1]) {
      const f = new THREE.Mesh(sphere, limbMat);
      f.scale.set(0.5, 0.26, 0.42);
      f.position.set(sx * 1.05, 0.2, 0.55);
      f.castShadow = true;
      this.feet.push(f);
      this.root.add(f);
      const arm = new THREE.Group();
      arm.position.set(sx * 2.25, RICE_Y + 0.05, 0.35);
      const a = new THREE.Mesh(sphere, limbMat);
      a.scale.set(0.5, 0.22, 0.24);
      a.position.x = sx * 0.4;
      a.castShadow = true;
      arm.add(a);
      this.arms.push(arm);
      this.body.add(arm);
    }
    this.held = new THREE.Mesh(wasabiGeometry(3, 1.1, 3), pasteMaterial());
    this.held.scale.setScalar(0.85);
    this.held.position.set(0.95, -0.1, 0.1);
    this.held.castShadow = true;
    this.arms[1].add(this.held);

    // soft contact shadow
    const cs = document.createElement('canvas');
    cs.width = cs.height = 64;
    const cg = cs.getContext('2d')!;
    const grad = cg.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, 'rgba(20,10,6,0.85)');
    grad.addColorStop(0.6, 'rgba(20,10,6,0.35)');
    grad.addColorStop(1, 'rgba(20,10,6,0)');
    cg.fillStyle = grad;
    cg.fillRect(0, 0, 64, 64);
    this.contact = new THREE.Mesh(
      new THREE.PlaneGeometry(6.4, 3.4),
      new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(cs), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 }),
    );
    this.contact.rotation.x = -Math.PI / 2;
    this.contact.position.y = 0.02;
    this.contact.renderOrder = 1;

    this.body.add(core, this.grains, fish, this.mouthSmile, this.mouthO, this.sweat);
    this.root.add(this.body, this.contact);
  }

  /** Knock n grains off (on a hit). Their world positions go to `shed` for the FX. */
  loseGrains(n: number, seed: number) {
    const rnd = prng(seed);
    const p = new THREE.Vector3();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();
    for (let k = 0; k < n * 6 && n > 0; k++) {
      const i = Math.floor(rnd() * this.grainBase.length);
      if (this.lost.has(i)) continue;
      this.grainBase[i].decompose(p, q, s);
      if (p.z < 0) continue; // only from the visible side
      this.lost.add(i);
      this.grains.setMatrixAt(i, new THREE.Matrix4().makeScale(0, 0, 0));
      this.shed.push(p.clone().applyMatrix4(this.body.matrixWorld));
      n--;
    }
    this.grains.instanceMatrix.needsUpdate = true;
  }

  restore() {
    this.lost.clear();
    this.grainBase.forEach((m, i) => this.grains.setMatrixAt(i, m));
    this.grains.instanceMatrix.needsUpdate = true;
  }

  onHurt() {
    this.squash = 1;
    this.hurtFlash = 1;
  }

  onThrow() {
    this.squash = -0.6; // stretch
  }

  /**
   * @param threat world-space (sim) point the eyes should look at, or null
   */
  update(w: World, a: number, t: number, dt: number, threat: { x: number; z: number } | null, ov: SushiOverride = {}) {
    const px = w.ppx + (w.px - w.ppx) * a;
    const pz = w.ppz + (w.pz - w.ppz) * a;
    const sink = w.hidden ? -0.55 : 0;
    this.root.position.set(px, w.plateTop + sink + (ov.hop ?? 0), -pz);
    if (ov.pos) this.root.position.copy(ov.pos);
    this.root.scale.setScalar(ov.scale ?? 1);
    const speed = Math.hypot(w.vx, w.vz);
    const moving = Math.min(1, speed / 6);

    // squash / stretch springs back
    this.squash += (0 - this.squash) * Math.min(1, dt * 9);
    const sq = this.squash;
    const breath = Math.sin(t * 2.4) * 0.02;
    const ph = w.stepPhase * Math.PI;
    const bob = Math.abs(Math.sin(ph)) * 0.16 * moving;
    const panic = ov.expr === 'scared' ? 1 : ov.expr === 'happy' ? 0 : w.panic;
    const trem = panic > 0 ? Math.sin(t * 61) * 0.035 * panic : 0;
    this.body.scale.set(1 + sq * 0.28 - breath * 0.5, 1 - sq * 0.26 + breath + bob * 0.3, 1 + sq * 0.18);
    this.body.position.set(trem, bob, 0);

    // lean into the movement, rock side to side when walking
    const lx = Math.max(-1, Math.min(1, w.vx / w.tune.maxSpeed));
    const lz = Math.max(-1, Math.min(1, w.vz / w.tune.maxSpeed));
    this.lean.x += (lx - this.lean.x) * Math.min(1, dt * 8);
    this.lean.y += (lz - this.lean.y) * Math.min(1, dt * 8);
    const rock = Math.sin(ph) * 0.07 * moving;
    this.body.rotation.set(this.lean.y * 0.16, 0, -this.lean.x * 0.14 + rock);
    // turn a little toward where you're going, but keep the face to him
    const wantYaw = Math.abs(w.vx) > 1 ? Math.sign(w.vx) * 0.3 * moving : 0;
    this.yaw += (wantYaw - this.yaw) * Math.min(1, dt * 6);
    this.root.rotation.set(ov.rotX ?? 0, this.yaw, ov.rotZ ?? 0);

    // feet step (or kick, dangling from the chopsticks)
    this.feet.forEach((f, i) => {
      if (ov.kick) {
        const k = Math.sin(t * 19 + i * Math.PI);
        f.position.y = 0.05 + k * 0.35;
        f.position.z = 0.55 + k * 0.2;
        return;
      }
      const s = Math.sin(ph + i * Math.PI);
      f.position.y = 0.2 + Math.max(0, s) * 0.32 * moving;
      f.position.z = 0.55 + s * 0.28 * moving;
    });

    // arms: swing when walking, up when panicking, overhead when throwing, one holds wasabi
    const throwK = w.throwAnim > 0 ? w.throwAnim / 0.28 : 0;
    this.arms.forEach((arm, i) => {
      const side = i === 0 ? -1 : 1;
      let rz = side * (0.35 + Math.sin(ph + i * Math.PI) * 0.35 * moving);
      let rx = 0;
      if (panic > 0.3) rz = side * (-0.9 + Math.sin(t * 30 + i) * 0.25);
      if (ov.expr === 'happy') rz = side * (-1.25 + Math.sin(t * 12 + i * 1.3) * 0.35);
      if (i === 1 && w.carry) rz = 0.15 + Math.sin(t * 3) * 0.08;
      if (i === 1 && throwK > 0) {
        // wind back then whip over the top toward him
        rz = -1.6 * Math.sin(throwK * Math.PI);
        rx = -1.2 * (1 - throwK);
      }
      arm.rotation.set(rx, 0, rz);
    });
    this.held.visible = w.carry;

    // face
    this.blinkT -= dt;
    if (this.blinkT < -0.12) this.blinkT = 2 + Math.random() * 3;
    const blink = this.blinkT < 0 ? 0.1 : 1;
    const scared = ov.expr !== 'happy' && (panic > 0.25 || w.phase === 'eaten');
    const happy = ov.expr === 'happy';
    const hurt = w.hurt > w.tune.hurtTime - 0.45;
    const effort = throwK > 0;
    // pupils look at the threat (or at him, i.e. up toward the camera)
    let tx = 0;
    let ty = 0.25;
    if (threat) {
      tx = Math.max(-1, Math.min(1, (threat.x - px) / 4));
      ty = Math.max(-1, Math.min(1, -(threat.z - pz) / 4)) * 0.6;
    }
    this.look.x += (tx - this.look.x) * Math.min(1, dt * 10);
    this.look.y += (ty - this.look.y) * Math.min(1, dt * 10);
    this.eyes.forEach((e, i) => {
      const side = i === 0 ? -1 : 1;
      e.sclera.visible = scared;
      const wide = scared ? 1.15 : 1;
      e.pupil.scale.set(scared ? 0.13 : 0.24, (scared ? 0.17 : 0.32) * (happy ? 0.12 : hurt ? 0.15 : effort ? 0.45 : blink), 0.1);
      e.pupil.position.set(this.look.x * (scared ? 0.16 : 0.07), this.look.y * (scared ? 0.18 : 0.06), scared ? 0.08 : 0.04);
      e.g.scale.set(wide, wide, 1);
      // brows: worried up when scared, down and in when throwing, flat otherwise
      const tilt = scared ? 0.45 : effort ? -0.4 : hurt ? 0.6 : 0.05;
      e.brow.rotation.z = -side * tilt;
      e.brow.position.y = scared ? 0.72 : effort ? 0.5 : 0.62;
    });
    this.mouthSmile.visible = happy || (!scared && !hurt && !effort);
    this.mouthSmile.scale.setScalar(happy ? 1.5 : 1);
    this.mouthO.visible = !this.mouthSmile.visible;
    this.mouthO.scale.set(effort ? 0.3 : 0.2, effort ? 0.08 : hurt ? 0.14 : 0.26, 0.06);
    this.sweat.visible = scared;
    this.sweat.position.y = RICE_Y + 0.62 - ((t * 0.8) % 1) * 0.5 * (scared ? 1 : 0);

    // freshness: the salmon dulls as you lose it
    const fr = w.hp / w.course.freshness;
    this.fishU.uFresh.value += (fr - this.fishU.uFresh.value) * Math.min(1, dt * 3);

    // invulnerability: flicker
    this.hurtFlash = Math.max(0, this.hurtFlash - dt * 2);
    this.body.visible = ov.pos !== undefined || !(w.hurt > 0 && Math.floor(t * 18) % 2 === 0 && w.hurt < w.tune.hurtTime - 0.15);

    // contact shadow follows, shrinks when the body lifts (and goes when it's carried off)
    this.contact.visible = !ov.pos;
    this.contact.scale.set(1 - bob * 0.8, 1 - bob * 0.8, 1);
    (this.contact.material as THREE.MeshBasicMaterial).opacity = w.hidden ? 0.3 : 0.9;
  }

}
