// The throw is a lob straight back at the diner's face, so it arrives at its own x. Whether it
// gets there is decided at release, against the chopsticks as they are at that moment ("what the
// lane looked like when you let go is what counts"). The same test drives the "shot is on" read.

import type { Tuning } from './constants';

export interface V3 {
  x: number;
  y: number;
  z: number;
}

export interface Arc {
  x0: number;
  y0: number;
  z0: number;
  vx: number;
  vy: number;
  vz: number;
  g: number;
  T: number;
}

/** Where the two chopsticks are: the point between the tips, how far apart the tips are, and the
 * point the sticks lead back to (the hand). */
export interface StickPose {
  tx: number;
  ty: number;
  tz: number;
  sep: number;
  ax: number;
  ay: number;
  az: number;
}

export interface Segment {
  x0: number;
  y0: number;
  z0: number;
  x1: number;
  y1: number;
  z1: number;
  r0: number; // radius at the tip
  r1: number; // radius at the far end
}

export const STICK_TEST_LEN = 24;

export function makeArc(t: Tuning, from: V3, to: V3): Arc {
  const dz = to.z - from.z;
  const dxz = Math.hypot(to.x - from.x, dz);
  const T = Math.min(t.throwMaxT, Math.max(t.throwMinT, dxz / t.throwSpeed));
  const vy = (to.y - from.y + 0.5 * t.throwG * T * T) / T;
  return { x0: from.x, y0: from.y, z0: from.z, vx: (to.x - from.x) / T, vy, vz: dz / T, g: t.throwG, T };
}

export function arcAt(a: Arc, t: number, out: V3 = { x: 0, y: 0, z: 0 }): V3 {
  out.x = a.x0 + a.vx * t;
  out.y = a.y0 + a.vy * t - 0.5 * a.g * t * t;
  out.z = a.z0 + a.vz * t;
  return out;
}

/** The two shafts of a pair of chopsticks, as tapered segments from each tip back toward the hand. */
export function stickSegments(p: StickPose, out: Segment[] = [mkSeg(), mkSeg()]): Segment[] {
  let dx = p.ax - p.tx;
  let dy = p.ay - p.ty;
  let dz = p.az - p.tz;
  const l = Math.hypot(dx, dy, dz) || 1;
  dx /= l;
  dy /= l;
  dz /= l;
  // the tips open sideways: horizontal and perpendicular to the sticks' ground direction
  let px = -dz;
  let pz = dx;
  const pl = Math.hypot(px, pz) || 1;
  px /= pl;
  pz /= pl;
  for (let i = 0; i < 2; i++) {
    const side = i === 0 ? -1 : 1;
    const s = out[i];
    s.x0 = p.tx + px * side * p.sep * 0.5;
    s.y0 = p.ty;
    s.z0 = p.tz + pz * side * p.sep * 0.5;
    // at the hand the two sticks sit about a finger apart, one above the other
    s.x1 = p.tx + dx * STICK_TEST_LEN + px * side * 0.55;
    s.y1 = p.ty + dy * STICK_TEST_LEN + side * 0.45;
    s.z1 = p.tz + dz * STICK_TEST_LEN + pz * side * 0.55;
    s.r0 = 0.14;
    s.r1 = 0.4;
  }
  return out;
}

function mkSeg(): Segment {
  return { x0: 0, y0: 0, z0: 0, x1: 0, y1: 0, z1: 0, r0: 0, r1: 0 };
}

/** Distance from point q to segment s, and the parameter along it (0 = tip). */
export function segDist(s: Segment, qx: number, qy: number, qz: number): { d: number; u: number } {
  const ex = s.x1 - s.x0;
  const ey = s.y1 - s.y0;
  const ez = s.z1 - s.z0;
  const ll = ex * ex + ey * ey + ez * ez || 1;
  let u = ((qx - s.x0) * ex + (qy - s.y0) * ey + (qz - s.z0) * ez) / ll;
  u = u < 0 ? 0 : u > 1 ? 1 : u;
  const cx = s.x0 + ex * u - qx;
  const cy = s.y0 + ey * u - qy;
  const cz = s.z0 + ez * u - qz;
  return { d: Math.hypot(cx, cy, cz), u };
}

export interface Block {
  t: number; // time along the arc of first contact
  pose: number; // index of the pair of chopsticks
  stick: number; // 0 = left, 1 = right
  u: number; // parameter along that stick
  x: number;
  y: number;
  z: number;
}

const SAMPLES = 36;
const segScratch: Segment[][] = [];
const pt: V3 = { x: 0, y: 0, z: 0 };

/** First contact between the arc and any of the sticks, or null if the way is clear. */
export function firstBlock(tune: Tuning, a: Arc, poses: StickPose[]): Block | null {
  for (let p = 0; p < poses.length; p++) {
    segScratch[p] = stickSegments(poses[p], segScratch[p]);
  }
  for (let i = 1; i <= SAMPLES; i++) {
    const t = (a.T * i) / SAMPLES;
    arcAt(a, t, pt);
    for (let p = 0; p < poses.length; p++) {
      for (let k = 0; k < 2; k++) {
        const s = segScratch[p][k];
        const { d, u } = segDist(s, pt.x, pt.y, pt.z);
        const r = s.r0 + (s.r1 - s.r0) * u;
        if (d < r + tune.blobR) return { t, pose: p, stick: k, u, x: pt.x, y: pt.y, z: pt.z };
      }
    }
  }
  return null;
}
