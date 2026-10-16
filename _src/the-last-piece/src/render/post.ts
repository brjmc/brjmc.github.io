// The post stack (ART_DIRECTION.md, "Post-processing"):
//   scene (HDR + depth) -> CoC + half-res downsample -> DOF gather (half res)
//   -> blur pyramid (bloom, naked-eye blur, cheap DOF on low tier)
//   -> lens composite: wasabi and tears on the glass, smudges, frame, eyelids, grade, tone map
//   -> FXAA (high tier).

import * as THREE from 'three';
import { Pass, makeRT } from './fsq';
import { LensMap, dirtTexture, type GlassesDef } from './lens';

export interface PostTier {
  dof: number; // gather taps; 0 = cheap pyramid blur
  bloom: boolean;
  fxaa: boolean;
  msaa: number;
}

export interface PostParams {
  near: number;
  far: number;
  focus: number; // view-space depth of the sushi
  aspect: number;
  glasses: GlassesDef;
  tint: THREE.Color | null;
  lid: number; // 0 open .. 1 shut
  lidRed: number; // light through the shut lids
  sting: number; // 0..1, wasabi in the eye
  flash: THREE.Vector4; // rgb, amount
  desat: number;
  exposure: number;
  time: number;
  drunk: number; // double vision / smear
  shake: number;
}

const COMMON = /* glsl */ `
uniform vec2 uNearFar;
float viewZ(float d) { return uNearFar.x * uNearFar.y / (uNearFar.y - d * (uNearFar.y - uNearFar.x)); }
uniform vec4 uCoc; // focus depth, K (fraction of height per unit inverse depth), dead zone, max (fraction of height)
uniform vec2 uRes; // full-res size in px
float cocPx(float z) {
  float x = 1.0 / uCoc.x - 1.0 / z;
  float c = max(abs(x) - uCoc.z, 0.0) * uCoc.y;
  return sign(x) * min(c, uCoc.w) * uRes.y; // negative = nearer than focus
}
`;

const COC_FRAG = /* glsl */ `
${COMMON}
uniform sampler2D tScene;
uniform sampler2D tDepth;
varying vec2 vUv;
void main() {
  vec3 c = texture2D(tScene, vUv).rgb;
  float z = viewZ(texture2D(tDepth, vUv).r);
  float coc = cocPx(z) * 0.5; // in half-res pixels
  gl_FragColor = vec4(min(c, vec3(60.0)), coc);
}
`;

const GATHER_FRAG = /* glsl */ `
uniform sampler2D tHalf;
uniform vec2 uTexel; // 1 / half-res size
uniform float uMaxR; // half-res px
varying vec2 vUv;
const float GOLDEN = 2.39996323;
void main() {
  vec4 ctr = texture2D(tHalf, vUv);
  float cs = abs(ctr.a);
  vec3 col = ctr.rgb;
  float tot = 1.0;
  float nearOverlap = 0.0;
  // rotate the spiral per pixel (interleaved gradient noise): sparse taps become fine noise,
  // which the tent filter after this pass removes, instead of ghost copies
  float ign = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
  float rot = ign * 6.2831853;
  for (int i = 0; i < TAPS; i++) {
    float fi = float(i);
    float r = uMaxR * sqrt((fi + ign) / float(TAPS));
    float a = fi * GOLDEN + rot;
    vec2 tc = vUv + vec2(cos(a), sin(a)) * r * uTexel;
    vec4 s = texture2D(tHalf, tc);
    float ss = abs(s.a);
    // a sample behind the centre can't blur over it by more than the centre allows
    if (s.a > ctr.a) ss = clamp(ss, 0.0, cs * 2.0);
    float m = smoothstep(r - 1.0, r + 1.0, ss);
    col += mix(col / tot, s.rgb, m);
    tot += 1.0;
    if (s.a < 0.0 && s.a < ctr.a) nearOverlap = max(nearOverlap, m * min(1.0, ss / 2.0));
  }
  gl_FragColor = vec4(col / tot, max(cs, nearOverlap * 3.0));
}
`;

const TENT_FRAG = /* glsl */ `
uniform sampler2D tSrc;
uniform vec2 uTexel;
varying vec2 vUv;
void main() {
  // a small blur whose radius follows the local CoC: in-focus edges stay crisp, large blurs lose their noise
  vec4 c0 = texture2D(tSrc, vUv);
  float r = clamp(c0.a * 0.12, 0.6, 2.2);
  vec4 c = c0 * 0.2;
  c += texture2D(tSrc, vUv + uTexel * vec2(-r, -r)) * 0.1;
  c += texture2D(tSrc, vUv + uTexel * vec2(r, -r)) * 0.1;
  c += texture2D(tSrc, vUv + uTexel * vec2(-r, r)) * 0.1;
  c += texture2D(tSrc, vUv + uTexel * vec2(r, r)) * 0.1;
  c += texture2D(tSrc, vUv + uTexel * vec2(0.0, -1.6 * r)) * 0.1;
  c += texture2D(tSrc, vUv + uTexel * vec2(0.0, 1.6 * r)) * 0.1;
  c += texture2D(tSrc, vUv + uTexel * vec2(-1.6 * r, 0.0)) * 0.1;
  c += texture2D(tSrc, vUv + uTexel * vec2(1.6 * r, 0.0)) * 0.1;
  gl_FragColor = vec4(c.rgb, max(c.a, c0.a));
}
`;

const DOWN_FRAG = /* glsl */ `
uniform sampler2D tSrc;
uniform vec2 uTexel; // of the source
varying vec2 vUv;
void main() {
  // 13-tap (Jimenez, CoD: AW) downsample
  vec2 t = uTexel;
  vec3 a = texture2D(tSrc, vUv + t * vec2(-2, -2)).rgb;
  vec3 b = texture2D(tSrc, vUv + t * vec2(0, -2)).rgb;
  vec3 c = texture2D(tSrc, vUv + t * vec2(2, -2)).rgb;
  vec3 d = texture2D(tSrc, vUv + t * vec2(-2, 0)).rgb;
  vec3 e = texture2D(tSrc, vUv).rgb;
  vec3 f = texture2D(tSrc, vUv + t * vec2(2, 0)).rgb;
  vec3 g = texture2D(tSrc, vUv + t * vec2(-2, 2)).rgb;
  vec3 h = texture2D(tSrc, vUv + t * vec2(0, 2)).rgb;
  vec3 i = texture2D(tSrc, vUv + t * vec2(2, 2)).rgb;
  vec3 j = texture2D(tSrc, vUv + t * vec2(-1, -1)).rgb;
  vec3 k = texture2D(tSrc, vUv + t * vec2(1, -1)).rgb;
  vec3 l = texture2D(tSrc, vUv + t * vec2(-1, 1)).rgb;
  vec3 m = texture2D(tSrc, vUv + t * vec2(1, 1)).rgb;
  vec3 o = e * 0.125 + (a + c + g + i) * 0.03125 + (b + d + f + h) * 0.0625 + (j + k + l + m) * 0.125;
  gl_FragColor = vec4(min(o, vec3(60.0)), 1.0);
}
`;

const UP_FRAG = /* glsl */ `
uniform sampler2D tLow;  // the coarser level (already upsampled chain)
uniform sampler2D tHigh; // this level's downsample
uniform vec2 uTexel;     // of the low level
uniform float uMix;
varying vec2 vUv;
void main() {
  vec2 t = uTexel;
  vec3 s = texture2D(tLow, vUv + t * vec2(-1, -1)).rgb + texture2D(tLow, vUv + t * vec2(1, -1)).rgb
         + texture2D(tLow, vUv + t * vec2(-1, 1)).rgb + texture2D(tLow, vUv + t * vec2(1, 1)).rgb
         + 2.0 * (texture2D(tLow, vUv + t * vec2(0, -1)).rgb + texture2D(tLow, vUv + t * vec2(0, 1)).rgb
                + texture2D(tLow, vUv + t * vec2(-1, 0)).rgb + texture2D(tLow, vUv + t * vec2(1, 0)).rgb)
         + 4.0 * texture2D(tLow, vUv).rgb;
  s /= 16.0;
  gl_FragColor = vec4(mix(texture2D(tHigh, vUv).rgb, s, uMix), 1.0);
}
`;

const COMPOSITE_FRAG = /* glsl */ `
${COMMON}
uniform sampler2D tScene;
uniform sampler2D tDepth;
uniform sampler2D tDof;
uniform sampler2D tBlur;  // normalised multi-scale blur (1/4 res)
uniform sampler2D tBig;   // heavy blur (1/16 res)
uniform sampler2D tLens;
uniform sampler2D tDirt;
uniform vec2 uLensTexel;
uniform float uAspect;
uniform float uTime;
uniform vec4 uShape;      // shape id, exponent, frame thickness, scale
uniform vec3 uFrame;
uniform vec3 uRim;
uniform vec4 uTint;       // rgb, amount
uniform vec4 uLid;        // closure, red, sting, drunk
uniform vec4 uFlash;
uniform vec4 uGrade;      // exposure, desat, bloom, dof on (1) / cheap (0)
uniform float uDebug;
varying vec2 vUv;

vec3 aces(vec3 x) {
  const float a = 2.51; const float b = 0.03; const float c = 2.43; const float d = 0.59; const float e = 0.14;
  return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
}
vec3 toSRGB(vec3 c) {
  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
}
float hash(vec2 p) { p = fract(p * vec2(443.897, 441.423)); p += dot(p, p.yx + 19.19); return fract((p.x + p.y) * p.x); }

// signed distance to the lens outline, in screen-height units (p in [-aspect, aspect] x [-1, 1])
float superE(vec2 p, vec2 r, float n) {
  vec2 q = abs(p) / r;
  float k = pow(pow(q.x, n) + pow(q.y, n), 1.0 / n);
  return (k - 1.0) * min(r.x, r.y);
}
float lensSDF(vec2 p) {
  float sc = uShape.w;
  vec2 r = vec2(uAspect, 1.0) * sc;
  float id = uShape.x;
  if (id < 0.5) {               // round wire: a big soft oval
    return superE(p, r * vec2(1.0, 1.02), uShape.y);
  } else if (id < 1.5) {        // square acetate
    return superE(p, r, uShape.y);
  } else if (id < 2.5) {        // half-moon readers: the top of the lens is a flat line low in the view
    float d = superE(p - vec2(0.0, -0.08), r * vec2(1.0, 0.98), uShape.y);
    return max(d, p.y - 0.34);
  } else if (id < 3.5) {        // aviator: wide at the top, the inner (nose) side sweeps down and in
    vec2 q = p;
    q.x += max(0.0, -q.y) * 0.22 * (q.x < 0.0 ? 1.0 : -0.3);
    return superE(q - vec2(0.0, 0.04), r * vec2(1.0, 1.0), uShape.y);
  } else {                      // cat-eye: the outer top corner swept up
    vec2 q = p;
    q.y -= max(0.0, q.x) * 0.14;
    return superE(q, r * vec2(1.0, 0.98), uShape.y);
  }
}

void main() {
  vec2 uv = vUv;
  vec2 p = (uv - 0.5) * 2.0;
  p.x *= uAspect;

  // drunk: a slow double image (course 6)
  float drunk = uLid.w;

  // ---- what's on the glass
  vec4 L = texture2D(tLens, uv);
  float paste = L.r;
  float water = L.g;
  float hxp = texture2D(tLens, uv + vec2(uLensTexel.x, 0.0)).r - texture2D(tLens, uv - vec2(uLensTexel.x, 0.0)).r;
  float hyp = texture2D(tLens, uv + vec2(0.0, uLensTexel.y)).r - texture2D(tLens, uv - vec2(0.0, uLensTexel.y)).r;
  float hxw = texture2D(tLens, uv + vec2(uLensTexel.x, 0.0)).g - texture2D(tLens, uv - vec2(uLensTexel.x, 0.0)).g;
  float hyw = texture2D(tLens, uv + vec2(0.0, uLensTexel.y)).g - texture2D(tLens, uv - vec2(0.0, uLensTexel.y)).g;
  vec2 gradP = vec2(hxp, hyp);
  vec2 gradW = vec2(hxw, hyw);
  // watering eye: the whole view wobbles a little
  float sting = uLid.z;
  vec2 wob = vec2(sin(uv.y * 23.0 + uTime * 3.1), cos(uv.x * 19.0 + uTime * 2.3)) * 0.0025 * sting;
  vec2 suv = uv + gradP * 0.03 + gradW * 0.03 + wob;
  vec3 big0 = texture2D(tBig, uv).rgb;

  // ---- the scene through the lens: chromatic fringe toward the rim, depth of field
  vec2 pn = p / vec2(max(uAspect, 1.0), 1.0);
  float r2 = dot(pn, pn);
  vec2 ca = (uv - 0.5) / vec2(max(uAspect, 1.0), 1.0) * 0.0016 * r2;
  vec3 sharp = vec3(texture2D(tScene, suv - ca).r, texture2D(tScene, suv).g, texture2D(tScene, suv + ca).b);
  float z = viewZ(texture2D(tDepth, suv).r);
  float coc = abs(cocPx(z));
  vec3 col;
  if (uGrade.w > 0.5) {
    vec4 dof = texture2D(tDof, suv);
    float cb = max(coc, dof.a * 2.0);
    col = mix(sharp, dof.rgb, smoothstep(0.6, 2.2, cb));
    // past what the gather covers, let the smooth pyramid take over: big, creamy blur
    col = mix(col, texture2D(tBlur, suv).rgb, smoothstep(0.3, 0.9, cb / (uCoc.w * uRes.y)) * 0.92);
  } else {
    col = mix(sharp, texture2D(tBlur, suv).rgb, smoothstep(1.0, 8.0, coc));
  }
  if (drunk > 0.0) {
    vec2 off = vec2(sin(uTime * 0.7), cos(uTime * 0.53)) * 0.006 * drunk;
    col = mix(col, texture2D(tScene, suv + off).rgb, 0.22 * drunk);
  }

  if (uDebug > 0.5) {
    vec4 dd = texture2D(tDof, uv);
    if (uDebug < 1.5) col = vec3(max(coc, 0.0) / 40.0, max(-cocPx(z), 0.0) / 40.0, dd.a / 20.0);
    else if (uDebug < 2.5) col = dd.rgb;
    else if (uDebug < 3.5) col = texture2D(tBlur, uv).rgb;
    else if (uDebug < 4.5) col = texture2D(tBig, uv).rgb;
    else col = vec3(uLid.x, uLid.y, uLid.z);
    gl_FragColor = vec4(toSRGB(aces(col)), 1.0);
    return;
  }
  // ---- watering: everything swims
  vec3 blur = texture2D(tBlur, suv).rgb;
  col = mix(col, blur, clamp(sting * 0.35 + smoothstep(0.02, 0.4, water) * 0.6, 0.0, 0.9));

  // ---- wasabi on the glass. It's 1.6 cm from his eye, so it is badly out of focus: a soft
  //      smear, opaque green where it's thick, a translucent bending edge where it thins out
  if (paste > 0.002) {
    vec2 lt = uLensTexel * 3.0;
    float ps = (paste * 2.0 + texture2D(tLens, uv + vec2(lt.x, 0.0)).r + texture2D(tLens, uv - vec2(lt.x, 0.0)).r
              + texture2D(tLens, uv + vec2(0.0, lt.y)).r + texture2D(tLens, uv - vec2(0.0, lt.y)).r) / 6.0;
    vec3 behind = texture2D(tBlur, uv + gradP * 0.18).rgb;
    vec3 absorb = exp(-ps * vec3(2.6, 0.7, 3.8) * 1.6);
    vec3 thin = behind * absorb * vec3(0.8, 1.05, 0.6) + vec3(0.02, 0.05, 0.0) * ps;
    float lum = dot(texture2D(tBig, uv).rgb, vec3(0.3, 0.6, 0.1));
    // backlit paste: dark in the thick core, glowing lime where light gets through
    float core = smoothstep(0.35, 1.1, ps);
    vec3 pasteCol = mix(vec3(0.42, 0.62, 0.12), vec3(0.12, 0.24, 0.03), core) * (0.3 + lum * 1.1);
    float grain = fract(sin(dot(floor(uv * uRes / 4.0), vec2(12.9898, 78.233))) * 43758.5453);
    pasteCol *= 0.9 + 0.2 * grain * core;
    vec3 c2 = mix(thin, pasteCol, smoothstep(0.18, 0.7, ps));
    // wet glint where the paste bulges toward the eye
    vec3 nrm = normalize(vec3(-gradP * 5.0, 1.0));
    float glint = pow(max(0.0, dot(nrm, normalize(vec3(-0.35, 0.55, 0.75)))), 10.0) * smoothstep(0.2, 0.6, ps);
    c2 += vec3(0.9, 1.0, 0.7) * glint * (0.15 + lum * 0.8);
    col = mix(col, c2, smoothstep(0.02, 0.22, ps));
  }
  if (water > 0.002) {
    vec3 nrm = normalize(vec3(-gradW * 10.0, 1.0));
    float glint = pow(max(0.0, dot(nrm, normalize(vec3(-0.3, 0.6, 0.74)))), 30.0);
    col *= 1.0 + smoothstep(0.05, 0.4, water) * 0.12;
    col += vec3(1.0, 0.97, 0.92) * glint * smoothstep(0.05, 0.3, water) * (0.25 + dot(big0, vec3(0.3)) * 0.8);
  }

  // ---- bloom: the multi-scale blur, above a soft threshold
  vec3 bl = texture2D(tBlur, uv).rgb;
  col += max(bl - 0.65, 0.0) * uGrade.z;

  // ---- smudges on the glass glow where something bright sits behind them
  vec2 duv = uv * vec2(uAspect, 1.0) * 0.9 + vec2(0.13, 0.07);
  float dirt = texture2D(tDirt, duv).r;
  vec3 big = texture2D(tBig, uv).rgb;
  col += big * dirt * 0.32 + max(big - 0.8, 0.0) * dirt * 0.7;

  // ---- tinted glass (sunglasses)
  col = mix(col, col * uTint.rgb * 1.6, uTint.a);

  // ---- the frame. Very close to the eye, so very soft. Outside it: the naked eye, out of focus
  float d = lensSDF(p);
  float soft = 0.05;
  float inLens = 1.0 - smoothstep(-soft, soft, d);
  vec3 naked = big * 0.85;
  float th = uShape.z;
  float frameA = smoothstep(-soft, soft, d) * (1.0 - smoothstep(th - soft * 1.4, th + soft * 1.4, d));
  vec3 frameCol = uFrame * (0.25 + dot(big, vec3(0.3, 0.6, 0.1)) * 0.5);
  // a bright line where the inner edge of the frame catches the pendant
  float rim = exp(-pow((d - 0.012) / 0.02, 2.0)) * (0.5 + 0.5 * smoothstep(-0.6, 0.8, p.y));
  frameCol += uRim * rim * 0.45;
  vec3 outside = mix(naked, frameCol, frameA);
  col = mix(outside, col, inLens);
  // the nose, soft and warm, low on the inner side (this is his right eye)
  float nose = 1.0 - smoothstep(0.0, 0.32, length((p - vec2(-uAspect * 1.12, -1.15)) * vec2(1.0, 0.75)) - 0.25);
  col = mix(col, vec3(0.20, 0.10, 0.07) * (0.5 + dot(big, vec3(0.33)) * 0.8), nose * 0.85);

  // ---- hit flash, desaturation
  col = mix(col, uFlash.rgb, uFlash.a);
  float g = dot(col, vec3(0.2126, 0.7152, 0.0722));
  col = mix(col, vec3(g), uGrade.y);

  // ---- eyelids: very close to the eye, so very soft; lashes are a dark fringe on the edge.
  //      Shut, the light comes through warm and red.
  float k = uLid.x;
  if (k > 0.001) {
    vec2 q = vec2(p.x / max(uAspect, 1.0), p.y);
    float yTop = 1.0 - 2.0 * k * 0.64;
    float yBot = -1.0 + 2.0 * k * 0.36;
    float bend = q.x * q.x * 0.16;
    float lashN = sin(q.x * 31.0 + sin(q.x * 7.0) * 2.0) * 0.5 + sin(q.x * 53.0 + 1.3) * 0.25;
    float lash = (0.03 + 0.02 * lashN) * smoothstep(0.0, 0.3, k);
    float top = smoothstep(yTop - 0.16, yTop + 0.06, p.y + bend - lash);
    float bot = 1.0 - smoothstep(yBot - 0.08, yBot + 0.14, p.y - bend);
    float lid = clamp(top + bot, 0.0, 1.0);
    // near shut, what's left of the view is a blurred slit seen through the lashes
    col = mix(col, big * 0.9, smoothstep(0.55, 0.9, k) * 0.7);
    vec3 through = vec3(0.24, 0.045, 0.03) * (0.2 + dot(big, vec3(0.33)) * 0.6) * uLid.y;
    col = mix(col, through, lid);
  }

  // ---- vignette, exposure, tone map, grain
  float vig = 1.0 - smoothstep(0.55, 1.6, length(p * vec2(1.0 / max(uAspect, 0.5), 1.0)) );
  col *= mix(0.62, 1.0, vig);
  col *= uGrade.x;
  col = aces(col);
  col = toSRGB(col);
  float gr = hash(uv * uRes + fract(uTime * 7.3) * 91.7) - 0.5;
  col += gr * 0.028;
  gl_FragColor = vec4(col, 1.0);
}
`;

const FXAA_FRAG = /* glsl */ `
uniform sampler2D tSrc;
uniform vec2 uTexel;
varying vec2 vUv;
float luma(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }
void main() {
  vec3 rgbNW = texture2D(tSrc, vUv + vec2(-1.0, -1.0) * uTexel).rgb;
  vec3 rgbNE = texture2D(tSrc, vUv + vec2(1.0, -1.0) * uTexel).rgb;
  vec3 rgbSW = texture2D(tSrc, vUv + vec2(-1.0, 1.0) * uTexel).rgb;
  vec3 rgbSE = texture2D(tSrc, vUv + vec2(1.0, 1.0) * uTexel).rgb;
  vec3 rgbM = texture2D(tSrc, vUv).rgb;
  float lNW = luma(rgbNW), lNE = luma(rgbNE), lSW = luma(rgbSW), lSE = luma(rgbSE), lM = luma(rgbM);
  float lMin = min(lM, min(min(lNW, lNE), min(lSW, lSE)));
  float lMax = max(lM, max(max(lNW, lNE), max(lSW, lSE)));
  vec2 dir = vec2(-((lNW + lNE) - (lSW + lSE)), ((lNW + lSW) - (lNE + lSE)));
  float red = max((lNW + lNE + lSW + lSE) * 0.03125, 1.0 / 128.0);
  float rcp = 1.0 / (min(abs(dir.x), abs(dir.y)) + red);
  dir = clamp(dir * rcp, -8.0, 8.0) * uTexel;
  vec3 a = 0.5 * (texture2D(tSrc, vUv + dir * (1.0 / 3.0 - 0.5)).rgb + texture2D(tSrc, vUv + dir * (2.0 / 3.0 - 0.5)).rgb);
  vec3 b = a * 0.5 + 0.25 * (texture2D(tSrc, vUv + dir * -0.5).rgb + texture2D(tSrc, vUv + dir * 0.5).rgb);
  float lB = luma(b);
  gl_FragColor = vec4((lB < lMin || lB > lMax) ? a : b, 1.0);
}
`;

export class Post {
  private scene!: THREE.WebGLRenderTarget;
  private half!: THREE.WebGLRenderTarget;
  private dof!: THREE.WebGLRenderTarget;
  private dof2!: THREE.WebGLRenderTarget;
  private down: THREE.WebGLRenderTarget[] = [];
  private up: THREE.WebGLRenderTarget[] = [];
  private ldr!: THREE.WebGLRenderTarget;
  readonly lens: LensMap;
  private cocP: Pass;
  private gatherP: Pass;
  private tentP: Pass;
  private downP: Pass;
  private upP: Pass;
  private compP: Pass;
  private fxaaP: Pass;
  private w = 1;
  private h = 1;
  private tier: PostTier = { dof: 24, bloom: true, fxaa: false, msaa: 0 };
  private gatherTaps = -1;

  constructor(private gl: THREE.WebGLRenderer) {
    const common = () => ({
      uNearFar: { value: new THREE.Vector2(0.6, 3000) },
      uCoc: { value: new THREE.Vector4(38, 2.0, 0.005, 0.04) },
      uRes: { value: new THREE.Vector2(1, 1) },
    });
    this.cocP = new Pass(COC_FRAG, { ...common(), tScene: { value: null }, tDepth: { value: null } });
    this.gatherP = new Pass(GATHER_FRAG, { tHalf: { value: null }, uTexel: { value: new THREE.Vector2() }, uMaxR: { value: 10 } }, { TAPS: 24 });
    this.tentP = new Pass(TENT_FRAG, { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() } });
    this.downP = new Pass(DOWN_FRAG, { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() } });
    this.upP = new Pass(UP_FRAG, { tLow: { value: null }, tHigh: { value: null }, uTexel: { value: new THREE.Vector2() }, uMix: { value: 0.62 } });
    this.compP = new Pass(COMPOSITE_FRAG, {
      ...common(),
      tScene: { value: null },
      tDepth: { value: null },
      tDof: { value: null },
      tBlur: { value: null },
      tBig: { value: null },
      tLens: { value: null },
      tDirt: { value: dirtTexture() },
      uLensTexel: { value: new THREE.Vector2() },
      uAspect: { value: 1 },
      uTime: { value: 0 },
      uShape: { value: new THREE.Vector4(0, 2.3, 0.04, 1.06) },
      uFrame: { value: new THREE.Color() },
      uRim: { value: new THREE.Color() },
      uTint: { value: new THREE.Vector4(1, 1, 1, 0) },
      uLid: { value: new THREE.Vector4() },
      uFlash: { value: new THREE.Vector4() },
      uGrade: { value: new THREE.Vector4(1, 0, 0.12, 1) },
      uDebug: { value: Number(new URLSearchParams(location.search).get('view') ?? 0) },
    });
    this.fxaaP = new Pass(FXAA_FRAG, { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() } });
    this.lens = new LensMap(4, 4);
    this.alloc(4, 4);
  }

  setTier(t: PostTier) {
    const msaaChanged = t.msaa !== this.tier.msaa;
    this.tier = t;
    if (t.dof > 0 && t.dof !== this.gatherTaps) {
      this.gatherTaps = t.dof;
      this.gatherP.mat.defines.TAPS = t.dof;
      this.gatherP.mat.needsUpdate = true;
    }
    if (msaaChanged) this.alloc(this.w, this.h);
  }

  private alloc(w: number, h: number) {
    for (const rt of [this.scene, this.half, this.dof, this.dof2, this.ldr, ...this.down, ...this.up]) rt?.dispose();
    this.w = w;
    this.h = h;
    this.scene = makeRT(w, h, { depthBuffer: true, samples: this.tier.msaa });
    this.scene.depthTexture = new THREE.DepthTexture(w, h);
    const hw = Math.ceil(w / 2);
    const hh = Math.ceil(h / 2);
    this.half = makeRT(hw, hh);
    this.dof = makeRT(hw, hh);
    this.dof2 = makeRT(hw, hh);
    this.down = [];
    this.up = [];
    let dw = hw;
    let dh = hh;
    for (let i = 0; i < 5; i++) {
      dw = Math.max(1, Math.ceil(dw / 2));
      dh = Math.max(1, Math.ceil(dh / 2));
      this.down.push(makeRT(dw, dh));
      if (i < 4) this.up.push(makeRT(dw, dh));
    }
    this.ldr = makeRT(w, h, { type: THREE.UnsignedByteType });
    this.lens.setSize(hw, hh, w / h);
  }

  get height() {
    return this.h;
  }

  setSize(w: number, h: number) {
    if (w !== this.w || h !== this.h) this.alloc(w, h);
  }

  render(scene: THREE.Scene, cam: THREE.PerspectiveCamera, P: PostParams) {
    const gl = this.gl;
    const w = this.w;
    const h = this.h;
    // 1. scene
    gl.setRenderTarget(this.scene);
    gl.clear();
    gl.render(scene, cam);
    const nf = new THREE.Vector2(cam.near, cam.far);
    const coc = new THREE.Vector4(P.focus, 2.1, 0.0052 * Math.max(1, 30 / Math.max(P.focus, 1)), 0.03);
    const res = new THREE.Vector2(w, h);
    // 2. CoC + half-res colour
    let src: THREE.Texture = this.scene.texture;
    this.cocP.u.tScene.value = this.scene.texture;
    this.cocP.u.tDepth.value = this.scene.depthTexture;
    this.cocP.u.uNearFar.value.copy(nf);
    this.cocP.u.uCoc.value.copy(coc);
    this.cocP.u.uRes.value.copy(res);
    this.cocP.render(gl, this.half);
    // 3. DOF gather
    if (this.tier.dof > 0) {
      this.gatherP.u.tHalf.value = this.half.texture;
      this.gatherP.u.uTexel.value.set(1 / this.half.width, 1 / this.half.height);
      this.gatherP.u.uMaxR.value = coc.w * h * 0.5;
      this.gatherP.render(gl, this.dof);
      this.tentP.u.tSrc.value = this.dof.texture;
      this.tentP.u.uTexel.value.set(1 / this.half.width, 1 / this.half.height);
      this.tentP.render(gl, this.dof2);
      src = this.dof2.texture;
    } else src = this.half.texture;
    // 4. pyramid
    let prev: THREE.Texture = src;
    let pw = this.half.width;
    let ph = this.half.height;
    for (const rt of this.down) {
      this.downP.u.tSrc.value = prev;
      this.downP.u.uTexel.value.set(1 / pw, 1 / ph);
      this.downP.render(gl, rt);
      prev = rt.texture;
      pw = rt.width;
      ph = rt.height;
    }
    let low: THREE.WebGLRenderTarget = this.down[4];
    for (let i = 3; i >= 0; i--) {
      this.upP.u.tLow.value = low.texture;
      this.upP.u.tHigh.value = this.down[i].texture;
      this.upP.u.uTexel.value.set(1 / low.width, 1 / low.height);
      this.upP.render(gl, this.up[i]);
      low = this.up[i];
    }
    // 5. the lens map
    this.lens.render(gl);
    // 6. composite
    const u = this.compP.u;
    u.tScene.value = this.scene.texture;
    u.tDepth.value = this.scene.depthTexture;
    u.tDof.value = this.dof2.texture;
    u.tBlur.value = this.up[0].texture;
    u.tBig.value = this.down[2].texture;
    u.tLens.value = this.lens.rt.texture;
    u.uLensTexel.value.set(1 / this.lens.rt.width, 1 / this.lens.rt.height);
    u.uNearFar.value.copy(nf);
    u.uCoc.value.copy(coc);
    u.uRes.value.copy(res);
    u.uAspect.value = P.aspect;
    u.uTime.value = P.time;
    const g = P.glasses;
    u.uShape.value.set(g.shape, g.exp, g.thick, g.scale);
    u.uFrame.value.set(g.frame);
    u.uRim.value.set(g.rim);
    if (P.tint) u.uTint.value.set(P.tint.r, P.tint.g, P.tint.b, 0.55);
    else u.uTint.value.set(1, 1, 1, 0);
    u.uLid.value.set(P.lid, P.lidRed, P.sting, P.drunk);
    u.uFlash.value.copy(P.flash);
    u.uGrade.value.set(P.exposure, P.desat, this.tier.bloom ? 0.16 : 0.06, this.tier.dof > 0 ? 1 : 0);
    if (this.tier.fxaa) {
      this.compP.render(gl, this.ldr);
      this.fxaaP.u.tSrc.value = this.ldr.texture;
      this.fxaaP.u.uTexel.value.set(1 / w, 1 / h);
      this.fxaaP.render(gl, null);
    } else this.compP.render(gl, null);
  }
}
