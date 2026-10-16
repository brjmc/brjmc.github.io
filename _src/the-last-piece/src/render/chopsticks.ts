// Chopsticks: a tapered shaft per stick, posed between the sim's tip and the hand. Each diner
// has his own pair (lacquer, black, hinoki, gold, steel-tipped moribashi, split waribashi).

import * as THREE from 'three';
import type { StickStyle } from '../sim/courses';
import type { Sticks } from '../sim/world';
import { STICK_LEN, orientBetween, posePair, type StickPoseR } from './sticks';
import { inject } from './util';

const REAL_LEN = 23; // cm: the taper ends here; the rest runs off screen toward the hand

function stickGeometry(square: number) {
  const g = new THREE.CylinderGeometry(1, 1, 1, 8, 40, false);
  g.translate(0, 0.5, 0);
  const p = g.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i);
    const cm = y * STICK_LEN;
    let r = 0.11 + (0.34 - 0.11) * Math.min(1, cm / REAL_LEN);
    // rounded tip
    if (cm < 0.25) r *= 0.55 + 0.45 * (cm / 0.25);
    const x = p.getX(i);
    const z = p.getZ(i);
    // squarer toward the top
    const sq = 1 + square * Math.min(1, cm / 8) * (Math.abs(Math.abs(x) - Math.abs(z)) < 0.3 ? 0.08 : -0.02);
    p.setXYZ(i, x * r * sq, y, z * r * sq);
  }
  g.computeVertexNormals();
  return g;
}

interface StyleDef {
  body: string;
  tip: string;
  rough: number;
  tipRough: number;
  clearcoat: number;
  metalTip: number; // 1 = steel tips (moribashi)
  grain: number; // 1 = show wood grain
  fleck: number; // gold flecks in the lacquer
  square: number;
}

const STYLES: Record<StickStyle, StyleDef> = {
  red: { body: '#8c1d15', tip: '#2a0b08', rough: 0.4, tipRough: 0.75, clearcoat: 1, metalTip: 0, grain: 0, fleck: 0.25, square: 1 },
  black: { body: '#15100e', tip: '#100c0b', rough: 0.35, tipRough: 0.8, clearcoat: 1, metalTip: 0, grain: 0, fleck: 0, square: 1 },
  hinoki: { body: '#d9b884', tip: '#5a3a1e', rough: 0.55, tipRough: 0.6, clearcoat: 0.2, metalTip: 0, grain: 1, fleck: 0, square: 0.4 },
  gold: { body: '#1a1210', tip: '#0f0b0a', rough: 0.3, tipRough: 0.7, clearcoat: 1, metalTip: 0, grain: 0, fleck: 1, square: 1 },
  moribashi: { body: '#c9a676', tip: '#c9ccd0', rough: 0.5, tipRough: 0.22, clearcoat: 0.1, metalTip: 1, grain: 1, fleck: 0, square: 0 },
  waribashi: { body: '#e6cfa3', tip: '#d8bd8e', rough: 0.7, tipRough: 0.75, clearcoat: 0, metalTip: 0, grain: 1, fleck: 0, square: 1.5 },
};

function stickMaterial(style: StickStyle) {
  const d = STYLES[style];
  const m = new THREE.MeshPhysicalMaterial({ color: '#ffffff', roughness: d.rough, clearcoat: d.clearcoat, clearcoatRoughness: 0.05 });
  return inject(
    m,
    {
      uniforms: {
        uBody: { value: new THREE.Color(d.body) },
        uTip: { value: new THREE.Color(d.tip) },
        uS: { value: new THREE.Vector4(d.tipRough, d.metalTip, d.grain, d.fleck) },
      },
      fragmentDecl: /* glsl */ `
        uniform vec3 uBody; uniform vec3 uTip; uniform vec4 uS;
        float lpTip = 0.0;
      `,
      albedo: /* glsl */ `
        {
          float cm = vOPos.y * ${STICK_LEN.toFixed(1)};
          float tipLen = uS.y > 0.5 ? 7.0 : 4.2;
          lpTip = 1.0 - smoothstep(tipLen - 0.15, tipLen + 0.15, cm);
          vec3 c = uBody;
          if (uS.z > 0.5) {
            float a = atan(vOPos.z, vOPos.x);
            float g = lpNoise(vec2(a * 2.0 + cm * 0.08, cm * 1.7)) * 0.6 + lpNoise(vec2(a * 6.0, cm * 6.0)) * 0.3;
            c *= 0.82 + g * 0.3;
          }
          if (uS.w > 0.0) {
            float f = smoothstep(0.86, 0.95, lpNoise(vec2(atan(vOPos.z, vOPos.x) * 9.0, cm * 8.0)));
            c = mix(c, vec3(0.9, 0.65, 0.25), f * uS.w * 0.8);
          }
          // grip grooves at the tip of lacquered pairs
          vec3 tc = uTip * (uS.y > 0.5 ? 1.0 : 0.85 + 0.15 * step(0.5, fract(cm * 9.0)));
          diffuseColor.rgb = mix(c, tc, lpTip);
        }
      `,
      roughness: 'roughnessFactor = mix(roughnessFactor, uS.x, lpTip);',
      metalness: 'metalnessFactor = mix(metalnessFactor, uS.y, lpTip);',
    },
    `stick-${style}`,
  );
}

const geoCache = new Map<number, THREE.BufferGeometry>();
function geoFor(square: number) {
  let g = geoCache.get(square);
  if (!g) geoCache.set(square, (g = stickGeometry(square)));
  return g;
}

export class ChopsticksView {
  readonly group = new THREE.Group();
  private meshes: THREE.Mesh[] = [];
  private pose: StickPoseR[] = [
    { tip: new THREE.Vector3(), end: new THREE.Vector3() },
    { tip: new THREE.Vector3(), end: new THREE.Vector3() },
  ];
  readonly style: StickStyle;

  constructor(style: StickStyle) {
    this.style = style;
    const d = STYLES[style];
    const mat = stickMaterial(style);
    for (let i = 0; i < 2; i++) {
      const m = new THREE.Mesh(geoFor(d.square), mat);
      m.castShadow = true;
      m.receiveShadow = true;
      this.meshes.push(m);
      this.group.add(m);
    }
  }

  /** Pose from the sim, or from explicit render-space tips/ends (eaten sequence, finale). */
  update(s: Sticks | null, a: number, override?: StickPoseR[]) {
    if (s) posePair(s, a, this.pose);
    const p = override ?? this.pose;
    for (let i = 0; i < 2; i++) orientBetween(this.meshes[i], p[i].tip, p[i].end);
  }

  get tips(): StickPoseR[] {
    return this.pose;
  }
}
