// Procedural low-poly humanoids with a bone index per vertex. The vertex shader in people.ts
// poses them (walk, crouch, lean, squash, tumble) so the whole crowd is one instanced draw.
//
// Bones: 0 pelvis, 1 torso, 2 head, 3 upper arm L, 4 forearm L, 5 upper arm R, 6 forearm R,
//        7 thigh L, 8 shin L, 9 thigh R, 10 shin R.        (L is +x, forward is +z)
// Parts: 0 coat, 1 legs, 2 shoes, 3 head, 4 hands, 5 eyes (chaser), 6 collar/scarf

import * as THREE from 'three';

export interface Proportions {
  hipX: number;
  hipY: number;
  kneeY: number;
  waistY: number;
  shoulderX: number;
  shoulderY: number;
  elbowY: number;
  wristY: number;
  neckY: number;
  headR: number;
  torsoW: number; // half width at the shoulders
  torsoD: number; // depth scale
  limbR: number;
  armR: number;
  coat: boolean;
  eyes: boolean;
  handLen: number;
}

export const HUMAN: Proportions = {
  hipX: 0.095,
  hipY: 0.9,
  kneeY: 0.48,
  waistY: 1.0,
  shoulderX: 0.2,
  shoulderY: 1.43,
  elbowY: 1.14,
  wristY: 0.87,
  neckY: 1.5,
  headR: 0.126,
  torsoW: 0.21,
  torsoD: 0.62,
  limbR: 0.072,
  armR: 0.052,
  coat: true,
  eyes: false,
  handLen: 0.09,
};

// The chaser: taller, narrow, long-limbed, small head, arms to below the knee.
export const CHASER: Proportions = {
  hipX: 0.085,
  hipY: 1.08,
  kneeY: 0.56,
  waistY: 1.2,
  shoulderX: 0.17,
  shoulderY: 1.66,
  elbowY: 1.18,
  wristY: 0.66,
  neckY: 1.76,
  headR: 0.1,
  torsoW: 0.16,
  torsoD: 0.55,
  limbR: 0.055,
  armR: 0.04,
  coat: true,
  eyes: true,
  handLen: 0.2,
};

interface Out {
  p: number[];
  n: number[];
  bone: number[];
  part: number[];
  skirt: number[];
}

function addGeom(out: Out, g: THREE.BufferGeometry, bone: number, part: number, skirt = 0) {
  const ng = g.index ? g.toNonIndexed() : g;
  ng.computeVertexNormals(); // flat: every face has its own vertices
  const pos = ng.getAttribute('position');
  const nor = ng.getAttribute('normal');
  for (let i = 0; i < pos.count; i++) {
    out.p.push(pos.getX(i), pos.getY(i), pos.getZ(i));
    out.n.push(nor.getX(i), nor.getY(i), nor.getZ(i));
    out.bone.push(bone);
    out.part.push(part);
    // skirt flag only on the bottom ring of the coat skirt
    out.skirt.push(skirt && pos.getY(i) < 0.9 ? 1 : 0);
  }
}

/** Tapered prism between two points (a, b) with radii ra, rb, scaled in depth by d. */
function limb(a: THREE.Vector3, b: THREE.Vector3, ra: number, rb: number, sides = 5, d = 1) {
  const len = a.distanceTo(b);
  const g = new THREE.CylinderGeometry(rb, ra, len, sides, 1, false);
  g.scale(1, 1, d);
  const mid = a.clone().add(b).multiplyScalar(0.5);
  const dir = b.clone().sub(a).normalize();
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
  g.applyQuaternion(q);
  g.translate(mid.x, mid.y, mid.z);
  return g;
}

export function buildFigure(pr: Proportions): THREE.InstancedBufferGeometry {
  const o: Out = { p: [], n: [], bone: [], part: [], skirt: [] };
  const V = (x: number, y: number, z = 0) => new THREE.Vector3(x, y, z);

  for (const s of [1, -1]) {
    const thigh = s > 0 ? 7 : 9;
    const shin = s > 0 ? 8 : 10;
    const hx = s * pr.hipX;
    addGeom(o, limb(V(hx, pr.hipY + 0.04), V(hx, pr.kneeY), pr.limbR * 1.2, pr.limbR), thigh, 1);
    addGeom(o, limb(V(hx, pr.kneeY), V(hx, 0.08), pr.limbR * 0.95, pr.limbR * 0.75), shin, 1);
    const shoe = new THREE.BoxGeometry(0.1, 0.08, 0.25);
    shoe.translate(hx, 0.04, 0.05);
    addGeom(o, shoe, shin, 2);

    const ua = s > 0 ? 3 : 5;
    const fa = s > 0 ? 4 : 6;
    const sx = s * pr.shoulderX;
    addGeom(o, limb(V(sx, pr.shoulderY), V(sx + s * 0.02, pr.elbowY), pr.armR * 1.15, pr.armR), ua, 0);
    addGeom(o, limb(V(sx + s * 0.02, pr.elbowY), V(sx + s * 0.025, pr.wristY), pr.armR, pr.armR * 0.85), fa, 0);
    const hand = new THREE.BoxGeometry(0.05, pr.handLen, 0.08);
    hand.translate(sx + s * 0.025, pr.wristY - pr.handLen / 2, 0.0);
    addGeom(o, hand, fa, 4);
  }

  // pelvis and coat skirt
  const pelvis = new THREE.BoxGeometry(pr.hipX * 2 + 0.14, 0.18, 0.21);
  pelvis.translate(0, pr.hipY + 0.04, 0);
  addGeom(o, pelvis, 0, 1);
  if (pr.coat) {
    const skirt = new THREE.CylinderGeometry(pr.torsoW * 0.88, pr.torsoW * 0.98, pr.waistY - 0.6, 6, 1, true);
    skirt.scale(1, 1, pr.torsoD * 1.15);
    skirt.translate(0, (pr.waistY + 0.6) / 2 + 0.02, 0);
    addGeom(o, skirt, 0, 0, 1);
  }

  // torso: wider at the shoulders, flattened front to back
  const torso = new THREE.CylinderGeometry(pr.torsoW, pr.torsoW * 0.78, pr.shoulderY - pr.waistY + 0.08, 6, 1);
  torso.scale(1, 1, pr.torsoD);
  torso.translate(0, (pr.shoulderY + pr.waistY) / 2 + 0.02, 0);
  addGeom(o, torso, 1, 0);
  // collar / scarf
  const collar = new THREE.CylinderGeometry(0.075, pr.torsoW * 0.62, 0.09, 6, 1);
  collar.scale(1, 1, 0.8);
  collar.translate(0, pr.shoulderY + 0.06, 0);
  addGeom(o, collar, 1, 6);

  // head
  const neck = limb(V(0, pr.shoulderY + 0.02), V(0, pr.neckY + 0.04), 0.045, 0.04);
  addGeom(o, neck, 2, 4);
  const head = new THREE.IcosahedronGeometry(pr.headR, 1);
  head.scale(0.92, 1.08, 1.0);
  head.translate(0, pr.neckY + pr.headR * 0.95, 0.0);
  addGeom(o, head, 2, 3);
  if (pr.eyes) {
    for (const s of [1, -1]) {
      const e = new THREE.BoxGeometry(0.034, 0.016, 0.02);
      e.translate(s * 0.036, pr.neckY + pr.headR * 1.05, pr.headR * 0.92);
      addGeom(o, e, 2, 5);
    }
  }

  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(o.p, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(o.n, 3));
  g.setAttribute('aBone', new THREE.Float32BufferAttribute(o.bone, 1));
  g.setAttribute('aPart', new THREE.Float32BufferAttribute(o.part, 1));
  g.setAttribute('aSkirt', new THREE.Float32BufferAttribute(o.skirt, 1));
  return g;
}
