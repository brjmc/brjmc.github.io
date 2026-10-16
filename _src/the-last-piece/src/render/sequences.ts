// The two scripted endings, as render-only overrides on top of the frozen sim.
//
// Eaten (prototype "runEat", same beats): the tips close and take hold (0-0.4 s), lift you
// clear of the plate (0.4-1.15 s), bring you in toward his mouth (1.15-2.05 s), and then he eats
// (2.05 s on).
//
// Finale: the eye squeezes shut (the lids close, tremble, and the light comes through red),
// he drops his chopsticks, and you celebrate.

import * as THREE from 'three';
import type { Game } from '../game';
import { EATEN_TIME, FINALE_TIME } from '../game';
import { ease } from '../sim/constants';
import type { World } from '../sim/world';
import type { StickPoseR } from './sticks';
import type { SushiOverride } from './sushi';

export interface SeqOut {
  sushi: SushiOverride;
  sticks: StickPoseR[] | null;
  lid: number | null;
  lidRed: number;
  focus: THREE.Vector3 | null; // render-space point to focus on
  look: THREE.Vector3 | null; // render-space point the camera should drift toward
  shake: number;
  chomp: boolean;
}

const clamp01 = (k: number) => Math.max(0, Math.min(1, k));

export class Sequences {
  private start: StickPoseR[] = [
    { tip: new THREE.Vector3(), end: new THREE.Vector3() },
    { tip: new THREE.Vector3(), end: new THREE.Vector3() },
  ];
  private out: StickPoseR[] = [
    { tip: new THREE.Vector3(), end: new THREE.Vector3() },
    { tip: new THREE.Vector3(), end: new THREE.Vector3() },
  ];
  private p0 = new THREE.Vector3();
  private stage = '';
  private chomped = false;

  /** Called each frame; `pose` is the main pair's current pose (render space). */
  update(game: Game, w: World, pose: StickPoseR[], cam: THREE.Camera): SeqOut | null {
    const st = game.stage;
    if (st !== this.stage) {
      this.stage = st;
      this.chomped = false;
      if (st === 'eaten' || st === 'finale') {
        for (let i = 0; i < 2; i++) {
          this.start[i].tip.copy(pose[i].tip);
          this.start[i].end.copy(pose[i].end);
        }
        this.p0.set(w.px, w.plateTop, -w.pz);
      }
    }
    if (st === 'eaten' || (st === 'failed' && w.phase === 'eaten')) return this.eaten(st === 'failed' ? EATEN_TIME : game.stageT, cam);
    if (st === 'finale' || (st === 'cleared' && w.phase === 'won')) return this.finale(st === 'cleared' ? FINALE_TIME : game.stageT, w);
    return null;
  }

  private eaten(t: number, cam: THREE.Camera): SeqOut {
    const P = this.p0.clone();
    let rotZ = 0;
    let pinch = 2.7;
    if (t < 0.4) {
      const k = ease(t / 0.4);
      pinch = 2.7 - 1.15 * k;
      rotZ = Math.sin(t * 30) * 0.05 * k;
    } else if (t < 1.15) {
      const k = ease((t - 0.4) / 0.75);
      pinch = 1.55;
      P.y += 7 * k;
      rotZ = Math.sin(t * 13) * 0.16 * (1 - k * 0.35);
    } else {
      const k = ease(clamp01((t - 1.15) / 0.9));
      pinch = 1.55;
      const lifted = this.p0.clone().add(new THREE.Vector3(0, 7, 0));
      // his mouth: below the eye and a little in front
      const mouth = new THREE.Vector3(0, -6.5, -5).applyMatrix4(cam.matrixWorld);
      mouth.x = cam.position.x;
      P.copy(lifted).lerp(mouth, k);
      rotZ = Math.sin(t * 9) * 0.1 * (1 - k);
    }
    const lift = P.clone().sub(this.p0);
    for (let i = 0; i < 2; i++) {
      const side = i === 0 ? -1 : 1;
      this.out[i].tip.set(P.x + side * pinch, P.y + 1.3, P.z);
      // the hand carries the food: the far ends travel with it, most of the way
      this.out[i].end.copy(this.start[i].end).addScaledVector(lift, 0.85);
    }
    const chomp = t >= 2.05;
    let shake = 0;
    if (chomp && !this.chomped) {
      this.chomped = true;
      shake = 2.5;
    }
    return {
      sushi: { pos: P, rotZ, expr: 'scared', kick: t > 0.4 },
      sticks: this.out,
      lid: chomp ? clamp01((t - 2.05) * 5) : null,
      lidRed: 0.15,
      focus: P,
      look: t > 1.15 ? P : null,
      shake,
      chomp: this.chomped && shake > 0,
    };
  }

  private finale(t: number, w: World): SeqOut {
    // the chopsticks fall from his hand onto the plate and table
    const floorY = w.plateTop;
    for (let i = 0; i < 2; i++) {
      const s = this.start[i];
      const side = i === 0 ? -1 : 1;
      const fall = Math.min(1, t / 0.55);
      const drop = (s.tip.y - floorY - 0.2) * (fall * fall);
      const bounce = t > 0.55 ? Math.abs(Math.sin((t - 0.55) * 14)) * 0.6 * Math.exp(-(t - 0.55) * 5) : 0;
      this.out[i].tip.set(s.tip.x + side * 1.5 * fall, s.tip.y - drop + bounce, s.tip.z + fall * 0.8);
      this.out[i].end.set(s.end.x + side * 3 * fall, s.end.y - 9 * fall, s.end.z + 2 * fall);
    }
    const squeeze = Math.min(0.84, 0.25 + t * 1.6) + Math.sin(t * 38) * 0.02;
    return {
      sushi: { expr: 'happy', hop: Math.abs(Math.sin(t * 8.5)) * 1.1 * Math.max(0, 1 - t / FINALE_TIME) },
      sticks: this.out,
      lid: squeeze,
      lidRed: 1.2,
      focus: null,
      look: null,
      shake: t < 0.1 ? 1.5 : 0,
      chomp: false,
    };
  }
}
