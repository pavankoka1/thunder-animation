# Analyse route — sprite-flipbook motion design

**Date:** 2026-07-03
**Route:** `/analyse` (`src/pages/AnalysePage.jsx` → `src/analyse/AnalyseBetspot.jsx`)
**Status:** Approved (sprite-sheet flipbook; ~12 fps)
**Supersedes:** `2026-07-03-analyse-pixel-warp-motion-design.md` and
`2026-07-03-analyse-ambient-filament-motion-design.md`. Both procedural approaches
(re-stroke overlay, pixel warp) were rejected: they moved one static pattern
(hover/zoom) instead of reforming the paths. The effect is a pre-rendered
flipbook — the artist supplied the exact frames.

## Goal

After the reveal, the plasma inside the betspot **plays as a flipbook of the
pre-rendered frames**, so the filament paths genuinely reform — new branches,
shifted nodes, different junctions — looping seamlessly. No procedural motion.

The reveal/hide choreography, screen-blend integration over the blue body, neon
border, reduced-motion fallback, and tab-hidden pause are preserved. All code is
analyse-scoped; no `src/canvas/**` or `src/webgl/**` edits (shared `loadImage.js`
is reused read-only).

## The asset

`400px width energy flames inside the spot.png` — **400×8450**, RGBA, opaque.
Autocorrelation (period 325, corr 0.96) and exact division (8450 ÷ 325 = 26)
confirm **26 frames of 400×325**, a seamless loop (frame 25 ≈ frame 0). Verified
visually: frames 0/1/2/12/25 are each a complete plasma field with distinct
filament topology.

- Ships in the repo as `public/analyse/plasma-frames.webp` — the 8 MB PNG is
  re-encoded to a single quality-90 lossy WebP (~1.4 MB; noisy plasma hides
  lossy artifacts) to keep the page light. Encoded with Pillow (`sips` lacks
  WebP export on this machine): `Image.open(png).save(out, "WEBP", quality=90,
method=6)`. Frame geometry is unchanged (400×8450, 26×325).
- Constants: `FRAME_W = 400`, `FRAME_H = 325`, `COUNT = round(img.height / 325)`.

## Architecture

### `src/analyse/plasmaFlipbook.js` (new)

- `loadPlasmaSheet(url)` → `{ img, frameW, frameH, count }`. Loads once via the
  shared `loadImage`, caches the result.
- `coverRect(frameW, frameH, targetW, targetH)` (pure) → the source sub-rect
  within a single frame that cover-fits the target: scale `s = max(tw/fw, th/fh)`,
  crop the centred band. For 400×325 → 438×204: `{ sx: 0, sy: ≈69.3, sw: 400,
sh: ≈186.3 }`. Unit-tested.
- `frameAt(tMs, fps, count)` (pure) → `Math.floor((tMs / 1000) * fps) % count`,
  wrapping/looping. Unit-tested.
- `initFlipbook(sheet, targetW, targetH)` → precomputes `coverRect`, an offscreen
  frame canvas (targetW×targetH), and a cached radial edge-fade vignette
  (white→transparent) so energy fades at the body edges as it does today.
- `paintFlipbookFrame(ctx, assets, tMs)` → `frame = frameAt(tMs, FPS, count)`;
  `drawImage(img, rect.sx, frame*frameH + rect.sy, rect.sw, rect.sh, 0,0,tw,th)`
  onto the offscreen; `destination-in` the vignette; blit to `ctx`. Same
  signature as the old `paintEnergyFrame`, so the component's rAF loop is
  unchanged. `FPS = 12` (top-of-file constant, tunable).

### `src/analyse/AnalyseBetspot.jsx` (edit)

- The bake effect is replaced: instead of `loadPlasmaFilaments` +
  `generateEnergyCanvas` + warp-asset build, it loads the sheet, calls
  `initFlipbook`, stores it in `motionRef`, sizes the canvas to the body
  (`BODY.width*3 × BODY.height*3` = 438×204), paints frame 0 as the static image,
  and `setReady(true)`.
- The rAF-loop effect, its cleanup (repaint frame 0 static), visibility pause,
  and reduced-motion listener are unchanged apart from calling
  `paintFlipbookFrame`. Cleanup redraws frame 0 (the static fallback) rather than
  a separate baked canvas.

### `AnalysePage.jsx`

Subtitle updated: the inner energy is a looping sequence of pre-rendered plasma
frames; the paths reform as it plays. (Drop warp/hub wording.)

### Removed (analyse-only, verified single-importer)

`energyHubs.js`, `energyMotion.js`, `cellularEnergy.js`, `plasmaFilaments.js` and
their tests, plus the `plasma-source.png` dependency. The `plasma_lightning_*`
SVGs were never runtime assets.

## Error handling

- Sheet load failure → log once, leave the energy canvas empty (body + border
  still render, reveal still toggles). No procedural fallback.
- `paintFlipbookFrame` no-ops if assets are missing.

## Performance

Per frame at 12 fps: one `drawImage` sub-rect + one vignette composite on a
438×204 canvas — well under budget (the rAF still ticks at display rate; only the
displayed frame index changes 12×/s). The sheet decodes once (~1–2 MB WebP). No
per-frame allocation beyond the reused offscreen.

## Testing / verification

1. Unit (vitest, pure, no DOM):
   - `frameAt`: 0 at t=0; advances one frame per `1/fps` s; wraps at `count`
     (e.g. `frameAt(2200, 12, 26)` loops back near 0); never returns an index
     `>= count`.
   - `coverRect`: returns a centred band that covers the target aspect (sw/sh
     matches target aspect after scale; sx/sy centre the crop; stays within frame).
2. Browser (Playwright): reveal → the canvas changes over time and the loop
   repeats every ~2.2 s; two frames one step apart are genuinely different and
   **not** explained by a pixel shift (inter-frame residual stays high under
   best-shift alignment — proves reforming, not warp/hover); hide → static frame
   0; reduced-motion → static; tab-hidden → paused; frame-time p95 within budget.

## Out of scope

- Home-page betspot, WebGL route, shared canvas modules.
- Generating/authoring new frames (the sheet is supplied).
- Reveal choreography, colours, CSS, border.
