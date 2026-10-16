// A pair of chopsticks, posed from the sim: two tapered shafts from the tips back toward the
// hand, opening sideways. Render space is sim space with z negated.

import * as THREE from 'three';
import type { Sticks } from '../sim/world';

export const STICK_LEN = 34; // long enough that the top end is always off screen

const tmpA = new THREE.Vector3();
const tmpB = new THREE.Vector3();
const tmpD = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

export interface StickPoseR {
  tip: THREE.Vector3; // render space
  end: THREE.Vector3;
}

/** Interpolated pose of the two sticks in render space. */
export function posePair(s: Sticks, a: number, out: StickPoseR[]) {
  const tx = s.ptx + (s.tx - s.ptx) * a;
  const ty = s.pty + (s.ty - s.pty) * a;
  const tz = s.ptz + (s.tz - s.ptz) * a;
  const sep = s.psep + (s.sep - s.psep) * a;
  const ax = s.pax + (s.ax - s.pax) * a;
  const ay = s.pay + (s.ay - s.pay) * a;
  const az = s.paz + (s.az - s.paz) * a;
  let dx = ax - tx;
  let dy = ay - ty;
  let dz = az - tz;
  const l = Math.hypot(dx, dy, dz) || 1;
  dx /= l;
  dy /= l;
  dz /= l;
  let px = -dz;
  let pz = dx;
  const pl = Math.hypot(px, pz) || 1;
  px /= pl;
  pz /= pl;
  for (let i = 0; i < 2; i++) {
    const side = i === 0 ? -1 : 1;
    const o = out[i];
    o.tip.set(tx + px * side * sep * 0.5, ty, -(tz + pz * side * sep * 0.5));
    o.end.set(tx + dx * STICK_LEN + px * side * 0.6, ty + dy * STICK_LEN + side * 0.5, -(tz + dz * STICK_LEN + pz * side * 0.6));
  }
}

/** Orient a unit-length +Y mesh to run from a to b. */
export function orientBetween(m: THREE.Object3D, a: THREE.Vector3, b: THREE.Vector3) {
  tmpD.subVectors(b, a);
  const len = tmpD.length();
  m.position.copy(a);
  m.quaternion.setFromUnitVectors(UP, tmpD.multiplyScalar(1 / (len || 1)));
  m.scale.set(1, len, 1);
}

export function midpoint(a: THREE.Vector3, b: THREE.Vector3) {
  return tmpA.copy(a).add(tmpB.copy(b)).multiplyScalar(0.5);
}
