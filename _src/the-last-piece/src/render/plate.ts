// The plate for a course (five kinds), what's on it (soy dish, soy, gari, daikon, wasabi
// mound) and the leftovers of the meal. Render space: sim x/y, z negated.

import * as THREE from 'three';
import type { CourseCfg } from '../sim/courses';
import type { World } from '../sim/world';
import { HEX } from './palette';
import { porcelainMaterial, slateMaterial, soyMaterial, woodMaterial } from './materials';
import { lathe, prng, profileSolid } from './util';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { pasteMaterial, wasabiGeometry } from './food';

export interface PlateView {
  group: THREE.Group;
  /** The wasabi mound meshes (scaled by charge each frame). */
  mounds: THREE.Mesh[];
  update(w: World, t: number): void;
}

const S = (z: number) => -z;

function plateMesh(cfg: CourseCfg): THREE.Object3D {
  const p = cfg.plate;
  const T = p.top;
  const g = new THREE.Group();
  if (p.kind === 'porcelain' || p.kind === 'sometsuke') {
    const W = p.rim;
    const prof: [number, number][] = [
      [0, 0.04],
      [0.03, T * 0.6],
      [0.12, T + 0.48],
      [0.32, T + 0.62],
      [0.62, T + 0.56],
      [W * 0.72, T + 0.26],
      [W, T + 0.02],
      [W + 0.8, T],
    ];
    const geo = profileSolid(p.hx, p.hz, p.r, prof, p.kind === 'sometsuke' ? 220 : 200);
    const m = new THREE.Mesh(geo, porcelainMaterial({ blue: p.kind === 'sometsuke' }));
    m.receiveShadow = true;
    m.castShadow = true;
    g.add(m);
  } else if (p.kind === 'slate') {
    const prof: [number, number][] = [
      [0, 0.02],
      [0.05, T - 0.15],
      [0.22, T],
      [0.5, T],
    ];
    const geo = profileSolid(p.hx, p.hz, p.r, prof, 260);
    // chip the edge: push outer rings in by a noisy amount
    const pos = geo.getAttribute('position') as THREE.BufferAttribute;
    const rnd = prng(17);
    const n = 260;
    const chips = Array.from({ length: n }, () => 0);
    for (let i = 0; i < n; i++) chips[i] = rnd();
    for (let ring = 0; ring < 3; ring++)
      for (let i = 0; i < n; i++) {
        const j = ring * n + i;
        const a = (chips[i] * 0.6 + chips[(i + 1) % n] * 0.4) * 0.35 + Math.sin(i * 0.31) * 0.08;
        const x = pos.getX(j);
        const z = pos.getZ(j);
        const l = Math.hypot(x, z) || 1;
        pos.setX(j, x - (x / l) * a);
        pos.setZ(j, z - (z / l) * a);
      }
    geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, slateMaterial());
    m.receiveShadow = true;
    m.castShadow = true;
    g.add(m);
  } else {
    // wooden boards: geta (on two feet) and a thick hinoki board
    const geta = p.kind === 'geta';
    const base = geta ? 0.9 : 0;
    const prof: [number, number][] = [
      [0, base],
      [0.04, T - 0.12],
      [0.14, T],
      [0.4, T],
    ];
    const mat = woodMaterial({ lo: '#c49a66', hi: HEX.hinoki, plank: 0, ring: 0.8, rough: 0.55, along: 'x', seam: 0 });
    const m = new THREE.Mesh(profileSolid(p.hx, p.hz, p.r, prof, 140), mat);
    m.receiveShadow = true;
    m.castShadow = true;
    g.add(m);
    if (geta) {
      for (const sx of [-1, 1]) {
        const foot = new THREE.Mesh(new THREE.BoxGeometry(2.2, base, p.hz * 1.7), mat);
        foot.position.set(sx * p.hx * 0.62, base / 2, 0);
        foot.castShadow = foot.receiveShadow = true;
        g.add(foot);
      }
    }
  }
  g.position.set(0, 0, S(p.cz));
  return g;
}

// --- the things on the plate --------------------------------------------------------------

function soyDish(r: number, top: number) {
  const g = new THREE.Group();
  const prof: [number, number][] = [
    [0, 0],
    [r * 0.55, 0],
    [r * 0.62, 0.12],
    [r * 0.95, 0.75],
    [r, 0.95],
    [r * 0.93, 1.0],
    [r * 0.86, 0.62],
    [r * 0.5, 0.28],
    [0, 0.26],
  ];
  const dish = new THREE.Mesh(lathe(prof, 48), porcelainMaterial({ tint: '#e9dfcd', speckle: 1.4 }));
  dish.castShadow = dish.receiveShadow = true;
  const soy = new THREE.Mesh(new THREE.CircleGeometry(r * 0.72, 40), soyMaterial());
  soy.rotation.x = -Math.PI / 2;
  soy.position.y = 0.5;
  g.add(dish, soy);
  g.position.y = top;
  return g;
}

function puddle(rx: number, rz: number, rot: number, seed: number) {
  // an irregular spill: a noisy outline, very slightly domed
  const rnd = prng(seed);
  const n = 48;
  const ph = [rnd() * 6, rnd() * 6, rnd() * 6];
  const shape = new THREE.Shape();
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI * 2;
    const k = 1 + 0.12 * Math.sin(a * 3 + ph[0]) + 0.07 * Math.sin(a * 5 + ph[1]) + 0.05 * Math.sin(a * 9 + ph[2]);
    const x = Math.cos(a) * rx * k;
    const y = Math.sin(a) * rz * k;
    if (i === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  }
  const geo = new THREE.ShapeGeometry(shape, 24);
  const pos = geo.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i) / rx;
    const y = pos.getY(i) / rz;
    pos.setZ(i, 0.06 * Math.max(0, 1 - (x * x + y * y)));
  }
  geo.computeVertexNormals();
  const m = new THREE.Mesh(geo, soyMaterial());
  m.rotation.x = -Math.PI / 2;
  m.rotation.z = rot;
  m.receiveShadow = true;
  // a couple of satellite drops
  const g = new THREE.Group();
  g.add(m);
  for (let i = 0; i < 3; i++) {
    const a = rnd() * Math.PI * 2;
    const d = new THREE.Mesh(new THREE.CircleGeometry(0.15 + rnd() * 0.25, 16), m.material);
    d.rotation.x = -Math.PI / 2;
    d.position.set(Math.cos(a) * rx * (1.3 + rnd() * 0.4), 0.01, Math.sin(a) * rz * (1.3 + rnd() * 0.4));
    g.add(d);
  }
  return g;
}

function gariSlice(rnd: () => number) {
  // one thin, curled, irregular slice of pickled ginger
  const n = 22;
  const shape = new THREE.Shape();
  const ph = rnd() * 6;
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI * 2;
    const k = 1 + 0.12 * Math.sin(a * 3 + ph) + 0.06 * Math.sin(a * 7 + ph * 2);
    const x = Math.cos(a) * 1.25 * k;
    const y = Math.sin(a) * 0.85 * k;
    if (i === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  }
  const g = new THREE.ShapeGeometry(shape, 6);
  const p = g.getAttribute('position') as THREE.BufferAttribute;
  const curl = 0.25 + rnd() * 0.35;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const y = p.getY(i);
    p.setZ(i, curl * x * x + 0.08 * y * y);
  }
  g.computeVertexNormals();
  return g;
}

function gariHeap(r: number, seed: number) {
  // thin translucent pink slices, curled, leaning on each other in a loose heap
  const rnd = prng(seed);
  const g = new THREE.Group();
  const mat = new THREE.MeshPhysicalMaterial({
    color: '#f6cdd2',
    roughness: 0.22,
    clearcoat: 0.7,
    clearcoatRoughness: 0.15,
    sheen: 0.6,
    sheenColor: new THREE.Color('#fff2f4'),
    emissive: new THREE.Color('#6a3038'),
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.93,
  });
  const sc = r / 1.8;
  const parts: THREE.BufferGeometry[] = [];
  const o = new THREE.Object3D();
  for (let i = 0; i < 12; i++) {
    const geo = gariSlice(rnd);
    const a = rnd() * Math.PI * 2;
    const d = rnd() * r * 0.4;
    o.scale.setScalar(sc * (0.8 + rnd() * 0.35));
    o.position.set(Math.cos(a) * d, 0.15 + i * 0.09 * sc, Math.sin(a) * d);
    // mostly flat, tilted up at the edges of the heap
    o.rotation.set(-Math.PI / 2 + (rnd() - 0.5) * 0.9, rnd() * 6.28, (rnd() - 0.5) * 0.7);
    o.updateMatrix();
    geo.applyMatrix4(o.matrix);
    parts.push(geo);
  }
  const m = new THREE.Mesh(mergeGeometries(parts), mat);
  m.castShadow = m.receiveShadow = true;
  g.add(m);
  return g;
}

function daikonHeap(rx: number, rz: number, seed: number) {
  // tsuma: a loose heap of fine white shreds
  const rnd = prng(seed);
  const n = 1700;
  const geo = new THREE.CylinderGeometry(0.045, 0.045, 1, 4, 1);
  const mat = new THREE.MeshPhysicalMaterial({ color: '#fdfcf7', roughness: 0.25, clearcoat: 0.8, clearcoatRoughness: 0.15, sheen: 1, sheenColor: new THREE.Color('#ffffff'), emissive: '#8a867c' });
  const inst = new THREE.InstancedMesh(geo, mat, n);
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const p = new THREE.Vector3();
  const s = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    // dome-shaped distribution
    const a = rnd() * Math.PI * 2;
    const d = Math.sqrt(rnd());
    const h = Math.sqrt(Math.max(0, 1 - d * d)) * 2.2 * (0.6 + rnd() * 0.4);
    p.set(Math.cos(a) * d * rx, h * Math.sqrt(rnd()), Math.sin(a) * d * rz);
    e.set(Math.PI / 2 + (rnd() - 0.5) * 0.7, rnd() * Math.PI, (rnd() - 0.5) * 0.7);
    q.setFromEuler(e);
    s.set(1, 2.8 + rnd() * 2.2, 1);
    m4.compose(p, q, s);
    inst.setMatrixAt(i, m4);
  }
  inst.castShadow = inst.receiveShadow = true;
  return inst;
}

// --- leftovers: what was cleared off this plate before you ----------------------------------

function decalAtlas() {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 128;
  const g = c.getContext('2d')!;
  // 0: oil ring where a piece used to sit
  g.strokeStyle = 'rgba(150,120,80,0.55)';
  g.lineWidth = 5;
  g.beginPath();
  g.ellipse(64, 64, 50, 34, 0, 0, Math.PI * 2);
  g.stroke();
  g.fillStyle = 'rgba(170,140,90,0.18)';
  g.fill();
  // 1: dried soy splash
  const rnd = prng(5);
  g.fillStyle = 'rgba(70,30,10,0.75)';
  for (let i = 0; i < 9; i++) {
    g.beginPath();
    g.ellipse(192 + (rnd() - 0.5) * 70, 64 + (rnd() - 0.5) * 40, 4 + rnd() * 16, 3 + rnd() * 8, rnd() * 3, 0, Math.PI * 2);
    g.fill();
  }
  // 2: a smear
  const sm = g.createLinearGradient(260, 64, 380, 64);
  sm.addColorStop(0, 'rgba(90,45,15,0)');
  sm.addColorStop(0.3, 'rgba(90,45,15,0.5)');
  sm.addColorStop(1, 'rgba(90,45,15,0)');
  g.fillStyle = sm;
  g.beginPath();
  g.ellipse(320, 64, 58, 12, -0.15, 0, Math.PI * 2);
  g.fill();
  // 3: wasabi streak
  g.fillStyle = 'rgba(120,170,60,0.55)';
  g.beginPath();
  g.ellipse(448, 64, 30, 9, 0.3, 0, Math.PI * 2);
  g.fill();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function litter(cfg: CourseCfg, w: World, seed: number) {
  const g = new THREE.Group();
  if (cfg.litter <= 0) return g;
  const rnd = prng(seed);
  const p = cfg.plate;
  const T = p.top;
  const atlas = decalAtlas();
  const decalMat = (cell: number) => {
    const t = atlas.clone();
    t.repeat.set(0.25, 1);
    t.offset.set(cell * 0.25, 0);
    t.needsUpdate = true;
    return new THREE.MeshStandardMaterial({ map: t, transparent: true, depthWrite: false, roughness: 0.3, polygonOffset: true, polygonOffsetFactor: -2 });
  };
  const decalM = decalMat(0);
  decalM.map!.repeat.set(1, 1);
  decalM.map!.offset.set(0, 0);
  const decals: THREE.BufferGeometry[] = [];
  const spot = (margin: number) => {
    // somewhere on the floor of the plate, not under a prop
    for (let i = 0; i < 20; i++) {
      const x = (rnd() * 2 - 1) * (p.hx - p.rim - margin);
      const z = (rnd() * 2 - 1) * (p.hz - p.rim - margin);
      if (p.kind === 'sometsuke' && Math.hypot(x, z) > p.hx - p.rim - margin) continue;
      if (w.walls.some((wl) => Math.hypot(x - wl.x, p.cz + z - wl.z) < wl.r + 1)) continue;
      return [x, z];
    }
    return [0, 0];
  };
  const n = Math.round(4 + cfg.litter * 7);
  for (let i = 0; i < n; i++) {
    const kind = i < 3 ? 0 : Math.floor(rnd() * 4);
    const [x, z] = spot(2);
    const size = kind === 0 ? 3.2 + rnd() * 1.4 : 1.6 + rnd() * 2;
    const q = new THREE.PlaneGeometry(size, size);
    const uv = q.getAttribute('uv') as THREE.BufferAttribute;
    for (let k = 0; k < uv.count; k++) uv.setX(k, (uv.getX(k) + kind) * 0.25);
    q.rotateZ(rnd() * Math.PI);
    q.rotateX(-Math.PI / 2);
    q.translate(x, T + 0.012, S(p.cz + z));
    decals.push(q);
  }
  if (decals.length) g.add(new THREE.Mesh(mergeGeometries(decals), decalM));
  // stray rice grains and sesame
  const grains = Math.round(6 + cfg.litter * 16);
  const gm = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 8, 6), new THREE.MeshPhysicalMaterial({ color: HEX.rice, roughness: 0.5, sheen: 0.4 }), grains);
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  for (let i = 0; i < grains; i++) {
    const [x, z] = spot(1.2);
    const sesame = i % 4 === 3;
    q.setFromEuler(new THREE.Euler(0, rnd() * Math.PI, 0));
    m4.compose(new THREE.Vector3(x, T + 0.1, S(p.cz + z)), q, sesame ? new THREE.Vector3(0.14, 0.05, 0.09) : new THREE.Vector3(0.32, 0.13, 0.14));
    gm.setMatrixAt(i, m4);
    if (sesame) gm.setColorAt(i, new THREE.Color('#3a2a1c'));
    else gm.setColorAt(i, new THREE.Color(HEX.rice));
  }
  gm.castShadow = true;
  gm.receiveShadow = true;
  g.add(gm);
  return g;
}

export function buildPlate(cfg: CourseCfg, w: World, seed: number): PlateView {
  const group = new THREE.Group();
  group.add(plateMesh(cfg));
  const T = cfg.plate.top;
  const mounds: THREE.Mesh[] = [];
  let k = 0;
  for (const pr of cfg.props) {
    const z = S(cfg.plate.cz + pr.z);
    k++;
    if (pr.kind === 'dish') {
      const d = soyDish(pr.r, T);
      d.position.set(pr.x, T, z);
      group.add(d);
    } else if (pr.kind === 'puddle') {
      const pd = puddle(pr.rx, pr.rz, pr.rot, seed + k);
      pd.position.set(pr.x, T + 0.012, z);
      group.add(pd);
    } else if (pr.kind === 'gari') {
      const h = gariHeap(pr.r, seed + k * 13);
      h.position.set(pr.x, T, z);
      group.add(h);
    } else if (pr.kind === 'daikon') {
      const h = daikonHeap(pr.rx, pr.rz, seed + k * 7);
      h.position.set(pr.x, T, z);
      group.add(h);
    } else if (pr.kind === 'mound') {
      const m = new THREE.Mesh(wasabiGeometry(31 + k, 1.25), pasteMaterial());
      m.scale.set(pr.r, pr.r * 0.9, pr.r);
      m.position.set(pr.x, T, z);
      m.castShadow = m.receiveShadow = true;
      group.add(m);
      mounds.push(m);
    }
  }
  group.add(litter(cfg, w, seed * 3 + 1));
  return {
    group,
    mounds,
    update(wd: World, t: number) {
      wd.mounds.forEach((m, i) => {
        const mesh = mounds[i];
        if (!mesh) return;
        // scooped down to a flat smear, then built back up
        const c = m.charge;
        const r = cfg.props.filter((p) => p.kind === 'mound')[i];
        const rr = r && r.kind === 'mound' ? r.r : 1.5;
        const s = 0.45 + 0.55 * c;
        mesh.scale.set(rr * (0.85 + 0.15 * c), rr * 0.9 * s + Math.sin(t * 6) * 0.02 * c, rr * (0.85 + 0.15 * c));
      });
    },
  };
}
