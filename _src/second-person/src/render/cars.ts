// Cars and vans: procedural low-poly bodies, instanced, lit like everything else.
// Parts: 0 body, 1 glass, 2 tyre, 3 headlight, 4 tail light, 5 trim

import * as THREE from 'three';
import { LIGHTING_GLSL, withShared } from './lighting';
import { P, type RGB } from './palette';

const MAX = 40;

interface Out {
  p: number[];
  n: number[];
  part: number[];
}

function add(o: Out, g: THREE.BufferGeometry, part: number) {
  const ng = g.index ? g.toNonIndexed() : g;
  ng.computeVertexNormals();
  const pos = ng.getAttribute('position');
  const nor = ng.getAttribute('normal');
  for (let i = 0; i < pos.count; i++) {
    o.p.push(pos.getX(i), pos.getY(i), pos.getZ(i));
    o.n.push(nor.getX(i), nor.getY(i), nor.getZ(i));
    o.part.push(part);
  }
}

function box(w: number, h: number, d: number, x: number, y: number, z: number, taperTop = 1, taperZ = 1) {
  const g = new THREE.BoxGeometry(w, h, d);
  const pos = g.getAttribute('position');
  for (let i = 0; i < pos.count; i++) {
    if (pos.getY(i) > 0) {
      pos.setX(i, pos.getX(i) * taperTop);
      pos.setZ(i, pos.getZ(i) * taperZ);
    }
  }
  g.translate(x, y, z);
  return g;
}

function wheels(o: Out, zs: number[], halfW: number, r: number) {
  for (const z of zs)
    for (const s of [1, -1]) {
      const g = new THREE.CylinderGeometry(r, r, 0.24, 8);
      g.rotateZ(Math.PI / 2);
      g.translate(s * halfW, r, z);
      add(o, g, 2);
    }
}

function lights(o: Out, halfLen: number, y: number, x: number, w: number) {
  for (const s of [1, -1]) {
    add(o, box(w, 0.13, 0.04, s * x, y, halfLen + 0.01), 3);
    add(o, box(w * 0.9, 0.11, 0.04, s * x, y + 0.04, -halfLen - 0.01), 4);
  }
}

function finish(o: Out) {
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(o.p, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(o.n, 3));
  g.setAttribute('aPart', new THREE.Float32BufferAttribute(o.part, 1));
  return g;
}

/** Sedan, 4.4 m x 1.95 m, roof at 1.42 m. Forward is +z. */
function sedan() {
  const o: Out = { p: [], n: [], part: [] };
  add(o, box(1.86, 0.5, 4.3, 0, 0.6, 0, 0.98, 0.97), 0);
  add(o, box(1.82, 0.1, 1.2, 0, 0.88, 1.45, 0.96, 0.9), 0); // bonnet lip
  add(o, box(1.62, 0.5, 2.1, 0, 1.1, -0.2, 0.84, 0.72), 1); // cabin glass
  add(o, box(1.34, 0.05, 1.45, 0, 1.38, -0.25), 0); // roof
  add(o, box(1.9, 0.16, 0.12, 0, 0.42, 2.17), 5);
  add(o, box(1.9, 0.16, 0.12, 0, 0.42, -2.17), 5);
  wheels(o, [1.38, -1.32], 0.82, 0.33);
  lights(o, 2.15, 0.68, 0.62, 0.34);
  return finish(o);
}

/** Van/bus, 7.2 m x 1.95 m, 2.7 m tall. */
function van() {
  const o: Out = { p: [], n: [], part: [] };
  add(o, box(1.94, 2.15, 6.9, 0, 1.45, -0.1, 0.97, 0.99), 0);
  add(o, box(1.9, 0.95, 0.06, 0, 1.95, 3.37, 0.95), 1); // windscreen
  for (const s of [1, -1]) add(o, box(0.04, 0.7, 5.2, s * 0.975, 2.0, -0.6), 1); // side windows
  add(o, box(1.96, 0.22, 0.14, 0, 0.46, 3.42), 5);
  add(o, box(1.96, 0.22, 0.14, 0, 0.46, -3.6), 5);
  wheels(o, [2.4, -2.5], 0.84, 0.4);
  lights(o, 3.42, 0.72, 0.7, 0.3);
  return finish(o);
}

const vert = /* glsl */ `
attribute float aPart;
attribute vec4 iPos; // x, y, z, yaw
attribute vec4 iCol; // body rgb, lights on
varying vec3 vP;
varying vec3 vN;
varying float vPart;
varying vec4 vCol;
void main() {
  float c = cos(iPos.w), s = sin(iPos.w);
  vec3 p = vec3(c * position.x + s * position.z, position.y, -s * position.x + c * position.z);
  vec3 n = vec3(c * normal.x + s * normal.z, normal.y, -s * normal.x + c * normal.z);
  vec3 wp = iPos.xyz + p;
  vP = wp;
  vN = n;
  vPart = aPart;
  vCol = iCol;
  gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
}
`;

const frag = /* glsl */ `
${LIGHTING_GLSL}
uniform vec3 uHazeLow;
varying vec3 vP;
varying vec3 vN;
varying float vPart;
varying vec4 vCol;
void main() {
  vec3 N = normalize(vN);
  int part = int(vPart + 0.5);
  vec3 V = normalize(vP - uCamPos);
  vec3 col = vCol.rgb;
  vec3 emit = vec3(0.0);
  if (part == 1) {
    float fres = pow(1.0 - abs(dot(N, -V)), 2.5);
    col = mix(vec3(0.05, 0.06, 0.075), uHazeLow * 0.6, fres);
  } else if (part == 2) col = vec3(0.05, 0.055, 0.06);
  else if (part == 5) col = vec3(0.1, 0.11, 0.12);
  else if (part == 3) { col = vec3(0.0); emit = uCold * mix(0.35, 1.15, vCol.a); }
  else if (part == 4) { col = vec3(0.0); emit = uEmber * 0.95; }
  vec3 lit = col * lightAt(vP, N, 1.0);
  // painted bodies catch a banded sheen from the lamps above
  if (part == 0) {
    vec3 R = reflect(V, N);
    float sp = 0.0;
    for (int i = 0; i < MAX_LAMPS; i++) {
      if (i >= uLampCount) break;
      vec3 l = normalize(uLamp[i] - vP);
      sp += pow(max(dot(R, l), 0.0), 24.0) * clamp(1.0 - length(uLamp[i] - vP) / 14.0, 0.0, 1.0) * uLampOn[i];
    }
    lit += uSodium * stepAA(0.35, sp) * 0.45;
  }
  lit += emit;
  float f = fogAmount(vP) * (part >= 3 && part <= 4 ? 0.6 : 1.0);
  gl_FragColor = vec4(mix(lit, uFogCol, f), 1.0);
}
`;

class CarSet {
  readonly mesh: THREE.Mesh;
  private pos = new Float32Array(MAX * 4);
  private col = new Float32Array(MAX * 4);
  private attrs: THREE.InstancedBufferAttribute[];
  private geo: THREE.InstancedBufferGeometry;
  n = 0;

  constructor(geo: THREE.InstancedBufferGeometry, mat: THREE.ShaderMaterial) {
    this.geo = geo;
    this.attrs = [new THREE.InstancedBufferAttribute(this.pos, 4), new THREE.InstancedBufferAttribute(this.col, 4)];
    for (const a of this.attrs) a.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('iPos', this.attrs[0]);
    geo.setAttribute('iCol', this.attrs[1]);
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.frustumCulled = false;
  }

  add(x: number, y: number, z: number, yaw: number, body: RGB, lightsOn: number) {
    if (this.n >= MAX) return;
    this.pos.set([x, y, z, yaw], this.n * 4);
    this.col.set([body[0], body[1], body[2], lightsOn], this.n * 4);
    this.n++;
  }

  end() {
    this.geo.instanceCount = this.n;
    for (const a of this.attrs) a.needsUpdate = true;
  }
}

export class Cars {
  readonly sedans: CarSet;
  readonly vans: CarSet;

  constructor() {
    const mat = new THREE.ShaderMaterial({
      vertexShader: vert,
      fragmentShader: frag,
      uniforms: withShared({ uHazeLow: { value: new THREE.Vector3(...P.hazeLow) } }),
    });
    this.sedans = new CarSet(sedan(), mat);
    this.vans = new CarSet(van(), mat);
  }
}
