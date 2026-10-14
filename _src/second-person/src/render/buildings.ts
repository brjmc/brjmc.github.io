// Buildings: one instanced box per building. Windows, shopfronts and sign boards come from
// the facade shader (world-space grid + hashes) and one canvas sign atlas.

import * as THREE from 'three';
import { FAR_X1, WALK_X0 } from '../sim/constants';
import { blocksInRange, type Block } from '../sim/props';
import { LIGHTING_GLSL, withShared } from './lighting';
import { FACADES, P } from './palette';
import { SIGN_ROWS, makeSignAtlas } from './signs';

const MAX = 72;

const vert = /* glsl */ `
attribute vec4 iBox;  // x0, x1, rz0, rz1 (render space)
attribute vec4 iMeta; // height, facade index, seed, side (0 near, 1 far, 2 backdrop)
varying vec3 vP;
varying vec3 vN;
flat varying vec4 vBox;
flat varying vec4 vMeta;
void main() {
  vec3 p = position + 0.5;
  vec3 wp = vec3(mix(iBox.x, iBox.y, p.x), p.y * iMeta.x, mix(iBox.z, iBox.w, p.z));
  vP = wp;
  vN = normal;
  vBox = iBox;
  vMeta = iMeta;
  gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
}
`;

const frag = /* glsl */ `
${LIGHTING_GLSL}
uniform vec3 uFacade[5];
uniform vec3 uColdWin;
uniform vec3 uDust;
uniform vec3 uHazeLow;
uniform sampler2D uSigns;
varying vec3 vP;
varying vec3 vN;
flat varying vec4 vBox;
flat varying vec4 vMeta;

float h1(float a, float b) { return hash12(vec2(a, b)); }

// Thin line at |d| < hw along coordinate c; fades to its average coverage when too fine to draw.
float lineAA(float d, float c, float hw) {
  float w = fwidth(c) + 1e-5;
  float l = 1.0 - smoothstep(hw - w * 0.7, hw + w * 0.7, abs(d));
  return mix(l, hw * 2.0 / max(w * 4.0, hw * 2.0) * 0.5, smoothstep(hw, hw * 4.0, w));
}

float boxMask(vec2 p, vec2 lo, vec2 hi) {
  vec2 w = fwidth(p) * 0.6 + 1e-4;
  vec2 a = smoothstep(lo - w, lo + w, p) * (1.0 - smoothstep(hi - w, hi + w, p));
  return a.x * a.y;
}

void main() {
  vec3 Pw = vP;
  vec3 N = normalize(vN);
  float side = vMeta.w;
  float seed = floor(vMeta.z + 0.5);
  float H = vMeta.x;
  int fi = int(vMeta.y + 0.5);
  vec3 wall = uFacade[0];
  for (int i = 0; i < 5; i++) if (i == fi) wall = uFacade[i];

  vec3 col = wall;
  vec3 emit = vec3(0.0);

  if (side > 1.5) {
    col = wall * 0.45;
  } else {
    bool street = (side < 0.5 && N.x > 0.5) || (side > 0.5 && N.x < -0.5);
    float simZ0 = -vBox.w;
    float len = vBox.w - vBox.z;
    float u = -Pw.z - simZ0; // metres along the street from the building's start
    if (side > 0.5) u = len - u; // far side faces the other way: keep text reading left to right
    float v = Pw.y;
    // weathering: vertical rain streaks and a darker plinth
    float streaks = vnoise(vec2(u * 3.0 + seed * 7.0, v * 0.15));
    col *= 0.93 + 0.1 * streaks;
    col *= 1.0 - 0.18 * (1.0 - smoothstep(0.0, 0.5, v));

    if (street) {
      bool shop = h1(seed, 1.0) < 0.78;
      float topRowLimit = H - 0.9;
      // cornice
      col *= 1.0 - 0.3 * smoothstep(H - 0.55, H - 0.5, v);
      if (shop && v < 3.6) {
        float nb = max(1.0, floor(len / 4.0));
        float bayW = len / nb;
        float bi = floor(u / bayW);
        float bu = u - bi * bayW;
        float doorBay = floor(h1(seed, 2.0) * nb);
        float lit = h1(seed, 10.0 + bi);
        vec3 glassLit = lit < 0.32 ? uSodium * (0.4 + 0.12 * v / 2.75) : lit < 0.44 ? uColdWin * (0.26 + 0.06 * v / 2.75) : vec3(-1.0);
        // pilasters and fascia
        col = wall * 0.82;
        float glass = boxMask(vec2(bu, v), vec2(0.42, 0.6), vec2(bayW - 0.42, 2.72));
        float door = bi == doorBay ? boxMask(vec2(bu, v), vec2(0.55, 0.0), vec2(1.55, 2.4)) : 0.0;
        float mm = mod(bu - 0.42 + 0.625, 1.25) - 0.625;
        float mull = lineAA(mm, bu, 0.03);
        vec3 dark = mix(wall * 0.32, uHazeLow * 0.45, pow(1.0 - abs(N.x * normalize(uCamPos - Pw).x), 3.0));
        vec3 g = glassLit.x < 0.0 ? dark : glassLit;
        g *= 1.0 - 0.5 * mull;
        if (glassLit.x >= 0.0) {
          // shelves and stock in silhouette
          float shelf = lineAA(mod(v - 0.95, 0.62) - 0.31, v, 0.035) * step(0.9, v) * step(v, 2.5);
          float stock = step(0.62, vnoise(vec2(u * 2.3 + bi * 17.0, floor((v - 0.95) / 0.62) * 3.1))) * step(0.95, v) * step(v, 2.5);
          float counter = step(v, 1.05) * step(0.6, v);
          g *= 1.0 - 0.55 * clamp(shelf + stock * 0.8 + counter * 0.7, 0.0, 1.0);
        }
        if (glassLit.x >= 0.0) emit += g * glass * (1.0 - door) * (1.0 - mull);
        col = mix(col, glassLit.x < 0.0 ? g : g * 0.0, glass * (1.0 - door));
        col = mix(col, wall * 0.18, door);
        // sign board
        float board = boxMask(vec2(u, v), vec2(0.2, 2.98), vec2(len - 0.2, 3.52));
        if (board > 0.0) {
          float row = floor(h1(seed, 3.0) * ${SIGN_ROWS}.0);
          vec2 suv = vec2((u - 0.45) / 9.6, (row + clamp((3.52 - v) / 0.54, 0.0, 1.0)) / ${SIGN_ROWS}.0);
          vec4 s = texture2D(uSigns, suv);
          float letter = s.g * step(0.0, suv.x) * step(suv.x, 1.0);
          vec3 boardCol = wall * 0.5;
          col = mix(col, mix(boardCol, uDust * 0.62, letter), board);
        }
      } else {
        // upper floors (or all floors for houses)
        float base = shop ? 4.25 : 0.9;
        float rowH = 2.6;
        float nc = max(1.0, floor(len / 2.3));
        float colW = len / nc;
        float r = floor((v - base) / rowH);
        float rv = v - base - r * rowH;
        float c = floor(u / colW);
        float cu = u - c * colW;
        float inRow = step(base, v) * step(v, topRowLimit) * step(base + r * rowH + 1.6, topRowLimit + 0.01);
        float win = boxMask(vec2(cu, rv), vec2(colW * 0.5 - 0.5, 0.5), vec2(colW * 0.5 + 0.5, 1.95)) * inRow;
        float frame = boxMask(vec2(cu, rv), vec2(colW * 0.5 - 0.58, 0.42), vec2(colW * 0.5 + 0.58, 2.03)) * inRow;
        col = mix(col, wall * 0.7, frame - win);
        float lit = h1(seed * 13.0 + r, c);
        float blind = h1(seed + c, r * 3.0 + 1.0);
        vec3 V = normalize(Pw - uCamPos);
        vec3 dark = mix(wall * 0.38, uHazeLow * 0.5, pow(1.0 - abs(dot(N, V)), 4.0));
        vec3 g = dark;
        if (lit < 0.28) g = uSodium * 0.5;
        else if (lit < 0.42) g = uColdWin * 0.42;
        // half-drawn blinds
        float blindLine = 1.95 - blind * 1.2;
        if (lit < 0.42 && blind > 0.55) g = mix(g, g * 0.45, step(blindLine, rv));
        float cross = lineAA(cu - colW * 0.5, u, 0.03) + lineAA(rv - 1.35, v, 0.03);
        g *= 1.0 - 0.6 * clamp(cross, 0.0, 1.0);
        if (lit < 0.42) emit += g * win;
        col = mix(col, lit < 0.42 ? vec3(0.0) : g, win);
      }
    } else {
      // party walls in the gaps
      col *= 0.78;
    }
  }

  vec3 lit = col * lightAt(Pw, N, 0.7) + emit;
  float f = fogAmount(Pw);
  vec3 outc = mix(lit, uFogCol, f * (1.0 - 0.25 * step(0.001, dot(emit, vec3(1.0)))));
  gl_FragColor = vec4(outc, 1.0);
}
`;

export class Buildings {
  readonly mesh: THREE.Mesh;
  private geo: THREE.InstancedBufferGeometry;
  private box: Float32Array;
  private meta: Float32Array;
  private boxAttr: THREE.InstancedBufferAttribute;
  private metaAttr: THREE.InstancedBufferAttribute;
  private blocks: Block[] = [];

  constructor() {
    const base = new THREE.BoxGeometry(1, 1, 1);
    this.geo = new THREE.InstancedBufferGeometry();
    this.geo.index = base.index;
    this.geo.setAttribute('position', base.getAttribute('position'));
    this.geo.setAttribute('normal', base.getAttribute('normal'));
    this.box = new Float32Array(MAX * 4);
    this.meta = new Float32Array(MAX * 4);
    this.boxAttr = new THREE.InstancedBufferAttribute(this.box, 4).setUsage(THREE.DynamicDrawUsage);
    this.metaAttr = new THREE.InstancedBufferAttribute(this.meta, 4).setUsage(THREE.DynamicDrawUsage);
    this.geo.setAttribute('iBox', this.boxAttr);
    this.geo.setAttribute('iMeta', this.metaAttr);
    const mat = new THREE.ShaderMaterial({
      vertexShader: vert,
      fragmentShader: frag,
      uniforms: withShared({
        uFacade: { value: FACADES.map((c) => new THREE.Vector3(...c)) },
        uColdWin: { value: new THREE.Vector3(...P.coldWindow) },
        uDust: { value: new THREE.Vector3(...P.dust) },
        uHazeLow: { value: new THREE.Vector3(...P.hazeLow) },
        uSigns: { value: makeSignAtlas() },
      }),
    });
    this.mesh = new THREE.Mesh(this.geo, mat);
    this.mesh.frustumCulled = false;
  }

  /** simCamZ: the camera's sim z. The camera looks toward +z. */
  update(simCamZ: number) {
    this.blocks = blocksInRange(simCamZ - 6, simCamZ + 120, this.blocks);
    let n = 0;
    const put = (x0: number, x1: number, z0: number, z1: number, h: number, f: number, seed: number, side: number) => {
      if (n >= MAX) return;
      const i = n * 4;
      this.box[i] = x0;
      this.box[i + 1] = x1;
      this.box[i + 2] = -z1;
      this.box[i + 3] = -z0;
      this.meta[i] = h;
      this.meta[i + 1] = f;
      this.meta[i + 2] = Math.round((((seed * 0.6180339) % 1) + 1) % 1 * 97);
      this.meta[i + 3] = side;
      n++;
    };
    for (const b of this.blocks) for (const bd of b.buildings) put(bd.x0, bd.x1, bd.z0, bd.z1, bd.h, bd.colour, bd.seed, bd.side);
    // dark backdrops so the alleys between buildings don't open onto the sky
    put(WALK_X0 - 12.5, WALK_X0 - 11.2, simCamZ - 6, simCamZ + 120, 26, 2, 0, 2);
    put(FAR_X1 + 11.2, FAR_X1 + 12.5, simCamZ - 6, simCamZ + 120, 26, 2, 0, 2);
    this.geo.instanceCount = n;
    this.boxAttr.needsUpdate = true;
    this.metaAttr.needsUpdate = true;
  }
}
