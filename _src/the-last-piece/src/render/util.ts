// Shared render helpers: coordinate conversion, lathe/profile geometry, GLSL noise, and a small
// onBeforeCompile helper for procedural surfaces on three's PBR materials.

import * as THREE from 'three';

/** Sim (x, y, z) -> render (x, y, -z). */
export const R = (x: number, y: number, z: number, v = new THREE.Vector3()) => v.set(x, y, -z);

export const srgb = (hex: string) => new THREE.Color(hex);

/** Deterministic hash in [0, 1). */
export function hash1(n: number) {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

/** Small seeded PRNG for render-only scatter (never touches the sim's rng). */
export function prng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };
}

/** A lathe from (radius, height) pairs, closed at the axis if the profile starts or ends at r = 0. */
export function lathe(profile: [number, number][], segments = 40) {
  const pts = profile.map(([r, y]) => new THREE.Vector2(Math.max(0.0001, r), y));
  const g = new THREE.LatheGeometry(pts, segments);
  g.computeVertexNormals();
  return g;
}

/** Points on a rounded rectangle outline (centred at 0), evenly spaced by arc length. */
export function rrectOutline(hx: number, hz: number, r: number, n: number): [number, number][] {
  r = Math.max(0, Math.min(r, hx, hz));
  const sx = hx - r;
  const sz = hz - r;
  const arc = (Math.PI / 2) * r;
  const per = 4 * sx + 4 * sz + 4 * arc;
  const out: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    let s = (i / n) * per;
    // walk: right edge (up), top-right arc, top edge (left), ...
    const segs: [number, (k: number) => [number, number]][] = [
      [2 * sz, (k) => [hx, -sz + k]],
      [arc, (k) => cornerPt(sx, sz, r, 0, k / (arc || 1))],
      [2 * sx, (k) => [sx - k, hz]],
      [arc, (k) => cornerPt(-sx, sz, r, 1, k / (arc || 1))],
      [2 * sz, (k) => [-hx, sz - k]],
      [arc, (k) => cornerPt(-sx, -sz, r, 2, k / (arc || 1))],
      [2 * sx, (k) => [-sx + k, -hz]],
      [arc, (k) => cornerPt(sx, -sz, r, 3, k / (arc || 1))],
    ];
    for (let k = 0; k < segs.length; k++) {
      const [len, f] = segs[k];
      if (s <= len || k === segs.length - 1) {
        out.push(f(Math.min(s, len)));
        break;
      }
      s -= len;
    }
  }
  return out;
}

function cornerPt(cx: number, cz: number, r: number, q: number, k: number): [number, number] {
  const a = (q * Math.PI) / 2 + k * (Math.PI / 2);
  return [cx + Math.cos(a) * r, cz + Math.sin(a) * r];
}

/**
 * A plate-like solid from a rounded-rect footprint and a profile of (inset, height) pairs, from
 * the outer edge inward. The innermost ring is capped with a flat floor. Adds `aProf`:
 * x = inset / maxInset, y = position around the outline 0..1.
 */
export function profileSolid(hx: number, hz: number, r: number, profile: [number, number][], n = 160) {
  const pos: number[] = [];
  const prof: number[] = [];
  const idx: number[] = [];
  const maxInset = profile[profile.length - 1][0] || 1;
  const rings = profile.length;
  for (let j = 0; j < rings; j++) {
    const [d, h] = profile[j];
    const ring = rrectOutline(hx - d, hz - d, Math.max(0.05, r - d), n);
    for (let i = 0; i < n; i++) {
      pos.push(ring[i][0], h, ring[i][1]);
      prof.push(d / maxInset, i / n);
    }
  }
  for (let j = 0; j < rings - 1; j++) {
    for (let i = 0; i < n; i++) {
      const a = j * n + i;
      const b = j * n + ((i + 1) % n);
      const c = (j + 1) * n + i;
      const d = (j + 1) * n + ((i + 1) % n);
      idx.push(a, c, b, b, c, d);
    }
  }
  // floor: fan from the centre
  const centre = pos.length / 3;
  const [, hFloor] = profile[rings - 1];
  pos.push(0, hFloor, 0);
  prof.push(1, 0);
  const base = (rings - 1) * n;
  for (let i = 0; i < n; i++) idx.push(centre, base + ((i + 1) % n), base + i);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aProf', new THREE.Float32BufferAttribute(prof, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

export const NOISE_GLSL = /* glsl */ `
float lpHash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float lpHash3(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float lpNoise(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(lpHash(i), lpHash(i + vec2(1, 0)), f.x), mix(lpHash(i + vec2(0, 1)), lpHash(i + vec2(1, 1)), f.x), f.y);
}
float lpNoise3(vec3 x) {
  vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(lpHash3(i), lpHash3(i + vec3(1,0,0)), f.x), mix(lpHash3(i + vec3(0,1,0)), lpHash3(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(lpHash3(i + vec3(0,0,1)), lpHash3(i + vec3(1,0,1)), f.x), mix(lpHash3(i + vec3(0,1,1)), lpHash3(i + vec3(1,1,1)), f.x), f.y), f.z);
}
float lpFbm(vec2 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 4; i++) { s += a * lpNoise(p); p = p * 2.03 + 7.1; a *= 0.5; } return s; }
`;

export interface Inject {
  /** GLSL declarations shared by both stages (uniforms, functions). */
  common?: string;
  vertexDecl?: string;
  /** Runs after `#include <project_vertex>`: has `transformed`, `objectNormal`, `modelMatrix`. */
  vertex?: string;
  fragmentDecl?: string;
  /** Runs after `#include <map_fragment>`: may change `diffuseColor`. */
  albedo?: string;
  /** Runs after `#include <roughnessmap_fragment>`: may change `roughnessFactor`. */
  roughness?: string;
  /** Runs after `#include <metalnessmap_fragment>`: may change `metalnessFactor`. */
  metalness?: string;
  /** Runs after `#include <normal_fragment_maps>`: may change `normal` (view space). */
  normal?: string;
  /** Runs after `#include <emissivemap_fragment>`: may change `totalEmissiveRadiance`. */
  emissive?: string;
  /** Runs at the end (after tonemapping/colorspace chunks): may change gl_FragColor. */
  end?: string;
  uniforms?: Record<string, THREE.IUniform>;
}

/**
 * Patch a built-in material with procedural code. Provides varyings vWPos (world position)
 * and vOPos (object position) to the fragment stage.
 */
export function inject<M extends THREE.Material>(mat: M, inj: Inject, key: string): M {
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, inj.uniforms ?? {});
    sh.vertexShader = sh.vertexShader
      .replace(
        '#include <common>',
        `#include <common>\nvarying vec3 vWPos;\nvarying vec3 vOPos;\n${NOISE_GLSL}\n${inj.common ?? ''}\n${inj.vertexDecl ?? ''}`,
      )
      .replace(
        '#include <project_vertex>',
        `#include <project_vertex>
        {
          vec4 lpW = vec4(transformed, 1.0);
          #ifdef USE_INSTANCING
            lpW = instanceMatrix * lpW;
          #endif
          vOPos = transformed;
          vWPos = (modelMatrix * lpW).xyz;
        }
        ${inj.vertex ?? ''}`,
      );
    sh.fragmentShader = sh.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>\nvarying vec3 vWPos;\nvarying vec3 vOPos;\n${NOISE_GLSL}\n${inj.common ?? ''}\n${inj.fragmentDecl ?? ''}`,
      )
      .replace('#include <map_fragment>', `#include <map_fragment>\n${inj.albedo ?? ''}`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>\n${inj.roughness ?? ''}`)
      .replace('#include <metalnessmap_fragment>', `#include <metalnessmap_fragment>\n${inj.metalness ?? ''}`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>\n${inj.normal ?? ''}`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>\n${inj.emissive ?? ''}`)
      .replace('#include <dithering_fragment>', `#include <dithering_fragment>\n${inj.end ?? ''}`);
  };
  mat.customProgramCacheKey = () => key;
  return mat;
}
