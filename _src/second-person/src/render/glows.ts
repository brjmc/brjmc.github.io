// Printed halos (stepped flat discs, additive) and flat light cones/beams.
// No bloom shader: these are the only "glow" in the frame.

import * as THREE from 'three';
import { LIGHTING_GLSL, shared } from './lighting';
import type { RGB } from './palette';

const MAX_HALOS = 160;
const MAX_BEAMS = 48;

const haloVert = /* glsl */ `
attribute vec4 iHalo; // x, y, z, size
attribute vec4 iCol;  // rgb, intensity
varying vec2 vUv;
varying vec4 vCol;
varying vec3 vP;
void main() {
  vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
  vec3 up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
  vec3 wp = iHalo.xyz + (right * position.x + up * position.y) * iHalo.w;
  vUv = position.xy * 2.0;
  vCol = iCol;
  vP = iHalo.xyz;
  gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
}
`;

const haloFrag = /* glsl */ `
${LIGHTING_GLSL}
varying vec2 vUv;
varying vec4 vCol;
varying vec3 vP;
void main() {
  float r = length(vUv);
  float w = fwidth(r) * 0.8;
  float core = 1.0 - smoothstep(0.16 - w, 0.16 + w, r);
  float mid = 1.0 - smoothstep(0.42 - w, 0.42 + w, r);
  float outer = 1.0 - smoothstep(1.0 - w, 1.0, r);
  float a = core * 0.75 + mid * 0.2 + outer * 0.07;
  float f = fogAmount(vP);
  gl_FragColor = vec4(vCol.rgb * a * vCol.a * (1.0 - 0.75 * f), 1.0);
}
`;

export class Halos {
  readonly mesh: THREE.Mesh;
  private geo = new THREE.InstancedBufferGeometry();
  private a = new Float32Array(MAX_HALOS * 4);
  private c = new Float32Array(MAX_HALOS * 4);
  private aAttr: THREE.InstancedBufferAttribute;
  private cAttr: THREE.InstancedBufferAttribute;
  private n = 0;

  constructor() {
    const q = new THREE.PlaneGeometry(1, 1);
    this.geo.index = q.index;
    this.geo.setAttribute('position', q.getAttribute('position'));
    this.aAttr = new THREE.InstancedBufferAttribute(this.a, 4).setUsage(THREE.DynamicDrawUsage);
    this.cAttr = new THREE.InstancedBufferAttribute(this.c, 4).setUsage(THREE.DynamicDrawUsage);
    this.geo.setAttribute('iHalo', this.aAttr);
    this.geo.setAttribute('iCol', this.cAttr);
    const mat = new THREE.ShaderMaterial({
      vertexShader: haloVert,
      fragmentShader: haloFrag,
      uniforms: shared,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.mesh = new THREE.Mesh(this.geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 10;
  }

  begin() {
    this.n = 0;
  }

  add(x: number, y: number, z: number, size: number, col: RGB, intensity: number) {
    if (this.n >= MAX_HALOS || intensity <= 0.001) return;
    const i = this.n * 4;
    this.a[i] = x;
    this.a[i + 1] = y;
    this.a[i + 2] = z;
    this.a[i + 3] = size;
    this.c[i] = col[0];
    this.c[i + 1] = col[1];
    this.c[i + 2] = col[2];
    this.c[i + 3] = intensity;
    this.n++;
  }

  end() {
    this.geo.instanceCount = this.n;
    this.aAttr.needsUpdate = true;
    this.cAttr.needsUpdate = true;
  }
}

const beamVert = /* glsl */ `
attribute vec4 iApex;  // x, y, z, length
attribute vec4 iDir;   // dir xyz, radius at the far end
attribute vec4 iCol;   // rgb, alpha
varying vec4 vCol;
varying float vT;
varying vec3 vP;
varying vec3 vN;
void main() {
  vec3 d = normalize(iDir.xyz);
  vec3 ref = abs(d.y) > 0.9 ? vec3(1.0, 0.0, 0.0) : vec3(0.0, 1.0, 0.0);
  vec3 sx = normalize(cross(ref, d));
  vec3 sy = cross(d, sx);
  // local cone: apex at y = 0, opening along +y to y = 1, radius 1 at y = 1
  float t = position.y;
  vec3 lp = sx * position.x * iDir.w + sy * position.z * iDir.w + d * t * iApex.w;
  vec3 wp = iApex.xyz + lp;
  vT = t;
  vCol = iCol;
  vP = wp;
  vN = normalize(sx * position.x + sy * position.z);
  gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
}
`;

const beamFrag = /* glsl */ `
${LIGHTING_GLSL}
varying vec4 vCol;
varying float vT;
varying vec3 vP;
varying vec3 vN;
void main() {
  vec3 V = normalize(uCamPos - vP);
  float edge = abs(dot(normalize(vN), V));
  // flat printed tint: soft only where the shape turns away and where it meets the ground
  float a = vCol.a * smoothstep(0.05, 0.45, edge) * smoothstep(1.0, 0.82, vT) * smoothstep(0.0, 0.08, vT);
  a *= smoothstep(0.0, 0.25, vP.y);
  float f = fogAmount(vP);
  gl_FragColor = vec4(vCol.rgb * a * (1.0 - 0.8 * f), 1.0);
}
`;

export class Beams {
  readonly mesh: THREE.Mesh;
  private geo = new THREE.InstancedBufferGeometry();
  private apex = new Float32Array(MAX_BEAMS * 4);
  private dir = new Float32Array(MAX_BEAMS * 4);
  private col = new Float32Array(MAX_BEAMS * 4);
  private attrs: THREE.InstancedBufferAttribute[];
  private n = 0;

  constructor() {
    const cone = new THREE.CylinderGeometry(1, 0, 1, 18, 1, true);
    cone.translate(0, 0.5, 0); // apex (radius 0) at y = 0, open end at y = 1
    this.geo.index = cone.index;
    this.geo.setAttribute('position', cone.getAttribute('position'));
    this.attrs = [
      new THREE.InstancedBufferAttribute(this.apex, 4),
      new THREE.InstancedBufferAttribute(this.dir, 4),
      new THREE.InstancedBufferAttribute(this.col, 4),
    ];
    for (const a of this.attrs) a.setUsage(THREE.DynamicDrawUsage);
    this.geo.setAttribute('iApex', this.attrs[0]);
    this.geo.setAttribute('iDir', this.attrs[1]);
    this.geo.setAttribute('iCol', this.attrs[2]);
    const mat = new THREE.ShaderMaterial({
      vertexShader: beamVert,
      fragmentShader: beamFrag,
      uniforms: shared,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
    });
    this.mesh = new THREE.Mesh(this.geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 9;
  }

  begin() {
    this.n = 0;
  }

  add(x: number, y: number, z: number, dx: number, dy: number, dz: number, length: number, radius: number, col: RGB, alpha: number) {
    if (this.n >= MAX_BEAMS || alpha <= 0.001) return;
    const i = this.n * 4;
    this.apex.set([x, y, z, length], i);
    this.dir.set([dx, dy, dz, radius], i);
    this.col.set([col[0], col[1], col[2], alpha], i);
    this.n++;
  }

  end() {
    this.geo.instanceCount = this.n;
    for (const a of this.attrs) a.needsUpdate = true;
  }
}
