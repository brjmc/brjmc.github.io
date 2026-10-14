// Pavements, kerbs and road: a few long strips that follow the camera, one shader.
// Paving joints, road paint, puddles and the wet streaks under lamps are all procedural.

import * as THREE from 'three';
import { FAR_X0, FAR_X1, KERB_H, ROAD_X1, WALK_X0, WALK_X1 } from '../sim/constants';
import { LIGHTING_GLSL, withShared } from './lighting';
import { P } from './palette';

const LEN = 140; // metres of street drawn
const BACK = 12; // metres behind the camera

function strips(): THREE.BufferGeometry {
  const pos: number[] = [];
  const nor: number[] = [];
  const surf: number[] = [];
  const quad = (a: number[], b: number[], c: number[], d: number[], n: number[], s: number) => {
    for (const v of [a, b, c, a, c, d]) {
      pos.push(...v);
      nor.push(...n);
      surf.push(s);
    }
  };
  const z0 = BACK;
  const z1 = -LEN;
  const top = (x0: number, x1: number, y: number, s: number) => quad([x0, y, z0], [x1, y, z0], [x1, y, z1], [x0, y, z1], [0, 1, 0], s);
  top(WALK_X0, WALK_X1, KERB_H, 0);
  quad([WALK_X1, KERB_H, z0], [WALK_X1, 0, z0], [WALK_X1, 0, z1], [WALK_X1, KERB_H, z1], [1, 0, 0], 1);
  top(WALK_X1, FAR_X0, 0, 2);
  quad([FAR_X0, 0, z0], [FAR_X0, KERB_H, z0], [FAR_X0, KERB_H, z1], [FAR_X0, 0, z1], [-1, 0, 0], 1);
  top(FAR_X0, FAR_X1, KERB_H, 3);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('aSurf', new THREE.Float32BufferAttribute(surf, 1));
  return g;
}

const vert = /* glsl */ `
attribute float aSurf;
varying vec3 vP;
varying vec3 vN;
varying float vSurf;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vP = wp.xyz;
  vN = normal;
  vSurf = aSurf;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const frag = /* glsl */ `
${LIGHTING_GLSL}
uniform vec3 uStone;
uniform vec3 uStoneFar;
uniform vec3 uKerb;
uniform vec3 uAsphalt;
uniform vec3 uPaint;
uniform vec3 uHazeLow;
varying vec3 vP;
varying vec3 vN;
varying float vSurf;

// 1 inside a thin line around integer multiples of 'period' (AA by derivatives).
float gridLine(float x, float period, float width) {
  float f = abs(fract(x / period + 0.5) - 0.5) * period;
  float w = fwidth(x) * 0.75 + 1e-4;
  return 1.0 - smoothstep(width - w, width + w, f);
}

// Mirror-ish streak of a light source in wet ground, stretched toward the viewer.
float streak(vec3 Pw, vec3 V, vec3 L, float reach) {
  vec3 R = reflect(V, vec3(0.0, 1.0, 0.0));
  vec3 toL = L - Pw;
  float dist = length(toL.xz);
  if (dist > reach) return 0.0;
  vec3 l = toL / length(toL);
  float h = dot(normalize(R.xz), normalize(l.xz));
  float az = 1.0 - h;
  float el = abs(R.y - l.y);
  float s = (1.0 - smoothstep(0.00002, 0.00032, az)) * (1.0 - smoothstep(0.05, 0.35, el));
  return s * (1.0 - dist / reach);
}

void main() {
  vec3 Pw = vP;
  float sz = -Pw.z; // sim z
  float x = Pw.x;
  int surf = int(vSurf + 0.5);
  vec3 albedo;
  float wetBase = 0.0;
  float puddleBias = 0.0;

  if (surf == 0 || surf == 3) {
    // pavement slabs in running bond; kerb stones along the road edge
    bool near = surf == 0;
    albedo = near ? uStone : uStoneFar;
    float kerbW = 0.32;
    bool kerbStrip = near ? (x > ${WALK_X1.toFixed(2)} - kerbW) : (x < ${FAR_X0.toFixed(2)} + kerbW);
    if (kerbStrip) {
      albedo = uKerb * 0.92;
      float j = gridLine(sz, 0.9, 0.012);
      albedo *= 1.0 - 0.35 * j;
      float edge = near ? smoothstep(${WALK_X1.toFixed(2)} - 0.03, ${WALK_X1.toFixed(2)}, x) : 1.0 - smoothstep(${FAR_X0.toFixed(2)}, ${FAR_X0.toFixed(2)} + 0.03, x);
      albedo *= 1.0 + 0.12 * edge;
    } else {
      float row = floor(sz / 1.1);
      float off = mod(row, 2.0) * 0.45;
      float cell = floor((x + off) / 0.9);
      float tone = hash12(vec2(cell, row));
      albedo *= 0.94 + 0.1 * tone;
      float j = max(gridLine(sz, 1.1, 0.014), gridLine(x + off, 0.9, 0.014));
      albedo *= 1.0 - 0.32 * j;
      // the odd cracked or replaced slab
      if (tone > 0.93) albedo *= 0.86;
    }
    // shopfront footing: darker band along the building line
    if (near) albedo *= 1.0 - 0.25 * (1.0 - smoothstep(${WALK_X0.toFixed(2)}, ${(WALK_X0 + 0.35).toFixed(2)}, x));
    else albedo *= 1.0 - 0.25 * smoothstep(${(FAR_X1 - 0.35).toFixed(2)}, ${FAR_X1.toFixed(2)}, x);
  } else if (surf == 2) {
    albedo = uAsphalt;
    float grain = vnoise(Pw.xz * 3.1) * 0.5 + vnoise(Pw.xz * 17.0) * 0.5;
    albedo *= 0.9 + 0.2 * grain;
    // patch repairs
    float patchN = vnoise(vec2(x * 0.25, sz * 0.08) + 13.0);
    if (patchN > 0.72) albedo *= 0.88;
    // paint: centre dashes, faded edge lines
    float dash = step(mod(sz, 6.0), 3.0) * (1.0 - smoothstep(0.09, 0.11, abs(x - 5.0)));
    float edgeL = 1.0 - smoothstep(0.05, 0.07, abs(x - 0.55));
    float edgeR = 1.0 - smoothstep(0.05, 0.07, abs(x - 9.5));
    float wear = 0.55 + 0.45 * vnoise(vec2(x * 4.0, sz * 1.7));
    albedo = mix(albedo, uPaint * 0.8, dash * 0.55 * wear);
    albedo = mix(albedo, uPaint * 0.8, (edgeL + edgeR) * 0.22 * wear);
    // gutters hold water
    puddleBias = 0.3 * (1.0 - smoothstep(0.0, 0.7, x - ${WALK_X1.toFixed(2)})) + 0.3 * smoothstep(${ROAD_X1 - 0.6}, ${ROAD_X1 + 0.15}, x);
    wetBase = 0.45;
  } else {
    // kerb faces
    albedo = uKerb * 0.62;
    wetBase = 0.0;
  }

  // puddles: low-frequency noise, more in the gutters
  float pn = vnoise(Pw.xz * vec2(0.42, 0.21) + 3.0) * 0.75 + vnoise(Pw.xz * 1.6) * 0.25;
  float puddle = smoothstep(0.66, 0.7, pn + puddleBias) * step(0.5, vN.y);

  vec3 N = normalize(vN);
  vec3 V = normalize(Pw - uCamPos);
  vec3 col = albedo * mix(1.0, 0.55, puddle);
  // puddles mirror the haze at grazing angles
  float fres = pow(1.0 - max(dot(-V, N), 0.0), 4.0);
  col = mix(col, uHazeLow * 0.75, puddle * fres * 0.8);

  vec3 lit = col * lightAt(Pw, N, 1.0);

  // wet streaks: lamps and headlights, mostly in puddles
  if (vN.y > 0.5) {
    // reflections right under the lens read as UI blobs, so they fade in with distance
    float wet = (wetBase * 0.12 + puddle) * smoothstep(5.0, 11.0, length(Pw - uCamPos));
    float s = 0.0;
    for (int i = 0; i < MAX_LAMPS; i++) {
      if (i >= uLampCount) break;
      s += streak(Pw, V, uLamp[i], 22.0) * uLampOn[i];
    }
    lit += uSodium * bands2(s * wet * 1.4) * 0.7;
    float c = 0.0;
    for (int i = 0; i < MAX_HEADS; i++) {
      if (i >= uHeadCount) break;
      c += streak(Pw, V, uHead[i], 30.0) * uHeadOn[i] * step(0.0, dot(normalize(uCamPos - uHead[i]), uHeadDir[i]));
    }
    lit += uCold * bands2(c * wet * 1.4) * 0.8;
  }

  float f = fogAmount(Pw);
  gl_FragColor = vec4(mix(lit, uFogCol, f), 1.0);
}
`;

export class Street {
  readonly mesh: THREE.Mesh;

  constructor() {
    const mat = new THREE.ShaderMaterial({
      vertexShader: vert,
      fragmentShader: frag,
      uniforms: withShared({
        uStone: { value: new THREE.Vector3(...P.stone) },
        uStoneFar: { value: new THREE.Vector3(...P.stoneFar) },
        uKerb: { value: new THREE.Vector3(...P.kerb) },
        uAsphalt: { value: new THREE.Vector3(...P.asphalt) },
        uPaint: { value: new THREE.Vector3(...P.paint) },
        uHazeLow: { value: new THREE.Vector3(...P.hazeLow) },
      }),
    });
    this.mesh = new THREE.Mesh(strips(), mat);
    this.mesh.frustumCulled = false;
  }

  /** Keep the strips under the camera. renderCamZ is the camera's render-space z. */
  follow(renderCamZ: number) {
    this.mesh.position.z = renderCamZ;
  }
}
