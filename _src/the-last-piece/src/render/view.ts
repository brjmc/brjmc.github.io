// The camera is the diner's eye. It leans sideways with the sim (never turns), pitches down at
// the plate, and its field of view is fitted to the screen so the plate is readable in both
// portrait and landscape. Breathing, tremor, recoil and shake are added here, render-only.

import * as THREE from 'three';
import type { World } from '../sim/world';

export interface Framing {
  vfov: number; // degrees
  /** Extra upward pitch (radians) so there is room above the plate. */
  lift: number;
}

/** Field of view for a screen aspect: fit most of the plate's width, clamp the vertical. */
export function frame(aspect: number, plateHalfW: number, dist: number): Framing {
  const portrait = aspect < 1;
  const need = plateHalfW * (portrait ? 0.62 : 0.74) + 1.2;
  const tanH = need / dist;
  let vHalf = Math.atan(tanH / aspect);
  const lo = (portrait ? 26 : 15) * (Math.PI / 180);
  const hi = 44 * (Math.PI / 180);
  vHalf = Math.min(hi, Math.max(lo, vHalf));
  // portrait has spare height: give most of it to the room above (bokeh), some to the table below
  const lift = portrait ? vHalf * 0.1 : vHalf * 0.14;
  return { vfov: (vHalf * 2 * 180) / Math.PI, lift };
}

export class EyeCam {
  readonly cam: THREE.PerspectiveCamera;
  private fr: Framing = { vfov: 40, lift: 0 };
  aspect = 1;
  /** Render-only offsets. */
  shake = 0;
  private shakeSeed = 0;
  focusDist = 30;

  constructor() {
    this.cam = new THREE.PerspectiveCamera(40, 1, 0.6, 3000);
  }

  resize(aspect: number, w: World) {
    this.aspect = aspect;
    const dist = Math.hypot(w.eyeY - w.plateTop, w.plate.cz - w.eyeZ);
    this.fr = frame(aspect, w.plate.hx, dist);
    this.cam.fov = this.fr.vfov;
    this.cam.aspect = aspect;
    this.cam.updateProjectionMatrix();
  }

  /**
   * Place the camera for this frame.
   * @param a interpolation alpha between sim steps
   * @param t render time (s)
   */
  private lookK = 0;

  update(w: World, a: number, t: number, dt: number, extra: { lurch: number; recoil: number; drunk: number; look: THREE.Vector3 | null }) {
    const eyeX = w.peyeX + (w.eyeX - w.peyeX) * a;
    const pz = w.ppz + (w.pz - w.ppz) * a;
    // breathing and the tremor of a man holding chopsticks over a plate
    const br = Math.sin(t * 1.5) * 0.22 + Math.sin(t * 4.65) * 0.05;
    const trem = Math.sin(t * 9) * (0.02 + w.hits * 0.025) + Math.sin(t * 13.7) * 0.012;
    const sway = extra.drunk * (Math.sin(t * 0.9) * 0.6 + Math.sin(t * 0.37 + 1) * 0.4);
    // recoil: wasabi in the eye throws his head back and up
    const rec = extra.recoil;
    this.shake = Math.max(0, this.shake - dt * 3.2);
    this.shakeSeed += dt * 60;
    const sh = this.shake * this.shake;
    const sx = (Math.sin(this.shakeSeed * 1.7) + Math.sin(this.shakeSeed * 3.1)) * 0.18 * sh;
    const sy = (Math.sin(this.shakeSeed * 2.3) + Math.sin(this.shakeSeed * 4.3)) * 0.14 * sh;

    const x = eyeX + trem + sx + sway * 0.6;
    const y = w.eyeY + br + rec * 2.4 + sy;
    const z = w.eyeZ - rec * 2.2;
    this.cam.position.set(x, y, -z);
    // look down at the plate, partway toward where you are; never yaw (he leans, he doesn't turn)
    const tz = w.plate.cz + (pz - w.plate.cz) * 0.3;
    const ty = w.plateTop + 0.5;
    const dz = tz - z;
    const dy = y - ty;
    let pitch = Math.atan2(dy, dz) - this.fr.lift - rec * 0.1 + sy * 0.01;
    // scripted: he looks at what he's bringing to his mouth
    this.lookK += ((extra.look ? 1 : 0) - this.lookK) * Math.min(1, dt * 3);
    if (extra.look && this.lookK > 0.001) {
      const lp = Math.atan2(y - extra.look.y, -extra.look.z - z);
      pitch += (Math.min(1.2, lp) - pitch) * this.lookK * 0.8;
    }
    const roll = sway * 0.012 + sx * 0.004 + trem * 0.01;
    this.cam.rotation.set(-pitch, 0, roll, 'YXZ');
    this.focusDist = Math.hypot(w.px - x, w.plateTop + 1.4 - y, pz - z);
  }
}
