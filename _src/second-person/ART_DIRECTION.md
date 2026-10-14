# ART DIRECTION — Second Person: the walk home

## One line

A street at dusk printed in a handful of flat inks, like a night woodblock print: cold haze
everywhere, and warmth only where a sodium lamp has pressed a pool of light onto wet stone.

## The signature: the sodium pool

Every lamp prints a **banded pool** onto the pavement: three hard-edged concentric steps of
sodium, brightest under the lamp, stepping down to nothing. In the pool, and only there:

- the stone is wet, and the lamp shows as one vertical streak in the puddles;
- drizzle becomes visible as fine straight lines;
- people pick up a sodium rim on the side facing the lamp.

The player walks from pool to pool. Between pools the street is cold. The chaser does not
take light: crossing a pool it stays a flat black cut-out, which is when it reads best.

The finish glow is the same element at its largest: the last pool, with its source behind
the lens. In the last 40 m its outer band creeps up the bottom of the frame, and its steps
widen as you close in.

Everything else stays quiet around the pools: no other warm colour, no bloom, no glints,
nothing animated in the background that competes.

## Palette

Value is rationed. Most of the frame sits in a narrow mid-dark band. The player is the
lightest lit surface. The chaser is the darkest thing. The two warm inks have opposite jobs.

| Token | Hex | Role |
|---|---|---|
| `ink` | `#0b0e14` | Outlines, the chaser's body, darkest value, card panels |
| `night` | `#141b28` | Sky zenith |
| `haze` | `#4f5c66` | Fog colour; what the far street dissolves into |
| `haze-low` | `#46525c` | Sky at the horizon, just under haze |
| `facade-1..5` | `#2c343b` `#333a3f` `#2a3138` `#38393a` `#303a3e` | Building walls (street file) |
| `stone` | `#5c626a` | Near pavement |
| `stone-far` | `#535962` | Far pavement |
| `kerb` | `#767b82` | Kerb face and edge |
| `asphalt` | `#23272c` | Road |
| `paint` | `#c9c2a6` | Road markings, always faded into the asphalt |
| `dust` | `#8c9aa0` | HUD labels, unlit signage, cold windows (`#cfd8dd` at full) |
| `cold` | `#dfe8f0` | Headlights and their beams |
| `bone` | `#e9dfc7` | The player. Nothing else is this light except emissive lights |
| `sodium` | `#f2c53c` | **Home.** Lamps, pools, lit windows, aim ring, finish glow, the "go" text |
| `ember` | `#e0552f` | **Harm.** Chaser eyes, tail lights, the aim ring over the road, "Caught" and "Hit" |
| `crowd-1..8` | `#7d8794` `#8f7f6e` `#6d7b83` `#93887a` `#5f6b78` `#a09484` `#71685f` `#849097` | Pedestrian coats (street file), each pushed toward haze by 35 % |
| `car-1..7` | `#4a3a40` `#25333f` `#3c4a3a` `#6d6a60` `#1d1f24` `#4a3550` `#5e5f52` | Car bodies. The street file had a brick red and an ochre; both cooled so cars carry no warmth except their tail lights |

## Shading model

- **Low-poly, faceted.** Flat normals per face. No textures on characters or cars.
- **Banded light.** Each light's contribution (N·L × falloff) is quantised into hard steps
  before it is added: three steps for sodium lamps, two for headlights, two for the cold sky
  key. Steps get one pixel of smoothing so they don't crawl.
- **Light sources:**
  - Cold hemisphere ambient: `haze` from above, `ink` from below. It sets the mid-dark band.
  - A weak cold key from high behind the camera, two bands, for form on people and cars.
  - Sodium lamps: up to 8 nearest point lights (6 on the low tier), range about 9 m.
  - Headlights: up to 6 cold spot lights from the nearest cars. Far-lane cars light the road
    in front of them, so their beams appear on screen before they do.
  - The finish pool: one large sodium light behind the camera, scaled by the last 40 m.
- **Fog** is height-and-distance haze toward `haze`. It is stepped very slightly (5 soft
  steps) so the street recedes like layered paper. If the steps crawl in motion, they
  become smooth.
- **The chaser is unlit.** Flat `ink`, with `ember` eyes as the only emissive. It ignores fog
  too, so it stays a silhouette at any distance.
- **Windows** are drawn in the facade shader: a world-space grid with hashed lit cells,
  `sodium` (28 %) or cold (14 %), the rest dark glass. Shopfronts at street level get one
  lit display window per bay and a canvas-texture sign band.

## Post-processing

One full-screen pass after the scene. In order:

1. **Ink lines** from depth discontinuities. About 1.5 px near the camera, thinning and
   fading into the haze with distance, like line weight in a print. No normal buffer: depth only.
2. **Proximity vignette** toward `ink`. Its radius closes as the chaser's lead shrinks.
3. **Desaturation** pulse for a near miss, and a full fade to grey on death, with `ember` and
   `sodium` kept.
4. **Finish spill:** the bottom edge of the frame takes the finish pool's outer band.

Lights don't use a bloom shader. A lamp head or headlight gets a **printed halo**: two flat
concentric discs, additive, like the pools. Lamp cones are flat translucent shapes: one tint
with a soft edge, not ray-marched.

## HUD type

- System monospace (`ui-monospace`, SF Mono, Menlo). No web fonts, no network.
- Labels: 10 px, uppercase, 0.18–0.22 em tracking, `dust`.
- Card titles: 22 px, sentence case, normal tracking, `bone` (`ember` for Caught and Hit).
- Body copy: 12 px, 1.7 line height, bone at 80 %.
- The only `sodium` text is the call to action ("Touch to begin"). The only `ember` text is
  harm.
- Cards are flat `ink` panels at 82 % with one hairline rule on top, left-aligned text. The
  buttons are flat, with no blur and no glass.
- The progress bar is a hairline: a `bone` dot for you, an `ink` dot with an `ember` core for
  it, and a `sodium` tick for home.

## Review of the first draft

The first draft of this document was revised. Notes on what read as generic and why it changed:

- **Bloom on all emissives → printed halos.** A soft glow around every light is the default
  look for any moody night city. Flat stepped halos repeat the pool's shape language instead.
- **Rain across the whole frame + wet reflections everywhere → drizzle and wet stone only
  inside light.** Full-screen rain and mirror-wet streets is the stock "noir city" image. Keeping
  both inside the pools makes them part of the signature instead of wallpaper.
- **Teal-and-orange grade → no grade.** The palette is authored in the materials. A
  post-process grade would have been a second, generic opinion on top.
- **Chromatic aberration, animated film grain, lens dirt → cut.** These say "cinematic" and
  have nothing to do with a print or a walk home.
- **Neon signage → unlit signs.** Shop signs are dark boards with `dust` lettering. The one
  lit thing in a shopfront is the display window. Neon is the most generic choice available,
  and it would have broken the rule that `sodium` is the only warm colour.
- **Glass HUD buttons (the street file's `backdrop-filter` blur) → flat ink panels.** Glass
  is the default UI choice. Flat panels match the flat inks.
- **Volumetric lamp cones were kept,** but as flat printed shapes rather than ray-marched
  fog, because the brief asks for them to read in the haze. If they compete with the pools
  in screenshots, they get cut first.
