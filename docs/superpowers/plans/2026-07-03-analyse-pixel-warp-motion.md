# Analyse Pixel-Warp Motion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** After the reveal on `/analyse`, the pattern already painted on the betspot canvas *moves* — its pixels are displaced by a slow flow field anchored at the 3 bright hubs, the way the reference SVG frames shift. No new strokes, no overlay.

**Architecture:** Replace the rejected re-stroke render path with a per-pixel displacement warp. `energyHubs.js` finds the 3 anchor hubs from the baked canvas's own luminance. `energyMotion.js` is rewritten: pure math (`sampleFlow`, `buildAnchorField`, `bilinearSample`) plus a `paintEnergyFrame` that, each frame, resamples the cached baked pixels through `displacement = anchor(x,y) · flow(x,y,t)` and `putImageData`s the result. `AnalyseBetspot.jsx`'s rAF wiring is unchanged (same `paintEnergyFrame(ctx, assets, tMs)` signature); only what builds `assets` changes.

**Tech Stack:** React 19 + Vite 6, Canvas 2D `getImageData`/`putImageData`, vitest. No new deps, no WebGL.

**Spec:** `docs/superpowers/specs/2026-07-03-analyse-pixel-warp-motion-design.md`.

**Hard constraint:** analyse-scoped only. No edits under `src/canvas/**` or `src/webgl/**`. `cellularEnergy.js` returns to its pre-feature state (the 5 `export` keywords added for the old approach are reverted — the warp samples baked pixels and needs no colour constants). This plan runs on the existing `feature/analyse-ambient-motion` branch, on top of the committed re-stroke work, which it supersedes.

**Calibration (from the reference SVGs, measured earlier):** hubs anchored (≤2% width drift); local wander ~0.3% → `MAX_AMP ≈ 1.8px` on the 438px canvas; slow (~0.2–0.4 Hz); zero net drift; isotropic.

---

### Task 1: Hub detection from the baked canvas (`energyHubs.js`)

**Files:**
- Create: `src/analyse/energyHubs.js`
- Test: `src/analyse/__tests__/energyHubs.test.js`

Additive — nothing imports it yet, so the app and existing tests stay green.

- [ ] **Step 1: Write the failing tests**

Create `src/analyse/__tests__/energyHubs.test.js`:

```js
import { describe, expect, it } from "vitest";
import { detectHubs } from "../energyHubs.js";

/** Paint a soft round blob of peak strength into a Float32Array field. */
function addBlob(field, w, h, cx, cy, radius, peak) {
  for (let y = Math.max(0, cy - radius); y < Math.min(h, cy + radius); y += 1) {
    for (let x = Math.max(0, cx - radius); x < Math.min(w, cx + radius); x += 1) {
      const d = Math.hypot(x - cx, y - cy) / radius;
      if (d >= 1) continue;
      const v = peak * (1 - d);
      const i = y * w + x;
      if (v > field[i]) field[i] = v;
    }
  }
}

describe("detectHubs", () => {
  it("finds three separated clusters, strongest first", () => {
    const w = 120;
    const h = 60;
    const field = new Float32Array(w * h);
    addBlob(field, w, h, 60, 30, 10, 1.0);
    addBlob(field, w, h, 20, 30, 10, 0.8);
    addBlob(field, w, h, 100, 30, 10, 0.7);

    const hubs = detectHubs(field, w, h, 3, 20);

    expect(hubs).toHaveLength(3);
    expect(Math.hypot(hubs[0].x - 60, hubs[0].y - 30)).toBeLessThan(8);
    const xs = hubs.map((p) => p.x).sort((a, b) => a - b);
    expect(Math.abs(xs[0] - 20)).toBeLessThan(8);
    expect(Math.abs(xs[2] - 100)).toBeLessThan(8);
  });

  it("ignores maxima hugging the border", () => {
    const w = 100;
    const h = 60;
    const field = new Float32Array(w * h);
    addBlob(field, w, h, 2, 2, 3, 1.0); // corner speck — excluded
    addBlob(field, w, h, 50, 30, 10, 0.7);

    const hubs = detectHubs(field, w, h, 2, 20);
    expect(hubs.length).toBeGreaterThanOrEqual(1);
    expect(Math.hypot(hubs[0].x - 50, hubs[0].y - 30)).toBeLessThan(8);
  });

  it("returns nothing for an empty field", () => {
    expect(detectHubs(new Float32Array(40 * 40), 40, 40, 3, 10).length).toBe(0);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- src/analyse/__tests__/energyHubs.test.js`
Expected: FAIL — cannot resolve `../energyHubs.js`.

- [ ] **Step 3: Implement `energyHubs.js`**

Create `src/analyse/energyHubs.js` (the detector is lifted verbatim from the prior `filamentSegments.js`, plus a `canvasToField` helper that reads the *baked* pattern's luminance × alpha):

```js
/**
 * Anchor-hub detection for the analyse betspot warp.
 *
 * The 3 "clutters" the reference SVGs pivot around are the brightest clusters
 * of the painted pattern. We read them straight off the baked canvas
 * (luminance × alpha), blur heavily, and pick separated maxima.
 */

/** Hub maxima this close to the border are ignored (texture edges glow). */
const HUB_MARGIN_FRAC = 0.08;

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
 * Brightest separated clusters of a scalar field: triple box blur ≈ gaussian,
 * then greedy maxima with a suppression radius and a border-margin exclusion.
 *
 * @param {Float32Array} field row-major, any non-negative scale
 * @returns {Array<{x:number,y:number,strength:number}>} strongest first
 */
export function detectHubs(field, w, h, count = 3, minSep = Math.round(Math.min(w, h) / 3)) {
  const r = Math.max(2, Math.round(Math.min(w, h) / 12));
  const a = Float32Array.from(field);
  const b = new Float32Array(w * h);
  for (let pass = 0; pass < 3; pass += 1) {
    boxBlurPass(a, b, w, h, r, true);
    boxBlurPass(b, a, w, h, r, false);
  }

  const work = Float32Array.from(a);
  const mx = Math.round(w * HUB_MARGIN_FRAC);
  const my = Math.round(h * HUB_MARGIN_FRAC);
  for (let yy = 0; yy < h; yy += 1) {
    if (yy < my || yy >= h - my) {
      work.fill(0, yy * w, (yy + 1) * w);
    } else {
      work.fill(0, yy * w, yy * w + mx);
      work.fill(0, yy * w + w - mx, (yy + 1) * w);
    }
  }

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

/**
 * Read a canvas into a scalar field = (luminance/255) × (alpha/255), in [0,1].
 * Uses the painted pattern itself, so hubs sit on the visible bright clusters.
 */
export function canvasToField(canvas) {
  const w = canvas.width;
  const h = canvas.height;
  const data = canvas.getContext("2d").getImageData(0, 0, w, h).data;
  const field = new Float32Array(w * h);
  for (let i = 0; i < w * h; i += 1) {
    const o = i * 4;
    const lum = (data[o] + data[o + 1] + data[o + 2]) / 3;
    field[i] = (lum / 255) * (data[o + 3] / 255);
  }
  return { field, w, h };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- src/analyse/__tests__/energyHubs.test.js`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/analyse/energyHubs.js src/analyse/__tests__/energyHubs.test.js
git commit -m "feat(analyse): hub detection from the baked pattern"
```

---

### Task 2: Rewrite `energyMotion.js` as a displacement warp

**Files:**
- Modify (replace contents): `src/analyse/energyMotion.js`
- Modify (replace contents): `src/analyse/__tests__/energyMotion.test.js`

After this task `npm test` is green but `npm run build` will FAIL (AnalyseBetspot still imports the removed `initMotionAssets`/`extractSegments`). That is expected and fixed in Task 3 — do not run the build as this task's gate.

- [ ] **Step 1: Replace the test file with warp-math tests**

Overwrite `src/analyse/__tests__/energyMotion.test.js`:

```js
import { describe, expect, it } from "vitest";
import {
  MAX_AMP,
  bilinearSample,
  buildAnchorField,
  sampleFlow,
} from "../energyMotion.js";

describe("sampleFlow", () => {
  it("stays within MAX_AMP on each axis", () => {
    let maxAbs = 0;
    for (let t = 0; t < 30; t += 0.3) {
      for (let x = 0; x < 440; x += 17) {
        for (let y = 0; y < 200; y += 13) {
          const f = sampleFlow(x, y, t);
          maxAbs = Math.max(maxAbs, Math.abs(f.x), Math.abs(f.y));
        }
      }
    }
    expect(maxAbs).toBeLessThanOrEqual(MAX_AMP + 1e-6);
  });

  it("has ~zero net drift over time at a fixed point (oscillates around rest)", () => {
    let sx = 0;
    let sy = 0;
    let n = 0;
    for (let t = 0; t < 240; t += 0.05) {
      const f = sampleFlow(123, 77, t);
      sx += f.x;
      sy += f.y;
      n += 1;
    }
    expect(Math.abs(sx / n)).toBeLessThan(0.15 * MAX_AMP);
    expect(Math.abs(sy / n)).toBeLessThan(0.15 * MAX_AMP);
  });

  it("is deterministic and spatially smooth", () => {
    expect(sampleFlow(50, 50, 3.2)).toEqual(sampleFlow(50, 50, 3.2));
    const a = sampleFlow(50, 50, 3.2);
    const b = sampleFlow(51, 50, 3.2);
    expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeLessThan(0.3);
  });
});

describe("buildAnchorField", () => {
  it("is 0 at a hub and ~1 far from all hubs, monotone with distance", () => {
    const w = 100;
    const h = 60;
    const hubs = [{ x: 50, y: 30, strength: 1 }];
    const a = buildAnchorField(w, h, hubs, 6, 40);

    expect(a[30 * w + 50]).toBe(0); // at the hub
    expect(a[30 * w + 95]).toBeCloseTo(1, 5); // far corner-ish
    const near = a[30 * w + 60]; // 10px away
    const mid = a[30 * w + 75]; // 25px away
    expect(near).toBeLessThan(mid);
    expect(mid).toBeLessThanOrEqual(1);
  });

  it("with no hubs leaves the whole field free (1)", () => {
    const a = buildAnchorField(10, 10, [], 6, 40);
    expect(a.every((v) => v === 1)).toBe(true);
  });
});

describe("bilinearSample", () => {
  it("interpolates a horizontal gradient between texels", () => {
    // 2×1 RGBA: red channel 0 then 200
    const src = new Uint8ClampedArray([0, 0, 0, 255, 200, 0, 0, 255]);
    const out = new Uint8ClampedArray(4);
    bilinearSample(src, 2, 1, 0.5, 0, out, 0);
    expect(out[0]).toBe(100);
    expect(out[3]).toBe(255);
  });

  it("clamps out-of-range coordinates to the edge", () => {
    const src = new Uint8ClampedArray([10, 20, 30, 255]);
    const out = new Uint8ClampedArray(4);
    bilinearSample(src, 1, 1, -5, 9, out, 0);
    expect(Array.from(out)).toEqual([10, 20, 30, 255]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- src/analyse/__tests__/energyMotion.test.js`
Expected: FAIL — `sampleFlow`/`buildAnchorField`/`bilinearSample` are not exported (the file still holds the old stroke code).

- [ ] **Step 3: Replace `energyMotion.js` with the warp implementation**

Overwrite `src/analyse/energyMotion.js`:

```js
/**
 * Displacement-warp motion for the analyse betspot.
 *
 * The pattern is already baked into the energy canvas. Each frame we resample
 * those pixels through displacement = anchor(x,y) · flow(x,y,t):
 *   • flow — a slow, low-frequency field of summed sinusoids that oscillates
 *     around rest and never drifts (matches the SVGs' zero-net-drift wander)
 *   • anchor — 0 at the 3 bright hubs, ramping to 1 away from them, so the
 *     clusters stay put and the filaments between them flex
 * No new strokes, no overlay: the painted pixels themselves move.
 */

const TAU = Math.PI * 2;

/** Max displacement, energy-canvas px (~0.3% of the 438px width). */
export const MAX_AMP = 1.8;

/** Spatial frequencies (rad/px) → wavelengths ~240–430px, larger than the body. */
const SK1 = 0.0155;
const SK2 = 0.0242;
/** Temporal rates (rad/s) → ~0.2 and ~0.14 Hz. */
const TR1 = 1.3;
const TR2 = 0.9;
/** Two bands per axis, summing to 1 before the MAX_AMP scale (keeps it bounded). */
const A1 = 0.6;
const A2 = 0.4;

/** Anchor ramp radii (px): frozen within R0 of a hub, free beyond R1. */
const R0 = 6;
const R1 = 42;
/** Coarse grid step for the per-frame flow evaluation (px). */
const GRID_STEP = 8;

function smoothstep(a, b, x) {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/**
 * Flow displacement at a point and time, bounded by MAX_AMP on each axis.
 * Pure sinusoids in t → zero temporal mean (no net drift). Deterministic.
 */
export function sampleFlow(x, y, tSec) {
  const dx =
    Math.sin(x * SK1 + y * SK2 * 0.6 + tSec * TR1) * A1 +
    Math.sin(x * SK2 * 0.5 - y * SK1 + tSec * TR2 + 1.7) * A2;
  const dy =
    Math.cos(y * SK1 - x * SK2 * 0.5 + tSec * TR1 * 0.85) * A1 +
    Math.cos(x * SK1 * 0.7 + y * SK2 + tSec * TR2 - 2.1) * A2;
  return { x: dx * MAX_AMP, y: dy * MAX_AMP };
}

/**
 * Per-pixel anchor weight in [0,1]: 0 within R0 of the nearest hub, ramping via
 * smoothstep to 1 beyond R1. With no hubs the whole field is free (1).
 */
export function buildAnchorField(w, h, hubs, r0 = R0, r1 = R1) {
  const field = new Float32Array(w * h);
  if (!hubs.length) {
    field.fill(1);
    return field;
  }
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      let best = Infinity;
      for (let k = 0; k < hubs.length; k += 1) {
        const d = Math.hypot(hubs[k].x - x, hubs[k].y - y);
        if (d < best) best = d;
      }
      field[y * w + x] = smoothstep(r0, r1, best);
    }
  }
  return field;
}

/**
 * Bilinearly sample RGBA from `src` (w×h) at (fx,fy), edge-clamped, writing 4
 * bytes into `out` at offset `oi`. Alpha travels with the colour.
 */
export function bilinearSample(src, w, h, fx, fy, out, oi) {
  let x = fx < 0 ? 0 : fx > w - 1 ? w - 1 : fx;
  let y = fy < 0 ? 0 : fy > h - 1 ? h - 1 : fy;
  const x0 = x | 0;
  const y0 = y | 0;
  const x1 = x0 + 1 < w ? x0 + 1 : x0;
  const y1 = y0 + 1 < h ? y0 + 1 : y0;
  const tx = x - x0;
  const ty = y - y0;
  const i00 = (y0 * w + x0) * 4;
  const i10 = (y0 * w + x1) * 4;
  const i01 = (y1 * w + x0) * 4;
  const i11 = (y1 * w + x1) * 4;
  for (let c = 0; c < 4; c += 1) {
    const top = src[i00 + c] * (1 - tx) + src[i10 + c] * tx;
    const bot = src[i01 + c] * (1 - tx) + src[i11 + c] * tx;
    out[oi + c] = top * (1 - ty) + bot * ty;
  }
}

/**
 * One-time asset bundle. Caches the baked pixels, a reusable output buffer, the
 * anchor field, and coarse flow-grid buffers.
 *
 * @param {HTMLCanvasElement} baked the static energy bake
 * @param {Array<{x,y,strength}>} hubs anchor hubs from detectHubs
 */
export function initWarpAssets(baked, hubs) {
  const w = baked.width;
  const h = baked.height;
  const src = baked.getContext("2d").getImageData(0, 0, w, h).data;
  const out = new ImageData(w, h);
  const anchor = buildAnchorField(w, h, hubs);

  const gw = Math.ceil(w / GRID_STEP) + 1;
  const gh = Math.ceil(h / GRID_STEP) + 1;
  return {
    w,
    h,
    src,
    out,
    anchor,
    gw,
    gh,
    gx: new Float32Array(gw * gh),
    gy: new Float32Array(gw * gh),
  };
}

/**
 * Paint one warped frame: resample the cached bake through the flow field and
 * putImageData. Flow is evaluated on a coarse grid and bilinearly interpolated
 * per pixel to keep trig cheap.
 */
export function paintEnergyFrame(ctx, assets, tMs) {
  const { w, h, src, out, anchor, gw, gh, gx, gy } = assets;
  const t = tMs / 1000;

  for (let gj = 0; gj < gh; gj += 1) {
    for (let gi = 0; gi < gw; gi += 1) {
      const f = sampleFlow(gi * GRID_STEP, gj * GRID_STEP, t);
      const gk = gj * gw + gi;
      gx[gk] = f.x;
      gy[gk] = f.y;
    }
  }

  const dst = out.data;
  for (let y = 0; y < h; y += 1) {
    const gjf = y / GRID_STEP;
    const gj0 = gjf | 0;
    const ty = gjf - gj0;
    const row0 = gj0 * gw;
    const row1 = (gj0 + 1 < gh ? gj0 + 1 : gj0) * gw;
    for (let x = 0; x < w; x += 1) {
      const oi = (y * w + x) * 4;
      const a = anchor[y * w + x];
      if (a <= 0) {
        bilinearSample(src, w, h, x, y, dst, oi);
        continue;
      }
      const gif = x / GRID_STEP;
      const gi0 = gif | 0;
      const tx = gif - gi0;
      const gi1 = gi0 + 1 < gw ? gi0 + 1 : gi0;
      const dxTop = gx[row0 + gi0] * (1 - tx) + gx[row0 + gi1] * tx;
      const dxBot = gx[row1 + gi0] * (1 - tx) + gx[row1 + gi1] * tx;
      const dyTop = gy[row0 + gi0] * (1 - tx) + gy[row0 + gi1] * tx;
      const dyBot = gy[row1 + gi0] * (1 - tx) + gy[row1 + gi1] * tx;
      const dx = (dxTop * (1 - ty) + dxBot * ty) * a;
      const dy = (dyTop * (1 - ty) + dyBot * ty) * a;
      bilinearSample(src, w, h, x - dx, y - dy, dst, oi);
    }
  }

  ctx.putImageData(out, 0, 0);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- src/analyse/__tests__/energyMotion.test.js`
Expected: PASS (7 tests). If the drift test fails, the flow has a non-oscillating term — keep every `t` term inside a sin/cos; do not loosen the test.

- [ ] **Step 5: Run the whole unit suite (build will fail — that's expected here)**

Run: `npm test`
Expected: PASS (energyHubs 3 + energyMotion 7 + filamentSegments 4 = 14). `npm run build` is intentionally NOT run this task.

- [ ] **Step 6: Commit**

```bash
git add src/analyse/energyMotion.js src/analyse/__tests__/energyMotion.test.js
git commit -m "feat(analyse): displacement-warp render path (replaces re-stroke)"
```

---

### Task 3: Rewire `AnalyseBetspot.jsx` + page copy

**Files:**
- Modify: `src/analyse/AnalyseBetspot.jsx`
- Modify: `src/pages/AnalysePage.jsx`

- [ ] **Step 1: Swap the imports**

In `src/analyse/AnalyseBetspot.jsx`, replace the two feature imports

```js
import { initMotionAssets, paintEnergyFrame } from "./energyMotion.js";
import { extractSegments } from "./filamentSegments.js";
```

with

```js
import { initWarpAssets, paintEnergyFrame } from "./energyMotion.js";
import { canvasToField, detectHubs } from "./energyHubs.js";
```

- [ ] **Step 2: Build warp assets in the bake effect**

In the bake effect, replace the extraction block

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

with

```js
        bakedRef.current = baked;
        try {
          const { field, w, h } = canvasToField(baked);
          const hubs = detectHubs(field, w, h);
          motionRef.current = initWarpAssets(baked, hubs);
        } catch (err) {
          console.warn("Warp assets unavailable — energy stays static", err);
        }
```

The rAF-loop effect, its cleanup (redraw static bake), the visibility handler, and the reduced-motion listener are unchanged — `paintEnergyFrame(ctx, assets, tMs)` keeps the same signature.

- [ ] **Step 3: Update the page copy**

In `src/pages/AnalysePage.jsx`, replace the trailing sentence of the subtitle

```
Once revealed, the web stays alive: branches take
          turns lighting up around three anchored hubs while filaments slowly writhe in
          place.
```

with

```
Once revealed, the painted web itself slowly drifts and breathes in
          place, anchored at three bright hubs.
```

- [ ] **Step 4: Verify tests, build, and the app**

```bash
npm test && npm run build
```
Expected: 14 tests pass; build succeeds (imports now resolve).

```bash
npm run dev
```
Open the `/analyse` route (Playwright or manually), click "Reveal energy", and confirm:
1. Bake reveals as before; after the fade the pattern visibly drifts/breathes.
2. The 3 bright clusters stay put; motion is strongest between them.
3. Hide → the exact static bake returns; re-reveal restarts motion.
4. Console clean.

- [ ] **Step 5: Commit**

```bash
git add src/analyse/AnalyseBetspot.jsx src/pages/AnalysePage.jsx
git commit -m "feat(analyse): drive the betspot warp from the reveal loop"
```

---

### Task 4: Remove dead code, restore `cellularEnergy.js`

**Files:**
- Delete: `src/analyse/filamentSegments.js`
- Delete: `src/analyse/__tests__/filamentSegments.test.js`
- Modify: `src/analyse/cellularEnergy.js` (revert the 5 `export` keywords)

- [ ] **Step 1: Confirm nothing imports the segment module**

Run: `grep -rn "filamentSegments\|initMotionAssets\|extractSegments\|computeRouteWeights\|jitterSegmentPoints" src`
Expected: no matches (all removed in Tasks 2–3). If any remain, fix the importer before deleting.

- [ ] **Step 2: Delete the dead files**

```bash
git rm src/analyse/filamentSegments.js src/analyse/__tests__/filamentSegments.test.js
```

- [ ] **Step 3: Revert the export keywords in `cellularEnergy.js`**

The warp samples baked pixels and imports no colour constants, so restore the shared-ish bake file to its pre-feature form. In `src/analyse/cellularEnergy.js` change these back:

```js
const VIOLET = "rgb(150, 70, 225)";
const MAGENTA = "rgb(210, 120, 245)";
const WHITE = "rgb(250, 250, 255)";
```
```js
const REACH_STOPS = [
```
```js
const THICK_STOPS = [
```

- [ ] **Step 4: Verify the whole suite and build**

Run: `npm test && npm run build`
Expected: 10 tests pass (energyHubs 3 + energyMotion 7); build succeeds; no unresolved imports.

- [ ] **Step 5: Commit**

```bash
git add -A src/analyse/cellularEnergy.js
git commit -m "chore(analyse): drop re-stroke segment code, restore cellularEnergy"
```

---

### Task 5: Verification script + measured checks

**Files:**
- Modify: `scripts/verify-analyse-motion.py`

- [ ] **Step 1: Switch the "motion present" assertion to a local-diff test**

A warp keeps bright-IoU high by design, so IoU is the wrong motion signal. Replace the re-routing block in `scripts/verify-analyse-motion.py`

```python
# 2. Re-routing: bright pixels partially swapped — neither frozen nor replaced
ma, mb = a > 120, b > 120
iou = np.logical_and(ma, mb).sum() / max(1, np.logical_or(ma, mb).sum())
print(f"bright IoU = {iou:.3f} (target 0.35-0.95)")
assert 0.35 < iou < 0.95, "FAIL: turnover outside expected band"
```

with

```python
# 2. Motion present: the pattern actually moved between frames, but subtly
d = np.abs(a - b)
moved = float((d > 8).mean())
print(f"moved fraction (|Δlum|>8) = {moved:.3f} (target 0.02-0.60)")
assert 0.02 < moved < 0.60, "FAIL: too little or too much motion"
```

(The drift check and the bright-area-conserved check above/below it stay as they are.)

- [ ] **Step 2: Capture two frames ~4s apart and run it**

With `npm run dev` running, reveal the energy, screenshot the `.analyse-betspot__energy` canvas via `toDataURL`, wait 4s, screenshot again, decode both to `frame_a.png`/`frame_b.png`, then:

```bash
python3 scripts/verify-analyse-motion.py frame_a.png frame_b.png
```
Expected: `OK: anchored, moving, energy-conserving` (drift (0,0); moved fraction in band; area conserved).

- [ ] **Step 3: Frame-time + fallbacks**

In the browser console while revealed, sample ~180 rAF deltas and confirm p95 within a frame budget (≲16–20ms). Then confirm: OS "Reduce Motion" → static (no loop); background the tab → loop pauses; foreground → resumes.

- [ ] **Step 4: Commit**

```bash
git add scripts/verify-analyse-motion.py
git commit -m "test(analyse): verify warp motion (local-diff signal)"
```

---

### Task 6: Finish

- [ ] **Step 1: Full gate**

```bash
npm test && npm run build && npm run format
git status   # confirm only intended files changed; revert any prettier churn outside src/analyse + AnalysePage
```

- [ ] **Step 2: Tune the feel**

With the app running, adjust `MAX_AMP`, `TR1`/`TR2` (speed), `SK1`/`SK2` (swirl scale), and `R0`/`R1` (hub freeze radius) in `energyMotion.js` against the live render and the reference SVGs. Commit any change as `chore(analyse): tune warp feel`.

- [ ] **Step 3: Use the superpowers:finishing-a-development-branch skill** for `feature/analyse-ambient-motion`.
