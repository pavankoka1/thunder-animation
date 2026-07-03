# Analyse route — extracted-web crossfade design

**Date:** 2026-07-03
**Route:** `/analyse` (`src/pages/AnalysePage.jsx` → `src/analyse/AnalyseBetspot.jsx`)
**Status:** Approved (extract dense web from frames → crossfade keyframes in code)
**Supersedes:** the procedural-network design (and the flipbook, warp, re-stroke).
The procedural network was rejected: its grow→retract life-cycle made branches
"travel like snakes" and it was too sparse.

## What the sprite paths actually do (measured, not assumed)

From the 26-frame sheet (`400×8450`, 26×`400×325`), measured directly:

- **The whole web is always present.** Bright coverage is ~constant every frame
  (29–32%); it never empties.
- **94% of bright pixels persist** frame-to-frame. Branches do **not** grow in or
  travel off and disappear.
- **The fine routes re-shape in place.** Hubs and trunk branches hold; thin
  filaments take slightly different paths between frames. Whole-loop bright IoU:
  f0↔f6 0.62, f0↔f13 0.50 (mid-loop most different), **f0↔f25 = 1.00 (seamless
  loop)**.

So the target motion is: a **dense, always-present filament web whose paths
re-route in place**, looping seamlessly — not travelling, not disappearing, not
hovering, not a clean sparse tree.

## Approach

Extract the real filament web from the frames (the detailed look the v1 attempt
had) as **vector polylines**, keep ~10 keyframes, and at runtime **crossfade
between consecutive keyframes**. Two keyframes are always drawn with opacities
summing to 1, so the web is always fully present; the crossfade of two
94%-similar networks reads as the fine paths re-routing; wrapping the last
keyframe to the first gives the seamless loop. Rendered as violet-halo +
white-core glow strokes in code — no runtime image (just ~96 KB gzipped path
data).

## The asset (build-time)

`scripts/extract-plasma-paths.py` (one-time, Pillow + scikit-image in the
scratchpad venv): for **10 keyframes** (`round(i·26/10)`, i=0..9) of
`~/Downloads/400px width energy flames inside the spot.png`:

1. threshold the bright web (`> 195`), drop specks (`remove_small_objects`, 40px);
2. `skeletonize` to 1px centrelines;
3. trace junction-to-junction polyline segments;
4. simplify (`approximate_polygon`, tol 1.8);
5. store as integer `[x,y]` in frame coords (400×325).

Output: `public/analyse/plasma-paths.json` =
`{ w:400, h:325, frames:[ [ [[x,y],…], … ], … ] }` (~504 KB raw, ~96 KB gz;
~4,900 pts/keyframe). Threshold/tolerance/keyframe-count are the detail/size
knobs.

## Architecture

### `src/analyse/plasmaPaths.js` (new)

**Pure (unit-tested):**

- `coverTransform(fw, fh, tw, th)` → `{ scale, offX, offY }` mapping a frame-space
  point to the cover-fit target: `X = (x-offX)·scale`, `Y = (y-offY)·scale`. For
  400×325 → 438×204: `scale ≈ 1.095`, `offX 0`, `offY ≈ 69.3`.
- `keyframeAt(tMs, loopMs, count)` → `{ k0, k1, frac }` — position in the loop:
  `p = (tMs/loopMs·count) mod count`, `k0 = floor(p)`, `k1 = (k0+1) mod count`,
  `frac = p−floor(p)`. Wraps seamlessly.

**Canvas (browser-verified):**

- `loadPaths(url)` → fetch + cache the JSON.
- `initPaths(json, tw, th)` → cover-transform every polyline once and build **one
  `Path2D` per keyframe** (all that keyframe's segments in a single path); also a
  reusable offscreen canvas and the radial edge-fade vignette. Returns
  `{ tw, th, keyframes:Path2D[], count, offscreen, vignette }`.
- `paintPathsFrame(ctx, assets, tMs)` → `{k0,k1,frac} = keyframeAt(tMs, LOOP_MS,
count)`; clear offscreen (`lighter`); stroke keyframe `k0` at opacity `1−frac`
  and `k1` at `frac`, each in three passes — violet halo (wide), magenta mid,
  white-hot core; `destination-in` the vignette; blit to `ctx`. `LOOP_MS ≈ 6000`
  (tunable). Same signature as the prior painters, so the component rAF loop is
  unchanged.

Stroke widths/alphas and colours are top-of-file constants, tuned bright in the
browser (the goal look: crisp white cores with a violet/purple halo, clear end
branches).

### `src/analyse/AnalyseBetspot.jsx` (edit)

- Setup effect: `await loadPaths(PATHS_URL)`, size the canvas to `BODY·scale`
  (438×204), `initPaths`, store in `motionRef`, paint the `t=0` frame static,
  `setReady`. Keep the `cancelled` guard (now genuinely async — a fetch).
- rAF loop, cleanup (repaint `t=0`), visibility pause, reduced-motion listener:
  unchanged apart from calling `paintPathsFrame`.

### `AnalysePage.jsx`

Subtitle: inner energy is the filament web extracted from the artwork, rendered
as vector branches that crossfade between keyframes so the paths re-route in
place, looping.

### Removed

`plasmaNetwork.js` + its test.

## Error handling

- `loadPaths` fetch/parse failure → log once, energy stays empty (body + border
  still render, reveal still toggles).
- `paintPathsFrame` no-ops on missing assets.

## Performance

Per frame: 2 keyframes × 3 `Path2D` stroke passes = **6 stroke calls** on a
438×204 offscreen (segment count is irrelevant — each keyframe is one batched
Path2D), + one vignette composite + blit. Well within budget. `Path2D`s and the
vignette are built once at init. ~96 KB gz data, fetched + parsed once.

## Testing / verification

1. Unit (vitest, pure, no DOM):
   - `keyframeAt`: `k0=0,frac=0` at t=0; advances; `k1=(k0+1)%count`; wraps at the
     loop end (`k0` returns to 0); `frac ∈ [0,1)`.
   - `coverTransform`: maps a frame corner/centre to cover the target; scale is
     `max(tw/fw, th/fh)`; centres the crop (`offX`/`offY` match the overflow).
2. Browser (Playwright): reveal → a dense branch web is always present (bright
   coverage roughly constant across frames — **not** growing/vanishing), and the
   fine paths visibly re-route over the loop (inter-frame change present, hubs
   persistent); loops seamlessly (~6 s); hide → static `t=0`; reduced-motion →
   static; tab-hidden → paused; frame-time p95 within budget. Tune brightness/
   violet and `LOOP_MS` live.

## Out of scope

- Home-page betspot, WebGL route, shared canvas modules.
- Authoring new frames; runtime raster images.
- Reveal choreography, body colours, CSS, border.
