// Wasabi in the world: dollops on the plate (landing squash, drying out before they expire),
// dabs falling from the tips, dabs held by the tips, and throws in flight (stretched along their
// velocity, spinning). Throws that clip a stick ride on it for a moment before they fall.

import * as THREE from 'three';
import type { World } from '../sim/world';
import { arcAt } from '../sim/throw';
import { pasteMaterial, wasabiGeometry } from './food';

const MAX = 32;

export class WasabiView {
  readonly group = new THREE.Group();
  private inst: THREE.InstancedMesh;
  private flying: THREE.Mesh[] = [];
  private born = new Map<number, number>();
  private m4 = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private e = new THREE.Euler();
  private p = new THREE.Vector3();
  private s = new THREE.Vector3();
  private col = new THREE.Color();
  private pt = { x: 0, y: 0, z: 0 };

  constructor() {
    this.inst = new THREE.InstancedMesh(wasabiGeometry(11, 1.2, 3), pasteMaterial(), MAX);
    this.inst.castShadow = true;
    this.inst.receiveShadow = true;
    this.inst.count = 0;
    this.inst.frustumCulled = false;
    this.group.add(this.inst);
  }

  private put(i: number, x: number, y: number, z: number, sx: number, sy: number, sz: number, rotY: number, dry = 0) {
    this.e.set(0, rotY, 0);
    this.q.setFromEuler(this.e);
    this.p.set(x, y, -z);
    this.s.set(sx, sy, sz);
    this.m4.compose(this.p, this.q, this.s);
    this.inst.setMatrixAt(i, this.m4);
    // drying out: darker and duller toward the end of its life
    this.col.setRGB(1 - dry * 0.45, 1 - dry * 0.3, 1 - dry * 0.55);
    this.inst.setColorAt(i, this.col);
  }

  update(w: World, a: number, t: number) {
    let n = 0;
    const top = w.plateTop;
    // on the plate
    for (const b of w.blobs) {
      if (n >= MAX) break;
      let born = this.born.get(b.id);
      if (born === undefined) this.born.set(b.id, (born = t));
      const age = t - born;
      // landing: squash then settle
      const land = Math.max(0, 1 - age / 0.35);
      const sq = Math.sin(land * Math.PI) * 0.45 * land;
      const dry = Math.max(0, 1 - b.life / 2.2);
      const pulse = dry > 0 ? 1 + Math.sin(t * 18) * 0.06 * dry : 1;
      const r = 0.95 * pulse * (1 - dry * 0.25);
      this.put(n++, b.x, top, b.z, r * (1 + sq), r * (1 - sq) * (1 - dry * 0.35), r * (1 + sq), b.id * 1.7, dry);
    }
    // falling from the tips (or off a stick, or out of a stung hand)
    for (const d of w.drops) {
      if (n >= MAX) break;
      const k = Math.min(1, d.t);
      const x = d.x0 + (d.x1 - d.x0) * k;
      const z = d.z0 + (d.z1 - d.z0) * k;
      const y = d.y0 + (top - d.y0) * k * k;
      const r = 0.7;
      this.put(n++, x, y, z, r * 0.9, r * 1.15, r * 0.9, t * 6);
    }
    // held between the tips, waiting to be fumbled
    for (const s of w.sticks) {
      if (!s.holding || n >= MAX) continue;
      const tx = s.ptx + (s.tx - s.ptx) * a;
      const ty = s.pty + (s.ty - s.pty) * a;
      const tz = s.ptz + (s.tz - s.ptz) * a;
      const wob = Math.sin(t * 7) * 0.05;
      this.put(n++, tx, ty - 0.35, tz, 0.55, 0.62 + wob, 0.55, t);
    }
    this.inst.count = n;
    this.inst.instanceMatrix.needsUpdate = true;
    if (this.inst.instanceColor) this.inst.instanceColor.needsUpdate = true;
    for (const id of this.born.keys()) if (!w.blobs.some((b) => b.id === id)) this.born.delete(id);

    // in flight
    let f = 0;
    for (const th of w.throws) {
      const tt = th.t + a / 120;
      if (th.outcome === 'clip' && tt >= th.blockT) continue; // now a drop
      if (tt > th.arc.T + 0.3) continue;
      while (this.flying.length <= f) {
        const m = new THREE.Mesh(wasabiGeometry(5, 0.6, 3), pasteMaterial());
        m.castShadow = true;
        this.group.add(m);
        this.flying.push(m);
      }
      const m = this.flying[f++];
      m.visible = true;
      const p = arcAt(th.arc, Math.min(tt, th.arc.T + 0.3), this.pt);
      m.position.set(p.x, p.y, -p.z);
      // stretch along the velocity
      const vy = th.arc.vy - th.arc.g * tt;
      const v = new THREE.Vector3(th.arc.vx, vy, -th.arc.vz);
      const sp = v.length();
      v.normalize();
      m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), v);
      m.rotateY(tt * 14);
      const st = 1 + Math.min(0.8, sp / 140);
      m.scale.set(0.5 / Math.sqrt(st), 0.5 * st, 0.5 / Math.sqrt(st));
    }
    for (let i = f; i < this.flying.length; i++) this.flying[i].visible = false;
  }
}
