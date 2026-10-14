// Deterministic street furniture per 9 m block, ported from the street file's blockAt().

import { BLOCK, FAR_X1, LAMP_X, WALK_X0 } from './constants';
import { hash } from './rng';

export interface Building {
  side: 0 | 1; // 0 = near (shopfronts at x = WALK_X0), 1 = far (facade at x = FAR_X1)
  x0: number;
  x1: number;
  z0: number;
  z1: number;
  h: number;
  faceX: number;
  colour: number; // index into the facade palette
  seed: number;
}

export interface Post {
  kind: 'lamp' | 'bin';
  x: number;
  z: number;
  r: number; // collision radius
}

export interface Block {
  index: number;
  buildings: Building[];
  posts: Post[];
}

export const FACADE_COUNT = 5;
export const LAMP_R = 0.28;
export const BIN_R = 0.45;

const cache = new Map<number, Block>();

export function blockAt(bi: number): Block {
  const hit = cache.get(bi);
  if (hit) return hit;
  const buildings: Building[] = [];
  const posts: Post[] = [];
  for (const side of [0, 1] as const) {
    const r1 = hash(bi, side, 3);
    const r2 = hash(bi, side, 7);
    const r3 = hash(bi, side, 11);
    const h = 6 + r1 * 17;
    const z0 = bi * BLOCK + 0.35;
    const z1 = (bi + 1) * BLOCK - 0.35;
    const colour = Math.floor(r2 * FACADE_COUNT);
    const seed = bi * 2 + side;
    buildings.push(
      side === 0
        ? { side, x0: WALK_X0 - 11, x1: WALK_X0, z0, z1, h, faceX: WALK_X0, colour, seed }
        : { side, x0: FAR_X1, x1: FAR_X1 + 11, z0, z1, h, faceX: FAR_X1, colour, seed },
    );
    if (r3 < 0.7) posts.push({ kind: 'lamp', x: LAMP_X, z: bi * BLOCK + r3 * BLOCK, r: LAMP_R });
    if (hash(bi, side, 17) < 0.35) {
      posts.push({
        kind: 'bin',
        x: WALK_X0 + 0.7 + hash(bi, side, 19) * 0.6,
        z: bi * BLOCK + hash(bi, side, 23) * BLOCK,
        r: BIN_R,
      });
    }
  }
  const block = { index: bi, buildings, posts };
  if (cache.size > 4096) cache.clear();
  cache.set(bi, block);
  return block;
}

/** Blocks overlapping [zMin, zMax]. */
export function blocksInRange(zMin: number, zMax: number, out: Block[] = []): Block[] {
  out.length = 0;
  const b0 = Math.floor(zMin / BLOCK);
  const b1 = Math.floor(zMax / BLOCK);
  for (let b = b0; b <= b1; b++) out.push(blockAt(b));
  return out;
}
