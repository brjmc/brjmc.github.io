// What's on his glasses. A small "lens map" render target holds thickness: wasabi paste in R,
// water (tears) in G. The post composite turns it into refraction, diffusion, absorption and
// glints. Splats grow on impact, drip for a couple of seconds, and stay. Plus: the static dirt
// texture (fingerprints, smears, dust) that lights up when something bright sits behind it,
// and the frame shape for each diner's glasses.

import * as THREE from 'three';
import type { GlassesKind } from '../sim/courses';
import { prng } from './util';

export interface Splat {
  x: number; // NDC
  y: number;
  size: number; // fraction of screen height (radius)
  seed: number;
  age: number;
  mag: number;
}

export interface Tear {
  x: number; // NDC
  y: number;
  vy: number;
  age: number;
  life: number;
  size: number;
  wob: number;
}

const VERT = /* glsl */ `
uniform vec4 uQuad; // centre (ndc), half size (ndc)
varying vec2 vP;
void main() {
  vP = position.xy;
  gl_Position = vec4(uQuad.xy + position.xy * uQuad.zw, 0.0, 1.0);
}
`;

const SPLAT_FRAG = /* glsl */ `
uniform vec4 uS; // seed, age, mag, unused
varying vec2 vP;
float h1(float n) { return fract(sin(n * 127.1) * 43758.5453); }
float n2(vec2 p) { vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  float a = h1(dot(i, vec2(1.0, 57.0))); float b = h1(dot(i + vec2(1, 0), vec2(1.0, 57.0)));
  float c = h1(dot(i + vec2(0, 1), vec2(1.0, 57.0))); float d = h1(dot(i + vec2(1, 1), vec2(1.0, 57.0)));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y); }
void main() {
  float seed = uS.x;
  float age = uS.y;
  float grow = 1.0 - pow(1.0 - clamp(age * 6.0, 0.0, 1.0), 3.0);
  // the quad is taller than wide below the centre to leave room for drips: p.y in [-2, 1]
  vec2 p = vec2(vP.x, vP.y * 1.5 - 0.5);
  vec2 q = p / max(grow, 0.05);
  // the body: a metaball of lumps, its edge broken by noise
  float f = 0.0;
  for (int i = 0; i < 7; i++) {
    float fi = float(i);
    vec2 c = vec2(h1(seed + fi * 3.1) - 0.5, h1(seed + fi * 7.7) - 0.5) * 0.75;
    float r = 0.16 + h1(seed + fi * 1.9) * 0.2;
    f += r * r / (dot(q - c, q - c) + 0.002);
  }
  float edge = n2(q * 5.0 + seed) * 0.5 + n2(q * 11.0 - seed) * 0.25;
  float body = smoothstep(0.55, 1.6, f + edge * 0.6 - 0.2);
  // splatter around the body: flecks thrown out on impact
  float fl = 0.0;
  for (int i = 0; i < 10; i++) {
    float fi = float(i);
    float a = h1(seed + fi * 5.3) * 6.2831;
    float d = 0.55 + h1(seed + fi * 2.2) * 0.4;
    vec2 c = vec2(cos(a), sin(a) * 0.8) * d;
    float r = 0.03 + h1(seed + fi * 9.1) * 0.05;
    fl = max(fl, 1.0 - smoothstep(r * 0.4, r, length(q - c)));
  }
  // drips: they creep down for a couple of seconds, then stop
  float dr = 0.0;
  for (int i = 0; i < 4; i++) {
    float fi = float(i);
    if (h1(seed + fi * 4.4) > 0.75) continue;
    float x0 = (h1(seed + fi * 6.6) - 0.5) * 0.8;
    float w = 0.03 + h1(seed + fi * 8.8) * 0.045;
    float len = (0.35 + h1(seed + fi * 3.3) * 0.9) * clamp(age / 2.6, 0.0, 1.0);
    float top = -0.15;
    float x = x0 + sin(p.y * 6.0 + fi) * 0.02;
    float inY = smoothstep(top - len - 0.02, top - len + 0.04, p.y) * (1.0 - smoothstep(top, top + 0.1, p.y));
    float col = 1.0 - smoothstep(w * 0.5, w, abs(p.x - x));
    float bulb = 1.0 - smoothstep(w * 0.9, w * 1.6, length(vec2(p.x - x, (p.y - (top - len)) * 1.2)));
    dr = max(dr, max(col * inY * 0.7, bulb * step(0.01, len)));
  }
  float h = max(body * (0.75 + 0.25 * n2(q * 3.0 + seed * 2.0)), max(fl * 0.55 * grow, dr * 0.8));
  // falloff to zero at the quad's edge
  h *= 1.0 - smoothstep(0.85, 1.0, max(abs(vP.x), abs(vP.y)));
  gl_FragColor = vec4(h * uS.z, 0.0, 0.0, 1.0);
}
`;

const TEAR_FRAG = /* glsl */ `
uniform vec4 uS; // age, life, wobble, trail length (local units)
varying vec2 vP;
void main() {
  // a drop at the bottom of the quad with a thin wet trail above it
  vec2 p = vP;
  float head = 1.0 - smoothstep(0.18, 0.32, length(vec2(p.x, (p.y + 0.7) * 1.3)));
  float x = sin(p.y * 7.0 + uS.z) * 0.06;
  float trail = (1.0 - smoothstep(0.03, 0.09, abs(p.x - x))) * smoothstep(-0.7, -0.5, p.y) * (1.0 - smoothstep(0.6, 1.0, p.y));
  float fade = 1.0 - smoothstep(uS.y * 0.7, uS.y, uS.x);
  float h = max(head, trail * 0.45) * fade;
  gl_FragColor = vec4(0.0, h, 0.0, 1.0);
}
`;

export class LensMap {
  readonly rt: THREE.WebGLRenderTarget;
  private scene = new THREE.Scene();
  private cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private splatMeshes: THREE.Mesh[] = [];
  private tearMeshes: THREE.Mesh[] = [];
  private quad = new THREE.PlaneGeometry(2, 2);
  splats: Splat[] = [];
  tears: Tear[] = [];
  aspect = 1;
  private rnd = prng(99);
  /** Anything on the glass at all (skip the work when clean). */
  get dirty() {
    return this.splats.length > 0 || this.tears.length > 0;
  }

  constructor(w: number, h: number) {
    this.rt = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, depthBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
  }

  setSize(w: number, h: number, aspect: number) {
    this.rt.setSize(Math.max(1, w), Math.max(1, h));
    this.aspect = aspect;
  }

  clear() {
    this.splats = [];
    this.tears = [];
  }

  /** A blob of wasabi arrives. (u, v) are lens-plane offsets from the sim, in cm. */
  addSplat(u: number, v: number, n: number) {
    const r = this.rnd;
    // off to one side and high: it should get in the way, not blot out the plate entirely
    const side = u !== 0 ? Math.sign(u) : r() < 0.5 ? -1 : 1;
    const x = side * (0.28 + r() * 0.4);
    const y = 0.18 + r() * 0.32 + v * 0.03;
    const mag = 1;
    this.splats.push({ x, y, size: 0.42 + n * 0.06 + r() * 0.1, seed: Math.floor(r() * 1000) + 1, age: 0, mag });
    // the eye waters
    for (let i = 0; i < 3; i++) this.addTear(x + (r() - 0.5) * 0.6, 0.6 + r() * 0.3);
  }

  addTear(x: number, y: number) {
    const r = this.rnd;
    this.tears.push({ x, y, vy: 0, age: 0, life: 5 + r() * 4, size: 0.035 + r() * 0.025, wob: r() * 6 });
  }

  update(dt: number) {
    for (const s of this.splats) s.age += dt;
    for (const t of this.tears) {
      t.age += dt;
      // drops stick, then let go and run
      const run = t.age > 0.6 ? 1 : 0;
      t.vy = Math.max(-0.5, t.vy - dt * 0.6 * run);
      t.y += t.vy * dt * (0.4 + 0.6 * Math.abs(Math.sin(t.age * 2 + t.wob)));
    }
    this.tears = this.tears.filter((t) => t.age < t.life && t.y > -1.4);
  }

  render(gl: THREE.WebGLRenderer) {
    const pool = (arr: THREE.Mesh[], n: number, frag: string) => {
      while (arr.length < n) {
        const m = new THREE.Mesh(
          this.quad,
          new THREE.ShaderMaterial({
            vertexShader: VERT,
            fragmentShader: frag,
            uniforms: { uQuad: { value: new THREE.Vector4() }, uS: { value: new THREE.Vector4() } },
            transparent: true,
            blending: THREE.AdditiveBlending,
            depthTest: false,
            depthWrite: false,
          }),
        );
        m.frustumCulled = false;
        this.scene.add(m);
        arr.push(m);
      }
      arr.forEach((m, i) => (m.visible = i < n));
    };
    pool(this.splatMeshes, this.splats.length, SPLAT_FRAG);
    pool(this.tearMeshes, this.tears.length, TEAR_FRAG);
    this.splats.forEach((s, i) => {
      const u = (this.splatMeshes[i].material as THREE.ShaderMaterial).uniforms;
      // sized against the screen's short side; the quad runs 1x the radius above, 2x below (drips)
      const kx = this.aspect < 1 ? 1 : 1 / this.aspect;
      const ky = this.aspect < 1 ? this.aspect : 1;
      const hy = s.size * 1.5 * ky;
      (u.uQuad.value as THREE.Vector4).set(s.x, s.y - s.size * 0.5 * ky, s.size * kx, hy);
      (u.uS.value as THREE.Vector4).set(s.seed, s.age, s.mag, 0);
    });
    this.tears.forEach((t, i) => {
      const u = (this.tearMeshes[i].material as THREE.ShaderMaterial).uniforms;
      const kx = this.aspect < 1 ? 1 : 1 / this.aspect;
      const ky = this.aspect < 1 ? this.aspect : 1;
      (u.uQuad.value as THREE.Vector4).set(t.x, t.y + t.size * 2 * ky, t.size * kx, t.size * 4 * ky);
      (u.uS.value as THREE.Vector4).set(t.age, t.life, t.wob + t.y * 3, 0);
    });
    const prev = gl.getRenderTarget();
    gl.setRenderTarget(this.rt);
    gl.setClearColor(0x000000, 0);
    gl.clear(true, false, false);
    if (this.dirty) gl.render(this.scene, this.cam);
    gl.setRenderTarget(prev);
  }
}

/** Fingerprints, smears and dust on the glass. Greyscale in R. */
export function dirtTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const g = c.getContext('2d')!;
  g.fillStyle = '#000';
  g.fillRect(0, 0, 512, 512);
  const r = prng(1234);
  // smears: soft wide strokes
  g.filter = 'blur(10px)';
  for (let i = 0; i < 7; i++) {
    g.strokeStyle = `rgba(255,255,255,${0.12 + r() * 0.12})`;
    g.lineWidth = 18 + r() * 40;
    g.beginPath();
    const x = r() * 512;
    const y = r() * 512;
    g.moveTo(x, y);
    g.quadraticCurveTo(x + (r() - 0.5) * 300, y + (r() - 0.5) * 200, x + (r() - 0.5) * 360, y + (r() - 0.5) * 300);
    g.stroke();
  }
  // fingerprints: concentric whorls
  g.filter = 'blur(0.6px)';
  for (let f = 0; f < 3; f++) {
    const cx = 80 + r() * 350;
    const cy = 80 + r() * 350;
    const rot = r() * Math.PI;
    for (let k = 3; k < 46; k += 2.4) {
      g.strokeStyle = `rgba(255,255,255,${0.18 * (1 - k / 50)})`;
      g.lineWidth = 1.2;
      g.beginPath();
      g.ellipse(cx, cy, k * 1.3, k, rot, r() * 0.5, Math.PI * 2 - r() * 0.8);
      g.stroke();
    }
  }
  // dust
  g.filter = 'none';
  for (let i = 0; i < 260; i++) {
    g.fillStyle = `rgba(255,255,255,${0.2 + r() * 0.6})`;
    g.beginPath();
    g.arc(r() * 512, r() * 512, 0.5 + r() * 1.6, 0, Math.PI * 2);
    g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

export interface GlassesDef {
  shape: number; // 0 round, 1 square, 2 half-moon, 3 aviator, 4 cat-eye
  exp: number; // superellipse exponent
  frame: string;
  thick: number; // frame band thickness (fraction of screen height)
  rim: string; // rim highlight
  scale: number; // lens size relative to the screen
}

export const GLASSES: Record<GlassesKind, GlassesDef> = {
  round: { shape: 0, exp: 2.3, frame: '#2a221c', thick: 0.04, rim: '#d9b072', scale: 1.06 },
  square: { shape: 1, exp: 5.5, frame: '#0b0909', thick: 0.11, rim: '#5c5650', scale: 1.0 },
  halfmoon: { shape: 2, exp: 3.2, frame: '#3b2a12', thick: 0.035, rim: '#ffcf6a', scale: 1.08 },
  aviator: { shape: 3, exp: 2.6, frame: '#6a5536', thick: 0.03, rim: '#ffe0a0', scale: 1.08 },
  cateye: { shape: 4, exp: 3.0, frame: '#3a1e10', thick: 0.12, rim: '#c08040', scale: 1.02 },
};
