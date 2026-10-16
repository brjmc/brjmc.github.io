// Units: centimetres and seconds. x is to the diner's right, y is up from the table top, z runs
// away from the diner. The diner's eye (the camera) sits near z = 0 and looks down at the plate.
//
// Values carried over from the prototype are converted at about 0.058 cm per prototype unit (a
// nigiri is ~86 units wide there and ~5 cm here). Values marked INVENTED have no counterpart
// in the prototype.

export const SIM_HZ = 120;
export const SIM_DT = 1 / SIM_HZ;

export interface Tuning {
  // the piece of sushi
  maxSpeed: number;
  accel: number;
  friction: number;
  bodyR: number; // obstacle / plate-edge radius
  hitRX: number; // stab hit ellipse half-axes, centred on the sushi
  hitRZ: number;
  pickRX: number; // pickup ellipse half-axes
  pickRZ: number;
  hurtTime: number;
  knockSpeed: number;
  freshness: number;
  soySlow: number; // speed multiplier inside a soy puddle
  daikonSlow: number;

  // the diner's eye
  eyeY: number;
  laneHalf: number; // |x - eyeX| below this is "in the lane"
  lensZ: number; // the lens sits this far in front of the eye

  // throws
  throwG: number; // gravity for the lob (stylised, lower than real)
  throwSpeed: number; // cm/s along the ground
  throwMinT: number;
  throwMaxT: number;
  blobR: number;
  stickR: number; // shaft radius used in the blocking test (tip end; grows toward the hand)

  // wasabi on the plate
  blobLife: number;
  clipLife: number;
  shedLife: number;
  moundRefill: number;

  // chopsticks
  hoverRest: number; // fraction along the throw arc where the tips rest between attempts
  restSepOpen: number;
  sepShut: number;
  aimHover: number;
  stabFloor: number;
  liftHover: number;
  fumbleHover: number;
  fumbleTime: number;
  dropTime: number;
  sweepTime: number;
  sweepLen: number;
  sweepHitR: number;
  feintAt: number; // fraction of the slot at which a feint re-targets
  feintExtra: number; // seconds a feint adds to its slot
}

export const DEFAULTS: Readonly<Tuning> = Object.freeze({
  maxSpeed: 13, // prototype 200 u/s ≈ 11.6 cm/s; the plate is a little bigger here
  accel: 95,
  friction: 13, // prototype
  bodyR: 1.9,
  hitRX: 2.3, // prototype 28 u ≈ 1.6 cm, widened: the body here is solid 3D, not a sprite
  hitRZ: 2.0,
  pickRX: 2.6, // prototype 42 u
  pickRZ: 2.3,
  hurtTime: 1.2, // prototype
  knockSpeed: 14, // prototype 140 u/s
  freshness: 5, // prototype
  soySlow: 0.45, // INVENTED
  daikonSlow: 0.62, // INVENTED

  eyeY: 18, // INVENTED (the prototype's camera height is a 2D projection constant)
  laneHalf: 2.0, // prototype 34 px ≈ 6.3 cm was nearly free; tightened, see PLAN §1
  lensZ: 1.6,

  throwG: 300, // INVENTED
  throwSpeed: 82, // prototype flight ≈ 0.7 s; faster here so the snapshot rule looks honest
  throwMinT: 0.3,
  throwMaxT: 0.48,
  blobR: 0.45,
  stickR: 0.22,

  blobLife: 11, // prototype
  clipLife: 7, // INVENTED
  shedLife: 9, // prototype
  moundRefill: 5.5, // INVENTED

  hoverRest: 0.12, // INVENTED
  restSepOpen: 3.6,
  sepShut: 0.18,
  aimHover: 3.2, // prototype 52 u
  stabFloor: 0.12,
  liftHover: 2.8, // prototype 46 u
  fumbleHover: 4.6, // prototype 74 u
  fumbleTime: 0.7, // prototype
  dropTime: 0.55, // prototype
  sweepTime: 0.62, // INVENTED
  sweepLen: 15, // INVENTED
  sweepHitR: 1.7, // INVENTED
  feintAt: 0.34, // INVENTED
  feintExtra: 0.2, // INVENTED
});

export function makeTuning(): Tuning {
  return { ...DEFAULTS };
}

export const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
export const ease = (k: number) => (k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2);
/** Exponential approach factor for a rate (1/s) over dt; frame-rate independent. */
export const approach = (rate: number, dt: number) => 1 - Math.exp(-rate * dt);
