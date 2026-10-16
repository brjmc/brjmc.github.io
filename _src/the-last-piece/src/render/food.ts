// Food geometry and materials shared by the plate, the sushi and the FX: wasabi paste.

import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { HEX } from './palette';
import { inject } from './util';

const cache = new Map<string, THREE.BufferGeometry>();

/** A dollop of paste: flat underneath, lumpy, with a soft twisted peak. Unit radius. */
export function wasabiGeometry(seed: number, peak = 1, detail = 4): THREE.BufferGeometry {
  const key = `${seed}|${peak}|${detail}`;
  const hit = cache.get(key);
  if (hit) return hit;
  let g: THREE.BufferGeometry = new THREE.IcosahedronGeometry(1, detail);
  g.deleteAttribute('normal');
  g.deleteAttribute('uv');
  g = mergeVertices(g);
  const pos = g.getAttribute('position') as THREE.BufferAttribute;
  const ph = [seed * 1.7, seed * 2.3, seed * 0.9];
  for (let i = 0; i < pos.count; i++) {
    let x = pos.getX(i);
    let y = pos.getY(i);
    let z = pos.getZ(i);
    const lump =
      0.09 * Math.sin(x * 5.1 + ph[0]) * Math.sin(z * 4.3 + ph[1]) +
      0.06 * Math.sin(y * 7.7 + x * 3.1 + ph[2]) +
      0.035 * Math.sin(x * 13 + z * 11 + ph[0]);
    const r = 1 + lump;
    x *= r;
    y *= r;
    z *= r;
    // sit on the plate: squash the underside flat, slump the sides
    if (y < 0) y *= 0.12;
    y *= 0.62;
    // a soft peak, twisted like a piped dollop
    const d2 = x * x + z * z;
    const tw = Math.atan2(z, x) + y * 3;
    y += peak * 0.42 * Math.exp(-d2 * 3.2) * (1 + 0.15 * Math.sin(tw * 3));
    pos.setXYZ(i, x, y, z);
  }
  g.computeVertexNormals();
  cache.set(key, g);
  return g;
}

let paste: THREE.MeshPhysicalMaterial | null = null;

export function pasteMaterial(): THREE.MeshPhysicalMaterial {
  if (paste) return paste;
  const m = new THREE.MeshPhysicalMaterial({
    color: HEX.wasabi,
    roughness: 0.5,
    clearcoat: 0.55,
    clearcoatRoughness: 0.32,
    sheen: 0.6,
    sheenRoughness: 0.5,
    sheenColor: new THREE.Color(HEX.wasabiHi),
  });
  paste = inject(
    m,
    {
      albedo: /* glsl */ `
        // grated: fibrous flecks, lighter and darker, and a deeper colour in the creases
        vec3 q = vOPos * 9.0;
        float f = lpNoise3(q) * 0.6 + lpNoise3(q * 2.7) * 0.4;
        float fleck = smoothstep(0.7, 0.85, lpNoise3(q * 4.1));
        diffuseColor.rgb *= 0.78 + f * 0.38;
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.86, 0.95, 0.55), fleck * 0.35);
      `,
      roughness: /* glsl */ `roughnessFactor = clamp(roughnessFactor - 0.25 * smoothstep(0.55, 0.8, lpNoise3(vOPos * 6.0)), 0.15, 1.0);`,
    },
    'paste',
  );
  return paste;
}
