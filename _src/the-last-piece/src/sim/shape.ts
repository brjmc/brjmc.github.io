// Plate outlines are rounded rectangles in the x/z plane (equal halves and full corner radius
// give a circle). Signed distance, a clamp that keeps the sushi on the plate, and push-out from
// round obstacles.

export interface RRect {
  cx: number;
  cz: number;
  hx: number;
  hz: number;
  r: number;
}

/** Signed distance to a rounded rectangle; negative inside. */
export function sdRRect(s: RRect, x: number, z: number): number {
  const r = Math.min(s.r, s.hx, s.hz);
  const qx = Math.abs(x - s.cx) - (s.hx - r);
  const qz = Math.abs(z - s.cz) - (s.hz - r);
  const ox = Math.max(qx, 0);
  const oz = Math.max(qz, 0);
  return Math.hypot(ox, oz) + Math.min(Math.max(qx, qz), 0) - r;
}

/** The same shape shrunk by d on every side (exact for rounded rectangles). */
export function inset(s: RRect, d: number): RRect {
  return { cx: s.cx, cz: s.cz, hx: s.hx - d, hz: s.hz - d, r: Math.max(0, s.r - d) };
}

/** Gradient of the SDF (outward normal), by central differences. */
export function sdNormal(s: RRect, x: number, z: number): [number, number] {
  const e = 0.01;
  const gx = sdRRect(s, x + e, z) - sdRRect(s, x - e, z);
  const gz = sdRRect(s, x, z + e) - sdRRect(s, x, z - e);
  const l = Math.hypot(gx, gz) || 1;
  return [gx / l, gz / l];
}

/** Moves (x, z) back inside s if it is outside. Returns the corrected point and whether it moved. */
export function clampInside(s: RRect, x: number, z: number): { x: number; z: number; hit: boolean; nx: number; nz: number } {
  const d = sdRRect(s, x, z);
  if (d <= 0) return { x, z, hit: false, nx: 0, nz: 0 };
  const [nx, nz] = sdNormal(s, x, z);
  return { x: x - nx * d, z: z - nz * d, hit: true, nx, nz };
}

/** Distance from a point to an ellipse-ish region, as a normalised radius (<1 inside). */
export function ellipseR(x: number, z: number, cx: number, cz: number, rx: number, rz: number, rot = 0): number {
  const dx = x - cx;
  const dz = z - cz;
  const c = Math.cos(rot);
  const s = Math.sin(rot);
  const u = (dx * c + dz * s) / rx;
  const v = (-dx * s + dz * c) / rz;
  return Math.hypot(u, v);
}
