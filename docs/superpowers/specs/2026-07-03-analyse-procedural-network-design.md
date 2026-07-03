# Analyse route — procedural plasma-network motion design

**Date:** 2026-07-03
**Route:** `/analyse` (`src/pages/AnalysePage.jsx` → `src/analyse/AnalyseBetspot.jsx`)
**Status:** Approved (procedural, code-driven animated network; no runtime images)
**Supersedes:** the sprite-flipbook design and both earlier procedural attempts
(re-stroke overlay, pixel warp). The flipbook worked but the artist frames are an
unaffordable runtime asset; the two earlier procedural tries either overlaid new
strokes on a bake or only warped one static image. This design generates and
animates the filament network entirely in code.

## Goal

The inner energy is a **procedurally generated plasma-lightning network** painted
on the canvas: filaments branch out from three central hubs and their paths
**continuously reform** — branches grow along one route, retract, and regrow on a
new route — so the topology genuinely changes over time. No sprite sheet, no
pre-rendered frames at runtime; only code and a tiny bit of path data generated
on the fly.

Integration is unchanged: screen-blend over the blue body, edge fade, reveal/hide
transition, neon border, reduced-motion→static, tab-hidden pause. Analyse-scoped;
no `src/canvas/**` or `src/webgl/**` edits (pure geometry helpers reused read-only).

**Accepted tradeoff:** this reads as clean drawn lightning-plasma, sparser than the
dense pre-rendered artwork. It reproduces the _behaviour_ (branching from 3 hubs,
paths reforming), not a pixel-match of the frames.

## Coordinate space

All geometry is in energy-canvas pixels: `w = BODY.width·STAGE.scale = 438`,
`h = BODY.height·STAGE.scale = 204`. Three hubs sit on the midline near the
frames' bright clusters: at `x ≈ {0.28, 0.5, 0.72}·w`, `y ≈ 0.5·h` (tunable).

## Architecture

### `src/analyse/plasmaNetwork.js` (new)

Reuses only pure helpers from `src/canvas/lightning/geometry.js`
(`cumulativeLengths`, `pointAtLength`, `subdivideSegment`) — read-only, no
coupling to the home page's betspot origin. Everything else is analyse-local.

**Deterministic RNG.** `makeRng(seed)` → mulberry32 `() => [0,1)`. All generation
is seeded so a `(branch, cycle)` pair reproduces the same path (testable).

**Branch generation (pure).**
`generateBranch(hub, angle, length, seed)` → `{ points:[{x,y}], cumLengths, length }`.
Walks a jagged polyline outward from `hub` along `angle`, using `subdivideSegment`
fractal midpoint displacement for the lightning kink. May emit 0–2 recursive
forks (own sub-branch objects) with reduced length/displacement. Returns a flat
array of branch polylines. Clipped to stay within the body bounds.

**Network model (pure).**
`buildNetwork(w, h, hubs, opts)` → a static list of **branch slots**: each slot
is `{ hub, angle, baseLength, seed }` (the _identity_ of a branch; its actual
path is regenerated per life-cycle). ~6–9 slots per hub → ~20–27 total (tunable).

**Life cycle (pure).**
`branchLife(slotIndex, tSec)` → `{ cycle, extent, alpha }`:

- `cycle = floor((tSec + phase) / PERIOD)` — increments each period; the new
  cycle triggers a **new route** (path regenerated with `seed ⊕ cycle`).
- `extent ∈ [0,1]` — grow (ease-out) → hold → retract (ease-in) across the period.
- `alpha` — `extent`-gated brightness with a fast flicker term.
- `phase` is staggered by `slotIndex` (hash) so the network is never all-on or
  all-off; the count of live branches stays roughly constant (tested).

### Painter (canvas, in the same module)

`initNetwork(w, h)` (one-time): builds the branch slots, a reusable offscreen
canvas, the radial edge-fade vignette (as in the flipbook), and a per-slot path
cache (`{ cycle, branches }`) so a slot's jagged path is generated once per cycle,
not per frame.

`paintNetworkFrame(ctx, assets, tMs)` (per frame): for each slot, compute
`branchLife`; regenerate + cache its path if `cycle` changed; draw the visible
portion (draw length = `extent · length`, via `cumLengths`/`pointAtLength`) onto
the offscreen with three glow passes — wide violet halo (blurred), magenta mid,
white core, `lighter`-blended, per-vertex jitter added at paint time; then
`destination-in` the vignette and blit to `ctx`. Same signature as the flipbook's
`paintFlipbookFrame`, so the component rAF loop is unchanged.

Colour constants (violet/magenta/white) live at the top of the module. Tunables:
hub positions, slots-per-hub, `PERIOD`, jitter amplitude, glow widths, `FPS` is
not needed (paints every rAF tick; motion is time-based).

### `src/analyse/AnalyseBetspot.jsx` (edit)

- Bake effect → `const assets = initNetwork(w, h)` (w/h from BODY·scale), store in
  `motionRef`, size the canvas, paint the `t=0` frame as the static image,
  `setReady(true)`. No async image load needed (drop `loadPlasmaSheet`), but keep
  the effect async-safe/`cancelled` guard for consistency.
- rAF-loop effect, cleanup (repaint `t=0` static), visibility pause, reduced-motion
  listener: unchanged apart from calling `paintNetworkFrame`.

### `AnalysePage.jsx`

Subtitle: the inner energy is a procedurally generated lightning network branching
from three hubs, its paths continuously reforming in code. (Drop sprite wording.)

### Removed

`plasmaFlipbook.js` + its test, and `public/analyse/plasma-frames.webp`
(`scripts/encode-plasma-frames.py` may stay as a dead-simple utility or be removed
— removed, since the sheet is gone).

## Error handling

- Generation is pure and cannot fail on load; if `initNetwork` throws it is
  caught, logged once, and the energy stays empty (body + border still render).
- `paintNetworkFrame` no-ops on missing assets.

## Performance

~20–27 branch slots × 3 glow strokes on a 438×204 offscreen per frame, plus one
vignette composite and blit — same class as the home page's lightning paint, well
within budget. Path regeneration is once per slot per `PERIOD` (seconds), not per
frame. No per-frame allocation beyond the jittered point arrays.

## Testing / verification

1. Unit (vitest, pure, no DOM):
   - `makeRng`: deterministic for a seed; output in [0,1).
   - `generateBranch`: deterministic for a seed; all points within the body
     bounds; polyline has interior vertices; different seeds → different paths.
   - `branchLife`: `extent`/`alpha` in [0,1]; `cycle` increments once per PERIOD;
     summed live-extent across slots stays within a band over a long `t` sweep
     (staggered, not all-on/all-off); a slot's `cycle` at `t` and `t+PERIOD`
     differ by exactly 1.
2. Browser (Playwright): reveal → filaments visibly branch from the 3 hubs and
   **reform** — assert branch endpoints/topology differ between frames several
   seconds apart, beyond what a pixel shift explains (residual under best-shift
   alignment stays high); loops indefinitely; hide → static `t=0`; reduced-motion
   → static; tab-hidden → paused; frame-time p95 within budget.

## Out of scope

- Home-page betspot, WebGL route, shared canvas modules.
- Pixel-matching the pre-rendered artwork.
- Reveal choreography, colours of the body, CSS, border.
