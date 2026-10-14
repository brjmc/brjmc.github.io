// The one post pass: ink lines from depth, proximity vignette, desaturation (near miss,
// death) and the finish spill along the bottom edge.

import * as THREE from 'three';
import { P } from './palette';

const vert = /* glsl */ `
varying vec2 vUv;
void main() { vUv = position.xy * 0.5 + 0.5; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

const frag = /* glsl */ `
uniform sampler2D tColor;
uniform sampler2D tDepth;
uniform vec2 uTexel;
uniform float uNear;
uniform float uFar;
uniform float uInkW;
uniform float uInkOn;
uniform vec3 uInk;
uniform vec3 uSodium;
uniform vec3 uEmber;
uniform vec2 uCentre;   // principal point in uv
uniform float uAspect;
uniform float uVig;     // 0..1 chaser proximity
uniform float uBeat;    // heartbeat pulse 0..1
uniform float uDesat;   // 0..1
uniform float uDeath;   // 0..1
uniform float uFlash;   // ember flash on impact
uniform float uSpill;   // finish spill 0..1
varying vec2 vUv;

float linZ(float d) {
  float z = d * 2.0 - 1.0;
  return 2.0 * uNear * uFar / (uFar + uNear - z * (uFar - uNear));
}

float stepAA(float e, float x, float w) { return smoothstep(e - w, e + w, x); }

void main() {
  vec3 c = texture2D(tColor, vUv).rgb;

  if (uInkOn > 0.5) {
    vec2 o = uTexel * uInkW;
    float zc = linZ(texture2D(tDepth, vUv).r);
    float wl = 1.0 / linZ(texture2D(tDepth, vUv - vec2(o.x, 0.0)).r);
    float wr = 1.0 / linZ(texture2D(tDepth, vUv + vec2(o.x, 0.0)).r);
    float wd = 1.0 / linZ(texture2D(tDepth, vUv - vec2(0.0, o.y)).r);
    float wu = 1.0 / linZ(texture2D(tDepth, vUv + vec2(0.0, o.y)).r);
    float wc = 1.0 / zc;
    // Laplacian of 1/z is zero on any plane, so only silhouettes and creases ink
    float lap = (4.0 * wc - wl - wr - wd - wu) / wc;
    float edge = smoothstep(0.035, 0.11, lap);
    // line weight thins into the haze, like a print
    edge *= 1.0 - smoothstep(18.0, 62.0, zc);
    c = mix(c, uInk, edge * 0.9);
  }

  // finish spill: the last pool's outer bands climbing the bottom edge
  if (uSpill > 0.0) {
    float y = vUv.y;
    float h = uSpill * 0.32;
    float b = step(y, h) * 0.18 + step(y, h * 0.55) * 0.14 + step(y, h * 0.22) * 0.12;
    c = mix(c, uSodium, b * uSpill);
  }

  // desaturate, but keep the two warm inks
  float lum = dot(c, vec3(0.299, 0.587, 0.114));
  float warm = smoothstep(0.1, 0.3, c.r - c.b);
  float ds = max(uDesat * 0.8, uDeath);
  c = mix(c, mix(vec3(lum), c, warm * 0.85), ds);
  c = mix(c, uEmber, uFlash * 0.35);

  // vignette toward ink; tightens as the chaser closes
  vec2 d = (vUv - uCentre) * vec2(uAspect, 1.0);
  float r = length(d) / max(uAspect, 1.0) * 1.6;
  float inner = mix(0.62, 0.22, uVig) - uBeat * 0.05 * uVig;
  float v = smoothstep(inner, inner + 0.7, r);
  c = mix(c, uInk, v * mix(0.45, 0.9, uVig));

  gl_FragColor = vec4(c, 1.0);
}
`;

export class Post {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  readonly target: THREE.WebGLRenderTarget;
  readonly uniforms = {
    tColor: { value: null as THREE.Texture | null },
    tDepth: { value: null as THREE.Texture | null },
    uTexel: { value: new THREE.Vector2(1, 1) },
    uNear: { value: 0.1 },
    uFar: { value: 220 },
    uInkW: { value: 1.5 },
    uInkOn: { value: 1 },
    uInk: { value: new THREE.Vector3(...P.ink) },
    uSodium: { value: new THREE.Vector3(...P.sodium) },
    uEmber: { value: new THREE.Vector3(...P.ember) },
    uCentre: { value: new THREE.Vector2(0.5, 0.46) },
    uAspect: { value: 1 },
    uVig: { value: 0 },
    uBeat: { value: 0 },
    uDesat: { value: 0 },
    uDeath: { value: 0 },
    uFlash: { value: 0 },
    uSpill: { value: 0 },
  };

  constructor() {
    this.target = new THREE.WebGLRenderTarget(1, 1, {
      depthTexture: new THREE.DepthTexture(1, 1),
      type: THREE.UnsignedByteType,
      colorSpace: THREE.NoColorSpace,
    });
    this.target.depthTexture!.type = THREE.UnsignedIntType;
    this.uniforms.tColor.value = this.target.texture;
    this.uniforms.tDepth.value = this.target.depthTexture;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
    const m = new THREE.Mesh(g, new THREE.ShaderMaterial({ vertexShader: vert, fragmentShader: frag, uniforms: this.uniforms, depthTest: false, depthWrite: false }));
    m.frustumCulled = false;
    this.scene.add(m);
  }

  setSize(w: number, h: number) {
    this.target.setSize(w, h);
    this.uniforms.uTexel.value.set(1 / w, 1 / h);
  }
}
