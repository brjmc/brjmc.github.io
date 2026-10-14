// Crowd, player and chaser. One instanced draw for crowd + player, one for the chaser.
// All posing happens in the vertex shader from a few per-instance numbers.

import * as THREE from 'three';
import { LIGHTING_GLSL, withShared } from './lighting';
import { CHASER, HUMAN, buildFigure, type Proportions } from './rig';
import { FACES, HEADS, P, type RGB } from './palette';

export const MAX_PEOPLE = 520;

const vert = /* glsl */ `
attribute float aBone;
attribute float aPart;
attribute float aSkirt;
attribute vec4 iPos;   // x, y, z, yaw
attribute vec4 iAnim;  // phase, stride, crouch, squash (negative = stretch)
attribute vec4 iPose;  // lean forward, lean side, reach, tilt
attribute vec4 iGait;  // arm swing, knee amp, bob, coat length
attribute vec3 iCoat;
attribute vec3 iLegs;
attribute vec4 iMisc;  // scale, head tone, fade, tilt direction (yaw)
uniform vec4 uJ1; // hipX, hipY, kneeY, waistY
uniform vec4 uJ2; // shoulderX, shoulderY, elbowY, neckY
varying vec3 vP;
varying vec3 vN;
varying vec3 vCol;
varying float vPart;
varying float vFade;
varying vec3 vLoc;

vec3 rotX(vec3 v, float a) { float c = cos(a), s = sin(a); return vec3(v.x, c * v.y - s * v.z, s * v.y + c * v.z); }
vec3 rotZ(vec3 v, float a) { float c = cos(a), s = sin(a); return vec3(c * v.x - s * v.y, s * v.x + c * v.y, v.z); }
vec3 rotY(vec3 v, float a) { float c = cos(a), s = sin(a); return vec3(c * v.x + s * v.z, v.y, -s * v.x + c * v.z); }

uniform vec3 uHeads[6];
uniform vec3 uFaces[4];

void main() {
  vec3 v = position;
  vec3 n = normal;
  float b = aBone;
  float ph = iAnim.x;
  float st = iAnim.y;
  float crouch = iAnim.z;

  // coat length: pull the skirt hem up toward the waist
  if (aSkirt > 0.5) v.y = mix(uJ1.w - 0.04, v.y, iGait.w);

  if (b > 6.5) {
    // legs
    bool L = b < 8.5;
    float s = L ? 1.0 : -1.0;
    float lp = ph + (L ? 0.0 : 3.14159265);
    float swing = -0.46 * st * sin(lp) - crouch * 0.85;
    float knee = st * iGait.y * max(0.0, cos(lp)) + 0.1 * st + crouch * 1.5;
    vec3 hip = vec3(s * uJ1.x, uJ1.y, 0.0);
    vec3 kn = vec3(s * uJ1.x, uJ1.z, 0.0);
    if (b == 8.0 || b == 10.0) { v = kn + rotX(v - kn, knee); n = rotX(n, knee); }
    v = hip + rotX(v - hip, swing);
    n = rotX(n, swing);
  } else if (b > 0.5) {
    // arms, then everything above the waist leans
    if (b > 2.5) {
      bool L = b < 4.5;
      float s = L ? 1.0 : -1.0;
      float reach = iPose.z;
      float arm = s * iGait.x * st * sin(ph) * 0.55 - reach * 1.35 - crouch * 0.55;
      float elbow = -(0.18 + 0.32 * st * iGait.x) * (1.0 - reach) - crouch * 0.9;
      vec3 sh = vec3(s * uJ2.x, uJ2.y, 0.0);
      vec3 el = vec3(s * (uJ2.x + 0.02), uJ2.z, 0.0);
      if (b == 4.0 || b == 6.0) { v = el + rotX(v - el, elbow); n = rotX(n, elbow); }
      // arms hang slightly out from the body
      float splay = s * (0.06 + 0.25 * crouch);
      v = sh + rotZ(rotX(v - sh, arm), splay);
      n = rotZ(rotX(n, arm), splay);
    }
    vec3 waist = vec3(0.0, uJ1.w, 0.0);
    float twist = 0.14 * st * sin(ph) * iGait.x;
    float lean = iPose.x + crouch * 0.35;
    v = waist + rotZ(rotX(rotY(v - waist, twist), lean), iPose.y);
    n = rotZ(rotX(rotY(n, twist), lean), iPose.y);
  }

  // weight: bob on each step, a little sway over the stance leg, sink when crouching
  v.y += iGait.z * st * cos(2.0 * ph) - crouch * 0.17;
  v.x += 0.02 * st * sin(ph) * iGait.z * 25.0;

  // squash (contact) or stretch (dash), about the feet
  float sq = iAnim.w;
  v.y *= 1.0 - sq;
  v.xz *= 1.0 + sq * 0.6;

  v *= iMisc.x;

  // tumble: tip over the feet toward iMisc.w
  float tilt = iPose.w;
  if (abs(tilt) > 1e-3) {
    v = rotY(rotX(rotY(v, -iMisc.w + iPos.w), tilt), iMisc.w - iPos.w);
    n = rotY(rotX(rotY(n, -iMisc.w + iPos.w), tilt), iMisc.w - iPos.w);
  }

  v = rotY(v, iPos.w);
  n = rotY(n, iPos.w);
  vec3 wp = iPos.xyz + v;

  vec3 col = iCoat;
  int part = int(aPart + 0.5);
  if (part == 1) col = iLegs;
  else if (part == 2) col = vec3(0.09, 0.1, 0.11);
  else if (part == 3) {
    // hair or hat, with a face on the front of the head
    bool face = position.z > 0.03 && position.y < uJ2.w + 0.16;
    col = face ? uFaces[int(iMisc.y) % 4] : uHeads[int(iMisc.y) % 6];
  }
  else if (part == 4) col = vec3(0.47, 0.44, 0.43);
  else if (part == 6) col = iCoat * 0.72;

  vP = wp;
  vN = n;
  vCol = col;
  vPart = aPart;
  vFade = iMisc.z;
  vLoc = position;
  gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
}
`;

const frag = /* glsl */ `
${LIGHTING_GLSL}
uniform float uUnlit;
varying vec3 vP;
varying vec3 vN;
varying vec3 vCol;
varying float vPart;
varying float vFade;
varying vec3 vLoc;

float bayer4(vec2 p) {
  vec2 q = mod(floor(p), 4.0);
  float i = q.x + q.y * 4.0;
  // 4x4 ordered dither thresholds
  float m[16];
  m[0]=0.0; m[1]=8.0; m[2]=2.0; m[3]=10.0; m[4]=12.0; m[5]=4.0; m[6]=14.0; m[7]=6.0;
  m[8]=3.0; m[9]=11.0; m[10]=1.0; m[11]=9.0; m[12]=15.0; m[13]=7.0; m[14]=13.0; m[15]=5.0;
  for (int k = 0; k < 16; k++) if (float(k) == i) return (m[k] + 0.5) / 16.0;
  return 0.5;
}

void main() {
  if (vFade < 0.999 && bayer4(gl_FragCoord.xy) > vFade) discard;
  vec3 N = normalize(vN);
  if (uUnlit > 0.5) {
    // the chaser: flat ink, ember eyes, no fog
    vec3 c = vPart > 4.5 && vPart < 5.5 ? uEmber * 1.25 : uInk;
    gl_FragColor = vec4(c, 1.0);
    return;
  }
  vec3 col = vCol;
  // coat opening down the front
  if (vPart < 0.5 && vLoc.z > 0.05 && vLoc.y > 0.7) col *= 1.0 - 0.45 * (1.0 - smoothstep(0.012, 0.022, abs(vLoc.x)));
  vec3 lit = col * lightAt(vP, N, 1.0);
  // sodium rim on the side facing a nearby lamp
  vec3 V = normalize(uCamPos - vP);
  float rim = pow(1.0 - max(dot(N, V), 0.0), 2.0);
  float near = 0.0;
  for (int i = 0; i < MAX_LAMPS; i++) {
    if (i >= uLampCount) break;
    vec3 d = uLamp[i] - vP;
    float dist = length(d);
    near += max(dot(N, d / dist), 0.0) * clamp(1.0 - dist / 7.0, 0.0, 1.0) * uLampOn[i];
  }
  lit += uSodium * stepAA(0.5, rim * near * 2.0) * 0.35;
  float f = fogAmount(vP);
  gl_FragColor = vec4(mix(lit, uFogCol, f), 1.0);
}
`;

function material(pr: Proportions, unlit: boolean) {
  return new THREE.ShaderMaterial({
    vertexShader: vert,
    fragmentShader: frag,
    uniforms: withShared({
      uJ1: { value: new THREE.Vector4(pr.hipX, pr.hipY, pr.kneeY, pr.waistY) },
      uJ2: { value: new THREE.Vector4(pr.shoulderX, pr.shoulderY, pr.elbowY, pr.neckY) },
      uHeads: { value: HEADS.map((c) => new THREE.Vector3(...c)) },
      uFaces: { value: FACES.map((c) => new THREE.Vector3(...c)) },
      uUnlit: { value: unlit ? 1 : 0 },
    }),
  });
}

export interface Pose {
  x: number;
  y: number;
  z: number; // render space
  yaw: number;
  phase: number;
  stride: number;
  crouch: number;
  squash: number;
  lean: number;
  leanSide: number;
  reach: number;
  tilt: number;
  tiltYaw: number;
  armSwing: number;
  kneeAmp: number;
  bob: number;
  coatLen: number;
  coat: RGB;
  legs: RGB;
  scale: number;
  head: number;
  fade: number;
}

export function defaultPose(): Pose {
  return {
    x: 0, y: 0, z: 0, yaw: 0, phase: 0, stride: 0, crouch: 0, squash: 0, lean: 0, leanSide: 0, reach: 0,
    tilt: 0, tiltYaw: 0, armSwing: 1, kneeAmp: 0.9, bob: 0.032, coatLen: 1, coat: P.bone, legs: P.boneTrim,
    scale: 1, head: 0, fade: 1,
  };
}

class Figures {
  readonly mesh: THREE.Mesh;
  private geo: THREE.InstancedBufferGeometry;
  private bufs: Record<string, { arr: Float32Array; attr: THREE.InstancedBufferAttribute; size: number }> = {};
  n = 0;

  constructor(pr: Proportions, max: number, unlit: boolean) {
    this.geo = buildFigure(pr);
    const add = (name: string, size: number) => {
      const arr = new Float32Array(max * size);
      const attr = new THREE.InstancedBufferAttribute(arr, size).setUsage(THREE.DynamicDrawUsage);
      this.geo.setAttribute(name, attr);
      this.bufs[name] = { arr, attr, size };
    };
    add('iPos', 4);
    add('iAnim', 4);
    add('iPose', 4);
    add('iGait', 4);
    add('iCoat', 3);
    add('iLegs', 3);
    add('iMisc', 4);
    this.max = max;
    this.mesh = new THREE.Mesh(this.geo, material(pr, unlit));
    this.mesh.frustumCulled = false;
  }

  private max: number;

  begin() {
    this.n = 0;
  }

  add(p: Pose) {
    if (this.n >= this.max) return;
    const i = this.n;
    const b = this.bufs;
    b.iPos.arr.set([p.x, p.y, p.z, p.yaw], i * 4);
    b.iAnim.arr.set([p.phase, p.stride, p.crouch, p.squash], i * 4);
    b.iPose.arr.set([p.lean, p.leanSide, p.reach, p.tilt], i * 4);
    b.iGait.arr.set([p.armSwing, p.kneeAmp, p.bob, p.coatLen], i * 4);
    b.iCoat.arr.set(p.coat, i * 3);
    b.iLegs.arr.set(p.legs, i * 3);
    b.iMisc.arr.set([p.scale, p.head, p.fade, p.tiltYaw], i * 4);
    this.n++;
  }

  end() {
    this.geo.instanceCount = this.n;
    for (const k in this.bufs) {
      const b = this.bufs[k];
      b.attr.needsUpdate = true;
      b.attr.clearUpdateRanges();
      b.attr.addUpdateRange(0, this.n * b.size);
    }
  }
}

export class People {
  readonly crowd = new Figures(HUMAN, MAX_PEOPLE, false);
  readonly chaser = new Figures(CHASER, 1, true);
}
