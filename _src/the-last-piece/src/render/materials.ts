// Procedural PBR materials: wood, glazed porcelain, lacquer, slate, soy.

import * as THREE from 'three';
import { HEX } from './palette';
import { inject } from './util';

export interface WoodOpts {
  lo: string;
  hi: string;
  plank: number; // plank width (cm); 0 = one solid board
  ring: number; // grain ring frequency
  rough: number;
  along: 'x' | 'z'; // grain direction in sim space
  seam?: number; // seam darkness 0..1
  clearcoat?: number;
}

let woodId = 0;

export function woodMaterial(o: WoodOpts) {
  const m = new THREE.MeshPhysicalMaterial({
    color: '#ffffff',
    roughness: o.rough,
    clearcoat: o.clearcoat ?? 0,
    clearcoatRoughness: 0.35,
  });
  const lo = new THREE.Color(o.lo);
  const hi = new THREE.Color(o.hi);
  return inject(
    m,
    {
      uniforms: {
        uLo: { value: lo },
        uHi: { value: hi },
        uWood: { value: new THREE.Vector4(o.plank, o.ring, o.seam ?? 0.6, o.along === 'x' ? 1 : 0) },
      },
      fragmentDecl: /* glsl */ `
        uniform vec3 uLo; uniform vec3 uHi; uniform vec4 uWood;
        float lpWoodV = 0.0;
        vec3 woodAt(vec3 p) {
          // u: across the grain, v: along it
          float u = uWood.w > 0.5 ? p.z : p.x;
          float v = uWood.w > 0.5 ? p.x : p.z;
          float pid = uWood.x > 0.0 ? floor(u / uWood.x) : 0.0;
          float h = lpHash(vec2(pid, 3.7));
          float pu = uWood.x > 0.0 ? fract(u / uWood.x) : 0.5;
          v += h * 173.0;
          // flat-sawn grain: rings bent by slow noise, with fine streaks along the board
          float bend = lpFbm(vec2(u * 0.18 + h * 9.0, v * 0.025)) * 3.0;
          float ring = fract((u * 0.9 + bend) * uWood.y);
          float late = smoothstep(0.55, 0.9, ring) * (1.0 - smoothstep(0.9, 1.0, ring));
          float streak = lpNoise(vec2(u * 9.0, v * 0.35)) * 0.5 + lpNoise(vec2(u * 31.0, v * 0.9)) * 0.25;
          float t = clamp(0.25 + h * 0.35 + late * 0.55 - streak * 0.35, 0.0, 1.0);
          vec3 c = mix(uLo, uHi, t);
          // pores and knots, very subtle
          c *= 1.0 - 0.18 * smoothstep(0.82, 1.0, lpNoise(vec2(u * 40.0, v * 3.0)));
          float seam = uWood.x > 0.0 ? smoothstep(0.0, 0.012, pu) * smoothstep(1.0, 0.988, pu) : 1.0;
          lpWoodV = late;
          return c * mix(1.0 - uWood.z, 1.0, seam);
        }
      `,
      albedo: /* glsl */ `
        vec3 lpWP = vec3(vWPos.x, vWPos.y, -vWPos.z);
        diffuseColor.rgb *= woodAt(lpWP);
      `,
      roughness: /* glsl */ `roughnessFactor = clamp(roughnessFactor + (lpWoodV - 0.3) * 0.18, 0.05, 1.0);`,
    },
    `wood${woodId++}`,
  );
}

export function porcelainMaterial(opts: { tint?: string; blue?: boolean; speckle?: number } = {}) {
  const m = new THREE.MeshPhysicalMaterial({
    color: opts.tint ?? HEX.porcelain,
    roughness: 0.32,
    clearcoat: 1,
    clearcoatRoughness: 0.08,
    sheen: 0.2,
    sheenColor: new THREE.Color('#fff4e0'),
  });
  return inject(
    m,
    {
      uniforms: { uBlue: { value: new THREE.Color(HEX.sometsuke) }, uPat: { value: new THREE.Vector2(opts.blue ? 1 : 0, opts.speckle ?? 1) } },
      vertexDecl: `attribute vec2 aProf; varying vec2 vProf;`,
      vertex: `vProf = aProf;`,
      fragmentDecl: `uniform vec3 uBlue; uniform vec2 uPat; varying vec2 vProf;`,
      albedo: /* glsl */ `
        // iron speckle in the glaze
        float sp = smoothstep(0.93, 0.99, lpNoise(vWPos.xz * 7.0)) * 0.22 * uPat.y;
        diffuseColor.rgb *= 1.0 - sp;
        if (uPat.x > 0.5) {
          // sometsuke: a hand-painted band of waves on the rim, and a thin line at the well
          float d = vProf.x;          // 0 at the outer edge, 1 in the middle of the well
          float a = vProf.y * 6.2831853;
          float band = smoothstep(0.1, 0.13, d) * (1.0 - smoothstep(0.5, 0.53, d));
          float wave = sin(a * 26.0 + sin(a * 52.0) * 0.6 + d * 22.0);
          float stroke = band * smoothstep(-0.2, 0.4, wave) * (0.75 + 0.25 * lpNoise(vWPos.xz * 3.0));
          float ring = smoothstep(0.66, 0.68, d) * (1.0 - smoothstep(0.7, 0.72, d)) + smoothstep(0.06, 0.07, d) * (1.0 - smoothstep(0.085, 0.095, d));
          float ink = clamp(stroke + ring * 0.9, 0.0, 1.0);
          diffuseColor.rgb = mix(diffuseColor.rgb, uBlue, ink * 0.92);
        }
      `,
    },
    `porcelain${opts.blue ? 'b' : ''}`,
  );
}

export function lacquerMaterial(hex: string, opts: { rough?: number; metal?: number; band?: string } = {}) {
  return new THREE.MeshPhysicalMaterial({
    color: hex,
    roughness: opts.rough ?? 0.42,
    metalness: opts.metal ?? 0,
    clearcoat: 1,
    clearcoatRoughness: 0.06,
  });
}

export function slateMaterial() {
  const m = new THREE.MeshPhysicalMaterial({ color: HEX.slate, roughness: 0.72, clearcoat: 0.15, clearcoatRoughness: 0.5 });
  return inject(
    m,
    {
      albedo: /* glsl */ `
        float n = lpFbm(vWPos.xz * 0.8) * 0.5 + lpNoise(vWPos.xz * 6.0) * 0.25;
        diffuseColor.rgb *= 0.75 + n * 0.55;
        // cleavage lines
        float c = abs(sin(vWPos.x * 1.7 + lpFbm(vWPos.xz * 0.5) * 6.0));
        diffuseColor.rgb *= 0.9 + 0.1 * smoothstep(0.0, 0.08, c);
      `,
      roughness: `roughnessFactor = clamp(roughnessFactor - 0.25 * smoothstep(0.85, 0.95, lpNoise(vWPos.xz * 22.0)), 0.2, 1.0);`,
    },
    'slate',
  );
}

export function soyMaterial() {
  return new THREE.MeshPhysicalMaterial({
    color: HEX.soy,
    roughness: 0.04,
    clearcoat: 1,
    clearcoatRoughness: 0.02,
    ior: 1.4,
    sheen: 0,
  });
}
