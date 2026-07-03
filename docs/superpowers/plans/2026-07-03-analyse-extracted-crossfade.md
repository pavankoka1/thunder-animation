# Analyse Extracted-Web Crossfade Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Extract the real filament web from the plasma frames as vector polylines and crossfade ~10 keyframes in code, so the dense web is always present and its paths re-route in place (the measured sprite behaviour) — no runtime image.

**Architecture:** Build-time Python extracts 10 keyframes → `plasma-paths.json`. Runtime `plasmaPaths.js`: pure `coverTransform`/`keyframeAt` + a canvas painter that builds one `Path2D` per keyframe and crossfades consecutive keyframes with violet-halo/white-core glow. `AnalyseBetspot.jsx` swaps the network calls for these.

**Tech Stack:** React 19 + Vite 6, Canvas 2D `Path2D`, vitest. Pillow + scikit-image (scratchpad venv) for the one-time extract. No new runtime deps.

**Spec:** `docs/superpowers/specs/2026-07-03-analyse-extracted-crossfade-design.md`.
**Branch:** continue `feature/analyse-ambient-motion`.
**Hard constraint:** analyse-scoped; no `src/canvas/**` or `src/webgl/**` edits.
**Canvas:** `tw=438, th=204` (BODY·scale). Frames `400×325`, 26 total → 10 keyframes.
**venv:** `/private/tmp/claude-502/-Users-pavankurmarao-k-Documents-personal-koka-lab/1a70a8e9-77bd-45e3-8ac0-178c6ab392ed/scratchpad/venv/bin/python`

---

### Task 1: Extract keyframe polylines → JSON

**Files:**
- Create: `scripts/extract-plasma-paths.py`
- Create: `public/analyse/plasma-paths.json`

- [ ] **Step 1: Write the extractor**

Create `scripts/extract-plasma-paths.py`:

```python
"""One-time: extract filament polylines from the plasma sprite sheet.

Usage: python3 scripts/extract-plasma-paths.py <sheet.png> public/analyse/plasma-paths.json
Needs Pillow + scikit-image. Emits ~10 keyframes of traced, simplified polylines
in frame coords (400x325): {"w":400,"h":325,"frames":[[[[x,y],...],...],...]}.
"""
import json
import sys

import numpy as np
from PIL import Image
from skimage.measure import approximate_polygon
from skimage.morphology import remove_small_objects, skeletonize

FH, FW, N = 325, 400, 26
KEYFRAMES = 10
THRESH = 195
MIN_OBJ = 40
TOL = 1.8

src, out = sys.argv[1], sys.argv[2]
a = np.asarray(Image.open(src).convert("L"), np.float32)
assert a.shape[0] == FH * N and a.shape[1] == FW, f"unexpected sheet {a.shape}"


def trace(skel):
    H, W = skel.shape
    S = skel.astype(np.uint8)

    def nb(y, x):
        o = []
        for dy in (-1, 0, 1):
            for dx in (-1, 0, 1):
                if dy or dx:
                    ny, nx = y + dy, x + dx
                    if 0 <= ny < H and 0 <= nx < W and S[ny, nx]:
                        o.append((ny, nx))
        return o

    deg = {}
    ys, xs = np.where(S)
    for y, x in zip(ys, xs):
        deg[(y, x)] = len(nb(y, x))
    seen = set()
    polys = []

    def edge(p, q):
        return (p, q) if p < q else (q, p)

    for start in [k for k, d in deg.items() if d == 1 or d >= 3]:
        for n in nb(*start):
            if edge(start, n) in seen:
                continue
            seen.add(edge(start, n))
            p = [start, n]
            prev, cur = start, n
            while deg.get(cur, 0) == 2:
                nn = [q for q in nb(*cur) if q != prev and edge(cur, q) not in seen]
                if not nn:
                    break
                seen.add(edge(cur, nn[0]))
                p.append(nn[0])
                prev, cur = cur, nn[0]
            polys.append(p)
    return polys


idxs = [round(i * N / KEYFRAMES) for i in range(KEYFRAMES)]
frames = []
for i in idxs:
    g = a[i * FH:(i + 1) * FH]
    skel = skeletonize(remove_small_objects(g > THRESH, min_size=MIN_OBJ))
    simp = []
    for p in trace(skel):
        s = approximate_polygon(np.array(p, np.float32), tolerance=TOL)
        if len(s) >= 2:
            simp.append([[int(round(x)), int(round(y))] for (y, x) in s])
    frames.append(simp)

with open(out, "w") as f:
    json.dump({"w": FW, "h": FH, "frames": frames}, f, separators=(",", ":"))
print(f"wrote {out}  keyframes={len(frames)}  segs={sum(len(fr) for fr in frames)}")
```

- [ ] **Step 2: Run it**

```bash
mkdir -p public/analyse
VENV=/private/tmp/claude-502/-Users-pavankurmarao-k-Documents-personal-koka-lab/1a70a8e9-77bd-45e3-8ac0-178c6ab392ed/scratchpad/venv/bin/python
$VENV scripts/extract-plasma-paths.py "$HOME/Downloads/400px width energy flames inside the spot.png" public/analyse/plasma-paths.json
```
Expected: `wrote … keyframes=10 segs=~24000`, file ~500 KB.

- [ ] **Step 3: Sanity-check the JSON shape**

```bash
node -e "const d=require('./public/analyse/plasma-paths.json'); console.log('w',d.w,'h',d.h,'frames',d.frames.length,'segs0',d.frames[0].length, 'pt0', d.frames[0][0][0])"
```
Expected: `w 400 h 325 frames 10 segs0 ~2400 pt0 [x,y]`.

- [ ] **Step 4: Commit**

```bash
git add scripts/extract-plasma-paths.py public/analyse/plasma-paths.json
git commit -m "chore(analyse): extract plasma web keyframes to vector json"
```

---

### Task 2: Pure math (`coverTransform`, `keyframeAt`)

**Files:**
- Create: `src/analyse/plasmaPaths.js` (pure functions this task)
- Test: `src/analyse/__tests__/plasmaPaths.test.js`

- [ ] **Step 1: Failing tests**

Create `src/analyse/__tests__/plasmaPaths.test.js`:

```js
import { describe, expect, it } from "vitest";
import { coverTransform, keyframeAt } from "../plasmaPaths.js";

describe("coverTransform", () => {
  it("covers the target with the larger scale and centres the crop", () => {
    const t = coverTransform(400, 325, 438, 204);
    expect(t.scale).toBeCloseTo(Math.max(438 / 400, 204 / 325), 5);
    expect(t.offX).toBeCloseTo(0, 3);
    expect(t.offY).toBeGreaterThan(0);
    // a frame point maps into the target span
    const X = (200 - t.offX) * t.scale;
    const Y = (162.5 - t.offY) * t.scale;
    expect(X).toBeCloseTo(219, 0);
    expect(Y).toBeCloseTo(102, 0);
  });
});

describe("keyframeAt", () => {
  it("starts at k0=0 and pairs consecutive keyframes", () => {
    const a = keyframeAt(0, 6000, 10);
    expect(a).toEqual({ k0: 0, k1: 1, frac: 0 });
    const b = keyframeAt(600, 6000, 10); // 1/10 of the loop
    expect(b.k0).toBe(1);
    expect(b.k1).toBe(2);
    expect(b.frac).toBeCloseTo(0, 5);
  });

  it("wraps the last keyframe back to the first, frac in [0,1)", () => {
    for (let t = 0; t < 20000; t += 137) {
      const { k0, k1, frac } = keyframeAt(t, 6000, 10);
      expect(k0).toBeGreaterThanOrEqual(0);
      expect(k0).toBeLessThan(10);
      expect(k1).toBe((k0 + 1) % 10);
      expect(frac).toBeGreaterThanOrEqual(0);
      expect(frac).toBeLessThan(1);
    }
  });

  it("is safe when count is 0", () => {
    expect(keyframeAt(500, 6000, 0)).toEqual({ k0: 0, k1: 0, frac: 0 });
  });
});
```

- [ ] **Step 2: Run — expect FAIL** (`npm test -- src/analyse/__tests__/plasmaPaths.test.js`; cannot resolve module).

- [ ] **Step 3: Implement**

Create `src/analyse/plasmaPaths.js`:

```js
/**
 * Extracted-web crossfade motion for the analyse betspot.
 *
 * The plasma filament web is extracted from the artwork frames (build-time) as
 * vector polylines; ~10 keyframes are crossfaded here so the dense web is always
 * present and its paths re-route in place, looping seamlessly. Painted as
 * violet-halo / white-core glow strokes — no runtime image.
 */

/** Cover-fit mapping: frame-space (fw×fh) point → target via X=(x-offX)·scale. */
export function coverTransform(fw, fh, tw, th) {
  const scale = Math.max(tw / fw, th / fh);
  return { scale, offX: (fw - tw / scale) / 2, offY: (fh - th / scale) / 2 };
}

/** Loop position → crossfade pair. p = (t/loop·count) mod count. */
export function keyframeAt(tMs, loopMs, count) {
  if (count <= 0) return { k0: 0, k1: 0, frac: 0 };
  const p = ((tMs / loopMs) * count) % count;
  const k0 = Math.floor(p);
  return { k0: k0 % count, k1: (k0 + 1) % count, frac: p - k0 };
}
```

- [ ] **Step 4: Run — expect PASS** (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/analyse/plasmaPaths.js src/analyse/__tests__/plasmaPaths.test.js
git commit -m "feat(analyse): crossfade math (coverTransform, keyframeAt)"
```

---

### Task 3: Canvas painter (load, init, paint)

**Files:**
- Modify: `src/analyse/plasmaPaths.js` (append)

No unit test — canvas composition, browser-verified in Task 4.

- [ ] **Step 1: Append loader + painter**

Append to `src/analyse/plasmaPaths.js`:

```js
/** Loop length (ms) for the 10-keyframe crossfade. Tune here. */
const LOOP_MS = 6000;
/** Glow passes: [width, "rgb(...)", alphaScale]. Tuned bright over blue. */
const PASSES = [
  [4.0, "rgb(150,70,225)", 0.5],
  [2.0, "rgb(210,120,245)", 0.62],
  [0.9, "rgb(250,252,255)", 0.98],
];

let pathsCache = null;

/** Fetch + cache the extracted keyframe JSON. */
export async function loadPaths(url) {
  if (pathsCache) return pathsCache;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`plasma paths ${res.status}`);
  pathsCache = await res.json();
  return pathsCache;
}

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

/**
 * Cover-transform every polyline once and build one Path2D per keyframe (all
 * that keyframe's segments in a single path), plus a reusable offscreen and the
 * edge-fade vignette.
 */
export function initPaths(json, tw, th) {
  const { scale, offX, offY } = coverTransform(json.w, json.h, tw, th);
  const keyframes = json.frames.map((segs) => {
    const path = new Path2D();
    for (const poly of segs) {
      for (let i = 0; i < poly.length; i += 1) {
        const X = (poly[i][0] - offX) * scale;
        const Y = (poly[i][1] - offY) * scale;
        if (i === 0) path.moveTo(X, Y);
        else path.lineTo(X, Y);
      }
    }
    return path;
  });
  return {
    tw,
    th,
    count: keyframes.length,
    keyframes,
    offscreen: makeCanvas(tw, th),
    vignette: makeVignette(tw, th),
  };
}

function drawKeyframe(ctx, path, opacity) {
  for (const [width, color, aScale] of PASSES) {
    ctx.globalAlpha = Math.min(1, opacity * aScale);
    ctx.lineWidth = width;
    ctx.strokeStyle = color;
    ctx.stroke(path);
  }
}

/**
 * Paint one crossfaded frame: two consecutive keyframes with opacities summing
 * to 1 (web always present), masked by the vignette, blitted. Signature matches
 * the prior painters.
 */
export function paintPathsFrame(ctx, assets, tMs) {
  if (!assets) return;
  const { tw, th, count, keyframes, offscreen, vignette } = assets;
  const { k0, k1, frac } = keyframeAt(tMs, LOOP_MS, count);

  const octx = offscreen.getContext("2d");
  octx.globalCompositeOperation = "source-over";
  octx.globalAlpha = 1;
  octx.clearRect(0, 0, tw, th);
  octx.globalCompositeOperation = "lighter";
  octx.lineCap = "round";
  octx.lineJoin = "round";

  drawKeyframe(octx, keyframes[k0], 1 - frac);
  drawKeyframe(octx, keyframes[k1], frac);

  octx.globalCompositeOperation = "destination-in";
  octx.globalAlpha = 1;
  octx.drawImage(vignette, 0, 0);
  octx.globalCompositeOperation = "source-over";

  ctx.clearRect(0, 0, tw, th);
  ctx.drawImage(offscreen, 0, 0);
}
```

- [ ] **Step 2: Run — expect PASS** (4 tests; canvas code only runs in functions).

- [ ] **Step 3: Commit**

```bash
git add src/analyse/plasmaPaths.js
git commit -m "feat(analyse): keyframe crossfade painter with glow strokes"
```

---

### Task 4: Rewire `AnalyseBetspot.jsx` + copy

**Files:**
- Modify: `src/analyse/AnalyseBetspot.jsx`, `src/pages/AnalysePage.jsx`

- [ ] **Step 1: Swap imports** — replace

```js
import { initNetwork, paintNetworkFrame } from "./plasmaNetwork.js";
```
with
```js
import { initPaths, loadPaths, paintPathsFrame } from "./plasmaPaths.js";
```
and add below the imports:
```js
const PATHS_URL = "/analyse/plasma-paths.json";
```

- [ ] **Step 2: Replace the setup IIFE body**

```js
    (async () => {
      try {
        const json = await loadPaths(PATHS_URL);
        if (cancelled) return;
        const canvas = canvasRef.current;
        if (!canvas) return;

        const w = BODY.width * STAGE.scale;
        const h = BODY.height * STAGE.scale;
        canvas.width = w;
        canvas.height = h;

        const assets = initPaths(json, w, h);
        motionRef.current = assets;
        paintPathsFrame(canvas.getContext("2d"), assets, 0);
        setReady(true);
      } catch (err) {
        console.error("Failed to load plasma paths", err);
      }
    })();
```

- [ ] **Step 3: Point rAF + cleanup at the new painter** — `paintNetworkFrame(ctx, assets, now - start)` → `paintPathsFrame(...)`; `if (assets) paintNetworkFrame(ctx, assets, 0)` → `paintPathsFrame`.

- [ ] **Step 4: Page copy** — replace the subtitle body with:

```
Blue body and outer glow are pure CSS. The inner energy is the filament web
          extracted from the artwork, rendered as vector branches that crossfade between
          keyframes — the dense web stays present while its paths re-route in place, looping.
          Screen-blended over the body and edge-faded. Click to toggle.
```

- [ ] **Step 5: Verify** — `npm test && npm run build`; then `npm run dev`, open `/analyse`, reveal: a dense branch web is always present and its fine paths re-route (no travelling/vanishing), loops ~6 s; hide → static; console clean. Tune `LOOP_MS`/`PASSES` for brightness/violet.

- [ ] **Step 6: Commit**

```bash
git add src/analyse/AnalyseBetspot.jsx src/pages/AnalysePage.jsx
git commit -m "feat(analyse): drive the extracted-web crossfade from the reveal loop"
```

---

### Task 5: Remove the procedural network

**Files:** delete `src/analyse/plasmaNetwork.js`, `src/analyse/__tests__/plasmaNetwork.test.js`

- [ ] **Step 1:** `grep -rn "plasmaNetwork\|initNetwork\|paintNetworkFrame" src` → expect none.
- [ ] **Step 2:** `git rm src/analyse/plasmaNetwork.js src/analyse/__tests__/plasmaNetwork.test.js`
- [ ] **Step 3:** `npm test && npm run build` → `plasmaPaths` tests pass (4); build ok.
- [ ] **Step 4:** `git commit -am "chore(analyse): remove procedural network superseded by extracted crossfade"`

---

### Task 6: Verify + finish

- [ ] **Step 1: Prove always-present + re-routing (not travel/vanish).** With `npm run dev`, reveal, capture the energy canvas `toDataURL` at ~0.3 s intervals across a loop; decode; assert: bright coverage roughly constant across captures (std/mean < 0.2 → always present), and inter-capture change is non-trivial but partial (paths re-route, hubs persist). Reuse the venv Python; compare bright-pixel coverage and IoU across captures.
- [ ] **Step 2: Behavioural** — loops ~6 s; hide → static; OS reduce-motion → static; tab-hidden → paused; rAF p95 within budget.
- [ ] **Step 3: Gate + format** — `npm test && npm run build && npm run format`; revert prettier churn outside `src/analyse` + `AnalysePage` + `scripts` + `docs`.
- [ ] **Step 4: Tune** — `LOOP_MS`, `PASSES` (widths/colours/alpha), extractor `THRESH`/`KEYFRAMES` (re-run Task 1 to change density) against the live render.
- [ ] **Step 5:** superpowers:finishing-a-development-branch for `feature/analyse-ambient-motion`.
