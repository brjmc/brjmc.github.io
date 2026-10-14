// Lamp posts and bins (instanced, lit like everything else). Lamp heads feed the light list.

import * as THREE from 'three';
import { KERB_H } from '../sim/constants';
import type { Block } from '../sim/props';
import { LIGHTING_GLSL, withShared } from './lighting';
import { hex, type RGB } from './palette';

const MAX = 48;

/** Append a box to arrays (position, normal, colour, emissive). */
function pushBox(
  out: { p: number[]; n: number[]; c: number[]; e: number[] },
  cx: number,
  cy: number,
  cz: number,
  sx: number,
  sy: number,
  sz: number,
  col: RGB,
  emitBottom = 0,
  taper = 1,
) {
  const g = new THREE.BoxGeometry(sx, sy, sz);
  const pos = g.getAttribute('position');
  const nor = g.getAttribute('normal');
  const idx = g.index!;
  for (let k = 0; k < idx.count; k++) {
    const i = idx.getX(k);
    let x = pos.getX(i);
    let z = pos.getZ(i);
    const y = pos.getY(i);
    if (y > 0) {
      x *= taper;
      z *= taper;
    }
    out.p.push(cx + x, cy + y, cz + z);
    out.n.push(nor.getX(i), nor.getY(i), nor.getZ(i));
    out.c.push(...col);
    out.e.push(emitBottom && nor.getY(i) < -0.5 ? emitBottom : 0);
  }
}

function pushCylinder(
  out: { p: number[]; n: number[]; c: number[]; e: number[] },
  cx: number,
  cy: number,
  cz: number,
  r0: number,
  r1: number,
  h: number,
  col: RGB,
) {
  const g = new THREE.CylinderGeometry(r1, r0, h, 6, 1, false).toNonIndexed();
  g.computeVertexNormals();
  const pos = g.getAttribute('position');
  const nor = g.getAttribute('normal');
  for (let i = 0; i < pos.count; i++) {
    out.p.push(cx + pos.getX(i), cy + pos.getY(i) + h / 2, cz + pos.getZ(i));
    out.n.push(nor.getX(i), nor.getY(i), nor.getZ(i));
    out.c.push(...col);
    out.e.push(0);
  }
}

function build(fill: (o: { p: number[]; n: number[]; c: number[]; e: number[] }) => void) {
  const o = { p: [] as number[], n: [] as number[], c: [] as number[], e: [] as number[] };
  fill(o);
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(o.p, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(o.n, 3));
  g.setAttribute('aCol', new THREE.Float32BufferAttribute(o.c, 3));
  g.setAttribute('aEmit', new THREE.Float32BufferAttribute(o.e, 1));
  return g;
}

export const LAMP_HEAD = { dx: 0.52, y: 4.52 }; // emitter offset from the post base (x toward the road)

const metal = hex('#2b3238');
const binCol = hex('#2f3a35');

const lampGeo = () =>
  build((o) => {
    pushCylinder(o, 0, 0, 0, 0.11, 0.09, 0.5, metal);
    pushCylinder(o, 0, 0.5, 0, 0.065, 0.05, 4.1, metal);
    pushBox(o, 0.26, 4.6, 0, 0.56, 0.06, 0.07, metal);
    pushBox(o, 0.52, 4.57, 0, 0.5, 0.1, 0.24, metal, 1);
  });

const binGeo = () =>
  build((o) => {
    pushBox(o, 0, 0.45, 0, 0.56, 0.9, 0.56, binCol, 0, 1.08);
    pushBox(o, 0, 0.94, 0, 0.66, 0.08, 0.66, hex('#26302c'));
    pushBox(o, 0, 0.62, 0.29, 0.3, 0.08, 0.02, hex('#3a4640'));
  });

const vert = /* glsl */ `
attribute vec3 aCol;
attribute float aEmit;
attribute vec4 iPos; // x, y, z, yaw
varying vec3 vP;
varying vec3 vN;
varying vec3 vCol;
varying float vEmit;
void main() {
  float c = cos(iPos.w), s = sin(iPos.w);
  vec3 p = vec3(c * position.x + s * position.z, position.y, -s * position.x + c * position.z);
  vec3 n = vec3(c * normal.x + s * normal.z, normal.y, -s * normal.x + c * normal.z);
  vec3 wp = iPos.xyz + p;
  vP = wp;
  vN = n;
  vCol = aCol;
  vEmit = aEmit;
  gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
}
`;

const frag = /* glsl */ `
${LIGHTING_GLSL}
varying vec3 vP;
varying vec3 vN;
varying vec3 vCol;
varying float vEmit;
void main() {
  vec3 N = normalize(vN);
  vec3 lit = vCol * lightAt(vP, N, 1.0);
  lit = mix(lit, uSodium * 1.1, vEmit);
  float f = fogAmount(vP) * (1.0 - 0.5 * vEmit);
  gl_FragColor = vec4(mix(lit, uFogCol, f), 1.0);
}
`;

class Instanced {
  readonly mesh: THREE.Mesh;
  private data = new Float32Array(MAX * 4);
  private attr: THREE.InstancedBufferAttribute;
  private geo: THREE.InstancedBufferGeometry;
  n = 0;

  constructor(geo: THREE.InstancedBufferGeometry, mat: THREE.ShaderMaterial) {
    this.geo = geo;
    this.attr = new THREE.InstancedBufferAttribute(this.data, 4).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('iPos', this.attr);
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.frustumCulled = false;
  }

  add(x: number, y: number, z: number, yaw: number) {
    if (this.n >= MAX) return;
    this.data.set([x, y, z, yaw], this.n * 4);
    this.n++;
  }

  end() {
    this.geo.instanceCount = this.n;
    this.attr.needsUpdate = true;
  }
}

export interface LampInfo {
  x: number; // render space emitter position
  y: number;
  z: number;
  simZ: number;
}

export class Posts {
  readonly lamps: Instanced;
  readonly bins: Instanced;
  readonly heads: LampInfo[] = [];

  constructor() {
    const mat = new THREE.ShaderMaterial({ vertexShader: vert, fragmentShader: frag, uniforms: withShared({}) });
    this.lamps = new Instanced(lampGeo(), mat);
    this.bins = new Instanced(binGeo(), mat);
  }

  update(blocks: Block[], simCamZ: number) {
    this.lamps.n = 0;
    this.bins.n = 0;
    this.heads.length = 0;
    for (const b of blocks) {
      for (const o of b.posts) {
        if (o.z < simCamZ - 3) continue;
        if (o.kind === 'lamp') {
          this.lamps.add(o.x, KERB_H, -o.z, 0);
          this.heads.push({ x: o.x + LAMP_HEAD.dx, y: LAMP_HEAD.y, z: -o.z, simZ: o.z });
        } else {
          this.bins.add(o.x, KERB_H, -o.z, (o.z * 1.7) % 0.6 - 0.3);
        }
      }
    }
    this.lamps.end();
    this.bins.end();
  }
}
