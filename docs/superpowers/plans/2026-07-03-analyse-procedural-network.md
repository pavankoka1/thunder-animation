# Analyse Procedural Plasma-Network Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the sprite flipbook with a procedurally generated plasma-lightning network that branches from 3 hubs and whose paths continuously reform in code — no runtime images.

**Architecture:** One new module `plasmaNetwork.js`: pure generation (`makeRng`, `generateBranch` via the shared `subdivideSegment` fractal, `buildNetwork`, `branchLife`) plus a canvas painter (`initNetwork`, `paintNetworkFrame`). Each branch "slot" regenerates its jagged path on a new route every life-cycle (grow → hold → retract), staggered across slots, so the network's topology changes over time. `AnalyseBetspot.jsx` swaps the flipbook calls for the network ones; its rAF/reveal/hide/reduced-motion wiring is unchanged.

**Tech Stack:** React 19 + Vite 6, Canvas 2D, vitest. Reuses pure helpers from `src/canvas/lightning/geometry.js` read-only. No new deps, no images.

**Spec:** `docs/superpowers/specs/2026-07-03-analyse-procedural-network-design.md`.

**Branch:** continue on `feature/analyse-ambient-motion`, on top of the flipbook work, which this supersedes.

**Hard constraint:** analyse-scoped only. No edits under `src/canvas/**` or `src/webgl/**`.

**Canvas space:** `w = BODY.width·STAGE.scale = 438`, `h = BODY.height·STAGE.scale = 204`. Hubs at `x ∈ {0.28,0.5,0.72}·w`, `y = 0.5·h`.

---

### Task 1: Seeded RNG + branch generation (pure)

**Files:**
- Create: `src/analyse/plasmaNetwork.js` (generation only this task)
- Test: `src/analyse/__tests__/plasmaNetwork.test.js`

- [ ] **Step 1: Write the failing tests**

Create `src/analyse/__tests__/plasmaNetwork.test.js`:

```js
import { describe, expect, it } from "vitest";
import { generateBranch, makeRng } from "../plasmaNetwork.js";

describe("makeRng", () => {
  it("is deterministic for a seed and stays in [0,1)", () => {
    const a = makeRng(123);
    const b = makeRng(123);
    const xs = [a(), a(), a()];
    expect([b(), b(), b()]).toEqual(xs);
    for (const x of xs) {
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
    }
  });

  it("differs across seeds", () => {
    expect(makeRng(1)()).not.toBe(makeRng(2)());
  });
});

describe("generateBranch", () => {
  const hub = { x: 219, y: 102 };

  it("returns polylines with interior vertices, all within bounds", () => {
    const branches = generateBranch(hub, 0.3, 120, 42, 438, 204);
    expect(branches.length).toBeGreaterThanOrEqual(1);
    for (const br of branches) {
      expect(br.points.length).toBeGreaterThanOrEqual(2);
      expect(br.cumLengths.length).toBe(br.points.length);
      expect(br.length).toBeGreaterThan(0);
      for (const p of br.points) {
        expect(p.x).toBeGreaterThanOrEqual(0);
        expect(p.x).toBeLessThanOrEqual(438);
        expect(p.y).toBeGreaterThanOrEqual(0);
        expect(p.y).toBeLessThanOrEqual(204);
      }
    }
    // starts at the hub
    expect(branches[0].points[0].x).toBeCloseTo(hub.x, 5);
    expect(branches[0].points[0].y).toBeCloseTo(hub.y, 5);
  });

  it("is deterministic for a seed and varies with it", () => {
    const a = generateBranch(hub, 0.3, 120, 42, 438, 204);
    const b = generateBranch(hub, 0.3, 120, 42, 438, 204);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    const c = generateBranch(hub, 0.3, 120, 43, 438, 204);
    expect(JSON.stringify(c)).not.toBe(JSON.stringify(a));
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test -- src/analyse/__tests__/plasmaNetwork.test.js`
Expected: FAIL — cannot resolve `../plasmaNetwork.js`.

- [ ] **Step 3: Implement RNG + generation**

Create `src/analyse/plasmaNetwork.js`:

```js
/**
 * Procedural plasma-network motion for the analyse betspot.
 *
 * Filaments branch out from three hubs; each branch regenerates on a new jagged
 * route every life-cycle (grow → hold → retract), staggered across branches, so
 * the network's paths continuously reform. Painted with additive neon glow in
 * code — no runtime images.
 */

import { cumulativeLengths, subdivideSegment } from "../canvas/lightning/geometry.js";

/** Deterministic mulberry32 RNG → () => [0,1). */
export function makeRng(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

function grow(x, y, angle, length, rng, w, h, depth, out) {
  const a = angle + (rng() - 0.5) * 0.4;
  const ex = clamp(x + Math.cos(a) * length, 0, w);
  const ey = clamp(y + Math.sin(a) * length, 0, h);
  const raw = subdivideSegment(x, y, ex, ey, length * 0.28, 3, rng);
  const points = raw.map((p) => ({ x: clamp(p.x, 0, w), y: clamp(p.y, 0, h) }));
  const cumLengths = cumulativeLengths(points);
  out.push({ points, cumLengths, length: cumLengths[cumLengths.length - 1] });

  if (depth > 0) {
    const forks = rng() < 0.75 ? 1 : 0;
    for (let f = 0; f <= forks; f += 1) {
      const idx = 1 + Math.floor(rng() * (points.length - 1));
      const start = points[Math.min(idx, points.length - 1)];
      const forkAngle = a + (rng() - 0.5) * 1.3;
      grow(start.x, start.y, forkAngle, length * (0.45 + rng() * 0.2), rng, w, h, depth - 1, out);
    }
  }
  return out;
}

/**
 * Generate one branch's polylines (main + recursive forks) as a jagged
 * lightning path from a hub. Deterministic for `seed`. All points clamped
 * within [0,w]×[0,h].
 *
 * @returns {Array<{points:Array<{x,y}>, cumLengths:number[], length:number}>}
 */
export function generateBranch(hub, angle, length, seed, w, h, depth = 2) {
  return grow(hub.x, hub.y, angle, length, makeRng(seed), w, h, depth, []);
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npm test -- src/analyse/__tests__/plasmaNetwork.test.js`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/analyse/plasmaNetwork.js src/analyse/__tests__/plasmaNetwork.test.js
git commit -m "feat(analyse): seeded RNG + fractal branch generation"
```

---

### Task 2: Network layout + branch life-cycle (pure)

**Files:**
- Modify: `src/analyse/plasmaNetwork.js` (append)
- Test: `src/analyse/__tests__/plasmaNetwork.test.js` (append)

- [ ] **Step 1: Append failing tests**

Extend the import at the top of the test file to
`import { branchLife, buildNetwork, generateBranch, makeRng, PERIOD } from "../plasmaNetwork.js";`
then append:

```js
describe("buildNetwork", () => {
  const hubs = [
    { x: 123, y: 102 },
    { x: 219, y: 102 },
    { x: 315, y: 102 },
  ];

  it("emits several slots per hub with stable identity fields", () => {
    const slots = buildNetwork(438, 204, hubs, { slotsPerHub: 7 });
    expect(slots.length).toBe(21);
    for (const s of slots) {
      expect(hubs).toContainEqual(s.hub);
      expect(Number.isFinite(s.angle)).toBe(true);
      expect(s.baseLength).toBeGreaterThan(0);
      expect(Number.isInteger(s.seed)).toBe(true);
      expect(s.phase).toBeGreaterThanOrEqual(0);
      expect(s.phase).toBeLessThan(PERIOD);
    }
  });
});

describe("branchLife", () => {
  const slots = buildNetwork(438, 204, [{ x: 219, y: 102 }], { slotsPerHub: 12 });

  it("keeps extent/alpha in [0,1] and cycles once per PERIOD", () => {
    const s = slots[0];
    for (let t = 0; t < 20; t += 0.13) {
      const l = branchLife(s, t);
      expect(l.extent).toBeGreaterThanOrEqual(0);
      expect(l.extent).toBeLessThanOrEqual(1);
      expect(l.alpha).toBeGreaterThanOrEqual(0);
      expect(l.alpha).toBeLessThanOrEqual(1);
    }
    expect(branchLife(s, 5).cycle + 1).toBe(branchLife(s, 5 + PERIOD).cycle);
  });

  it("staggers so total live extent stays within a band (not all-on/all-off)", () => {
    const sums = [];
    for (let t = 0; t < 40; t += 0.25) {
      let sum = 0;
      for (const s of slots) sum += branchLife(s, t).extent;
      sums.push(sum);
    }
    const mean = sums.reduce((a, b) => a + b, 0) / sums.length;
    for (const v of sums) {
      expect(v).toBeGreaterThan(mean * 0.55);
      expect(v).toBeLessThan(mean * 1.45);
    }
    expect(mean).toBeGreaterThan(slots.length * 0.4);
  });
});
```

- [ ] **Step 2: Run to verify the new tests fail**

Run: `npm test -- src/analyse/__tests__/plasmaNetwork.test.js`
Expected: FAIL — `buildNetwork`/`branchLife`/`PERIOD` not exported.

- [ ] **Step 3: Append the layout + life-cycle code**

Append to `src/analyse/plasmaNetwork.js`:

```js
/** One life-cycle length in seconds (grow → hold → retract → regrow). */
export const PERIOD = 3.5;

function seedFor(hubIndex, slotIndex) {
  return (Math.imul(hubIndex + 1, 73856093) ^ Math.imul(slotIndex + 1, 19349663)) >>> 0;
}

/**
 * Static branch slots: the identity of each branch (hub, outward angle, base
 * length, seed, staggered phase). The actual jagged path is regenerated per
 * life-cycle in the painter.
 */
export function buildNetwork(w, h, hubs, { slotsPerHub = 7 } = {}) {
  const slots = [];
  const reach = w * 0.34;
  for (let hi = 0; hi < hubs.length; hi += 1) {
    for (let si = 0; si < slotsPerHub; si += 1) {
      const seed = seedFor(hi, si);
      const rng = makeRng(seed);
      const angle = (si / slotsPerHub) * Math.PI * 2 + rng() * 0.6;
      slots.push({
        hubIndex: hi,
        hub: hubs[hi],
        angle,
        baseLength: reach * (0.7 + rng() * 0.6),
        seed,
        phase: rng() * PERIOD,
      });
    }
  }
  return slots;
}

function smoothstep(t) {
  const x = t < 0 ? 0 : t > 1 ? 1 : t;
  return x * x * (3 - 2 * x);
}

/** grow → hold → retract envelope over the [0,1) cycle fraction. */
function envelope(u) {
  const G = 0.28;
  const H = 0.72;
  if (u < G) return smoothstep(u / G);
  if (u < H) return 1;
  return 1 - smoothstep((u - H) / (1 - H));
}

/**
 * Life state of a branch slot at time t: which cycle (→ route seed), how far it
 * has grown (extent), and its painted brightness (alpha, with flicker).
 *
 * @returns {{cycle:number, extent:number, alpha:number}}
 */
export function branchLife(slot, tSec, period = PERIOD) {
  const local = tSec + slot.phase;
  const cycle = Math.floor(local / period);
  const u = local / period - cycle;
  const extent = envelope(u);
  const flicker = 0.78 + 0.22 * Math.sin(tSec * 11 + slot.seed);
  return { cycle, extent, alpha: Math.max(0, Math.min(1, extent * flicker)) };
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npm test -- src/analyse/__tests__/plasmaNetwork.test.js`
Expected: PASS (6 tests). If the "band" test fails, phases are clustering — it should not with mulberry32; do not widen the band, investigate `phase`.

- [ ] **Step 5: Commit**

```bash
git add src/analyse/plasmaNetwork.js src/analyse/__tests__/plasmaNetwork.test.js
git commit -m "feat(analyse): network layout + staggered branch life-cycle"
```

---

### Task 3: Canvas painter (init, vignette, frame)

**Files:**
- Modify: `src/analyse/plasmaNetwork.js` (append)

No unit test — canvas composition, verified in the browser in Task 4.

- [ ] **Step 1: Append the painter**

Append to `src/analyse/plasmaNetwork.js`:

```js
/** Neon glow passes (rgba prefixes; alpha appended per draw). */
const HALO = "rgba(150,70,225,";
const MID = "rgba(210,120,245,";
const CORE = "rgba(250,252,255,";
/** Hubs on the body midline, matching the reference clusters. */
const HUB_XS = [0.28, 0.5, 0.72];
/** Per-vertex paint-time jitter amplitude (px). */
const JITTER = 1.2;

function makeCanvas(w, h) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
}

function makeVignette(w, h) {
  const c = makeCanvas(w, h);
  const ctx = c.getContext("2d");
  const cx = w * 0.5;
  const cy = h * 0.5;
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.hypot(cx, cy));
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.6, "rgba(255,255,255,0.92)");
  g.addColorStop(0.85, "rgba(255,255,255,0.5)");
  g.addColorStop(1, "rgba(255,255,255,0.08)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  return c;
}

/** One-time asset bundle: slots, offscreen, vignette, per-slot path cache. */
export function initNetwork(w, h) {
  const hubs = HUB_XS.map((fx) => ({ x: fx * w, y: h * 0.5 }));
  const slots = buildNetwork(w, h, hubs);
  return {
    w,
    h,
    slots,
    offscreen: makeCanvas(w, h),
    vignette: makeVignette(w, h),
    cache: slots.map(() => ({ cycle: -1, branches: null })),
  };
}

function strokeVisible(ctx, branch, drawLen, tSec, seed, width, style) {
  const pts = branch.points;
  const cum = branch.cumLengths;
  ctx.beginPath();
  let started = false;
  for (let i = 0; i < pts.length; i += 1) {
    if (cum[i] > drawLen) break;
    const jx = Math.sin(tSec * 2.1 + seed + i * 1.3) * JITTER;
    const jy = Math.cos(tSec * 1.7 + seed + i * 1.7) * JITTER;
    const x = pts[i].x + jx;
    const y = pts[i].y + jy;
    if (!started) {
      ctx.moveTo(x, y);
      started = true;
    } else {
      ctx.lineTo(x, y);
    }
  }
  if (!started) return;
  ctx.lineWidth = width;
  ctx.strokeStyle = style;
  ctx.stroke();
}

/**
 * Paint one frame of the reforming network. Regenerates a slot's jagged path
 * when its life-cycle advances; draws the grown portion with additive neon
 * glow; masks with the vignette; blits. Signature matches the prior painters.
 */
export function paintNetworkFrame(ctx, assets, tMs) {
  if (!assets) return;
  const { w, h, slots, offscreen, vignette, cache } = assets;
  const t = tMs / 1000;

  const octx = offscreen.getContext("2d");
  octx.globalCompositeOperation = "source-over";
  octx.globalAlpha = 1;
  octx.clearRect(0, 0, w, h);
  octx.globalCompositeOperation = "lighter";
  octx.lineCap = "round";
  octx.lineJoin = "round";

  for (let i = 0; i < slots.length; i += 1) {
    const slot = slots[i];
    const life = branchLife(slot, t);
    if (life.alpha < 0.02) continue;

    const slotCache = cache[i];
    if (slotCache.cycle !== life.cycle) {
      slotCache.cycle = life.cycle;
      slotCache.branches = generateBranch(
        slot.hub,
        slot.angle,
        slot.baseLength,
        (slot.seed ^ (life.cycle * 0x9e3779b1)) >>> 0,
        w,
        h,
      );
    }

    const a = life.alpha;
    for (const branch of slotCache.branches) {
      const drawLen = life.extent * branch.length;
      strokeVisible(octx, branch, drawLen, t, slot.seed, 4.5, HALO + (0.28 * a).toFixed(3) + ")");
      strokeVisible(octx, branch, drawLen, t, slot.seed, 2.0, MID + (0.5 * a).toFixed(3) + ")");
      strokeVisible(octx, branch, drawLen, t, slot.seed, 0.9, CORE + (0.85 * a).toFixed(3) + ")");
    }
  }

  octx.globalCompositeOperation = "destination-in";
  octx.globalAlpha = 1;
  octx.drawImage(vignette, 0, 0);
  octx.globalCompositeOperation = "source-over";

  ctx.clearRect(0, 0, w, h);
  ctx.drawImage(offscreen, 0, 0);
}
```

- [ ] **Step 2: Verify import stays test-safe**

Run: `npm test -- src/analyse/__tests__/plasmaNetwork.test.js`
Expected: PASS (6 tests) — canvas code only runs inside functions.

- [ ] **Step 3: Commit**

```bash
git add src/analyse/plasmaNetwork.js
git commit -m "feat(analyse): neon glow painter for the reforming network"
```

---

### Task 4: Rewire `AnalyseBetspot.jsx` + page copy

**Files:**
- Modify: `src/analyse/AnalyseBetspot.jsx`
- Modify: `src/pages/AnalysePage.jsx`

- [ ] **Step 1: Swap imports**

In `src/analyse/AnalyseBetspot.jsx`, replace

```js
import { initFlipbook, loadPlasmaSheet, paintFlipbookFrame } from "./plasmaFlipbook.js";
import { BODY, CHIP, ENERGY_OPACITY, LAYER_URLS, STAGE, TOP_BAR } from "./spec.js";

const SHEET_URL = "/analyse/plasma-frames.webp";
```

with

```js
import { initNetwork, paintNetworkFrame } from "./plasmaNetwork.js";
import { BODY, CHIP, ENERGY_OPACITY, LAYER_URLS, STAGE, TOP_BAR } from "./spec.js";
```

- [ ] **Step 2: Replace the setup effect body**

Replace the async IIFE inside the first `useEffect` (the `loadPlasmaSheet`/`initFlipbook` block) with:

```js
    // Build the procedural network once, size the canvas to the body, and paint
    // the t=0 frame as the static image. The reveal loop then animates it.
    (async () => {
      try {
        const canvas = canvasRef.current;
        if (cancelled || !canvas) return;

        const w = BODY.width * STAGE.scale;
        const h = BODY.height * STAGE.scale;
        canvas.width = w;
        canvas.height = h;

        const assets = initNetwork(w, h);
        motionRef.current = assets;
        paintNetworkFrame(canvas.getContext("2d"), assets, 0);
        setReady(true);
      } catch (err) {
        console.error("Failed to build plasma network", err);
      }
    })();
```

- [ ] **Step 3: Point the rAF loop and cleanup at the network painter**

Change the frame call

```js
      paintFlipbookFrame(ctx, assets, now - start);
```
to
```js
      paintNetworkFrame(ctx, assets, now - start);
```

and the cleanup restore

```js
      if (assets) paintFlipbookFrame(ctx, assets, 0);
```
to
```js
      if (assets) paintNetworkFrame(ctx, assets, 0);
```

- [ ] **Step 4: Update the page copy**

In `src/pages/AnalysePage.jsx`, replace the subtitle body with:

```
Blue body and outer glow are pure CSS. The inner energy is a procedurally
          generated lightning network — filaments branch out from three hubs and their
          paths continuously reform in code (grow, retract, regrow on new routes). Painted
          with additive neon glow, screen-blended over the body and edge-faded. Click to
          toggle.
```

- [ ] **Step 5: Verify tests, build, app**

```bash
npm test && npm run build
```
Expected: passing; build succeeds.

```bash
npm run dev
```
Open `/analyse`, reveal, confirm: filaments branch from 3 hubs and visibly reform (grow/retract/reroute), loop indefinitely; hide → static; console clean.

- [ ] **Step 6: Commit**

```bash
git add src/analyse/AnalyseBetspot.jsx src/pages/AnalysePage.jsx
git commit -m "feat(analyse): drive the procedural network from the reveal loop"
```

---

### Task 5: Remove the flipbook + sprite asset

**Files:**
- Delete: `src/analyse/plasmaFlipbook.js`, `src/analyse/__tests__/plasmaFlipbook.test.js`
- Delete: `public/analyse/plasma-frames.webp`, `scripts/encode-plasma-frames.py`

- [ ] **Step 1: Confirm nothing imports the flipbook**

Run: `grep -rn "plasmaFlipbook\|loadPlasmaSheet\|paintFlipbookFrame\|plasma-frames" src`
Expected: no matches.

- [ ] **Step 2: Delete**

```bash
git rm src/analyse/plasmaFlipbook.js src/analyse/__tests__/plasmaFlipbook.test.js \
       public/analyse/plasma-frames.webp scripts/encode-plasma-frames.py
```

- [ ] **Step 3: Verify suite + build**

Run: `npm test && npm run build`
Expected: `plasmaNetwork` tests pass (6); build succeeds; no unresolved imports.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore(analyse): remove sprite flipbook superseded by procedural network"
```

---

### Task 6: Verify reform + finish

- [ ] **Step 1: Prove it reforms (topology change over seconds)**

With `npm run dev` up, reveal the energy, capture the `.analyse-betspot__energy` canvas via `toDataURL` twice ~`PERIOD` seconds apart (≈3.5 s), decode to `n0.png`/`n1.png`, and run:

```bash
/private/tmp/claude-502/-Users-pavankurmarao-k-Documents-personal-koka-lab/1a70a8e9-77bd-45e3-8ac0-178c6ab392ed/scratchpad/venv/bin/python - "$PWD/n0.png" "$PWD/n1.png" << 'PY'
import sys, numpy as np
from PIL import Image
a=np.asarray(Image.open(sys.argv[1]).convert("L"),np.float32)
b=np.asarray(Image.open(sys.argv[2]).convert("L"),np.float32)
d=np.abs(a-b)
print("mean|d|:", round(float(d.mean()),1), " frac>30:", round(float((d>30).mean()),3),
      "-> non-trivial change = paths reforming")
PY
```
Expected: clear inter-frame change (paths differ across a cycle), confirming reform.

- [ ] **Step 2: Behavioural checks**

Confirm in the browser: loops indefinitely; hide → static t=0; OS Reduce-Motion → static; tab-hidden → paused; rAF frame-time p95 within budget.

- [ ] **Step 3: Full gate + format**

```bash
npm test && npm run build && npm run format
git status   # revert any prettier churn outside src/analyse + AnalysePage + docs
```

- [ ] **Step 4: Tune the look**

Constants at the top of `plasmaNetwork.js`: `HUB_XS`, `slotsPerHub` (buildNetwork), `PERIOD`, `JITTER`, glow widths/alphas, `reach`. Adjust against the live render and the reference frames. Commit any change as `chore(analyse): tune network look`.

- [ ] **Step 5: Use the superpowers:finishing-a-development-branch skill** for `feature/analyse-ambient-motion`.
