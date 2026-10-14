// Shop sign boards drawn once into a canvas atlas: dark boards, worn dust-coloured lettering.
// Unlit on purpose (see ART_DIRECTION.md: no neon).

import * as THREE from 'three';

export const SIGN_ROWS = 16;

const WORDS = [
  'LAUNDERETTE',
  'CHEMIST',
  'OFF LICENCE',
  'KEYS CUT · HEELS',
  'NEWS & TOBACCO',
  'TO LET',
  'NOODLE BAR',
  'BOOKMAKERS',
  'CAFE',
  'ALTERATIONS',
  'PAWNBROKER',
  'HARDWARE',
  'BAKERY',
  'OPTICIANS',
  'MINICABS',
  'FUNERAL DIRECTORS',
];

export function makeSignAtlas(): THREE.Texture {
  const W = 1024;
  const rowH = 64;
  const cv = document.createElement('canvas');
  cv.width = W;
  cv.height = rowH * SIGN_ROWS;
  const g = cv.getContext('2d')!;
  // channel R: board tone, G: lettering mask
  for (let i = 0; i < SIGN_ROWS; i++) {
    const y = i * rowH;
    g.fillStyle = 'rgb(255,0,0)';
    g.fillRect(0, y, W, rowH);
    g.fillStyle = 'rgb(200,0,0)';
    g.fillRect(0, y + rowH - 6, W, 6);
    g.font = `600 ${Math.round(rowH * 0.56)}px ui-monospace, Menlo, Consolas, monospace`;
    g.textBaseline = 'middle';
    const word = WORDS[i % WORDS.length];
    const spacing = 6;
    let x = 36;
    for (const ch of word) {
      // worn letters: the odd one faded
      const r = Math.abs(Math.sin((i + 1) * 91.7 + x * 0.37));
      const a = r > 0.93 ? 0.45 : 1;
      g.fillStyle = `rgba(255,255,0,${a})`;
      g.fillText(ch, x, y + rowH * 0.48);
      x += g.measureText(ch).width + spacing;
    }
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.NoColorSpace;
  tex.flipY = false; // rows are addressed top-down in the facade shader
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.anisotropy = 4;
  return tex;
}
