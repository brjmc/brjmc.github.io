// Shared light uniforms and the banded lighting GLSL used by every lit material.
// All positions are in render space: (x, y, -z) of the sim.

import * as THREE from 'three';
import { P, type RGB } from './palette';

export const MAX_LAMPS = 8;
export const MAX_HEADS = 6;

const v3 = (c: RGB) => new THREE.Vector3(c[0], c[1], c[2]);

export const shared = {
  uLamp: { value: Array.from({ length: MAX_LAMPS }, () => new THREE.Vector3(0, -100, 0)) },
  uLampOn: { value: new Float32Array(MAX_LAMPS) },
  uHead: { value: Array.from({ length: MAX_HEADS }, () => new THREE.Vector3(0, -100, 0)) },
  uHeadDir: { value: Array.from({ length: MAX_HEADS }, () => new THREE.Vector3(0, 0, 1)) },
  uHeadOn: { value: new Float32Array(MAX_HEADS) },
  uFinish: { value: new THREE.Vector4(0, 0, 0, 0) },
  uCamPos: { value: new THREE.Vector3() },
  uFogCol: { value: v3(P.haze) },
  uFogP: { value: new THREE.Vector4(9, 72, 5, 0.9) }, // start, end, steps, max
  uTime: { value: 0 },
  uLampCount: { value: MAX_LAMPS },
  uHeadCount: { value: MAX_HEADS },
  uSodium: { value: v3(P.sodium) },
  uCold: { value: v3(P.cold) },
  uEmber: { value: v3(P.ember) },
  uInk: { value: v3(P.ink) },
  uSkyAmb: { value: v3([0.47, 0.52, 0.58]) },
  uGroundAmb: { value: v3([0.14, 0.15, 0.18]) },
  uKeyDir: { value: new THREE.Vector3(-0.35, 0.8, 0.5).normalize() },
};

export type Shared = typeof shared;

export const LIGHTING_GLSL = /* glsl */ `
#define MAX_LAMPS ${MAX_LAMPS}
#define MAX_HEADS ${MAX_HEADS}
uniform vec3 uLamp[MAX_LAMPS];
uniform float uLampOn[MAX_LAMPS];
uniform vec3 uHead[MAX_HEADS];
uniform vec3 uHeadDir[MAX_HEADS];
uniform float uHeadOn[MAX_HEADS];
uniform vec4 uFinish;
uniform vec3 uCamPos;
uniform vec3 uFogCol;
uniform vec4 uFogP;
uniform float uTime;
uniform int uLampCount;
uniform int uHeadCount;
uniform vec3 uSodium;
uniform vec3 uCold;
uniform vec3 uEmber;
uniform vec3 uInk;
uniform vec3 uSkyAmb;
uniform vec3 uGroundAmb;
uniform vec3 uKeyDir;

#ifdef SP_VERTEX
float stepAA(float edge, float x) { return smoothstep(edge - 0.01, edge + 0.01, x); }
#else
float stepAA(float edge, float x) {
  float w = max(fwidth(x), 1e-4) * 0.8;
  return smoothstep(edge - w, edge + w, x);
}
#endif
// Hard printed steps.
float bands3(float x) { return (stepAA(0.10, x) + stepAA(0.30, x) + stepAA(0.62, x)) / 3.0; }
float bands2(float x) { return (stepAA(0.12, x) + stepAA(0.45, x)) * 0.5; }

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1.0, 0.0)), u.x), mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), u.x), u.y);
}

// Raw (unbanded) lamp term: a downward cone, so each lamp prints a distinct pool.
float lampTerm(vec3 Pw, vec3 N, vec3 L) {
  vec3 d = L - Pw;
  float dist = length(d);
  vec3 l = d / dist;
  float ndl = max(dot(N, l), 0.0);
  float cone = clamp((l.y - 0.74) / 0.26, 0.0, 1.0);
  float fall = clamp(1.0 - dist / 11.0, 0.0, 1.0);
  return ndl * cone * fall * 1.9;
}

float headTerm(vec3 Pw, vec3 N, vec3 H, vec3 dir) {
  vec3 d = Pw - H;
  float dist = length(d);
  vec3 l = d / max(dist, 1e-3);
  float cone = smoothstep(0.86, 0.97, dot(l, dir));
  float ndl = max(dot(N, -l), 0.0);
  float fall = clamp(1.0 - dist / 34.0, 0.0, 1.0);
  return cone * ndl * fall * 1.6;
}

// Stepped haze, 0 = clear, uFogP.w = fully hazed.
float fogAmount(vec3 Pw) {
  float d = length(Pw - uCamPos);
  float f = clamp((d - uFogP.x) / (uFogP.y - uFogP.x), 0.0, 1.0);
  f = pow(f, 0.85);
  float steps = uFogP.z;
  float s = f * steps;
  float fs = floor(s);
  float t = smoothstep(0.35, 0.65, s - fs);
  f = (fs + t) / steps;
  return f * uFogP.w;
}

// The banded light that every lit surface receives. rim: how much sodium rim to add (people).
vec3 lightAt(vec3 Pw, vec3 N, float keyAmt) {
  float hemi = N.y * 0.5 + 0.5;
  vec3 amb = mix(uGroundAmb, uSkyAmb, hemi);
  float key = bands2(max(dot(N, uKeyDir), 0.0)) * keyAmt;
  vec3 light = amb + vec3(0.26, 0.29, 0.34) * key;

  float sod = 0.0;
  for (int i = 0; i < MAX_LAMPS; i++) {
    if (i >= uLampCount) break;
    sod += lampTerm(Pw, N, uLamp[i]) * uLampOn[i];
  }
  light += uSodium * bands3(sod) * 1.45;

  float cold = 0.0;
  for (int i = 0; i < MAX_HEADS; i++) {
    if (i >= uHeadCount) break;
    cold += headTerm(Pw, N, uHead[i], uHeadDir[i]) * uHeadOn[i];
  }
  light += uCold * bands2(cold) * 1.1;

  if (uFinish.w > 0.0) {
    vec3 d = uFinish.xyz - Pw;
    float dist = length(d);
    float ndl = max(dot(N, d / dist), 0.0) * 0.6 + 0.4;
    float f = clamp(1.0 - dist / (14.0 + 26.0 * uFinish.w), 0.0, 1.0);
    light += uSodium * bands3(f * f * ndl * uFinish.w * 1.4) * 1.1;
  }
  return light;
}
`;

/** Merge the shared uniforms with per-material ones. */
export function withShared<T extends Record<string, THREE.IUniform>>(own: T): T & Shared {
  return { ...shared, ...own } as T & Shared;
}
