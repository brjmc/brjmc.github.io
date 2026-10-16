// The counter and the room beyond it. Everything past the plate is far out of focus, so the
// room is cheap: a few boxes, a painted back wall, glowing lanterns and two silhouettes.

import * as THREE from 'three';
import type { CourseCfg } from '../sim/courses';
import { HEX } from './palette';
import { woodMaterial } from './materials';
import { prng } from './util';

export interface Lantern {
  pos: THREE.Vector3;
  r: number;
  color: THREE.Color;
  k: number;
}

export interface Room {
  group: THREE.Group;
  lanterns: Lantern[];
  /** Animated silhouettes (chef, the date). */
  update(t: number): void;
}

const hdr = (hex: string, k: number) => new THREE.Color(hex).multiplyScalar(k);

function backWallTexture() {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 512;
  const g = c.getContext('2d')!;
  const grad = g.createLinearGradient(0, 0, 0, 512);
  grad.addColorStop(0, '#0e0809');
  grad.addColorStop(0.55, '#24140f');
  grad.addColorStop(1, '#170d0b');
  g.fillStyle = grad;
  g.fillRect(0, 0, 1024, 512);
  const r = prng(41);
  // shelves of bottles, backlit
  for (const y of [150, 250]) {
    g.fillStyle = '#3a2216';
    g.fillRect(0, y, 1024, 8);
    for (let x = 30; x < 1000; x += 18 + r() * 26) {
      const h = 40 + r() * 46;
      const w = 10 + r() * 10;
      const glow = g.createLinearGradient(x, y - h, x + w, y);
      const warm = r() < 0.7;
      glow.addColorStop(0, warm ? 'rgba(255,170,90,0.55)' : 'rgba(170,200,120,0.4)');
      glow.addColorStop(1, 'rgba(60,30,15,0.6)');
      g.fillStyle = glow;
      g.beginPath();
      g.roundRect(x, y - h, w, h, [w / 2, w / 2, 1, 1]);
      g.fill();
    }
  }
  // a noren curtain to the kitchen
  g.fillStyle = '#1b1416';
  for (let i = 0; i < 4; i++) g.fillRect(640 + i * 46, 300, 42, 212);
  g.fillStyle = 'rgba(243,230,207,0.35)';
  g.beginPath();
  g.arc(732, 380, 22, 0, Math.PI * 2);
  g.fill();
  // warm wash where the lanterns hang
  for (const [x, y, rr] of [[180, 90, 220], [520, 60, 260], [880, 110, 200]]) {
    const w = g.createRadialGradient(x, y, 0, x, y, rr);
    w.addColorStop(0, 'rgba(255,170,90,0.28)');
    w.addColorStop(1, 'rgba(255,170,90,0)');
    g.fillStyle = w;
    g.fillRect(0, 0, 1024, 512);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function buildRoom(cfg: CourseCfg): Room {
  const group = new THREE.Group();
  const lanterns: Lantern[] = [];
  const table = cfg.setting === 'table';
  // every small glowing thing in the room goes into one instanced draw
  const glows: { x: number; y: number; z: number; r: number; sy: number; c: THREE.Color }[] = [];
  const glow = (x: number, y: number, z: number, r: number, c: THREE.Color, sy = 1) => glows.push({ x, y, z, r, sy, c });

  // the counter top (render z = -sim z)
  const top = new THREE.Mesh(
    new THREE.PlaneGeometry(320, table ? 160 : 124),
    woodMaterial({ lo: '#2a170d', hi: HEX.tableHi, plank: table ? 40 : 13, ring: table ? 0.22 : 0.55, rough: 0.38, along: table ? 'x' : 'z', clearcoat: 0.5 }),
  );
  top.rotation.x = -Math.PI / 2;
  top.position.set(0, 0, table ? -40 : -6);
  top.receiveShadow = true;
  group.add(top);

  if (!table) {
    // the raised ledge where the chef sets plates, and the neta case on it
    const ledgeMat = woodMaterial({ lo: '#1d1009', hi: '#5b3820', plank: 0, ring: 0.4, rough: 0.5, along: 'x' });
    const ledge = new THREE.Mesh(new THREE.BoxGeometry(320, 9, 18), ledgeMat);
    ledge.position.set(0, 4.5, -71);
    ledge.receiveShadow = true;
    group.add(ledge);
    // the neta case: a low warm glow along the ledge with bright little lamps inside
    const caseLight = new THREE.Mesh(new THREE.BoxGeometry(150, 3, 10), new THREE.MeshBasicMaterial({ color: hdr('#ffc98a', 0.7) }));
    caseLight.position.set(8, 11, -72);
    group.add(caseLight);
    for (let i = 0; i < 7; i++) glow(-58 + i * 20, 14, -72, 1.4, hdr(i % 3 === 1 ? '#ffb46a' : '#ffd29a', 9));
  }

  // the back wall: shelves, bottles, a curtain
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(520, 260), new THREE.MeshBasicMaterial({ map: backWallTexture(), color: hdr('#ffffff', 0.9) }));
  wall.position.set(0, 70, table ? -230 : -190);
  group.add(wall);

  // paper lanterns (drawn as bokeh in the post pass; here, their glowing bodies)
  const lanternAt = (x: number, y: number, z: number, r: number, hex: string, k: number) => {
    glow(x, y, z, r, hdr(hex, k), 1.25);
    lanterns.push({ pos: new THREE.Vector3(x, y, z), r, color: new THREE.Color(hex), k });
  };
  lanternAt(-60, 40, -150, 9, HEX.lantern, 7);
  lanternAt(28, 46, -175, 8, HEX.lantern, 7);
  lanternAt(110, 34, -140, 10, '#ff9a55', 6);
  lanternAt(-150, 30, -125, 7, '#ffc77a', 5);
  lanternAt(190, 50, -200, 9, HEX.lantern, 5);
  // small bright things beyond the counter: bulbs over the case, bottles catching the light,
  // the pass to the kitchen. Out of focus, each becomes a disc of bokeh.
  const br = prng(cfg.n * 7 + 3);
  for (let i = 0; i < 16; i++) {
    const r = 0.9 + br() * 1.6;
    const c = hdr(br() < 0.8 ? '#ffc27a' : '#ffe6c0', 14 + br() * 22);
    glow(-140 + br() * 280, 16 + br() * 26, -(table ? 120 : 95) - br() * 90, r, c);
  }
  const inst = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 16, 10), new THREE.MeshBasicMaterial({ color: '#ffffff' }), glows.length);
  const m4 = new THREE.Matrix4();
  glows.forEach((g, i) => {
    m4.makeScale(g.r, g.r * g.sy, g.r).setPosition(g.x, g.y, g.z);
    inst.setMatrixAt(i, m4);
    inst.setColorAt(i, g.c);
  });
  group.add(inst);

  // somebody behind the counter, or across the table
  const sil = new THREE.Group();
  const dark = new THREE.MeshStandardMaterial({ color: '#160d0b', roughness: 0.9 });
  const skin = new THREE.MeshStandardMaterial({ color: '#4a2a1e', roughness: 0.7 });
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(16, 30, 6, 16), table ? new THREE.MeshStandardMaterial({ color: '#5a1f22', roughness: 0.8 }) : new THREE.MeshStandardMaterial({ color: '#e9e2d4', roughness: 0.9 }));
  torso.position.y = table ? 18 : 20;
  torso.scale.z = 0.6;
  const head = new THREE.Mesh(new THREE.SphereGeometry(10, 20, 14), skin);
  head.position.y = table ? 58 : 62;
  const hair = new THREE.Mesh(new THREE.SphereGeometry(10.8, 20, 14, 0, Math.PI * 2, 0, Math.PI * (table ? 0.75 : 0.45)), dark);
  hair.position.copy(head.position);
  hair.position.y += 1;
  sil.add(torso, head, hair);
  if (table) {
    sil.position.set(-6, 0, -88);
  } else {
    // the chef, in whites, a hachimaki round his head
    const band = new THREE.Mesh(new THREE.TorusGeometry(10.2, 1.2, 8, 24), new THREE.MeshStandardMaterial({ color: '#efe9de' }));
    band.rotation.x = Math.PI / 2;
    band.position.copy(head.position);
    band.position.y += 3;
    sil.add(band);
    sil.position.set(30, 6, -120);
  }
  group.add(sil);

  return {
    group,
    lanterns,
    update(t: number) {
      if (table) {
        sil.position.x = -6 + Math.sin(t * 0.4) * 2;
        head.rotation.z = Math.sin(t * 0.6) * 0.05;
      } else {
        // the chef works: drifts along the counter and back
        sil.position.x = 30 + Math.sin(t * 0.13) * 60;
        sil.rotation.y = Math.sin(t * 0.13 + 1.2) * 0.4;
      }
    },
  };
}
