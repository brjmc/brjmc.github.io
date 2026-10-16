// Full-screen pass helper: one big triangle, an orthographic camera, a ShaderMaterial.

import * as THREE from 'three';

const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
const tri = new THREE.BufferGeometry();
tri.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
tri.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 2, 0, 0, 2], 2));

export const FSQ_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

export class Pass {
  readonly mesh: THREE.Mesh;
  readonly mat: THREE.ShaderMaterial;

  constructor(frag: string, uniforms: Record<string, THREE.IUniform>, defines: Record<string, string | number> = {}) {
    this.mat = new THREE.ShaderMaterial({ vertexShader: FSQ_VERT, fragmentShader: frag, uniforms, defines, depthTest: false, depthWrite: false });
    this.mesh = new THREE.Mesh(tri, this.mat);
    this.mesh.frustumCulled = false;
  }

  get u() {
    return this.mat.uniforms;
  }

  render(gl: THREE.WebGLRenderer, target: THREE.WebGLRenderTarget | null) {
    gl.setRenderTarget(target);
    gl.render(this.mesh, cam);
  }
}

export function makeRT(w: number, h: number, opts: Partial<THREE.RenderTargetOptions> = {}) {
  return new THREE.WebGLRenderTarget(Math.max(1, w), Math.max(1, h), {
    type: THREE.HalfFloatType,
    format: THREE.RGBAFormat,
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    depthBuffer: false,
    generateMipmaps: false,
    ...opts,
  });
}
