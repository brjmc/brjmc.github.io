// Level table (brief) and endless scaling for 7+ (invented: the levels reference was not available).

export interface Jam {
  from: number; // metres from the start line
  to: number;
  mult: number; // crowd density multiplier inside the jam
}

export type Traffic =
  | { kind: 'none' }
  | { kind: 'light' }
  | { kind: 'waves'; period: number; cars: number; speed: number };

export interface LevelCfg {
  n: number;
  title: string;
  brief: string[];
  length: number;
  crowd: number; // near-pavement pedestrians per metre of street
  jams: Jam[];
  traffic: Traffic;
  chaserSpeed: number;
}

export const CHASER_SPEED_CAP = 4.35;
export const WAVE_PERIOD_FLOOR = 2.9;

// Briefing text is invented: the reference file with the original text was not provided.
const TABLE: Omit<LevelCfg, 'n'>[] = [
  {
    title: 'Walk',
    brief: [
      'Something is behind you. It walks.',
      'Hold anywhere on the ground to walk that way.',
      'You will not see where you are going.',
    ],
    length: 130,
    crowd: 0.22,
    jams: [],
    traffic: { kind: 'none' },
    chaserSpeed: 3.15,
  },
  {
    title: 'Traffic',
    brief: [
      'Hold on yourself to brace. Let go to shove.',
      'The crowd will slow you. The road will not.',
    ],
    length: 150,
    crowd: 0.5,
    jams: [],
    traffic: { kind: 'light' },
    chaserSpeed: 3.35,
  },
  {
    title: 'The crush',
    brief: ['The pavement fills up ahead.', 'You will be in it before you see it.'],
    length: 170,
    crowd: 0.75,
    jams: [{ from: 52, to: 104, mult: 7 }],
    traffic: { kind: 'light' },
    chaserSpeed: 3.5,
  },
  {
    title: 'The rhythm',
    brief: ['The cars come in waves.', 'Count the gaps.'],
    length: 180,
    crowd: 0.6,
    jams: [],
    traffic: { kind: 'waves', period: 5.4, cars: 3, speed: 19 },
    chaserSpeed: 3.6,
  },
  {
    title: 'Both',
    brief: ['Crowds, then waves, then crowds.'],
    length: 200,
    crowd: 0.95,
    jams: [
      { from: 60, to: 96, mult: 6 },
      { from: 132, to: 168, mult: 6 },
    ],
    traffic: { kind: 'waves', period: 4.8, cars: 3, speed: 20 },
    chaserSpeed: 3.75,
  },
  {
    title: 'Rush',
    brief: ['Everyone is going home.'],
    length: 220,
    crowd: 1.15,
    jams: [
      { from: 40, to: 80, mult: 7 },
      { from: 120, to: 190, mult: 5 },
    ],
    traffic: { kind: 'waves', period: 4.2, cars: 4, speed: 22 },
    chaserSpeed: 3.95,
  },
];

const ENDLESS_BRIEFS = ['Keep walking.', 'Not far now.', 'It does not tire.', 'Another street.', 'Nearly home.'];

export function levelCfg(n: number): LevelCfg {
  const lv = Math.max(1, Math.floor(n));
  if (lv <= TABLE.length) {
    const row = TABLE[lv - 1];
    return { n: lv, ...row, jams: row.jams.map((j) => ({ ...j })), traffic: { ...row.traffic } };
  }
  // Endless: everything grows a little each block until it reaches a cap or floor.
  const k = lv - TABLE.length; // 1 for level 7
  const length = Math.min(320, 220 + 12 * k);
  const crowd = Math.min(1.5, 1.15 + 0.04 * k);
  const jams: Jam[] = [
    { from: Math.round(length * 0.18), to: Math.round(length * 0.36), mult: Math.min(8, 7 + 0.1 * k) },
    { from: Math.round(length * 0.55), to: Math.round(length * 0.86), mult: Math.min(7, 5 + 0.2 * k) },
  ];
  return {
    n: lv,
    title: `Block ${lv}`,
    brief: [ENDLESS_BRIEFS[(lv - 7) % ENDLESS_BRIEFS.length]],
    length,
    crowd,
    jams,
    traffic: {
      kind: 'waves',
      period: Math.max(WAVE_PERIOD_FLOOR, 4.2 - 0.15 * k),
      cars: Math.min(5, 4 + Math.floor(k / 4)),
      speed: Math.min(25, 22 + 0.3 * k),
    },
    chaserSpeed: Math.min(CHASER_SPEED_CAP, 3.95 + 0.05 * k),
  };
}

/** Crowd density multiplier at a distance along the level. */
export function jamMult(cfg: LevelCfg, dist: number): number {
  let m = 1;
  for (const j of cfg.jams) if (dist >= j.from && dist <= j.to) m = Math.max(m, j.mult);
  return m;
}

export function jamAt(cfg: LevelCfg, dist: number): Jam | null {
  for (const j of cfg.jams) if (dist >= j.from && dist <= j.to) return j;
  return null;
}
