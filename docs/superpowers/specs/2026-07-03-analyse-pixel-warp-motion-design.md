# Analyse route — pixel-warp motion design

**Date:** 2026-07-03
**Route:** `/analyse` (`src/pages/AnalysePage.jsx` → `src/analyse/AnalyseBetspot.jsx`)
**Status:** Approved (displacement warp of the baked pattern; per-pixel canvas-2D)
**Supersedes:** `2026-07-03-analyse-ambient-filament-motion-design.md` (the earlier
re-stroke approach overlaid _new_ strokes on a dimmed copy of the bake — rejected:
it added content on top instead of moving the painted pattern).

## Goal

After the energy reveal, the pattern **already painted** on the betspot canvas
moves — the existing pixels are displaced by a slow flow field the way the whole
filament network shifts between the reference SVG phases (v1→v2→v3). The three
central clusters ("clutters") stay anchored; the filaments between them flex.
No new strokes, no dimming, no overlay — the same pixels, warped.

The static look (hidden state, reveal transition, baked aesthetic at full
brightness) is preserved exactly. All new code is analyse-scoped; no shared
(`src/canvas/**`, `src/webgl/**`) code changes.

## What "move like the SVGs" means (measured earlier this session)

| Behaviour     | Measurement (on 1064px SVGs)                    | Warp target (438px canvas)                       |
| ------------- | ----------------------------------------------- | ------------------------------------------------ |
| Hubs anchored | 3 clusters move ≤2% of width between phases     | displacement ≈ 0 within r0 of each hub           |
| Local wander  | median 2.8–4.5px, isotropic, **zero net drift** | max amplitude ~1.5–1.8px, oscillates around rest |
| Frequency     | slow evolution across phases                    | ~0.2–0.4 Hz temporal, low spatial frequency      |

## Architecture

### Removed from the render path

The re-stroke machinery added earlier is deleted (all from this branch, so no
loss): the dimmed-base overlay, `segmentsFromMask`, `thinMask`, `pruneLeafSpurs`,
`tagSegmentsWithHubs`, `jitterSegmentPoints`, `computeRouteWeights`, and their
tests. This is the code that produced "new glowing particles on top."

### `src/analyse/energyHubs.js` (new, ~90 lines)

Just the hub detector, kept from the old `filamentSegments.js`: `detectHubs`
(triple box-blur → greedy maxima with suppression + border-margin exclusion) and
its `boxBlurPass` helper. Renamed because it no longer traces segments.

- Input: a luminance/alpha Float32Array of the **baked** canvas (the real painted
  pattern), not the pre-bake web. So anchors sit on the visible bright clusters.
- Output: `hubs: [{x, y, strength}]` in energy-canvas pixel coords (3 hubs).

### `src/analyse/energyMotion.js` (rewritten)

Same public surface: `initWarpAssets(baked, hubs)` (was `initMotionAssets`) and
`paintEnergyFrame(ctx, assets, tMs)`.

`initWarpAssets(baked, hubs)` — runs once:

- Caches the baked RGBA as a source `Uint8ClampedArray` (via a one-time
  `getImageData`).
- Allocates one reusable output `ImageData`.
- Precomputes a per-pixel **anchor field** `a(x,y) ∈ [0,1]`: `0` within `r0` of the
  nearest hub, ramping via `smoothstep` to `1` beyond `r1`. Cached as a
  `Float32Array`. Hubs frozen; between-hub filaments free.

`paintEnergyFrame(ctx, assets, tMs)` — per frame (pure math + one putImageData):

1. Evaluate a smooth **flow field** `F(x,y,t)` on a coarse grid (every ~8px):
   a small sum of sinusoidal terms at differing phases/directions so the field
   _oscillates around rest and never accumulates drift_. Deterministic, seedless.
2. Per output pixel, bilinearly interpolate `F` from the coarse grid, form
   `D = a(x,y) · F`, clamp `|D|` to `MAX_AMP` (~1.5–1.8px).
3. Bilinearly sample the cached source at `(x − Dx, y − Dy)` (edge-clamped),
   RGBA together so alpha travels with the pattern. Write to the output buffer.
4. `ctx.putImageData(output, 0, 0)`.

Tunables at top of file: `MAX_AMP`, temporal rate(s), spatial scale, `r0`/`r1`,
coarse-grid step.

### `src/analyse/AnalyseBetspot.jsx` (minimal edit)

- The bake effect now computes hubs from the baked canvas and calls
  `initWarpAssets(baked, hubs)` (replacing `extractSegments` + `initMotionAssets`).
  Import lines swap accordingly.
- The rAF-loop effect, cleanup (restore static bake), visibility pause, and the
  reduced-motion listener from the prior work are unchanged.

### `AnalysePage.jsx`

Copy updated: the web "slowly drifts and breathes in place, anchored at three
bright hubs" (drop the "branches take turns lighting up" wording — that described
the rejected approach).

## Error handling

- If `getImageData` throws (tainted canvas) or hubs come back empty → log once,
  leave the static bake in place (degrades to today's behaviour, reveal unaffected).
- `paintEnergyFrame` guards on missing assets and no-ops.

## Performance

438×204 ≈ 89k px. Per frame: coarse flow grid (~1.4k evals) + per-pixel bilinear
interpolate + bilinear source sample. Budget well under a frame; a per-pixel warp
at this size is a few ms in JS. No per-frame allocation beyond the reused output
buffer; a single `getImageData` at init, none in the loop.

## Testing / verification

1. Unit (vitest, pure math, no DOM):
   - Flow/anchor: displacement ≈ 0 at each hub coord; `|D| ≤ MAX_AMP` everywhere;
     over a long `t` sweep the mean displacement per pixel stays ~0 (no drift);
     neighbouring pixels differ smoothly.
   - Bilinear resample: a known constant displacement shifts a synthetic gradient
     by the expected sub-pixel amount.
   - Determinism: same `(x,y,t)` → same `D`.
2. Browser (Playwright): hub neighbourhoods stay put (local cross-correlation
   shift ≈ 0); mid-branch regions show sub-2px motion between frames; zero global
   drift; bright area conserved; frame-time p95 within budget; hidden→static;
   reduced-motion→static.
3. `scripts/verify-analyse-motion.py` reused; the "motion present" assertion
   switches from bright-IoU to a local mean-abs-diff threshold (a warp keeps IoU
   high by design), keeping drift≈0 and area-conserved checks.

## Out of scope

- Home-page betspot, WebGL route, shared canvas modules.
- Using the SVG files at runtime (calibration references only).
- Reveal choreography, colours, CSS.
