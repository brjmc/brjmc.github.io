// Lighting: a small procedural room rendered once into a PMREM environment (reflections and
// fill for every PBR surface), a warm pendant spot over the plate with a soft shadow (its
// shadows of the chopstick tips are part of the telegraph), and a dim rim from the counter.

import * as THREE from 'three';
import { HEX } from './palette';

export interface Lights {
  key: THREE.SpotLight;
  rim: THREE.DirectionalLight;
  fill: THREE.DirectionalLight;
  envMap: THREE.Texture;
  dispose(): void;
}

const hdr = (hex: string, k: number) => new THREE.Color(hex).multiplyScalar(k);

/** Build the environment scene around the plate (render space, plate centre near (0, 0, -33)). */
function envScene() {
  const s = new THREE.Scene();
  s.background = new THREE.Color(HEX.room0).multiplyScalar(0.6);
  const box = new THREE.Mesh(
    new THREE.BoxGeometry(500, 220, 500),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(HEX.room1).multiplyScalar(0.5), side: THREE.BackSide }),
  );
  box.position.y = 80;
  s.add(box);
  // the counter top around us, warm and dark: what the plate's sides pick up
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(500, 500), new THREE.MeshBasicMaterial({ color: hdr(HEX.table, 0.35) }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -1;
  s.add(floor);
  const glow = (hex: string, k: number, r: number, x: number, y: number, z: number) => {
    const m = new THREE.Mesh(new THREE.SphereGeometry(r, 16, 12), new THREE.MeshBasicMaterial({ color: hdr(hex, k) }));
    m.position.set(x, y, z);
    s.add(m);
  };
  // the pendant straight above: the big highlight on glaze, lacquer and wet fish
  const pend = new THREE.Mesh(new THREE.CircleGeometry(16, 32), new THREE.MeshBasicMaterial({ color: hdr(HEX.tungsten, 9) }));
  pend.rotation.x = Math.PI / 2;
  pend.position.set(0, 70, 0);
  s.add(pend);
  // paper lanterns beyond the counter, and one behind the diner
  glow(HEX.lantern, 5, 11, -70, 70, -150);
  glow(HEX.lantern, 5, 9, 35, 78, -170);
  glow(HEX.lantern, 4, 12, 130, 60, -120);
  glow(HEX.lantern, 3, 10, -150, 55, 60);
  glow('#ff8a4a', 3, 8, 90, 40, 120);
  // the neta case on the counter: a long low strip of whiter light
  const strip = new THREE.Mesh(new THREE.BoxGeometry(160, 6, 4), new THREE.MeshBasicMaterial({ color: hdr('#ffe9cc', 4) }));
  strip.position.set(0, 18, -80);
  s.add(strip);
  return s;
}

export function makeLights(gl: THREE.WebGLRenderer, scene: THREE.Scene, shadowSize: number): Lights {
  const pmrem = new THREE.PMREMGenerator(gl);
  const env = envScene();
  const rt = pmrem.fromScene(env, 0.02, 0.1, 1000);
  env.traverse((o) => {
    const m = o as THREE.Mesh;
    m.geometry?.dispose();
    (m.material as THREE.Material | undefined)?.dispose?.();
  });
  pmrem.dispose();
  scene.environment = rt.texture;
  scene.environmentIntensity = 0.55;

  const key = new THREE.SpotLight(HEX.tungsten, 5200, 0, 0.46, 0.7, 2);
  key.position.set(1.5, 62, -31);
  key.target.position.set(0, 0, -33);
  key.castShadow = true;
  key.shadow.mapSize.set(shadowSize, shadowSize);
  key.shadow.camera.near = 35;
  key.shadow.camera.far = 75;
  key.shadow.bias = -0.0004;
  key.shadow.normalBias = 0.02;
  key.shadow.radius = 4;
  scene.add(key, key.target);

  // rim: the counter light behind the plate, low and warm, so silhouettes lift off the dark
  const rim = new THREE.DirectionalLight('#ffc48a', 0.7);
  rim.position.set(-20, 30, -120);
  rim.target.position.set(0, 0, -33);
  scene.add(rim, rim.target);

  // fill: the room behind the diner (and the white of his shirt) bouncing back onto the front of
  // the food. Without it the rice face, lit from straight above, goes muddy.
  const fill = new THREE.DirectionalLight('#ffe3c4', 1.15);
  fill.position.set(4, 26, 30);
  fill.target.position.set(0, 0, -33);
  scene.add(fill, fill.target);

  return {
    key,
    rim,
    fill,
    envMap: rt.texture,
    dispose() {
      rt.dispose();
    },
  };
}
