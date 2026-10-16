// ART_DIRECTION.md palette tokens (sRGB hex). THREE.Color converts to linear on construction.

import * as THREE from 'three';

export const HEX = {
  room0: '#120b0d',
  room1: '#2b1813',
  lantern: '#ffb35c',
  tungsten: '#ffd7a1',
  table: '#4a2c1a',
  tableHi: '#80512d',
  porcelain: '#eee6d6',
  porcelainLo: '#b3a58e',
  sometsuke: '#2c4f95',
  slate: '#25272b',
  hinoki: '#d9b884',
  rice: '#f5f0e4',
  riceLo: '#cdbfa6',
  salmon: '#f27b4b',
  salmonFat: '#ffd8c0',
  salmonDeep: '#c64f2b',
  wasabi: '#8fc93f',
  wasabiDeep: '#4d7a19',
  wasabiHi: '#d6f291',
  lacquer: '#8c1d15',
  danger: '#ff4a2a',
  soy: '#2e1508',
  gari: '#f3c2c8',
  ink: '#0d0a0c',
  bone: '#f3e6cf',
} as const;

export type Token = keyof typeof HEX;

export const C = (t: Token) => new THREE.Color(HEX[t]);
