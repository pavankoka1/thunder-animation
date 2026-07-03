# Analyse route — ambient filament motion design

**Date:** 2026-07-03
**Route:** `/analyse` (`src/pages/AnalysePage.jsx` → `src/analyse/AnalyseBetspot.jsx`)
**Status:** Approved (approach A — live polyline re-stroke)

## Goal

After the energy reveal, the filament web inside the betspot body moves the way the
plasma phase references move: filaments writhe in place, branches take turns lighting
up around three anchored hubs, and brightness breathes per branch — a continuous
ambient idle loop, not a one-shot. The current static look (hidden state, reveal
transition, baked energy aesthetic) must be preserved exactly; all new code is
additive and analyse-scoped.

## Reference analysis (what "the same motion" means, measured)

Source: three VTracer SVG traces of consecutive plasma frames
(`plasma_lightning_hires.svg`, `_v2_`, `_v3_`, 1064×864, ~20k paths each), rendered
and compared pixel-wise. They form a temporal sequence v1 → v2 → v3.

| Behaviour            | Measurement                                                                                  | Animation target                                                                                       |
| -------------------- | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Hubs anchored        | 3 main clusters (left ~300,340; centre ~445,470; right ~655,495) move ≤2% of width per phase | Hubs never translate; centre may pulse strongest                                                       |
| Branch re-routing    | Bright-pixel IoU between adjacent phases ≈ 0.49–0.57; total bright area constant (~10–11%)   | ~50% of web brightly lit at any moment; per-frame weight normalization keeps total lit energy constant |
| Filament writhe      | Median local wander 2.8–4.5px on 1064px (~0.3–0.4% of width), isotropic, zero net drift      | Per-vertex jitter ≈ 0.55 body-units, endpoints pinned, no global drift                                 |
| Brightness breathing | Individual tendrils fade in/out; field never pulses globally                                 | Per-segment weight noise, staggered periods 4–7s                                                       |

The SVGs are calibration references only — never runtime assets (10MB each).

## Architecture

Two new modules, one light component edit. No shared/home-page code changes
(`extractFilamentPaths.js`, `innerEnergyMotion.js` remain untouched reference
implementations; they are coupled to the home page's 84×68 viewBox).

### 1. `src/analyse/filamentSegments.js` (new)

Turns the web canvas already produced by `loadPlasmaFilaments` into geometry.
Runs once, cached alongside the existing filament cache.

- Input: web canvas (white filaments on transparent, body space ×3 supersample,
  438×204).
- Threshold alpha into a binary mask, downsample (max-pool) to a bounded skeleton
  grid, thin to a 1px skeleton, walk junction-to-junction into polyline segments
  (same algorithm shape as the home extractor, re-implemented in body space).
- Detect 3 hubs: strongest local maxima of a heavily blurred copy of the web,
  minimum separation enforced. Tag each segment with its nearest hub.
- Output: `{ segments: [{ id, points: [{x,y}], hub }], hubs: [{x,y}] }` in energy
  canvas coordinates. Expected ~100–200 segments.

### 2. `src/analyse/energyMotion.js` (new)

Pure frame painter: `paintEnergyFrame(ctx, assets, tMs)`.

Per frame:

1. Clear; draw the **dimmed base** — the existing baked energy canvas at reduced
   alpha (~0.55) so the organic raster web always underlies the strokes and
   extraction gaps never go black.
2. On an offscreen canvas, stroke every segment in the existing three passes —
   violet halo (blurred), magenta mid, white core; colours imported from
   `cellularEnergy.js` constants — with `lighter` blending. Per segment:
   - **Writhe:** per-vertex jitter, two sine bands per axis keyed on
     `seg.id`/vertex seed (`hashNoise.js` available for smoother variants),
     amplitude 0.55 body-units — i.e. 0.55 × the ×3 supersample = ~1.65px in
     energy-canvas pixels — × sin(πu) envelope (endpoints pinned),
     frequencies ~0.2–0.5 Hz.
   - **Route weight:** smooth per-segment noise, period 4–7s staggered by seed,
     shaped (smoothstep window) so mean lit fraction ≈ 0.5. Drives stroke alpha
     and width. Weights normalized each frame so the sum is ~constant.
   - **Hub pulse:** slow sine per hub (±10%, independent phases) multiplies its
     segments' weights; the existing static centre-flash stays in the base.
3. Apply the existing radial reach/thickness masks (`destination-in`, gradient
   stops reused from `cellularEnergy.js`) to the stroke layer, then composite
   onto the main energy canvas with `lighter`.

### 3. `AnalyseBetspot.jsx` (edit, ~30 lines)

- Bake effect unchanged; additionally keep the extraction result
  (`filamentSegments`) and the baked canvas in refs.
- New effect on `revealed && ready`: start a rAF loop calling
  `paintEnergyFrame`; cancel on hide/unmount. On hide, repaint the static bake so
  the hidden→revealed cycle matches today's behaviour exactly.
- Pause when `document.visibilityState === "hidden"`.
- `prefers-reduced-motion: reduce` → never start the loop (today's static
  behaviour is the fallback).
- CSS (`AnalysePage.css`), reveal transition, border pulse: untouched.

## Error handling

- Extraction failure or 0 segments → log once, keep the current static bake
  (feature degrades to today's behaviour, never blocks the reveal).
- Frame painter guards on missing assets and paints nothing (dim base only) if
  segments are absent.

## Performance

~150 polylines × 3 strokes on a 438×204 canvas + 2 composites per frame — well
under a frame budget; the home page already runs the same class of loop
(`paintInnerEnergyAnimated`). No per-frame allocations beyond the jittered point
arrays; no getImageData in the loop.

## Testing / verification

1. Playwright against the dev server: capture energy-canvas frames a few seconds
   apart and assert the three signatures — hub positions static, ~half the bright
   pixels swapped between distant frames (IoU ≈ 0.5–0.7), no global drift
   (best-shift ≈ 0).
2. Frame-time sample over ~5s: no long frames attributable to the loop.
3. Visual regression of the hidden and just-revealed states against the current
   build (must be pixel-equivalent apart from motion).
4. Reduced-motion and tab-hidden behaviour checked manually.

## Out of scope

- Home-page betspot, WebGL route, and shared canvas modules.
- Using the SVG files at runtime.
- Changing reveal choreography, colours, or CSS.
