// Street layout and gameplay tuning. Metres and seconds. The player advances toward -z.
// Pure data: no three.js, no DOM.

/* ---------- street layout (fixed) ---------- */
export const WALK_X0 = -7.0; // near pavement, shopfront line
export const WALK_X1 = -0.15; // near pavement, kerb edge
export const ROAD_X0 = 0.0;
export const ROAD_X1 = 10.0;
export const FAR_X0 = 10.15;
export const FAR_X1 = 14.0;
export const LANE_NEAR = 2.6; // traffic toward the camera (-z)
export const LANE_FAR = 7.4; // traffic away from the camera (+z)
export const KERB_H = 0.14;
export const LAMP_X = -0.75;
export const BLOCK = 9; // building block length along z

export const SIM_HZ = 120;
export const SIM_DT = 1 / SIM_HZ;

/* ---------- tuning ---------- */
// Everything the debug panel may touch. DEFAULTS is frozen; a World works on its own copy.
export interface Tuning {
  // camera
  camHeight: number;
  camDist: number;
  camPitch: number;
  camDeadX: number;
  camDeadZ: number;
  camRateX: number;
  camRateZ: number;
  camHeldMul: number;
  // player
  playerR: number;
  baseSpeed: number;
  dirScaleMin: number;
  accel: number;
  dashAccel: number;
  steerDeadzone: number;
  // shove
  shoveTouchR: number;
  shoveBodyR: number;
  chargeTime: number;
  minCharge: number;
  dashSpeed: number;
  dashBaseTime: number;
  shoveCooldown: number;
  staggerTime: number;
  // crowd collisions: head-on / partial / glancing
  tierHeadDot: number;
  tierPartialDot: number;
  tierHeadFactor: number;
  tierHeadTime: number;
  tierPartialFactor: number;
  tierPartialTime: number;
  tierGlanceFactor: number;
  tierGlanceTime: number;
  playerPushShare: number;
  // pedestrians
  pedR: number;
  pedStillChance: number;
  pedSpeedMin: number;
  pedSpeedMax: number;
  farPavementShare: number;
  jamSpeedMax: number;
  yieldSpeed: number;
  yieldTime: number;
  // chaser
  chaserShoveR: number;
  chaserCatchR: number;
  chaserStartGap: number;
  // cars
  carW: number;
  carLen: number;
  carLongLen: number;
  carH: number;
  carLongH: number;
  carLongChance: number;
  carHitMargin: number;
  lightSpeedMin: number;
  lightSpeedMax: number;
  nearGapMin: number;
  nearGapMax: number;
  farGapMin: number;
  farGapMax: number;
  laneJitter: number;
  nearSpawnAhead: number;
  farSpawnBehind: number;
  waveSpacing: number;
  nearMissMargin: number;
  // misc
  finishGlowDist: number;
  itIsOnYouDist: number;
}

export const DEFAULTS: Readonly<Tuning> = Object.freeze({
  // camera (brief)
  camHeight: 2.7,
  camDist: 7.5,
  camPitch: 0.21,
  camDeadX: 0.55,
  camDeadZ: 0.4,
  camRateX: 4.5, // street file: kx = 1 - exp(-4.5 dt)
  camRateZ: 7.0, // street file: kz = 1 - exp(-7 dt)
  camHeldMul: 1.8, // INVENTED: how much the follow tightens while a finger is down

  // player (brief)
  playerR: 0.34, // street file
  baseSpeed: 4.5,
  dirScaleMin: 0.72,
  accel: 26,
  dashAccel: 90,
  steerDeadzone: 0.55,

  // shove (brief)
  shoveTouchR: 1.5,
  shoveBodyR: 0.55, // INVENTED: a touch ray passing this close to the body also counts as touching the character
  chargeTime: 0.55,
  minCharge: 0.25,
  dashSpeed: 11.5,
  dashBaseTime: 0.3,
  shoveCooldown: 1.9,
  staggerTime: 0.9,

  // collision tiers (brief)
  tierHeadDot: 0.55,
  tierPartialDot: 0.2,
  tierHeadFactor: 0.26,
  tierHeadTime: 0.45,
  tierPartialFactor: 0.6,
  tierPartialTime: 0.25,
  tierGlanceFactor: 0.85,
  tierGlanceTime: 0.12,
  playerPushShare: 0.55, // street file: player takes 55 % of the overlap, ped 45 %

  // pedestrians (street file)
  pedR: 0.33,
  pedStillChance: 0.12,
  pedSpeedMin: 0.7,
  pedSpeedMax: 1.9,
  farPavementShare: 0.32, // street file: 24 % of all peds are on the far side -> 0.32 of near density
  jamSpeedMax: 0.45, // INVENTED: jam crowds mill slowly and stay inside their jam
  yieldSpeed: 1.6, // INVENTED: a bumped pedestrian side-steps out of your line at this speed...
  yieldTime: 0.45, // ...for this long (without it, a straight walk bulldozes people head-on)

  // chaser (brief)
  chaserShoveR: 0.8,
  chaserCatchR: 0.95,
  chaserStartGap: 14, // INVENTED: street file toggled it on 15–16 m behind

  // cars (street file unless noted)
  carW: 1.95,
  carLen: 4.4,
  carLongLen: 7.2,
  carH: 1.42,
  carLongH: 2.7,
  carLongChance: 0.18,
  carHitMargin: 0.3,
  lightSpeedMin: 15, // brief
  lightSpeedMax: 23, // brief
  nearGapMin: 1.1,
  nearGapMax: 3.4,
  farGapMin: 1.4,
  farGapMax: 4.0,
  laneJitter: 0.25,
  nearSpawnAhead: 78,
  farSpawnBehind: 34,
  waveSpacing: 11.5, // INVENTED: centre-to-centre spacing inside a convoy
  nearMissMargin: 0.9, // INVENTED: lateral clearance beyond the hit box that counts as a near miss

  // misc
  finishGlowDist: 40, // brief
  itIsOnYouDist: 3.2, // INVENTED: status cue threshold
});

export function makeTuning(over?: Partial<Tuning>): Tuning {
  return { ...DEFAULTS, ...(over ?? {}) };
}

export const inRoad = (x: number) => x > ROAD_X0 && x < ROAD_X1;
