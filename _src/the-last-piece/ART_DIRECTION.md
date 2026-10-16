# ART DIRECTION: The Last Piece

## The idea

Macro food photography, shot through somebody else's glasses.

It is late at a sushi counter. The light is tungsten and paper lanterns. The plate is in sharp
focus and everything else falls away into soft blur. You are a 5 cm piece of salmon nigiri, and
the camera is the man who wants to eat you. You are always looking *through his lens*: you can
see the edge of its frame, the smudges catching the light, and later the wasabi you put there.

## Signature: the lens

The lens is the one element everything else stays quiet around.

- **Frame.** The lens shape changes with each diner: round wire, black acetate square, gold
  half-moon readers, tinted aviators, tortoiseshell cat-eye. Seen from behind, the frame is a
  dark, very soft-edged silhouette with one rim highlight.
- **Outside the lens.** Whatever the frame doesn't cover, his naked eye sees, so it is out of
  focus. The half-moon readers are the extreme case: the top third of the screen is blur.
- **On the glass.** Smudges and dust stay invisible until a bright light sits behind them,
  then they glow.
- **Wasabi.** When you score, a thick green smear lands on the lens. It is opaque at the core
  and thins to a translucent, refracting edge. The lantern bokeh behind it bends and goes green.
  It stays for the rest of the course and drips. Success makes the game harder to see. This is
  the most important image in the game.

Everything else is restrained. The room is plum-brown darkness with warm discs of bokeh. Only
three things in frame are saturated: you (coral), the wasabi (acid green), and the danger (his
lacquer and its vermilion strike rings).

## Palette

sRGB hex, with each token's role. Shader and material colours are converted to linear at load.

| Token | Hex | Role |
|---|---|---|
| `room-0` | `#120b0d` | far room, the darkest value in frame (never pure black) |
| `room-1` | `#2b1813` | counter and wall in shadow |
| `lantern` | `#ffb35c` | paper lanterns, bokeh discs |
| `tungsten` | `#ffd7a1` | key light (pendant over the plate) |
| `table` | `#4a2c1a` | walnut counter |
| `table-hi` | `#80512d` | wood grain highlight |
| `porcelain` | `#eee6d6` | plates, cups |
| `porcelain-lo` | `#b3a58e` | porcelain in shadow, crackle |
| `sometsuke` | `#2c4f95` | blue underglaze (course 2) |
| `slate` | `#25272b` | slate board (course 4) |
| `hinoki` | `#d9b884` | pale cypress (courses 3, 5) |
| `rice` | `#f5f0e4` | rice grains |
| `rice-lo` | `#cdbfa6` | rice in shadow |
| `salmon` | `#f27b4b` | **you** |
| `salmon-fat` | `#ffd8c0` | fat lines |
| `salmon-deep` | `#c64f2b` | thick muscle, shadowed edge |
| `wasabi` | `#8fc93f` | **the weapon** |
| `wasabi-deep` | `#4d7a19` | paste in shadow, lens smear edge |
| `wasabi-hi` | `#d6f291` | wet highlight, "shot is on" bracket |
| `lacquer` | `#8c1d15` | his chopsticks (course 1/6) |
| `danger` | `#ff4a2a` | strike rings, the sweep line |
| `soy` | `#2e1508` | soy (near-black, very glossy) |
| `gari` | `#f3c2c8` | pickled ginger |
| `ink` | `#0d0a0c` | spectacle frame, eyelids |
| `bone` | `#f3e6cf` | HUD text |
| `bill` | `#f6efe0` | card paper |
| `hanko` | `#c8321e` | card stamp |

Rules:

- Gameplay-critical hues are unique and survive blur. Coral is only you, acid green is only
  wasabi, and vermilion is only "something is coming down here".
- Warm light, warm shadows. No teal-and-orange grade; shadows lean plum, not blue.
- The brightest values in frame are lanterns and specular glints. Porcelain never clips to
  white.

## Shading and lighting

Physically based materials from three.js (Standard/Physical), reshaped per food with injected
shader code. The reason is gloss: food photography is all about wet specular, and
image-based lighting gives the reflections for free.

- **Environment.** A small procedural room rendered once into a PMREM cube: lantern
  spheres, a pendant, the warm counter, dark walls. The porcelain, lacquer, soy and wet salmon
  all reflect it, so the lanterns appear in the soy dish without any special-casing.
- **Key.** A spot "pendant" straight above the plate, warm, with a soft shadow map. Its shadows
  are the telegraph: the chopstick tips' shadows slide together on the plate as the tips come
  down. A small strike ring marks the exact spot.
- **Fill.** Environment only. **Rim.** A dim warm back-light from the counter so food
  silhouettes separate from the dark room.
- **Food:**
  - Salmon: clearcoat for wetness, procedural fat striations that run diagonally and wave,
    a lighter cut face on top, and fake subsurface (wrap diffuse plus a warm transmission term
    at thin edges).
  - Rice: hundreds of instanced grains over a soft core, each grain a slightly different
    off-white, so the silhouette breaks up the way real nigiri does.
  - Wasabi: lumpy displaced paste, matte with a wet sheen.
  - Chopsticks: lacquer clearcoat with a sharp highlight running down the shaft.
- **Character.** The sushi has a face: two glossy eyes and a mouth drawn with SDFs on the
  rice. The pupils track the nearest threat. It also has rice-grain feet and arms. Squash
  and stretch, panic, the throw and the hit are all procedural.

## Post-processing (in order)

1. **Scene.** Half-float HDR target with a depth texture.
2. **Depth of field.** CoC from depth, thin-lens style, focus locked on the sushi. A gather blur
   at half resolution (golden-angle spiral, scatter-as-gather weighting). This is what makes it
   macro: shallow, with the room dissolving.
3. **Bloom.** Thresholded, a mip chain at half resolution. It is lanterns, glints and the
   finale only, never a general haze.
4. **Lens.**
   - Wasabi smears and tears: a height map rendered at reduced resolution, then refraction,
     diffusion, absorption and specular.
   - Smudges lit by the bloom behind them.
   - The frame mask: outside the lens the view comes from the blurred buffer.
   - Chromatic fringe toward the rim, and a vignette.
5. **Eyelid.** Blinks, the finale's squeeze, and the eaten fade. Lids are a very soft dark curve
   with lashes; when shut, light comes through warm and red.
6. **Tone map and grade.** Filmic (ACES fit), slightly lifted plum blacks, warm highlights,
   fine grain, then FXAA.

Quality tiers cut DOF taps (or replace the gather with the blurred buffer), bloom levels,
shadow map size, grain count and DPR.

## HUD type

- Diegetic first. The "shot is on" read is a pair of wasabi-green corner brackets around
  the sushi (the prototype's amber brackets, recoloured) plus a lit throw button. Strike rings
  are on the plate.
- DOM text is small, sparse, and tracked out:
  - top left: the course, in small caps;
  - top right: **APPETITE** (his, pips that go dark as you score) and **FRESH** (yours, five
    salmon pips). These are the prototype's labels.
- Type is the system serif for titles (Hiragino Mincho, Yu Mincho, then Georgia) and system
  monospace for numbers and labels. No web fonts: no network.
- Cards look like the paper you get at the counter. The briefing is a menu slip. A win is the
  bill ("CHECK, PLEASE": time, freshness, throws) with a red hanko stamp. A loss is the same
  slip stamped "ITADAKIMASU".

## Review of the first draft (what was generic, and what changed)

- The first draft said "cozy restaurant, warm bokeh, film grain". Any food scene could say
  that. What makes this one specific is **whose eyes these are**: the frame, the naked-eye blur
  outside it, the dirty glass and his blinking. The lens moved from a post effect to the
  signature, and the glasses became per-course art direction (each diner's frame changes the
  composition).
- Removed: lens flares (they belong to a camera, not to glasses), teal shadows, and a general
  bloom haze.
- Added: the rule that the only saturated colours are you, wasabi and danger. The game has
  to stay readable through shallow depth of field and a smeared lens.
