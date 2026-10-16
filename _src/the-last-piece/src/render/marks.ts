// Strike telegraphs on the plate: a vermilion ring that tightens as the tips come down, with two
// ticks sliding together (the prototype's "two shadows"), an impact ring when they land, and a
// chevron line for sweeps. Drawn as decals just above the plate.

import * as THREE from 'three';
import type { World } from '../sim/world';
import { HEX } from './palette';

const VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv * 2.0 - 1.0;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const RING_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform vec4 uP; // x: ring radius (0..1 of the quad), y: urgency 0..1, z: time, w: kind (0 ring, 1 impact, 2 feint)
uniform float uFade;
varying vec2 vUv;
void main() {
  float d = length(vUv);
  float aa = fwidth(d) * 1.2;
  float r = uP.x;
  float a = 0.0;
  if (uP.w < 0.5 || uP.w > 1.5) {
    float w = 0.05 + 0.03 * uP.y;
    a = smoothstep(r - w - aa, r - w, d) * (1.0 - smoothstep(r, r + aa, d));
    // faint fill so the spot reads through depth of field
    a = max(a, (1.0 - smoothstep(r - aa, r, d)) * 0.12 * (0.4 + uP.y));
    // two ticks either side, sliding together as the tips close
    float gap = mix(0.55, 0.06, uP.y) * r;
    vec2 q = vec2(abs(vUv.x) - gap, vUv.y);
    float tick = (1.0 - smoothstep(0.05, 0.05 + aa, abs(q.y))) * (1.0 - smoothstep(0.16 * r, 0.16 * r + aa, abs(q.x)));
    a = max(a, tick);
    // pulse faster as it gets close
    float pulse = 0.65 + 0.35 * sin(uP.z * mix(8.0, 34.0, uP.y));
    a *= pulse;
    if (uP.w > 1.5) a *= step(0.5, fract(uP.z * 14.0)) * 0.6 + 0.4; // feint: flicker
  } else {
    // impact: a thin ring expanding outward and fading
    float w = 0.04;
    a = smoothstep(r - w - aa, r - w, d) * (1.0 - smoothstep(r, r + aa, d));
  }
  a *= uFade;
  if (a < 0.003) discard;
  gl_FragColor = vec4(uColor * (1.0 + 0.6 * uP.y), a);
}
`;

const LINE_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform vec4 uP; // x: length/width ratio, y: urgency, z: time, w: progress of the drag (-1 before)
varying vec2 vUv;
void main() {
  // vUv.x along the line (-1..1), vUv.y across
  float L = uP.x;
  float x = vUv.x * L;
  float y = vUv.y;
  float aa = fwidth(y) * 1.5;
  float edge = 1.0 - smoothstep(0.85 - aa, 0.85, abs(y));
  float caps = 1.0 - smoothstep(L - 1.0, L, abs(x));
  // chevrons pointing along the drag
  float c = fract((x - uP.z * mix(3.0, 9.0, uP.y)) * 0.32);
  float chev = 1.0 - smoothstep(0.0, 0.15, abs(c - 0.5 - abs(y) * 0.22) - 0.08);
  float a = (0.18 + 0.5 * chev) * edge * caps;
  a = max(a, (1.0 - smoothstep(0.08, 0.08 + aa, abs(abs(y) - 0.85))) * caps * 0.8);
  // the part already swept is spent
  float t = (vUv.x * 0.5 + 0.5);
  if (uP.w >= 0.0) a *= step(uP.w, t) * 0.8 + 0.2;
  a *= 0.6 + 0.4 * sin(uP.z * mix(6.0, 22.0, uP.y));
  if (a < 0.003) discard;
  gl_FragColor = vec4(uColor * (1.0 + 0.5 * uP.y), a);
}
`;

interface Impact {
  x: number;
  z: number;
  t: number;
  hit: boolean;
}

function mat(frag: string) {
  return new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: frag,
    uniforms: {
      uColor: { value: new THREE.Color(HEX.danger) },
      uP: { value: new THREE.Vector4() },
      uFade: { value: 1 },
    },
    transparent: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -6,
    polygonOffsetUnits: -6,
  });
}

export class MarksView {
  readonly group = new THREE.Group();
  private rings: THREE.Mesh[] = [];
  private lines: THREE.Mesh[] = [];
  private impacts: Impact[] = [];
  private quad = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  /** Global fade (cards, finale). */
  fade = 1;

  impact(x: number, z: number, hit: boolean) {
    this.impacts.push({ x, z, t: 0, hit });
  }

  private ring(i: number) {
    while (this.rings.length <= i) {
      const m = new THREE.Mesh(this.quad, mat(RING_FRAG));
      m.renderOrder = 2;
      this.group.add(m);
      this.rings.push(m);
    }
    return this.rings[i];
  }

  private line(i: number) {
    while (this.lines.length <= i) {
      const m = new THREE.Mesh(this.quad, mat(LINE_FRAG));
      m.renderOrder = 2;
      this.group.add(m);
      this.lines.push(m);
    }
    return this.lines[i];
  }

  update(w: World, t: number, dt: number) {
    let n = 0;
    let nl = 0;
    const y = w.plateTop + 0.03;
    for (const s of w.sticks) {
      if (s.phase === 'aim' || s.phase === 'stab') {
        s.marks.forEach((m, i) => {
          if (m.fired) return;
          const tIn = s.phase === 'aim' ? s.timer + m.start + m.fireAt : m.start + m.fireAt - s.burst;
          const urg = Math.max(0, Math.min(1, 1 - tIn / 1.4));
          const R = 1.05 + (1 - urg) * 1.6;
          const ring = this.ring(n++);
          ring.visible = true;
          ring.position.set(m.x, y, -m.z);
          const size = R * 2 + 0.6;
          ring.scale.set(size, 1, size);
          const u = (ring.material as THREE.ShaderMaterial).uniforms;
          (u.uP.value as THREE.Vector4).set(R / (size / 2), urg, t + i * 0.37, m.feint && !m.retargeted ? 2 : 0);
          u.uFade.value = this.fade * (s.who === 'comp' ? 0.85 : 1);
        });
      }
      const sw = s.sweep;
      if (sw && (s.phase === 'aim' || s.phase === 'sweep')) {
        const tIn = s.phase === 'aim' ? s.timer : 0;
        const urg = Math.max(0, Math.min(1, 1 - tIn / 1.3));
        const dx = sw.bx - sw.ax;
        const dz = sw.bz - sw.az;
        const len = Math.hypot(dx, dz);
        const width = 2.6;
        const l = this.line(nl++);
        l.visible = true;
        l.position.set((sw.ax + sw.bx) / 2, y, -(sw.az + sw.bz) / 2);
        l.rotation.y = Math.atan2(dz, dx);
        l.scale.set(len + width, 1, width);
        const u = (l.material as THREE.ShaderMaterial).uniforms;
        (u.uP.value as THREE.Vector4).set((len + width) / width, urg, t, sw.k);
        u.uFade.value = this.fade;
      }
    }
    // impacts
    for (const im of this.impacts) {
      im.t += dt;
      const k = im.t / 0.35;
      if (k >= 1) continue;
      const ring = this.ring(n++);
      ring.visible = true;
      ring.position.set(im.x, y, -im.z);
      const size = 6;
      ring.scale.set(size, 1, size);
      const u = (ring.material as THREE.ShaderMaterial).uniforms;
      (u.uP.value as THREE.Vector4).set(0.15 + k * 0.8, 1, t, 1);
      u.uFade.value = (1 - k) * (im.hit ? 1 : 0.6) * this.fade;
    }
    this.impacts = this.impacts.filter((im) => im.t < 0.35);
    for (let i = n; i < this.rings.length; i++) this.rings[i].visible = false;
    for (let i = nl; i < this.lines.length; i++) this.lines[i].visible = false;
  }
}
