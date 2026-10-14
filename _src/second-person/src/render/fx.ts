// Sky, blob shadows, the aim ring, screen-width line segments (speed lines, aim line)
// and the drizzle that only shows inside light.

import * as THREE from 'three';
import { LIGHTING_GLSL, shared, withShared } from './lighting';
import { P, type RGB } from './palette';

const fullTri = () => {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
  return g;
};

/* ---------------- sky ---------------- */

export class Sky {
  readonly mesh: THREE.Mesh;
  readonly uniforms = {
    uHorizon: { value: 0.5 }, // horizon height in [0, 1] screen space from the bottom
    uSpan: { value: 0.5 },
    uNight: { value: new THREE.Vector3(...P.night) },
    uLow: { value: new THREE.Vector3(...P.hazeLow) },
    uHaze: { value: new THREE.Vector3(...P.haze) },
    uRes: { value: new THREE.Vector2(1, 1) },
  };

  constructor() {
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      depthTest: false,
      depthWrite: false,
      vertexShader: /* glsl */ `void main() { gl_Position = vec4(position.xy, 1.0, 1.0); }`,
      fragmentShader: /* glsl */ `
        uniform float uHorizon; uniform float uSpan; uniform vec3 uNight; uniform vec3 uLow; uniform vec3 uHaze; uniform vec2 uRes;
        void main() {
          float y = gl_FragCoord.y / uRes.y;
          float t = clamp((y - uHorizon) / uSpan, 0.0, 1.0);
          // woodblock bokashi: a smooth gradient, the one soft thing in the frame
          vec3 c = mix(uLow, uNight, pow(t, 0.7));
          c = mix(c, uHaze, (1.0 - smoothstep(0.0, 0.08, t)) * 0.6);
          gl_FragColor = vec4(c, 1.0);
        }`,
    });
    this.mesh = new THREE.Mesh(fullTri(), mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -100;
  }
}

/* ---------------- blob shadows ---------------- */

const MAX_SHADOWS = 560;

export class Shadows {
  readonly mesh: THREE.Mesh;
  private geo = new THREE.InstancedBufferGeometry();
  private d = new Float32Array(MAX_SHADOWS * 4);
  private attr: THREE.InstancedBufferAttribute;
  private n = 0;

  constructor() {
    const q = new THREE.PlaneGeometry(1, 1);
    q.rotateX(-Math.PI / 2);
    this.geo.index = q.index;
    this.geo.setAttribute('position', q.getAttribute('position'));
    this.attr = new THREE.InstancedBufferAttribute(this.d, 4).setUsage(THREE.DynamicDrawUsage);
    this.geo.setAttribute('iS', this.attr); // x, y, z, size (z-scale packed in the sign? no: square)
    const mat = new THREE.ShaderMaterial({
      uniforms: shared,
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
      vertexShader: /* glsl */ `
        attribute vec4 iS; varying vec2 vUv; varying vec3 vP;
        void main() {
          vec3 wp = iS.xyz + vec3(position.x * abs(iS.w), 0.0, position.z * abs(iS.w) * (iS.w < 0.0 ? 2.4 : 1.0));
          vUv = position.xz * 2.0; vP = wp;
          gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        ${LIGHTING_GLSL}
        varying vec2 vUv; varying vec3 vP;
        void main() {
          float r = length(vUv);
          float w = fwidth(r);
          float a = (1.0 - smoothstep(0.55 - w, 0.55 + w, r)) * 0.22 + (1.0 - smoothstep(1.0 - w, 1.0, r)) * 0.2;
          a *= 1.0 - fogAmount(vP);
          gl_FragColor = vec4(uInk, a);
        }`,
    });
    this.mesh = new THREE.Mesh(this.geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 1;
  }

  begin() {
    this.n = 0;
  }

  /** size < 0 stretches the shadow along z (cars). */
  add(x: number, y: number, z: number, size: number) {
    if (this.n >= MAX_SHADOWS) return;
    this.d.set([x, y + 0.012, z, size], this.n * 4);
    this.n++;
  }

  end() {
    this.geo.instanceCount = this.n;
    this.attr.needsUpdate = true;
  }
}

/* ---------------- aim ring ---------------- */

export class AimRing {
  readonly mesh: THREE.Mesh;
  readonly uniforms = withShared({
    uCol: { value: new THREE.Vector3(...P.sodium) },
    uPulse: { value: 0 },
    uCharge: { value: -1 }, // -1 = steering ring, 0..1 = charge fill
    uAlpha: { value: 1 },
  });

  constructor() {
    const q = new THREE.PlaneGeometry(1.4, 1.4);
    q.rotateX(-Math.PI / 2);
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -4,
      polygonOffsetUnits: -4,
      vertexShader: /* glsl */ `
        varying vec2 vUv; varying vec3 vP;
        void main() { vUv = position.xz / 0.7; vec4 wp = modelMatrix * vec4(position, 1.0); vP = wp.xyz; gl_Position = projectionMatrix * viewMatrix * wp; }`,
      fragmentShader: /* glsl */ `
        ${LIGHTING_GLSL}
        uniform vec3 uCol; uniform float uPulse; uniform float uCharge; uniform float uAlpha;
        varying vec2 vUv; varying vec3 vP;
        void main() {
          float r = length(vUv);
          float w = fwidth(r) * 0.8;
          float rr = 0.62 + 0.12 * uPulse;
          float ring = smoothstep(rr - 0.1 - w, rr - 0.1 + w, r) * (1.0 - smoothstep(rr - w, rr + w, r));
          float dot_ = 1.0 - smoothstep(0.1 - w, 0.1 + w, r);
          float a = ring * (0.55 + 0.35 * uPulse) + dot_ * 0.9;
          if (uCharge >= 0.0) {
            float ang = atan(vUv.x, -vUv.y) / 6.2831853 + 0.5;
            float fill = step(ang, uCharge) * smoothstep(0.78 - w, 0.78 + w, r) * (1.0 - smoothstep(0.9 - w, 0.9 + w, r));
            a = max(a, fill * 0.95);
          }
          gl_FragColor = vec4(uCol, a * uAlpha);
        }`,
    });
    this.mesh = new THREE.Mesh(q, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 2;
  }

  set(x: number, y: number, z: number, col: RGB, pulse: number, charge: number, alpha: number) {
    this.mesh.position.set(x, y + 0.02, z);
    this.uniforms.uCol.value.set(...col);
    this.uniforms.uPulse.value = pulse;
    this.uniforms.uCharge.value = charge;
    this.uniforms.uAlpha.value = alpha;
  }
}

/* ---------------- screen-width segments ---------------- */

const MAX_SEGS = 64;

export class Segments {
  readonly mesh: THREE.Mesh;
  private geo = new THREE.InstancedBufferGeometry();
  private a = new Float32Array(MAX_SEGS * 4);
  private b = new Float32Array(MAX_SEGS * 4);
  private c = new Float32Array(MAX_SEGS * 4);
  private attrs: THREE.InstancedBufferAttribute[];
  private n = 0;
  readonly uniforms = { uRes: { value: new THREE.Vector2(1, 1) } };

  constructor() {
    // x: 0 = start, 1 = end; y: side
    this.geo.setAttribute('position', new THREE.Float32BufferAttribute([0, -1, 0, 1, -1, 0, 1, 1, 0, 0, -1, 0, 1, 1, 0, 0, 1, 0], 3));
    this.attrs = [this.a, this.b, this.c].map((arr) => new THREE.InstancedBufferAttribute(arr, 4).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('iA', this.attrs[0]); // xyz, width px
    this.geo.setAttribute('iB', this.attrs[1]); // xyz, alpha
    this.geo.setAttribute('iC', this.attrs[2]); // rgb, taper
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      transparent: true,
      depthWrite: false,
      vertexShader: /* glsl */ `
        attribute vec4 iA; attribute vec4 iB; attribute vec4 iC; uniform vec2 uRes;
        varying vec4 vC; varying float vT;
        void main() {
          vec4 pa = projectionMatrix * viewMatrix * vec4(iA.xyz, 1.0);
          vec4 pb = projectionMatrix * viewMatrix * vec4(iB.xyz, 1.0);
          vec2 sa = pa.xy / pa.w * uRes * 0.5;
          vec2 sb = pb.xy / pb.w * uRes * 0.5;
          vec2 d = normalize(sb - sa + 1e-5);
          vec2 nrm = vec2(-d.y, d.x);
          float t = position.x;
          vec4 p = mix(pa, pb, t);
          float wpx = iA.w * mix(1.0, iC.w, t);
          p.xy += nrm * position.y * wpx / uRes * p.w;
          vC = vec4(iC.rgb, iB.w * mix(1.0, 0.0, t * step(0.5, iC.w)));
          vT = t;
          gl_Position = p;
        }`,
      fragmentShader: /* glsl */ `
        varying vec4 vC; varying float vT;
        void main() { gl_FragColor = vC; }`,
    });
    this.mesh = new THREE.Mesh(this.geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 8;
  }

  begin() {
    this.n = 0;
  }

  add(ax: number, ay: number, az: number, bx: number, by: number, bz: number, widthPx: number, col: RGB, alpha: number, taper = 1) {
    if (this.n >= MAX_SEGS || alpha <= 0.002) return;
    const i = this.n * 4;
    this.a.set([ax, ay, az, widthPx], i);
    this.b.set([bx, by, bz, alpha], i);
    this.c.set([col[0], col[1], col[2], taper], i);
    this.n++;
  }

  end() {
    this.geo.instanceCount = this.n;
    for (const a of this.attrs) a.needsUpdate = true;
  }
}

/* ---------------- drizzle ---------------- */

export class Drizzle {
  readonly mesh: THREE.Mesh;
  readonly uniforms = withShared({
    uBox: { value: new THREE.Vector4(0, 0, 0, 1) }, // centre xyz, intensity
    uRes: { value: new THREE.Vector2(1, 1) },
  });
  private geo = new THREE.InstancedBufferGeometry();

  constructor(count: number) {
    this.geo.setAttribute('position', new THREE.Float32BufferAttribute([0, -1, 0, 1, -1, 0, 1, 1, 0, 0, -1, 0, 1, 1, 0, 0, 1, 0], 3));
    const seeds = new Float32Array(count * 4);
    for (let i = 0; i < count * 4; i++) seeds[i] = Math.random();
    this.geo.setAttribute('iSeed', new THREE.InstancedBufferAttribute(seeds, 4));
    this.geo.instanceCount = count;
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexShader: /* glsl */ `
        #define SP_VERTEX
        ${LIGHTING_GLSL}
        attribute vec4 iSeed; uniform vec4 uBox; uniform vec2 uRes;
        varying float vA; varying vec3 vCol;
        void main() {
          // a 16 x 6 x 32 m box ahead of the camera, where the lamp cones are; ~6 m/s with a little wind
          vec3 size = vec3(16.0, 6.0, 32.0);
          float fall = 5.5 + iSeed.w * 1.5;
          vec3 base = (iSeed.xyz - 0.5) * size;
          base.y = mod(iSeed.y * size.y - uTime * fall, size.y);
          base.x = mod(base.x + uTime * 0.6 - uBox.x + size.x * 0.5, size.x) - size.x * 0.5;
          base.z = mod(base.z - uBox.z + size.z * 0.5, size.z) - size.z * 0.5;
          vec3 pa = vec3(uBox.x + base.x, base.y, uBox.z + base.z - 17.0);
          vec3 pb = pa + vec3(0.06, -0.5, 0.0);
          // only visible where a lamp or headlight reaches
          float sod = 0.0;
          for (int i = 0; i < MAX_LAMPS; i++) {
            if (i >= uLampCount) break;
            vec3 d = uLamp[i] - pa;
            float horiz = length(d.xz);
            float cone = 1.0 - smoothstep(0.4 + (uLamp[i].y - pa.y) * 0.5, 0.8 + (uLamp[i].y - pa.y) * 0.62, horiz);
            sod += cone * step(pa.y, uLamp[i].y) * uLampOn[i];
          }
          float cold = 0.0;
          for (int i = 0; i < MAX_HEADS; i++) {
            if (i >= uHeadCount) break;
            vec3 d = pa - uHead[i];
            float dist = length(d);
            cold += smoothstep(0.94, 0.985, dot(d / dist, uHeadDir[i])) * clamp(1.0 - dist / 14.0, 0.0, 1.0) * uHeadOn[i];
          }
          sod = clamp(sod, 0.0, 1.0);
          cold = clamp(cold, 0.0, 1.0) * 0.7;
          vCol = uSodium * sod + uCold * cold;
          vA = max(sod, cold) * uBox.w * (0.35 + 0.4 * iSeed.z) * (1.0 - fogAmount(pa));
          vec4 ca = projectionMatrix * viewMatrix * vec4(pa, 1.0);
          vec4 cb = projectionMatrix * viewMatrix * vec4(pb, 1.0);
          vec2 sa = ca.xy / ca.w * uRes * 0.5;
          vec2 sb = cb.xy / cb.w * uRes * 0.5;
          vec2 dd = normalize(sb - sa + 1e-5);
          vec2 nrm = vec2(-dd.y, dd.x);
          vec4 p = mix(ca, cb, position.x);
          p.xy += nrm * position.y * 0.6 / uRes * p.w;
          if (vA < 0.01) p = vec4(2.0, 2.0, 2.0, 1.0);
          gl_Position = p;
        }`,
      fragmentShader: /* glsl */ `
        varying float vA; varying vec3 vCol;
        void main() { gl_FragColor = vec4(vCol * vA, 1.0); }`,
    });
    this.mesh = new THREE.Mesh(this.geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 11;
  }

  setCount(n: number) {
    this.geo.instanceCount = n;
  }
}
