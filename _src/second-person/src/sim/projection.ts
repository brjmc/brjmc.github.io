// Camera projection shared by input (screen -> ground) and the renderer (same frustum).
// Sim coordinates: the camera sits at -z of the player and looks toward +z, pitched down.
// Screen x grows with world x (the road is on the right), as in the street file.

export interface View {
  W: number; // CSS pixels
  H: number;
  F: number; // focal length in pixels
  CX: number; // principal point
  CY: number;
}

export interface CamPose {
  x: number;
  y: number;
  z: number;
  pitch: number;
}

// INVENTED: the street file used F = 0.85 H, which on a portrait phone leaves a ~30° wide view.
// Keep 0.85 H, but never let the horizontal half-angle fall below this.
export const MIN_HALF_FOV_X = 0.42;

export function makeView(W: number, H: number): View {
  const F = Math.min(H * 0.85, W / 2 / Math.tan(MIN_HALF_FOV_X));
  return { W, H, F, CX: W / 2, CY: H * 0.54 };
}

export interface Projected {
  sx: number;
  sy: number;
  depth: number; // camera-space Z
}

export function project(v: View, c: CamPose, x: number, y: number, z: number): Projected {
  const cp = Math.cos(c.pitch);
  const sp = Math.sin(c.pitch);
  const dx = x - c.x;
  const dy = y - c.y;
  const dz = z - c.z;
  const X = dx;
  const Y = dy * cp + dz * sp;
  const Z = -dy * sp + dz * cp;
  return { sx: v.CX + (v.F * X) / Z, sy: v.CY - (v.F * Y) / Z, depth: Z };
}

/** World-space ray direction (not normalised) through a screen point. */
export function screenRay(v: View, c: CamPose, px: number, py: number): { dx: number; dy: number; dz: number } {
  const cp = Math.cos(c.pitch);
  const sp = Math.sin(c.pitch);
  const a = (px - v.CX) / v.F;
  const b = (v.CY - py) / v.F;
  return { dx: a, dy: b * cp - sp, dz: b * sp + cp };
}

/**
 * Ground point under a screen point. A point above the horizon clamps to a far ground
 * point in the same horizontal direction instead of dropping the input.
 */
export function unproject(v: View, c: CamPose, px: number, py: number, groundY = 0): { x: number; z: number } {
  const r = screenRay(v, c, px, py);
  const dy = Math.min(r.dy, -0.02);
  const t = (groundY - c.y) / dy;
  return { x: c.x + t * r.dx, z: c.z + t * r.dz };
}

/**
 * Does the ray through a screen point pass within `radius` of a standing figure
 * (vertical segment from y0 to y1 at x, z)?
 */
export function rayHitsFigure(
  v: View,
  c: CamPose,
  px: number,
  py: number,
  fx: number,
  fz: number,
  y0: number,
  y1: number,
  radius: number,
): boolean {
  const r = screenRay(v, c, px, py);
  const hx = r.dx;
  const hz = r.dz;
  const h2 = hx * hx + hz * hz;
  if (h2 < 1e-9) return false;
  const t = ((fx - c.x) * hx + (fz - c.z) * hz) / h2;
  if (t <= 0) return false;
  const cx = c.x + hx * t - fx;
  const cz = c.z + hz * t - fz;
  if (cx * cx + cz * cz > radius * radius) return false;
  const y = c.y + r.dy * t;
  return y >= y0 - 0.1 && y <= y1 + 0.1;
}
