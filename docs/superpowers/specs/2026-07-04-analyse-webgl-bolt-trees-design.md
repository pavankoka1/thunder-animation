# Analyse route — WebGL branching bolt-trees + control panel

**Date:** 2026-07-04
**Route:** `/analyse` (`src/pages/AnalysePage.jsx` → `src/analyse/AnalyseBetspot.jsx`)
**Status:** Approved (JS bolt-trees + WebGL glow + on-page controls)
**Supersedes:** the voronoi `plasmaGL.js` (generic cracks — replaced with real
branching structure like the home page).

## Goal

Reproduce the home-page canvas's plasma structure on `/analyse`, in WebGL, with
no images: a few **central clusters**, each throwing a **branching bolt-tree**
(trunk → recursive branches) with **tapering thickness**, animated so the bolts
**grow then re-strike** along new paths. Every parameter is controlled by
**on-page sliders/buttons** so the look can be dialled in live.

## What we're matching (home page, studied)

- `generateLightningTree` (`src/canvas/lightning/generate.js`): a trunk bolt from
  an origin to an edge (fractal midpoint subdivision, `subdivideSegment`), with
  branches spawning recursively along it — each shorter and less displaced
  (`branchLen *= 1 - depth*…`, `displacement *= 1 - depth*…`), depth-limited.
- Thickness/glow (`paint.js` `GLOW_LAYERS`): three stacked strokes — wide violet
  halo (low alpha) → cyan-ish mid → thin white-hot core.
- Clusters: the strike radiates from the center across regions (the
  `NETWORK_SEQUENCE` SW/E/N groups ≈ "little clusters in center").
- Growth: `segmentDrawLength(seg, progress)` grows each segment; branches appear
  as their parent reaches them.

## Architecture

### 1. `src/analyse/boltField.js` (new, pure — unit-tested)

Generates the geometry in energy-canvas pixels (438×204). Reuses only pure
helpers `subdivideSegment`, `cumulativeLengths` from
`src/canvas/lightning/geometry.js` (read-only; not the home viewBox-coupled
`generateLightningTree`).

- `generateField(config, w, h)` → `{ segments: [{ points:[{x,y}], cumLengths,
length, depth, spawnAt, clusterId }], clusters:[{x,y}] }`.
  - Places `config.clusterCount` cluster origins near center, spread by
    `config.clusterSpread`.
  - Each cluster: a trunk from its origin toward a biased edge target
    (`subdivideSegment`, displacement `config.trunkJitter`), then recursive
    branches (`config.branchChance`, `config.maxDepth`), branch length/jitter
    tapering with depth, `spawnAt` set so branches grow after their parent.
  - Seeded by `config.seed` → deterministic; re-strike bumps the seed.
- `segmentDrawLength(seg, progress)` — grown length at progress ∈ [0,1]
  (ease-out), respecting `spawnAt`. Pure, ported from the home generator.

### 2. `src/analyse/boltGL.js` (new — WebGL2 renderer)

WebGL `lineWidth` is unreliable, so each bolt segment is expanded to a **ribbon**
(triangle strip: per-vertex ± normal × halfWidth). Rendered in **3 additive glow
passes** (halo/mid/core) — pass width = the thickness control, per-vertex width
tapers with `depth` and toward the bolt tip. Fragment shader fades across the
ribbon (distance-from-centerline) for a soft glow; alpha also gated by a radial
edge-fade so energy stays contained.

- `initBoltGL(canvas, config)` → `{ gl, programs, buffers, config, w, h }`.
- `uploadField(assets, field)` → tessellate the field into ribbon vertex buffers
  once per (re-)strike.
- `drawBolts(assets, progress)` → draw the grown portion (`progress` clips ribbon
  length via `segmentDrawLength`), 3 passes, additive, edge-faded. Colours,
  widths, intensities from `assets.config`.

### 3. `src/analyse/AnalyseBetspot.jsx` (edit)

Strike lifecycle in the rAF loop, driven by the config:

- Grow the current field over `config.strikeMs` (progress 0→1).
- Hold for `config.holdMs`.
- **Re-strike**: bump seed, `generateField` + `uploadField`, grow again → bolts
  reform along new paths, looping.
- Reveal/hide, reduced-motion (→ single static strike), tab-hidden pause: kept.
- Reads a shared mutable `config` (see controls) so slider edits apply next frame.

### 4. `src/analyse/PlasmaControls.jsx` (new) + `AnalysePage.jsx` (edit)

A collapsible **control panel** rendered under the betspot. Range sliders +
buttons bound to the config object (React state lifted to `AnalysePage`, passed
to both `AnalyseBetspot` and the panel; edits mutate the same config the renderer
reads). Controls:

- **Structure:** cluster count (1–5), cluster spread, branch density
  (branchChance 0–1), max depth (1–5), trunk jitter, branch length.
- **Thickness:** halo / mid / core widths; glow intensities.
- **Colour:** halo, mid, core (colour pickers → RGB).
- **Motion:** strike duration, hold, re-strike interval, growth easing.
- **Edge fade:** radius, softness.
- **Buttons:** Re-strike now, Randomize seed, Reset to defaults.

Config lives in `boltField.js`/`boltGL.js` as `DEFAULT_CONFIG`; the panel is a
thin view over it. Panel styling reuses the existing `analyse-btn` look.

### Removed

`plasmaGL.js` (voronoi) + its test.

## Error handling

- No WebGL2 / shader compile failure → log once, energy stays empty (body +
  border still render). Reduced-motion → one static strike, no loop.

## Performance

A few clusters × trunk+branches ≈ 60–160 segments → a few thousand ribbon
vertices, 3 passes. Re-tessellation only on re-strike (every few seconds), not
per frame. Comfortably within budget.

## Testing / verification

1. Unit (vitest, pure — `boltField.js`):
   - `generateField`: emits `clusterCount` clusters; all points within [0,w]×[0,h];
     branch depth never exceeds `maxDepth`; deeper branches are shorter (taper);
     deterministic for a seed, different across seeds.
   - `segmentDrawLength`: 0 before `spawnAt`, grows to `length` by progress 1,
     monotonic.
2. Browser (Playwright + screenshots — judged visually, not just metrics):
   branches radiate from the clusters with visible thickness taper and glow;
   the bolts grow then re-strike on new paths (screenshot diff across a cycle);
   moving a slider (e.g. branch density, core width, a colour) visibly changes
   the render; hide→static, reduced-motion→static, tab-hidden→pause; frame budget.

## Out of scope

- Home-page, WebGL route, shared canvas modules (pure geometry helpers reused
  read-only).
- Persisting slider values across reloads (in-memory only).
- Reveal choreography, body colours, CSS, border.
