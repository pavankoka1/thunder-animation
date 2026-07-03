# Outer-betspot energy — reference-video analysis

> "We've already achieved thunder animation, this should be even more easy
> compared to what we've done. … check frame by frame to capture the data,
> only after we get the data, we should proceed further."

Source files (user's Downloads):

- `energy inside active spot.mp4` — **inside** effect we already render.
- `Plinko Animation SuperBall 5.mp4` — reference for the **outer / around-
  betspot** energy effect the user wants next.

Frames extracted to `/tmp/vidframes/*.jpg` via OpenCV (Python 3.14, headless
opencv 4.13). FPS, duration, frame count, and crop boxes are noted below.

---

## 1. `energy inside active spot.mp4` — already implemented

| Property | Value |
|---|---|
| Size | 1064 × 864 |
| FPS | 24 |
| Frames | 145 |
| Duration | 6.04 s |

**What it is:** a continuously animating purple plasma field with a dense
network of white branching filaments. Sample frames 0, 26, 65, 91, 130 all
show the same character — a bright cyan/white filament skeleton inside a
deep purple base, with the filaments crackling and shifting slightly between
frames. This is a looping background animation, not a one-shot strike.

**Mapping to our work:** this is the existing inside-betspot reveal we
already drive via plasma.svg + our network thunder strike on `/paths`. No
new work required here.

---

## 2. `Plinko Animation SuperBall 5.mp4` — outer edge energy reference

| Property | Value |
|---|---|
| Size | 750 × 1334 (portrait) |
| FPS | 29.97 |
| Frames | 176 |
| Duration | 5.87 s |

The video shows a *different* game (a triangle Plinko board) — the user is
sharing it as a **style reference** for the kind of edge energy they want
**around our betspot**, not the geometry. The relevant detail lives in the
triangle's border line and the bottom chip slots.

### Border-line construction (apex + edges close-ups)

Looking at `plinko_left_edge_f024.jpg`, `plinko_apex_f024.jpg`,
`plinko_apex_f036.jpg`, `plinko_left_edge_f088.jpg`:

The border is a **two-line stack**:

1. **Inner neon stroke**: thin (~2 CSS px) pink/magenta line, almost pure
   `rgb(255, 90, 170)` at peak, with a brighter near-white core down the
   middle.
2. **Outer cyan-white glow halo**: ~4–6 CSS px soft bloom in cool white-
   blue, sits a few pixels outside the inner line.

So the rim is "magenta line + cyan corona" — colour-complementary so the
outer halo reads as a separate energy layer, not just a magenta bloom.

### The "electric arc" effect

`plinko_apex_f024.jpg` and `plinko_apex_f036.jpg` are the clearest. White-
cyan **lightning arcs** are visible *crackling along* the border line:

- Thin filaments (~1 CSS px core), following the border path roughly but
  with short perpendicular forks of 5–15 CSS px.
- Pure white core with cyan halo (`rgba(170, 230, 255, ~0.8)`).
- Each arc occupies maybe 30–80 CSS px of border length.
- Arcs appear intermittently — 2–4 alive at any given moment along the
  whole triangle, each lasting ~80–160 ms.
- They drift along the border edge over their life.

This is conceptually **the same filament network we already render
inside the betspot, but constrained to a thin band hugging the border**.

### Pulses

`plinko_left_edge_f048.jpg` vs `plinko_apex_f110.jpg` (calm) show the
border colour shifting:

- Calm baseline: cooler magenta with white centre, gentle outer glow.
- Pulse peak: shifts toward **bright violet / purple**, halo intensifies,
  glow extends further out. Whole border lifts in brightness.

Pulses run on a slow heartbeat (~1 Hz), independent of the arcs.

### Bottom chips / multiplier slots

`plinko_05/06/07` frames + `bottom_chips_f024.jpg`:

- Each chip slot has its own **pink/magenta glowing border** that *can*
  light up independently.
- When a chip "qualifies" (e.g. f048 → f063), its border lights up
  brighter, the colour shifts pink → magenta-yellow, and a subtle radial
  glow appears behind it.
- This is the same border-energy treatment scaled down to per-slot.

### Apex orb (one-shot)

`plinko_03_f0047_t01568ms.jpg`: at strike onset, a **magenta-purple plasma
orb** with white electric arcs appears at the triangle apex. ~20 px wide
hot core + ~60 px corona + a few short white arc forks branching out
horizontally. Lasts ~200 ms before contracting. Probably maps to a "ball
spawned" moment in their game. We can borrow it as the **drop point /
chip-centre** burst for our betspot.

---

## Implementation plan for our betspot (draft, no code yet)

Once we proceed, the natural pieces are:

1. **Border-path resource.** Compute the rounded-rect outline of
   `BETSPOT_CLIP` as a polyline at the workmask resolution. This is the
   "filament network" for the edge effect.

2. **Static neon stack** — render the base border every frame:
   - Pass A: 1.0 viewBox-px stroke, pure white, no shadow.
   - Pass B: 2.4 viewBox-px stroke, `rgba(255, 90, 170, …)`, no blur.
   - Pass C: 6 viewBox-px stroke, `rgba(170, 230, 255, …)`, `blur(2px)`.
   - Composited additively, this matches the magenta-line + cyan-halo
     stack we see in the reference.

3. **Edge-arc particle system.** Reuse the existing `sparkPool` model but
   anchor each particle to a parametric `t ∈ [0, 1]` along the border-path
   instead of an `(x, y)` pixel. Each "arc" is a short polyline of 3–6
   points constructed from the border tangent + a couple of perpendicular
   jitters, lives 80–160 ms, drifts along `t`.

4. **Heartbeat pulse.** Modulate the whole border's brightness with a slow
   1 Hz sine plus an asymmetric envelope (fast attack, slow decay) so we
   get the pulse beat without it looking robotic.

5. **Optional apex / chip burst** at the chip centre — small radial-
   gradient orb tied to the existing `paintOriginBurst` so the inside
   strike and outer pulse share an attack moment.

Once we agree on the breakdown, I'll wire piece 1+2 first (just the static
neon rim with no animation), confirm colour/thickness look right, then add
arcs + pulse.
