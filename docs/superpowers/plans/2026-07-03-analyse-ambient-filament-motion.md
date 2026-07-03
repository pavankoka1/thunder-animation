# Analyse Ambient Filament Motion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** After the energy reveal on `/analyse`, the filament web inside the betspot stays alive as a continuous ambient loop — filaments writhe in place, branches take turns lighting up around three anchored hubs, total brightness stays constant.

**Architecture:** Two new analyse-scoped modules: `filamentSegments.js` turns the already-baked web canvas into polyline segments + hub positions (reusing the exported, frame-agnostic skeleton helpers from `extractFilamentPaths.js`), and `energyMotion.js` paints one animation frame (dimmed baked base + per-segment re-stroking with route weights, writhe jitter, hub pulse, radial masks). `AnalyseBetspot.jsx` gains a rAF loop effect active only while revealed. Spec: `docs/superpowers/specs/2026-07-03-analyse-ambient-filament-motion-design.md`.

**Tech Stack:** React 19 + Vite 6, Canvas 2D, vitest (added in Task 1) for the pure-math modules. No new runtime dependencies.

**Hard constraint from the user:** the current code was hard-won — every change to existing files must be minimal and additive. Existing-file edits in this plan, exhaustively: `export` keywords on five existing constants in `cellularEnergy.js` (Task 4), ~30 additive lines in `AnalyseBetspot.jsx` (Task 5), one copy sentence in `AnalysePage.jsx` (Task 5), `package.json` devDependency + script (Task 1). Nothing under `src/canvas/` or `src/webgl/` is modified.

**Calibration targets (measured from the three reference SVGs):**
- Hubs anchored: 3 blur-maxima clusters, never translate.
- Re-routing: ~50% of the web brightly lit at any moment; total lit energy constant per frame.
- Writhe: ≈1.65px amplitude on the 438×204 energy canvas (0.55 body-units × 3 supersample), isotropic, endpoints pinned, ~0.2–0.5 Hz.
- Per-branch breathing periods 4–7s, staggered.

---

### Task 1: Vitest infra + hub detection (TDD)

**Files:**
- Modify: `package.json` (add `vitest` devDependency, `test` script)
- Create: `src/analyse/filamentSegments.js` (hub detection only in this task)
- Test: `src/analyse/__tests__/filamentSegments.test.js`

- [ ] **Step 1: Branch + install vitest**

```bash
cd /Users/pavankurmarao.k/Documents/personal/thunder-animation
git checkout -b feature/analyse-ambient-motion
npm install -D vitest
```

Then add the script to `package.json` (`"test": "vitest run"` after `"format"`):

```json
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview",
    "format": "prettier --write .",
    "test": "vitest run"
  },
```

- [ ] **Step 2: Write the failing test for detectHubs**

Create `src/analyse/__tests__/filamentSegments.test.js`:

```js
import { describe, expect, it } from "vitest";
import { detectHubs } from "../filamentSegments.js";

/** Paint a soft square blob of the given peak strength into a Float32Array grid. */
function addBlob(alpha, w, h, cx, cy, radius, peak) {
  for (let y = Math.max(0, cy - radius); y < Math.min(h, cy + radius); y += 1) {
    for (let x = Math.max(0, cx - radius); x < Math.min(w, cx + radius); x += 1) {
      const d = Math.hypot(x - cx, y - cy) / radius;
      if (d >= 1) continue;
      const v = peak * (1 - d);
      const i = y * w + x;
      if (v > alpha[i]) alpha[i] = v;
    }
  }
}

describe("detectHubs", () => {
  it("finds three separated bright clusters, strongest first", () => {
    const w = 120;
    const h = 60;
    const alpha = new Float32Array(w * h);
    addBlob(alpha, w, h, 60, 30, 10, 1.0); // centre, strongest
    addBlob(alpha, w, h, 20, 30, 10, 0.8);
    addBlob(alpha, w, h, 100, 30, 10, 0.7);

    const hubs = detectHubs(alpha, w, h, 3, 20);

    expect(hubs).toHaveLength(3);
    expect(Math.hypot(hubs[0].x - 60, hubs[0].y - 30)).toBeLessThan(8);
    const xs = hubs.map((p) => p.x).sort((a, b) => a - b);
    expect(Math.hypot(xs[0] - 20, 0)).toBeLessThan(8);
    expect(Math.hypot(xs[2] - 100, 0)).toBeLessThan(8);
  });

  it("returns fewer hubs than requested when the field is empty", () => {
    const hubs = detectHubs(new Float32Array(40 * 40), 40, 40, 3, 10);
    expect(hubs.length).toBeLessThanOrEqual(1);
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npm test -- src/analyse/__tests__/filamentSegments.test.js`
Expected: FAIL — `Failed to load ../filamentSegments.js` (module does not exist).

- [ ] **Step 4: Implement detectHubs**

Create `src/analyse/filamentSegments.js`:

```js
/**
 * Filament segment extraction for the analyse betspot's ambient motion.
 *
 * Consumes the web canvas already produced by `loadPlasmaFilaments` (white
 * filaments on transparent, energy-canvas space) and returns polyline
 * segments plus the anchored hub positions the reference SVG phases showed.
 * Reuses the exported, frame-agnostic skeleton helpers from the home page's
 * extractor — no shared code is modified.
 */

import {
  buildSkeletonFromMask,
  chainSegments,
  densifySegmentPoints,
  pathsToSegments,
  traceSkeletonPaths,
} from "../canvas/plasma/extractFilamentPaths.js";

/** Web alpha above this counts as filament when building the skeleton mask. */
const MASK_ALPHA = 0.45;
/** Drop chained segments shorter than this (energy-canvas px). */
const MIN_SEGMENT_LEN = 6;
/** Vertex spacing after densify (energy-canvas px) — writhe needs interior vertices. */
const DENSIFY_SPACING = 2;

function boxBlurPass(src, dst, w, h, r, horizontal) {
  const lineCount = horizontal ? h : w;
  const lineLen = horizontal ? w : h;
  const stride = horizontal ? 1 : w;
  const lineStride = horizontal ? w : 1;
  const norm = 1 / (2 * r + 1);

  for (let l = 0; l < lineCount; l += 1) {
    const base = l * lineStride;
    let sum = 0;
    for (let i = -r; i <= r; i += 1) {
      const idx = Math.min(lineLen - 1, Math.max(0, i));
      sum += src[base + idx * stride];
    }
    for (let i = 0; i < lineLen; i += 1) {
      dst[base + i * stride] = sum * norm;
      const addIdx = Math.min(lineLen - 1, i + r + 1);
      const subIdx = Math.max(0, i - r);
      sum += src[base + addIdx * stride] - src[base + subIdx * stride];
    }
  }
}

/**
 * Find the brightest energy clusters: triple box blur ≈ gaussian, then greedy
 * maxima with a suppression radius. Mirrors how the reference hubs were found.
 *
 * @param {Float32Array} alpha web alpha in [0,1], row-major
 * @returns {Array<{x:number,y:number,strength:number}>} strongest first
 */
export function detectHubs(alpha, w, h, count = 3, minSep = Math.round(Math.min(w, h) / 3)) {
  const r = Math.max(2, Math.round(Math.min(w, h) / 12));
  let a = Float32Array.from(alpha);
  let b = new Float32Array(w * h);
  for (let pass = 0; pass < 3; pass += 1) {
    boxBlurPass(a, b, w, h, r, true);
    boxBlurPass(b, a, w, h, r, false);
  }

  const work = Float32Array.from(a);
  const hubs = [];
  for (let k = 0; k < count; k += 1) {
    let bi = -1;
    let bv = 1e-4;
    for (let i = 0; i < work.length; i += 1) {
      if (work[i] > bv) {
        bv = work[i];
        bi = i;
      }
    }
    if (bi < 0) break;
    const x = bi % w;
    const y = (bi / w) | 0;
    hubs.push({ x, y, strength: a[bi] });

    const x0 = Math.max(0, x - minSep);
    const x1 = Math.min(w, x + minSep);
    for (let yy = Math.max(0, y - minSep); yy < Math.min(h, y + minSep); yy += 1) {
      work.fill(0, yy * w + x0, yy * w + x1);
    }
  }
  return hubs;
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm test -- src/analyse/__tests__/filamentSegments.test.js`
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json src/analyse/filamentSegments.js src/analyse/__tests__/filamentSegments.test.js
git commit -m "feat(analyse): vitest infra + hub detection for filament motion"
```

---

### Task 2: Segment extraction from the web mask (TDD)

> **Deviation (2026-07-03, during execution):** the original 1px-cross test mask
> is a pathological input — `pruneSkeletonSpurs` in the shared extractor walks
> from degree-1 endpoints with a first-step backtrack, erasing leaf-ended 1px
> hairlines 2px per sweep until gone. Real plasma webs are thick-stroked,
> junction-rich meshes and are unaffected (the home page proves this). The test
> mask was changed to a 3px-thick mesh (rectangle outline + cross) which the
> pipeline handles as expected. Shared code untouched. Follow-up: confirm real
> web segment count during Task 5/6 browser verification.
>
> **Deviation 2 (2026-07-03, Task 5 verification):** on the real web canvas the
> shared ridge skeleton fragmented the thick glow mask into confetti (4 usable
> segments, 28px total — invisible motion). Replaced `buildSkeletonFromMask`
> with an analyse-local Zhang–Suen `thinMask` + correct `pruneLeafSpurs`
> (connectivity-preserving; 448 segments, ~5,100px, 49ms one-time). Shared
> tracing helpers still reused; shared code still untouched. `detectHubs` also
> gained a border-margin exclusion (texture edges glow, which produced a
> garbage corner hub). The originally-planned 1px-cross test now passes and was
> restored alongside the mesh test.

**Files:**
- Modify: `src/analyse/filamentSegments.js` (append)
- Test: `src/analyse/__tests__/filamentSegments.test.js` (append)

- [ ] **Step 1: Write the failing tests**

Append to `src/analyse/__tests__/filamentSegments.test.js` (extend the import line to `import { detectHubs, segmentsFromMask, tagSegmentsWithHubs } from "../filamentSegments.js";`):

```js
describe("segmentsFromMask", () => {
  it("traces a cross mask into segments with interior vertices", async () => {
    const w = 60;
    const h = 40;
    const mask = new Uint8Array(w * h);
    for (let x = 5; x <= 55; x += 1) mask[20 * w + x] = 1; // horizontal bar
    for (let y = 5; y <= 35; y += 1) mask[y * w + 30] = 1; // vertical bar

    const segments = await segmentsFromMask(mask, w, h);

    expect(segments.length).toBeGreaterThanOrEqual(2);
    const totalLength = segments.reduce((n, s) => n + s.length, 0);
    expect(totalLength).toBeGreaterThan(40);
    for (const seg of segments) {
      expect(seg.points.length).toBeGreaterThanOrEqual(3);
      for (const p of seg.points) {
        expect(p.x).toBeGreaterThanOrEqual(0);
        expect(p.x).toBeLessThan(w);
        expect(p.y).toBeGreaterThanOrEqual(0);
        expect(p.y).toBeLessThan(h);
      }
    }
    // ids are dense and unique
    expect(new Set(segments.map((s) => s.id)).size).toBe(segments.length);
  });
});

describe("tagSegmentsWithHubs", () => {
  it("assigns each segment to its nearest hub by midpoint", () => {
    const segments = [
      { id: 0, points: [{ x: 0, y: 0 }, { x: 10, y: 0 }], length: 10 },
      { id: 1, points: [{ x: 90, y: 0 }, { x: 100, y: 0 }], length: 10 },
    ];
    const hubs = [
      { x: 5, y: 0, strength: 1 },
      { x: 95, y: 0, strength: 0.8 },
    ];
    const tagged = tagSegmentsWithHubs(segments, hubs);
    expect(tagged[0].hub).toBe(0);
    expect(tagged[1].hub).toBe(1);
  });
});
```

- [ ] **Step 2: Run tests to verify the new ones fail**

Run: `npm test -- src/analyse/__tests__/filamentSegments.test.js`
Expected: FAIL — `segmentsFromMask is not a function` (detectHubs tests still pass).

- [ ] **Step 3: Implement segmentsFromMask, tagSegmentsWithHubs, and the canvas-facing wrapper**

Append to `src/analyse/filamentSegments.js`:

```js
/**
 * Skeletonize a binary mask and trace it into densified polyline segments.
 * Pure (no DOM) — points stay in mask/energy-canvas pixel coordinates.
 *
 * @returns {Promise<Array<{id:number, points:Array<{x,y}>, length:number}>>}
 */
export async function segmentsFromMask(mask, w, h) {
  const { skel, w: sw, h: sh, mapPoint } = await buildSkeletonFromMask(mask, w, h);
  const raw = traceSkeletonPaths(skel, sw, sh, mapPoint, 3);
  let segments = chainSegments(pathsToSegments(raw, 1, 0));

  return segments
    .map((seg) => ({ ...seg, points: densifySegmentPoints(seg.points, DENSIFY_SPACING) }))
    .filter((seg) => seg.points.length >= 3 && seg.length >= MIN_SEGMENT_LEN)
    .map((seg, idx) => ({ id: idx, points: seg.points, length: seg.length }));
}

/** Tag each segment with the index of the hub nearest its midpoint. */
export function tagSegmentsWithHubs(segments, hubs) {
  if (!hubs.length) return segments.map((seg) => ({ ...seg, hub: 0 }));
  return segments.map((seg) => {
    const mid = seg.points[(seg.points.length / 2) | 0];
    let best = 0;
    let bestD = Infinity;
    for (let k = 0; k < hubs.length; k += 1) {
      const d = Math.hypot(hubs[k].x - mid.x, hubs[k].y - mid.y);
      if (d < bestD) {
        bestD = d;
        best = k;
      }
    }
    return { ...seg, hub: best };
  });
}

/** Read the web canvas's alpha channel into a Float32Array in [0,1]. */
export function webCanvasToAlpha(web) {
  const w = web.width;
  const h = web.height;
  const data = web.getContext("2d").getImageData(0, 0, w, h).data;
  const alpha = new Float32Array(w * h);
  for (let i = 0; i < w * h; i += 1) alpha[i] = data[i * 4 + 3] / 255;
  return { alpha, w, h };
}

/**
 * Full extraction for the betspot: web canvas → { segments, hubs }.
 * Canvas-dependent wrapper around the pure helpers above.
 */
export async function extractSegments(web) {
  const { alpha, w, h } = webCanvasToAlpha(web);
  const mask = new Uint8Array(w * h);
  for (let i = 0; i < alpha.length; i += 1) mask[i] = alpha[i] > MASK_ALPHA ? 1 : 0;

  const hubs = detectHubs(alpha, w, h);
  const segments = tagSegmentsWithHubs(await segmentsFromMask(mask, w, h), hubs);
  return { segments, hubs };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- src/analyse/__tests__/filamentSegments.test.js`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/analyse/filamentSegments.js src/analyse/__tests__/filamentSegments.test.js
git commit -m "feat(analyse): trace web canvas into hub-tagged filament segments"
```

---

### Task 3: Motion math — route weights + writhe jitter (TDD)

**Files:**
- Create: `src/analyse/energyMotion.js` (pure math only in this task)
- Test: `src/analyse/__tests__/energyMotion.test.js`

- [ ] **Step 1: Write the failing tests**

Create `src/analyse/__tests__/energyMotion.test.js`:

```js
import { describe, expect, it } from "vitest";
import {
  WRITHE_AMP,
  computeRouteWeights,
  jitterSegmentPoints,
} from "../energyMotion.js";

function line(id, n = 10) {
  const points = Array.from({ length: n }, (_, i) => ({ x: i * 4, y: 50 }));
  return { id, points, length: (n - 1) * 4, hub: id % 3 };
}

describe("jitterSegmentPoints", () => {
  it("pins endpoints and displaces interior vertices within the amplitude", () => {
    const seg = line(5);
    const pts = jitterSegmentPoints(seg, 1.37);

    expect(pts[0]).toEqual(seg.points[0]);
    expect(pts[pts.length - 1]).toEqual(seg.points[seg.points.length - 1]);

    let maxD = 0;
    let moved = false;
    for (let i = 1; i < pts.length - 1; i += 1) {
      const d = Math.hypot(pts[i].x - seg.points[i].x, pts[i].y - seg.points[i].y);
      maxD = Math.max(maxD, d);
      if (d > 0.05) moved = true;
    }
    expect(moved).toBe(true);
    // per-axis amp ≤ WRITHE_AMP → euclidean bound √2×, small slack for float
    expect(maxD).toBeLessThanOrEqual(WRITHE_AMP * Math.SQRT2 * 1.01);
  });

  it("is deterministic for the same time and segment", () => {
    const seg = line(9);
    expect(jitterSegmentPoints(seg, 2.5)).toEqual(jitterSegmentPoints(seg, 2.5));
  });
});

describe("computeRouteWeights", () => {
  const segments = Array.from({ length: 80 }, (_, i) => line(i));
  const hubs = [
    { x: 0, y: 0, strength: 1 },
    { x: 50, y: 0, strength: 0.9 },
    { x: 100, y: 0, strength: 0.8 },
  ];

  it("keeps the length-weighted lit fraction near the 50% turnover target", () => {
    const lenSum = segments.reduce((n, s) => n + s.length, 0);
    const fractions = [];
    for (let t = 0; t <= 60; t += 0.5) {
      const w = computeRouteWeights(segments, hubs, t);
      let sum = 0;
      for (let i = 0; i < segments.length; i += 1) sum += w[i] * segments[i].length;
      fractions.push(sum / lenSum);
    }
    const mean = fractions.reduce((a, b) => a + b, 0) / fractions.length;
    expect(mean).toBeGreaterThan(0.4);
    expect(mean).toBeLessThan(0.6);
    for (const f of fractions) {
      expect(f).toBeGreaterThan(0.33);
      expect(f).toBeLessThan(0.67);
    }
  });

  it("varies per segment over time (branches take turns)", () => {
    const w0 = Array.from(computeRouteWeights(segments, hubs, 0));
    const w3 = Array.from(computeRouteWeights(segments, hubs, 3));
    let changed = 0;
    for (let i = 0; i < w0.length; i += 1) {
      if (Math.abs(w0[i] - w3[i]) > 0.15) changed += 1;
    }
    expect(changed).toBeGreaterThan(w0.length * 0.25);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- src/analyse/__tests__/energyMotion.test.js`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement the pure motion math**

Create `src/analyse/energyMotion.js`:

```js
/**
 * Ambient energy motion for the analyse betspot — the three behaviours
 * measured from the plasma phase references:
 *
 *   • writhe: per-vertex jitter, endpoints pinned, no global drift
 *   • re-routing: per-segment route weights, ~50% of the web lit at once,
 *     length-weighted total normalized so energy redistributes, never pulses
 *   • hub pulse: slow ±10% brightness sine per anchored hub
 *
 * This module is pure math + painting; it owns no state and no rAF loop.
 */

const TAU = Math.PI * 2;

/** Writhe amplitude in energy-canvas px (0.55 body-units × 3 supersample). */
export const WRITHE_AMP = 1.65;
/** Writhe angular rates (rad/s) — ≈0.35 Hz and ≈0.19 Hz bands. */
const RATE_A = 2.2;
const RATE_B = 1.2;

/** Length-weighted lit fraction target (measured bright IoU ≈ 0.5). */
const TARGET_LIT = 0.5;
/** Per-frame normalization clamp — keeps redistribution gentle. */
const NORM_MIN = 0.6;
const NORM_MAX = 1.6;
/** Segments below this weight are skipped entirely when painting. */
export const WEIGHT_FLOOR = 0.06;

function hash1(n) {
  const s = Math.sin(n * 127.1) * 43758.5453123;
  return s - Math.floor(s);
}

function smoothstep(a, b, x) {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/**
 * Writhe: two-band sinusoidal per-vertex jitter with a sin(πu) envelope so
 * endpoints stay pinned to the skeleton (junctions never move).
 */
export function jitterSegmentPoints(seg, tSec) {
  const src = seg.points;
  const n = src.length;
  const out = new Array(n);
  for (let i = 0; i < n; i += 1) {
    if (i === 0 || i === n - 1) {
      out[i] = { x: src[i].x, y: src[i].y };
      continue;
    }
    const u = i / (n - 1);
    const env = Math.sin(u * Math.PI);
    const seed = seg.id * 1009 + i * 13;
    const jx =
      Math.sin(tSec * RATE_A + seed * 0.013) * WRITHE_AMP * 0.67 +
      Math.sin(tSec * RATE_B + seed * 0.041) * WRITHE_AMP * 0.33;
    const jy =
      Math.cos(tSec * RATE_A * 0.86 + seed * 0.017) * WRITHE_AMP * 0.67 +
      Math.cos(tSec * RATE_B * 1.18 + seed * 0.037) * WRITHE_AMP * 0.33;
    out[i] = { x: src[i].x + jx * env, y: src[i].y + jy * env };
  }
  return out;
}

/** Raw breathing weight for one segment: smooth periodic noise in [0,1]. */
function rawRouteWeight(id, tSec) {
  const period = 4 + hash1(id + 0.17) * 3; // 4–7s, staggered by id
  const phase = hash1(id + 3.7) * TAU;
  const a = Math.sin((tSec / period) * TAU + phase);
  const b = Math.sin((tSec / (period * 1.73)) * TAU + phase * 2.1) * 0.35;
  const v = 0.5 + (0.5 * (a + b)) / 1.35;
  return smoothstep(0.25, 0.75, v);
}

/** Slow ±10% pulse per hub, independent phases. */
function hubPulse(hubIndex, tSec) {
  const period = 5 + hubIndex * 1.7;
  return 1 + 0.1 * Math.sin((tSec / period) * TAU + hubIndex * 2.1);
}

/**
 * Route weights for every segment at time t. Length-weighted sum is
 * normalized toward TARGET_LIT so energy visibly redistributes between
 * branches instead of the whole field pulsing.
 *
 * @returns {Float32Array} weight per segment, aligned with `segments`
 */
export function computeRouteWeights(segments, hubs, tSec, out) {
  const weights = out && out.length === segments.length ? out : new Float32Array(segments.length);
  let sum = 0;
  let lenSum = 0;
  for (let i = 0; i < segments.length; i += 1) {
    const seg = segments[i];
    const pulse = hubs.length ? hubPulse(seg.hub ?? 0, tSec) : 1;
    const w = Math.min(1, rawRouteWeight(seg.id, tSec) * pulse);
    weights[i] = w;
    sum += w * seg.length;
    lenSum += seg.length;
  }
  const scale =
    sum > 0 ? Math.min(NORM_MAX, Math.max(NORM_MIN, (TARGET_LIT * lenSum) / sum)) : 1;
  for (let i = 0; i < weights.length; i += 1) {
    weights[i] = Math.min(1, weights[i] * scale);
  }
  return weights;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- src/analyse/__tests__/energyMotion.test.js`
Expected: PASS (4 tests). If the lit-fraction bounds fail, the normalization clamp is binding — widen NORM_MIN/NORM_MAX toward 0.5/1.8 rather than loosening the test.

- [ ] **Step 5: Run the whole suite and commit**

Run: `npm test`
Expected: PASS (9 tests).

```bash
git add src/analyse/energyMotion.js src/analyse/__tests__/energyMotion.test.js
git commit -m "feat(analyse): route-weight + writhe motion math"
```

---

### Task 4: Frame painter + colour exports

**Files:**
- Modify: `src/analyse/cellularEnergy.js:18-20,53-66` (add `export` keywords ONLY — no logic changes)
- Modify: `src/analyse/energyMotion.js` (append painting section)

No unit test — this is canvas composition; it is verified visually in Task 5 and statistically in Task 6. Keep the pure math above untouched.

- [ ] **Step 1: Export the existing colour + mask constants from cellularEnergy.js**

In `src/analyse/cellularEnergy.js`, change exactly five declarations (content stays identical):

```js
export const VIOLET = "rgb(150, 70, 225)";
export const MAGENTA = "rgb(210, 120, 245)";
export const WHITE = "rgb(250, 250, 255)";
```

and

```js
export const REACH_STOPS = [
```
```js
export const THICK_STOPS = [
```

Run: `npm run build`
Expected: build succeeds (proves no syntax slip in the shared file).

- [ ] **Step 2: Append the painter to energyMotion.js**

Append to `src/analyse/energyMotion.js`:

```js
import {
  MAGENTA,
  REACH_STOPS,
  THICK_STOPS,
  VIOLET,
  WHITE,
} from "./cellularEnergy.js";

/** Stroke widths (energy-canvas px) and pass alphas — tuned to match the bake. */
const HALO_WIDTH = 5.5;
const MID_WIDTH = 2.2;
const CORE_WIDTH = 1.0;
const HALO_ALPHA = 0.5;
const MID_ALPHA = 0.62;
const CORE_ALPHA = 0.78;
/** One blur applied to the whole halo layer per frame (not per stroke). */
const HALO_LAYER_BLUR_PX = 4;
/** Dimmed baked web that always underlies the strokes. */
const BASE_DIM = 0.55;

function makeCanvas(w, h) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
}

/** White radial gradient canvas for destination-in masking (stops from the bake). */
function makeRadialMask(w, h, stops) {
  const c = makeCanvas(w, h);
  const ctx = c.getContext("2d");
  const cx = w * 0.5;
  const cy = h * 0.5;
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.hypot(cx, cy));
  for (const [offset, alpha] of stops) g.addColorStop(offset, `rgba(255,255,255,${alpha})`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  return c;
}

/**
 * One-time asset bundle for the frame painter.
 *
 * @param {HTMLCanvasElement} baked the existing static energy bake
 * @param {{segments:Array, hubs:Array}} extraction from extractSegments
 */
export function initMotionAssets(baked, extraction) {
  const w = baked.width;
  const h = baked.height;

  const dimmed = makeCanvas(w, h);
  const dctx = dimmed.getContext("2d");
  dctx.globalAlpha = BASE_DIM;
  dctx.drawImage(baked, 0, 0);

  return {
    w,
    h,
    baked,
    dimmed,
    segments: extraction.segments,
    hubs: extraction.hubs,
    weights: new Float32Array(extraction.segments.length),
    reachMask: makeRadialMask(w, h, REACH_STOPS),
    thickMask: makeRadialMask(w, h, THICK_STOPS),
    haloLayer: makeCanvas(w, h),
    reachLayer: makeCanvas(w, h),
  };
}

function strokePolyline(ctx, pts, width, color, alpha) {
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i += 1) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.lineWidth = width;
  ctx.strokeStyle = color;
  ctx.globalAlpha = alpha;
  ctx.stroke();
}

/**
 * Paint one ambient frame onto the energy canvas context.
 * Layers: dimmed bake → halo strokes (thickness-masked, layer-blurred) →
 * mid+core strokes (reach-masked), all lighter-blended like the bake.
 */
export function paintEnergyFrame(ctx, assets, tMs) {
  const { w, h, dimmed, segments, hubs, weights, haloLayer, reachLayer, reachMask, thickMask } =
    assets;
  if (!segments.length) return;
  const t = tMs / 1000;

  computeRouteWeights(segments, hubs, t, weights);

  const hctx = haloLayer.getContext("2d");
  const rctx = reachLayer.getContext("2d");
  for (const c of [hctx, rctx]) {
    c.globalCompositeOperation = "source-over";
    c.globalAlpha = 1;
    c.clearRect(0, 0, w, h);
    c.lineCap = "round";
    c.lineJoin = "round";
    c.globalCompositeOperation = "lighter";
  }

  for (let i = 0; i < segments.length; i += 1) {
    const wgt = weights[i];
    if (wgt < WEIGHT_FLOOR) continue;
    const pts = jitterSegmentPoints(segments[i], t);
    strokePolyline(hctx, pts, HALO_WIDTH * (0.7 + 0.3 * wgt), VIOLET, HALO_ALPHA * wgt);
    strokePolyline(rctx, pts, MID_WIDTH, MAGENTA, MID_ALPHA * wgt);
    strokePolyline(rctx, pts, CORE_WIDTH, WHITE, CORE_ALPHA * wgt);
  }

  hctx.globalCompositeOperation = "destination-in";
  hctx.globalAlpha = 1;
  hctx.drawImage(thickMask, 0, 0);
  rctx.globalCompositeOperation = "destination-in";
  rctx.globalAlpha = 1;
  rctx.drawImage(reachMask, 0, 0);

  ctx.globalCompositeOperation = "source-over";
  ctx.globalAlpha = 1;
  ctx.clearRect(0, 0, w, h);
  ctx.drawImage(dimmed, 0, 0);
  ctx.globalCompositeOperation = "lighter";
  ctx.filter = `blur(${HALO_LAYER_BLUR_PX}px)`;
  ctx.drawImage(haloLayer, 0, 0);
  ctx.filter = "none";
  ctx.drawImage(reachLayer, 0, 0);
  ctx.globalCompositeOperation = "source-over";
}
```

Note: the two `import` groups end up split (math section has none). Move the new import block to the top of the file when appending — `npm run format` will settle ordering.

- [ ] **Step 3: Verify the suite still passes and the app builds**

Run: `npm test && npm run build`
Expected: 9 tests pass; build succeeds. (`energyMotion.test.js` imports the module — if the new canvas code ran at import time it would crash under node; it must only run inside functions.)

- [ ] **Step 4: Commit**

```bash
git add src/analyse/cellularEnergy.js src/analyse/energyMotion.js
git commit -m "feat(analyse): ambient frame painter over the static bake"
```

---

### Task 5: Wire the loop into AnalyseBetspot + page copy

**Files:**
- Modify: `src/analyse/AnalyseBetspot.jsx` (additive: 2 imports, 2 refs, extraction in the bake effect, 1 new effect)
- Modify: `src/pages/AnalysePage.jsx:12-19` (one sentence added to the subtitle)

- [ ] **Step 1: Add imports and refs**

In `src/analyse/AnalyseBetspot.jsx`, extend the imports:

```js
import { extractSegments } from "./filamentSegments.js";
import { initMotionAssets, paintEnergyFrame } from "./energyMotion.js";
```

Inside the component, next to `canvasRef`:

```js
  const bakedRef = useRef(null);
  const motionRef = useRef(null);
```

- [ ] **Step 2: Extend the bake effect (additive lines only)**

In the existing async bake effect, after `canvas.getContext("2d").drawImage(baked, 0, 0);` and before `setReady(true);`, insert:

```js
        bakedRef.current = baked;
        try {
          const extraction = await extractSegments(data.web);
          if (cancelled) return;
          if (extraction.segments.length > 0) {
            motionRef.current = initMotionAssets(baked, extraction);
          } else {
            console.warn("No filament segments — energy stays static");
          }
        } catch (err) {
          console.warn("Filament segments unavailable — energy stays static", err);
        }
```

The existing bake, `setReady(true)`, and error handling stay exactly as they are — extraction failure degrades to today's static behaviour.

- [ ] **Step 3: Add the animation-loop effect**

After the bake effect, add:

```js
  // Ambient motion — repaints only the energy canvas while revealed.
  // Falls back to the static bake when hidden, unmounted, extraction
  // failed, or the user prefers reduced motion.
  useEffect(() => {
    const canvas = canvasRef.current;
    const assets = motionRef.current;
    if (!revealed || !ready || !canvas || !assets) return undefined;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return undefined;

    const ctx = canvas.getContext("2d");
    const start = performance.now();
    let raf = 0;

    const frame = (now) => {
      paintEnergyFrame(ctx, assets, now - start);
      raf = requestAnimationFrame(frame);
    };

    const onVisibility = () => {
      cancelAnimationFrame(raf);
      if (!document.hidden) raf = requestAnimationFrame(frame);
    };

    raf = requestAnimationFrame(frame);
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener("visibilitychange", onVisibility);
      const baked = bakedRef.current;
      if (baked) {
        ctx.globalCompositeOperation = "source-over";
        ctx.globalAlpha = 1;
        ctx.filter = "none";
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(baked, 0, 0);
      }
    };
  }, [revealed, ready]);
```

- [ ] **Step 4: Update the page copy**

In `src/pages/AnalysePage.jsx`, append one sentence to the subtitle paragraph (after "Click to toggle."):

```
Once revealed, the web stays alive: branches take turns lighting up around
three anchored hubs while filaments slowly writhe in place.
```

- [ ] **Step 5: Verify in the browser**

```bash
npm run dev
```

Open `http://localhost:5173/analyse` (Playwright or manually) and check:
1. "Baking energy field…" appears then clears (extraction adds < ~1s, once).
2. Reveal fades in as before; filaments visibly writhe and branches breathe.
3. Hide restores the exact static frameless look; re-reveal restarts motion.
4. Console shows no errors/warnings.

Expected: all four hold.

- [ ] **Step 6: Run tests, format, commit**

```bash
npm test && npm run format
git add src/analyse/AnalyseBetspot.jsx src/pages/AnalysePage.jsx
git commit -m "feat(analyse): ambient filament motion loop in the betspot"
```

---

### Task 6: Statistical + performance verification

**Files:**
- Create: `scripts/verify-analyse-motion.py` (throwaway verification helper; committed for reproducibility)

- [ ] **Step 1: Capture two motion frames seconds apart**

With `npm run dev` still running, use Playwright (browser tools or a script) to:
1. Navigate to `http://localhost:5173/analyse`, wait for the Reveal button to be enabled.
2. Click "Reveal energy", wait 2.5s (fade completes).
3. Screenshot the canvas element → `frame_a.png`.
4. Wait 4s, screenshot again → `frame_b.png`.

- [ ] **Step 2: Write the verification script**

Create `scripts/verify-analyse-motion.py`:

```python
"""Verify the analyse ambient motion matches the reference statistics.

Usage: python3 verify-analyse-motion.py frame_a.png frame_b.png
Needs pillow + numpy. Checks the three measured signatures:
anchored (no drift), re-routing (partial bright turnover), bounded writhe.
"""
import sys
import numpy as np
from PIL import Image

a = np.asarray(Image.open(sys.argv[1]).convert("L"), np.float32)
b = np.asarray(Image.open(sys.argv[2]).convert("L"), np.float32)
assert a.shape == b.shape, "frames must match"

# 1. No global drift: best integer shift must be (0, 0)
best = (0, 0, 1e18)
h, w = a.shape
for dy in range(-6, 7, 2):
    for dx in range(-6, 7, 2):
        ys, xs = slice(max(0, dy), min(h, h + dy)), slice(max(0, dx), min(w, w + dx))
        ys2, xs2 = slice(max(0, -dy), min(h, h - dy)), slice(max(0, -dx), min(w, w - dx))
        err = float(np.mean((a[ys, xs] - b[ys2, xs2]) ** 2))
        if err < best[2]:
            best = (dx, dy, err)
print(f"drift: best shift = ({best[0]}, {best[1]})")
assert best[:2] == (0, 0), "FAIL: web is drifting"

# 2. Re-routing: bright pixels partially swapped, not static, not replaced
ma, mb = a > 170, b > 170
iou = np.logical_and(ma, mb).sum() / max(1, np.logical_or(ma, mb).sum())
print(f"bright IoU = {iou:.3f} (target 0.35-0.90)")
assert 0.35 < iou < 0.90, "FAIL: turnover outside expected band"

# 3. Energy conserved: bright area roughly constant
ra, rb = ma.mean(), mb.mean()
print(f"bright area: {ra:.4f} vs {rb:.4f}")
assert abs(ra - rb) / max(ra, rb) < 0.25, "FAIL: field is pulsing globally"

print("OK: anchored, re-routing, energy-conserving")
```

- [ ] **Step 3: Run it**

```bash
python3 scripts/verify-analyse-motion.py frame_a.png frame_b.png
```

Expected: `OK: anchored, re-routing, energy-conserving`. If IoU is > 0.90 the motion is too subtle — first suspect: route-weight periods too long relative to the 4s gap.

- [ ] **Step 4: Frame-time sample**

In the browser console (or `browser_evaluate`) while revealed:

```js
await new Promise((resolve) => {
  const deltas = [];
  let last = performance.now();
  const tick = (now) => {
    deltas.push(now - last);
    last = now;
    if (deltas.length < 180) requestAnimationFrame(tick);
    else resolve(console.log("p95 frame ms:", deltas.sort((x, y) => x - y)[Math.floor(deltas.length * 0.95)]));
  };
  requestAnimationFrame(tick);
});
```

Expected: p95 ≲ 20ms on a desktop. If not, the halo layer blur is the first suspect — drop `HALO_LAYER_BLUR_PX` to 0 and pre-blur the halo look into wider/lower-alpha strokes.

- [ ] **Step 5: Visual parity + reduced motion**

1. Compare the hidden state and the first revealed instant against `main` (screenshots) — must be equivalent apart from motion.
2. Enable "Reduce motion" in macOS Accessibility settings, reload — energy must reveal static, no loop.

- [ ] **Step 6: Commit**

```bash
git add scripts/verify-analyse-motion.py
git commit -m "test(analyse): motion verification script + measured thresholds"
```

---

### Task 7: Finish

- [ ] **Step 1: Full suite + build + format**

```bash
npm test && npm run build && npm run format
git status   # confirm only intended files changed
```

- [ ] **Step 2: Use the superpowers:finishing-a-development-branch skill** to decide merge/PR/cleanup for `feature/analyse-ambient-motion`.
