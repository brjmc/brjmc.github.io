// Palette tokens from ART_DIRECTION.md, as raw sRGB triples. Shaders work in sRGB on purpose:
// the look is flat inks, so authored hex values should land on screen unchanged.

export type RGB = [number, number, number];

export const hex = (h: string): RGB => {
  const n = parseInt(h.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
};

export const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

export const P = {
  ink: hex('#0b0e14'),
  night: hex('#141b28'),
  haze: hex('#4f5c66'),
  hazeLow: hex('#46525c'),
  stone: hex('#5c626a'),
  stoneFar: hex('#535962'),
  kerb: hex('#767b82'),
  asphalt: hex('#23272c'),
  paint: hex('#c9c2a6'),
  dust: hex('#8c9aa0'),
  coldWindow: hex('#cfd8dd'),
  cold: hex('#dfe8f0'),
  bone: hex('#e9dfc7'),
  boneTrim: hex('#b9ac90'),
  sodium: hex('#f2c53c'),
  ember: hex('#e0552f'),
};

export const FACADES: RGB[] = ['#2c343b', '#333a3f', '#2a3138', '#38393a', '#303a3e'].map(hex);

// Street-file crowd colours, pushed 35 % toward haze so no coat outshines the player.
export const CROWD: RGB[] = ['#7d8794', '#8f7f6e', '#6d7b83', '#93887a', '#5f6b78', '#a09484', '#71685f', '#849097']
  .map(hex)
  .map((c) => mix(c, P.haze, 0.35));

// Heads: hair and hats, muted and cold.
export const HEADS: RGB[] = ['#2a2c30', '#3b3a3a', '#4a4540', '#2f343b', '#5b5650', '#1e2126'].map(hex);

// Car bodies: the street file's red and ochre cooled so cars carry no warmth but their tail lights.
export const CARS: RGB[] = ['#4a3a40', '#25333f', '#3c4a3a', '#6d6a60', '#1d1f24', '#4a3550', '#5e5f52'].map(hex);

// Faces: muted, pulled toward haze so skin never reads as a warm accent.
export const FACES: RGB[] = ['#d2c3b3', '#b8a596', '#dccdbd', '#a08f82'].map(hex).map((c) => mix(c, P.haze, 0.12));
