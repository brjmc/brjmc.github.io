// The rest of the table, an hour and a half into dinner: teacup, sake flask and cup, a little
// soy dish, a stack of empty plates, the hand towel, the chopstick rest. Render only.

import * as THREE from 'three';
import type { CourseCfg } from '../sim/courses';
import { lacquerMaterial, porcelainMaterial, soyMaterial, woodMaterial } from './materials';
import { lathe, prng } from './util';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export interface Decor {
  group: THREE.Group;
  /** Where steam comes from (render space), for the atmosphere pass. */
  steam: THREE.Vector3[];
  /** Small warm point lights in the scene (a candle on course 4), for bokeh. */
  glows: { pos: THREE.Vector3; color: THREE.Color; k: number; r: number }[];
}

const S = (z: number) => -z;

function glaze(hex: string, rough = 0.3) {
  const m = porcelainMaterial({ tint: hex, speckle: 1.2 });
  m.roughness = rough;
  return m;
}

function yunomi() {
  // a tall teacup with a brown iron glaze running into cream, tea inside
  const g = new THREE.Group();
  const prof: [number, number][] = [
    [0, 0],
    [2.4, 0],
    [2.5, 0.3],
    [2.9, 4.5],
    [3.05, 7.2],
    [2.9, 7.3],
    [2.7, 4.6],
    [2.3, 0.7],
    [0, 0.6],
  ];
  const cup = new THREE.Mesh(lathe(prof, 48), glaze('#6b3a22', 0.25));
  cup.castShadow = cup.receiveShadow = true;
  const tea = new THREE.Mesh(new THREE.CircleGeometry(2.75, 40), new THREE.MeshPhysicalMaterial({ color: '#7d7a2c', roughness: 0.05, clearcoat: 1 }));
  tea.rotation.x = -Math.PI / 2;
  tea.position.y = 5.6;
  g.add(cup, tea);
  return g;
}

function tokkuri() {
  const prof: [number, number][] = [
    [0, 0],
    [2.6, 0],
    [3.6, 2],
    [3.9, 5],
    [3.2, 8.5],
    [1.2, 11],
    [1.0, 12.8],
    [1.5, 13.4],
    [1.2, 13.6],
    [0.8, 13],
    [0, 12.6],
  ];
  const m = new THREE.Mesh(lathe(prof, 40), glaze('#e7e0d0', 0.22));
  m.castShadow = m.receiveShadow = true;
  return m;
}

function ochoko() {
  const prof: [number, number][] = [
    [0, 0],
    [1.2, 0],
    [1.4, 0.3],
    [2.3, 2.6],
    [2.2, 2.7],
    [1.2, 0.8],
    [0, 0.7],
  ];
  const m = new THREE.Mesh(lathe(prof, 32), glaze('#3b4a5c', 0.2));
  m.castShadow = m.receiveShadow = true;
  return m;
}

function kozara(withSoy: boolean) {
  const g = new THREE.Group();
  const prof: [number, number][] = [
    [0, 0],
    [2.2, 0],
    [2.4, 0.2],
    [4.0, 0.9],
    [4.2, 1.1],
    [4.0, 1.12],
    [2.3, 0.5],
    [0, 0.45],
  ];
  const d = new THREE.Mesh(lathe(prof, 48), porcelainMaterial({ blue: false, tint: '#eae2d2' }));
  d.castShadow = d.receiveShadow = true;
  g.add(d);
  if (withSoy) {
    const s = new THREE.Mesh(new THREE.CircleGeometry(2.6, 32), soyMaterial());
    s.rotation.x = -Math.PI / 2;
    s.position.y = 0.6;
    g.add(s);
  }
  return g;
}

function plateStack(n: number) {
  const g = new THREE.Group();
  const prof: [number, number][] = [
    [0, 0],
    [5, 0],
    [5.4, 0.2],
    [9, 1.1],
    [9.3, 1.3],
    [9.0, 1.35],
    [5.2, 0.6],
    [0, 0.55],
  ];
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < n; i++) parts.push(lathe(prof, 56).translate((i % 2 ? 0.4 : -0.3) * i * 0.3, i * 0.85, (i % 3) * 0.2));
  const m = new THREE.Mesh(mergeGeometries(parts), porcelainMaterial({ tint: '#ece4d4' }));
  m.castShadow = m.receiveShadow = true;
  g.add(m);
  return g;
}

function oshibori() {
  // a rolled hand towel on a little lacquer tray
  const g = new THREE.Group();
  const tray = new THREE.Mesh(new THREE.BoxGeometry(5, 0.5, 9), lacquerMaterial('#2a0f0b'));
  tray.position.y = 0.25;
  const roll = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.4, 7.6, 24), new THREE.MeshPhysicalMaterial({ color: '#f3efe6', roughness: 0.95, sheen: 1, sheenColor: new THREE.Color('#ffffff') }));
  roll.rotation.x = Math.PI / 2;
  roll.position.y = 1.9;
  for (const m of [tray, roll]) {
    m.castShadow = m.receiveShadow = true;
    g.add(m);
  }
  return g;
}

function hashioki() {
  // a ceramic chopstick rest
  const m = new THREE.Mesh(new THREE.CapsuleGeometry(0.55, 3, 6, 16), glaze('#7a8f6a', 0.25));
  m.rotation.z = Math.PI / 2;
  m.position.y = 0.45;
  m.scale.y = 0.8;
  m.castShadow = m.receiveShadow = true;
  return m;
}

function candle() {
  const g = new THREE.Group();
  const glass = new THREE.Mesh(lathe([[0, 0], [2.2, 0], [2.3, 4.5], [2.1, 4.5], [2, 0.4], [0, 0.4]], 32), new THREE.MeshPhysicalMaterial({ color: '#b0552a', roughness: 0.1, transparent: true, opacity: 0.65, clearcoat: 1 }));
  const flame = new THREE.Mesh(new THREE.SphereGeometry(0.45, 12, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffc070').multiplyScalar(12) }));
  flame.scale.y = 1.8;
  flame.position.y = 2.6;
  g.add(glass, flame);
  return g;
}

export function buildDecor(cfg: CourseCfg): Decor {
  const group = new THREE.Group();
  const steam: THREE.Vector3[] = [];
  const glows: Decor['glows'] = [];
  const p = cfg.plate;
  const rnd = prng(cfg.n * 31 + 7);
  const edge = p.hx + 4.5;
  const place = (o: THREE.Object3D, x: number, z: number, rot = rnd() * 6.28) => {
    o.position.set(x, 0, S(z));
    o.rotation.y = rot;
    group.add(o);
  };
  const flip = cfg.n % 2 === 0 ? -1 : 1;

  const cup = yunomi();
  const cupX = -(edge + 5) * flip;
  place(cup, cupX, p.cz - 6, 0);
  steam.push(new THREE.Vector3(cupX, 5.8, S(p.cz - 6)));
  place(kozara(true), (edge + 4) * flip, p.cz - 9);
  place(tokkuri(), (edge + 9) * flip, p.cz + 16);
  place(ochoko(), (edge + 2) * flip, p.cz + 12);
  place(oshibori(), -(edge + 3) * flip, p.cz - 21, 0.15 * flip);
  place(hashioki(), (edge - 2) * flip, p.cz - 20, 0.1);

  if (cfg.setting === 'table') {
    // her side of the table: a candle, her own dish
    const c = candle();
    place(c, 6, p.cz + 30, 0);
    glows.push({ pos: new THREE.Vector3(6, 2.6, S(p.cz + 30)), color: new THREE.Color('#ffb060'), k: 8, r: 1.4 });
    place(kozara(false), -10, p.cz + 26);
  } else {
    place(plateStack(4 + Math.floor(rnd() * 2)), -(edge + 10) * flip, p.cz + 24);
  }

  // a spare pair of plain chopsticks, unused, on the rest
  const spareMat = woodMaterial({ lo: '#a3794a', hi: '#d8b27c', plank: 0, ring: 3, rough: 0.5, along: 'z' });
  for (let i = 0; i < 2; i++) {
    const s = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.3, 21, 8), spareMat);
    s.rotation.x = Math.PI / 2;
    s.rotation.z = 0.08 * flip;
    s.position.set((edge - 2) * flip + (i - 0.5) * 0.7, 0.9 + i * 0.05, S(p.cz - 20) - 6);
    s.castShadow = true;
    group.add(s);
  }
  return { group, steam, glows };
}
