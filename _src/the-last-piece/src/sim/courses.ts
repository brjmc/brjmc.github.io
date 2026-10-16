// The courses: one evening at a sushi counter. Each course is a diner (glasses, chopsticks,
// temperament), a plate (shape, what's on it) and one new idea. Difficulty inside a course
// ramps with hits, as in the prototype: `ramp[min(hits, ramp.length - 1)]`.

export type GlassesKind = 'round' | 'square' | 'halfmoon' | 'aviator' | 'cateye';
export type StickStyle = 'red' | 'black' | 'hinoki' | 'gold' | 'moribashi' | 'waribashi';
export type PlateKind = 'porcelain' | 'sometsuke' | 'geta' | 'slate' | 'hinoki';

export interface PlateCfg {
  kind: PlateKind;
  /** Outer half extents and corner radius (a rounded rectangle; equal halves + r = circle). */
  hx: number;
  hz: number;
  r: number;
  /** Centre of the plate on the table. */
  cz: number;
  /** Height of the surface the sushi stands on. */
  top: number;
  /** Width of the raised rim that is not walkable (0 for flat boards). */
  rim: number;
}

export type PlateProp =
  | { kind: 'dish'; x: number; z: number; r: number } // a little soy dish: a wall
  | { kind: 'gari'; x: number; z: number; r: number } // a heap of pickled ginger: a wall
  | { kind: 'puddle'; x: number; z: number; rx: number; rz: number; rot: number } // soy: slows you
  | { kind: 'daikon'; x: number; z: number; rx: number; rz: number } // shredded radish: hides you, slows you
  | { kind: 'mound'; x: number; z: number; r: number }; // grated wasabi: a refilling source

/** How the diner behaves at a given number of hits taken. */
export interface Stage {
  idle: number; // s hovering between attempts
  aim: number; // s lining up
  marks: number; // stabs per volley
  slot: number; // s per stab
  track: number; // 1/s, how fast marks follow you while lining up
  spread: number; // cm, initial scatter of the marks around you
  feint: number; // chance each stab is a feint (pauses, re-targets late)
  sweep: number; // chance an attempt is a sweep instead of a volley
  guard: number; // 0 = never; >0 = between attempts he parks the tips, shut, on your line, at this rate (1/s)
  chase: number; // 1/s: marks still waiting in a volley keep following you at this rate (prototype: 0)
  dropNear: number; // cm, the fumbled wasabi lands at most this far from you
  fumble: number; // chance an attempt ends with a dab of wasabi fumbled onto the plate (prototype: 1)
}

export interface DinerCfg {
  name: string;
  glasses: GlassesKind;
  sticks: StickStyle;
  /** Lens tint (sunglasses), as a hex colour; omitted for clear glass. */
  tint?: string;
  lean: {
    k: number; // spring stiffness (prototype 9)
    c: number; // velocity damping (prototype 2.3)
    amp: number; // cm, wander amplitude (prototype ≈ 5.5 cm, but the lane was wider)
    freq: number; // rad/s (prototype 0.7)
    ampPerHit: number; // cm added per hit (drink, stinging eye)
    maxOff: number; // cm, how far off-centre he lets you get before he catches up
  };
  blink: [number, number]; // seconds between blinks
  ramp: Stage[];
}

export interface CompanionCfg {
  sticks: StickStyle;
  idle: [number, number];
  aim: number;
  slot: number;
  track: number;
  dropChance: number; // she fumbles some wasabi too
}

export interface CourseCfg {
  n: number;
  title: string;
  kicker: string;
  brief: string[];
  plate: PlateCfg;
  props: PlateProp[];
  diner: DinerCfg;
  companion?: CompanionCfg;
  hitsToWin: number;
  freshness: number;
  /** Where you start, relative to the plate centre. */
  start: { x: number; z: number };
  /** Course 1 shows contextual tutorial cues. */
  tutorial?: boolean;
  /** Leftover litter density on the plate (render only). */
  litter: number;
  /** Where we are (render only): at the counter, or at a table with someone across from him. */
  setting?: 'counter' | 'table';
}

const S = (
  idle: number,
  aim: number,
  marks: number,
  slot: number,
  track: number,
  spread: number,
  extra: Partial<Stage> = {},
): Stage => ({ idle, aim, marks, slot, track, spread, feint: 0, sweep: 0, guard: 0, chase: 0, dropNear: 7, fumble: 1, ...extra });

const PORCELAIN: PlateCfg = { kind: 'porcelain', hx: 13.5, hz: 9, r: 3.2, cz: 33, top: 0.8, rim: 2.0 };

export const COURSES: CourseCfg[] = [
  {
    n: 1,
    title: 'The last piece',
    kicker: 'Course one · sake nigiri',
    brief: ['He has eaten everything else on the plate.', 'Dodge the tips. Pick up the wasabi he drops. Put it in his eye.'],
    plate: PORCELAIN,
    props: [],
    diner: {
      name: 'The regular',
      glasses: 'round',
      sticks: 'red',
      lean: { k: 9, c: 2.3, amp: 2.4, freq: 0.7, ampPerHit: 0.4, maxOff: 7 },
      blink: [4.5, 9.5],
      ramp: [
        S(1.7, 1.55, 1, 0.52, 0.7, 6, { dropNear: 5 }),
        S(1.45, 1.4, 2, 0.48, 0.9, 7, { dropNear: 6 }),
        S(1.3, 1.25, 2, 0.44, 1.1, 7, { dropNear: 6.5 }),
      ],
    },
    hitsToWin: 3,
    freshness: 5,
    start: { x: 0, z: 0 },
    tutorial: true,
    litter: 0.6,
  },
  {
    n: 2,
    title: 'Soy',
    kicker: 'Course two · the salaryman',
    brief: ['A soy dish on the plate, and soy spilled around it.', 'Go round the dish. Soy slows you down.'],
    plate: { kind: 'sometsuke', hx: 12.5, hz: 12.5, r: 12.5, cz: 34, top: 0.9, rim: 2.2 },
    props: [
      { kind: 'dish', x: 4.2, z: 3.2, r: 2.8 },
      { kind: 'puddle', x: -3.6, z: -2.4, rx: 3.4, rz: 2.1, rot: 0.4 },
      { kind: 'puddle', x: 2.4, z: -0.6, rx: 1.4, rz: 0.9, rot: -0.3 },
    ],
    diner: {
      name: 'The salaryman',
      glasses: 'square',
      sticks: 'black',
      lean: { k: 8, c: 2.0, amp: 2.9, freq: 0.75, ampPerHit: 0.7, maxOff: 7.5 },
      blink: [4, 8],
      ramp: [
        S(1.5, 1.35, 2, 0.44, 0.6, 7, { fumble: 0.85 }),
        S(1.3, 1.15, 3, 0.4, 0.95, 7.5, { fumble: 0.85 }),
        S(1.1, 1.0, 3, 0.37, 1.2, 8, { fumble: 0.85 }),
      ],
    },
    hitsToWin: 3,
    freshness: 5,
    start: { x: -4, z: 2 },
    litter: 0.5,
  },
  {
    n: 3,
    title: 'Daikon',
    kicker: 'Course three · the critic',
    brief: ['He guards his eye while you hold wasabi. Make him strike first, then throw.', 'In the daikon he loses sight of you.'],
    plate: { kind: 'geta', hx: 15, hz: 8.5, r: 0.8, cz: 33, top: 2.8, rim: 0.4 },
    props: [
      { kind: 'daikon', x: -8, z: 3, rx: 3.6, rz: 2.7 },
      { kind: 'gari', x: 6.5, z: -3.6, r: 1.9 },
    ],
    diner: {
      name: 'The critic',
      glasses: 'halfmoon',
      sticks: 'hinoki',
      lean: { k: 14, c: 4.2, amp: 2.2, freq: 0.6, ampPerHit: 0.3, maxOff: 6 },
      blink: [6, 11],
      ramp: [
        S(1.4, 1.3, 2, 0.42, 1.0, 6.5, { feint: 0.3, guard: 4.2, chase: 0.7, fumble: 0.8 }),
        S(1.25, 1.15, 2, 0.4, 1.2, 7, { feint: 0.4, guard: 5.0, chase: 0.9, fumble: 0.8 }),
        S(1.1, 1.05, 3, 0.37, 1.4, 7, { feint: 0.45, guard: 5.8, chase: 1.1, fumble: 0.8 }),
      ],
    },
    hitsToWin: 3,
    freshness: 5,
    start: { x: 2, z: 1 },
    litter: 0.2,
  },
  {
    n: 4,
    title: 'Date night',
    kicker: 'Course four · two at the counter',
    brief: ['Her chopsticks come from across the table.', 'Only his eye counts. Her fumbles are yours to use.'],
    plate: { kind: 'slate', hx: 15.5, hz: 9.5, r: 1.6, cz: 34, top: 0.9, rim: 0.3 },
    props: [{ kind: 'gari', x: -8.5, z: 3.5, r: 1.8 }],
    diner: {
      name: 'The date',
      glasses: 'aviator',
      sticks: 'gold',
      tint: '#6b4a22',
      lean: { k: 9, c: 2.4, amp: 2.8, freq: 0.8, ampPerHit: 0.5, maxOff: 7.5 },
      blink: [4.5, 9],
      ramp: [
        S(1.7, 1.35, 2, 0.43, 0.75, 7, { chase: 0.6, fumble: 0.7 }),
        S(1.45, 1.2, 2, 0.4, 1.0, 7.5, { chase: 0.8, fumble: 0.7 }),
        S(1.3, 1.05, 3, 0.37, 1.2, 8, { chase: 0.9, fumble: 0.7 }),
        S(1.2, 1.0, 3, 0.36, 1.3, 8, { chase: 1.0, fumble: 0.7 }),
      ],
    },
    setting: 'table',
    companion: { sticks: 'waribashi', idle: [2.6, 4.4], aim: 1.15, slot: 0.46, track: 0.9, dropChance: 0.45 },
    hitsToWin: 4,
    freshness: 5,
    start: { x: 0, z: -2 },
    litter: 0.3,
  },
  {
    n: 5,
    title: 'Fresh wasabi',
    kicker: "Course five · the chef's own",
    brief: ['A mound of grated wasabi on the board. Help yourself.', 'He sweeps the board with the tips. Get off the line.'],
    plate: { kind: 'hinoki', hx: 18, hz: 8, r: 1.0, cz: 33, top: 2.2, rim: 0.4 },
    props: [
      { kind: 'mound', x: 13, z: 2, r: 1.7 },
      { kind: 'gari', x: -11.5, z: -2.4, r: 1.7 },
    ],
    diner: {
      name: 'The chef',
      glasses: 'cateye',
      sticks: 'moribashi',
      lean: { k: 11, c: 3.0, amp: 2.6, freq: 0.9, ampPerHit: 0.35, maxOff: 7 },
      blink: [5, 9],
      ramp: [
        S(1.2, 1.25, 2, 0.4, 1.0, 7, { sweep: 0.5, chase: 0.8, fumble: 0.5 }),
        S(1.1, 1.1, 3, 0.37, 1.15, 7.5, { sweep: 0.55, chase: 1.0, fumble: 0.5 }),
        S(1.0, 1.0, 3, 0.35, 1.3, 8, { sweep: 0.6, feint: 0.2, chase: 1.1, fumble: 0.5 }),
        S(0.9, 0.95, 4, 0.33, 1.45, 8, { sweep: 0.6, feint: 0.25, chase: 1.2, fumble: 0.5 }),
      ],
    },
    hitsToWin: 4,
    freshness: 5,
    start: { x: -2, z: 0 },
    litter: 0.15,
  },
  {
    n: 6,
    title: 'Last orders',
    kicker: 'Course six · the regular, later',
    brief: ['Closing time. He has had a few, and he still wants the last piece.', 'Five in the eye.'],
    plate: PORCELAIN,
    props: [
      { kind: 'puddle', x: 6, z: -2.8, rx: 2.8, rz: 1.8, rot: -0.2 },
      { kind: 'gari', x: -2.6, z: 3.4, r: 1.5 },
      { kind: 'daikon', x: -9, z: -2.4, rx: 2.6, rz: 2.4 },
      { kind: 'mound', x: 9.6, z: 3.4, r: 1.5 },
    ],
    diner: {
      name: 'The regular',
      glasses: 'round',
      sticks: 'red',
      lean: { k: 7, c: 1.6, amp: 3.6, freq: 0.85, ampPerHit: 0.45, maxOff: 8.5 },
      blink: [3.5, 7],
      ramp: [
        S(1.2, 1.15, 2, 0.4, 1.05, 7.5, { feint: 0.2, sweep: 0.25, guard: 2.4, chase: 1.0, fumble: 0.7 }),
        S(1.1, 1.05, 3, 0.37, 1.2, 8, { feint: 0.25, sweep: 0.3, guard: 2.8, chase: 1.15, fumble: 0.7 }),
        S(1.0, 1.0, 3, 0.35, 1.35, 8, { feint: 0.3, sweep: 0.35, guard: 3.2, chase: 1.3, fumble: 0.7 }),
        S(0.95, 0.95, 4, 0.33, 1.5, 8.5, { feint: 0.3, sweep: 0.35, guard: 3.6, chase: 1.4, fumble: 0.7 }),
        S(0.9, 0.9, 4, 0.32, 1.65, 8.5, { feint: 0.35, sweep: 0.4, guard: 4.0, chase: 1.5, fumble: 0.7 }),
      ],
    },
    hitsToWin: 5,
    freshness: 5,
    start: { x: 0, z: 0 },
    litter: 1,
  },
];

export const LAST_AUTHORED = COURSES.length;

/** Course n (1-based). Beyond the authored six: "Seconds", an endless remix of 2–5 that keeps scaling. */
export function courseCfg(n: number): CourseCfg {
  n = Math.max(1, Math.floor(n));
  if (n <= LAST_AUTHORED) return COURSES[n - 1];
  const k = n - LAST_AUTHORED; // 1, 2, 3...
  const base = COURSES[1 + ((k - 1) % 4)]; // 2, 3, 4, 5, 2, ...
  const f = Math.min(1, k / 10);
  const scale = (st: Stage, i: number): Stage => ({
    ...st,
    idle: Math.max(0.85, st.idle * (1 - 0.15 * f)),
    aim: Math.max(0.8, st.aim * (1 - 0.12 * f)),
    marks: Math.min(4, st.marks + (k >= 4 && i > 0 ? 1 : 0)),
    slot: Math.max(0.3, st.slot * (1 - 0.1 * f)),
    track: st.track * (1 + 0.25 * f),
    feint: Math.min(0.45, st.feint + 0.15 * f),
    sweep: Math.min(0.5, st.sweep + 0.2 * f),
    guard: st.guard > 0 ? st.guard * (1 + 0.2 * f) : k >= 3 ? 1.6 + f : 0,
    chase: st.chase + 0.5 * f,
  });
  const ramp = [...base.diner.ramp];
  while (ramp.length < 5) ramp.push(ramp[ramp.length - 1]);
  return {
    ...base,
    n,
    title: `Seconds (${k})`,
    kicker: `Course ${n} · seconds`,
    brief: ['Still hungry.', 'Five in the eye.'],
    diner: {
      ...base.diner,
      lean: { ...base.diner.lean, amp: base.diner.lean.amp + 0.4 * f },
      ramp: ramp.map(scale),
    },
    hitsToWin: 5,
    litter: Math.min(1, base.litter + 0.1 * k),
  };
}

export function stageFor(c: CourseCfg, hits: number): Stage {
  const r = c.diner.ramp;
  return r[Math.min(hits, r.length - 1)];
}
