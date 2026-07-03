# Analyse Sprite-Flipbook Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Play the artist's 26-frame plasma sprite sheet as a seamless flipbook inside the `/analyse` betspot so the filament paths genuinely reform, replacing the rejected procedural warp/re-stroke.

**Architecture:** A single new module `plasmaFlipbook.js` — two pure functions (`frameAt`, `coverRect`) plus a canvas loader/painter (`loadPlasmaSheet`, `initFlipbook`, `paintFlipbookFrame`). `AnalyseBetspot.jsx` loads the sheet, cover-fits each frame into the 438×204 energy canvas through a cached edge-fade vignette, and advances the frame index on its existing rAF loop (~12 fps). The whole bake+warp pipeline (`energyHubs`, `energyMotion`, `cellularEnergy`, `plasmaFilaments`) is removed.

**Tech Stack:** React 19 + Vite 6, Canvas 2D `drawImage`, vitest. WebP asset. No new runtime deps. Pillow (scratchpad venv) is a one-time build tool for the WebP encode.

**Spec:** `docs/superpowers/specs/2026-07-03-analyse-sprite-flipbook-design.md`.

**Branch:** continue on `feature/analyse-ambient-motion`, on top of the committed warp work, which this supersedes.

**Hard constraint:** analyse-scoped only. No edits under `src/canvas/**` (shared `loadImage.js` reused read-only) or `src/webgl/**`.

**Asset facts (measured):** `~/Downloads/400px width energy flames inside the spot.png` = 400×8450, RGBA, 26 frames of 400×325 (autocorr period 325 @ 0.96; 8450÷325=26 exact). Energy canvas target = `BODY.width×STAGE.scale` × `BODY.height×STAGE.scale` = 146×3 × 68×3 = **438×204**.

---

### Task 1: Encode + vendor the sprite sheet as WebP

**Files:**
- Create: `scripts/encode-plasma-frames.py`
- Create: `public/analyse/plasma-frames.webp` (build output, committed)

- [ ] **Step 1: Write the encode script**

Create `scripts/encode-plasma-frames.py`:

```python
"""One-time: re-encode the plasma sprite sheet PNG to a compact WebP.

Usage: python3 scripts/encode-plasma-frames.py <source.png> public/analyse/plasma-frames.webp
Needs Pillow. Quality 90 is visually lossless on noisy plasma and ~5x smaller.
Frame geometry is preserved (400x8450, 26 frames of 400x325).
"""
import sys

from PIL import Image

src, out = sys.argv[1], sys.argv[2]
img = Image.open(src)
assert img.size == (400, 8450), f"unexpected sheet size {img.size}"
assert img.height % 325 == 0, "height must be a whole number of 325px frames"
img.save(out, "WEBP", quality=90, method=6)
print(f"wrote {out}  frames={img.height // 325}")
```

- [ ] **Step 2: Run it (Pillow via the scratchpad venv)**

```bash
mkdir -p public/analyse
/private/tmp/claude-502/-Users-pavankurmarao-k-Documents-personal-koka-lab/1a70a8e9-77bd-45e3-8ac0-178c6ab392ed/scratchpad/venv/bin/python \
  scripts/encode-plasma-frames.py \
  "$HOME/Downloads/400px width energy flames inside the spot.png" \
  public/analyse/plasma-frames.webp
```
Expected: `wrote public/analyse/plasma-frames.webp  frames=26`, file ~1.4 MB.
(If that venv is gone, `python3 -m pip install pillow` then rerun.)

- [ ] **Step 3: Verify the WebP decodes at the right size**

```bash
/private/tmp/claude-502/-Users-pavankurmarao-k-Documents-personal-koka-lab/1a70a8e9-77bd-45e3-8ac0-178c6ab392ed/scratchpad/venv/bin/python -c "from PIL import Image; im=Image.open('public/analyse/plasma-frames.webp'); print(im.size); assert im.size==(400,8450)"
```
Expected: `(400, 8450)`.

- [ ] **Step 4: Commit**

```bash
git add scripts/encode-plasma-frames.py public/analyse/plasma-frames.webp
git commit -m "chore(analyse): vendor plasma sprite sheet as webp"
```

---

### Task 2: Pure flipbook math (`frameAt`, `coverRect`)

**Files:**
- Create: `src/analyse/plasmaFlipbook.js` (pure functions only this task)
- Test: `src/analyse/__tests__/plasmaFlipbook.test.js`

- [ ] **Step 1: Write the failing tests**

Create `src/analyse/__tests__/plasmaFlipbook.test.js`:

```js
import { describe, expect, it } from "vitest";
import { coverRect, frameAt } from "../plasmaFlipbook.js";

describe("frameAt", () => {
  it("starts at 0 and advances one frame per 1/fps second", () => {
    expect(frameAt(0, 12, 26)).toBe(0);
    expect(frameAt(1000, 12, 26)).toBe(12);
    expect(frameAt(1000 / 12, 12, 26)).toBe(1);
  });

  it("loops back within [0, count)", () => {
    expect(frameAt(2200, 12, 26)).toBe(0); // floor(26.4) % 26
    for (let t = 0; t < 10000; t += 37) {
      const f = frameAt(t, 12, 26);
      expect(f).toBeGreaterThanOrEqual(0);
      expect(f).toBeLessThan(26);
    }
  });

  it("is safe when count is 0", () => {
    expect(frameAt(500, 12, 0)).toBe(0);
  });
});

describe("coverRect", () => {
  it("returns a centred source band matching the target aspect", () => {
    const r = coverRect(400, 325, 438, 204);
    // covers: scaled band aspect equals target aspect
    expect(r.sw / r.sh).toBeCloseTo(438 / 204, 3);
    // centred and within the frame
    expect(r.sx).toBeCloseTo(0, 3);
    expect(r.sy).toBeGreaterThan(0);
    expect(r.sx + r.sw).toBeLessThanOrEqual(400 + 1e-6);
    expect(r.sy + r.sh).toBeLessThanOrEqual(325 + 1e-6);
    // symmetric crop
    expect(r.sy).toBeCloseTo((325 - r.sh) / 2, 3);
  });

  it("handles a target taller than the frame (crops width)", () => {
    const r = coverRect(400, 325, 100, 400);
    expect(r.sw / r.sh).toBeCloseTo(100 / 400, 3);
    expect(r.sy).toBeCloseTo(0, 3);
    expect(r.sx).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test -- src/analyse/__tests__/plasmaFlipbook.test.js`
Expected: FAIL — cannot resolve `../plasmaFlipbook.js`.

- [ ] **Step 3: Implement the pure functions**

Create `src/analyse/plasmaFlipbook.js`:

```js
/**
 * Sprite-flipbook motion for the analyse betspot.
 *
 * The plasma effect is a pre-rendered 26-frame sheet (400×325 per frame,
 * stacked vertically). We play the frames in sequence so the filament paths
 * genuinely reform. This module is the frame maths plus a thin canvas painter.
 */

import { loadImage } from "../canvas/loadImage.js";

/** Sprite geometry — one frame is 400×325; the sheet stacks them vertically. */
export const FRAME_W = 400;
export const FRAME_H = 325;
/** Playback rate. Tune here. */
export const FPS = 12;

/** Looping frame index for a given time. Safe when count is 0. */
export function frameAt(tMs, fps, count) {
  if (count <= 0) return 0;
  return Math.floor((tMs / 1000) * fps) % count;
}

/**
 * Cover-fit source rect: the centred sub-rect of a single frame that fills the
 * target aspect with no distortion (crops the overflowing axis).
 *
 * @returns {{sx:number, sy:number, sw:number, sh:number}} within one frame
 */
export function coverRect(frameW, frameH, targetW, targetH) {
  const s = Math.max(targetW / frameW, targetH / frameH);
  const sw = targetW / s;
  const sh = targetH / s;
  return { sx: (frameW - sw) / 2, sy: (frameH - sh) / 2, sw, sh };
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npm test -- src/analyse/__tests__/plasmaFlipbook.test.js`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/analyse/plasmaFlipbook.js src/analyse/__tests__/plasmaFlipbook.test.js
git commit -m "feat(analyse): flipbook frame maths (frameAt, coverRect)"
```

---

### Task 3: Flipbook loader + painter (canvas glue)

**Files:**
- Modify: `src/analyse/plasmaFlipbook.js` (append)

No unit test — canvas composition, verified in the browser in Task 4.

- [ ] **Step 1: Append the loader, init, vignette, and painter**

Append to `src/analyse/plasmaFlipbook.js`:

```js
let sheetCache = null;

/**
 * Load the sprite sheet once. count derived from the sheet height.
 * @returns {Promise<{img:HTMLImageElement, frameW:number, frameH:number, count:number}>}
 */
export async function loadPlasmaSheet(url) {
  if (sheetCache) return sheetCache;
  const img = await loadImage(url);
  const count = Math.round(img.naturalHeight / FRAME_H);
  sheetCache = { img, frameW: FRAME_W, frameH: FRAME_H, count };
  return sheetCache;
}

function makeCanvas(w, h) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
}

/** Radial white→transparent vignette so energy fades at the body edges. */
function makeVignette(w, h) {
  const c = makeCanvas(w, h);
  const ctx = c.getContext("2d");
  const cx = w * 0.5;
  const cy = h * 0.5;
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.hypot(cx, cy));
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.6, "rgba(255,255,255,0.92)");
  g.addColorStop(0.85, "rgba(255,255,255,0.5)");
  g.addColorStop(1, "rgba(255,255,255,0.1)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  return c;
}

/**
 * One-time asset bundle: cover-fit rect, a reusable offscreen frame canvas, and
 * the cached edge-fade vignette.
 */
export function initFlipbook(sheet, targetW, targetH) {
  return {
    sheet,
    targetW,
    targetH,
    rect: coverRect(sheet.frameW, sheet.frameH, targetW, targetH),
    frame: makeCanvas(targetW, targetH),
    vignette: makeVignette(targetW, targetH),
  };
}

/**
 * Paint the current flipbook frame into ctx: cover-fit the sprite sub-rect onto
 * the offscreen, mask with the vignette, blit. Same signature as the old
 * paintEnergyFrame so the component rAF loop is unchanged.
 */
export function paintFlipbookFrame(ctx, assets, tMs) {
  if (!assets) return;
  const { sheet, targetW, targetH, rect, frame, vignette } = assets;
  const idx = frameAt(tMs, FPS, sheet.count);

  const fctx = frame.getContext("2d");
  fctx.globalCompositeOperation = "source-over";
  fctx.globalAlpha = 1;
  fctx.clearRect(0, 0, targetW, targetH);
  fctx.drawImage(
    sheet.img,
    rect.sx,
    idx * sheet.frameH + rect.sy,
    rect.sw,
    rect.sh,
    0,
    0,
    targetW,
    targetH,
  );
  fctx.globalCompositeOperation = "destination-in";
  fctx.drawImage(vignette, 0, 0);
  fctx.globalCompositeOperation = "source-over";

  ctx.clearRect(0, 0, targetW, targetH);
  ctx.drawImage(frame, 0, 0);
}
```

- [ ] **Step 2: Verify the module imports cleanly (tests still green)**

Run: `npm test -- src/analyse/__tests__/plasmaFlipbook.test.js`
Expected: PASS (5 tests) — the appended canvas code only runs inside functions, so importing under node stays safe.

- [ ] **Step 3: Commit**

```bash
git add src/analyse/plasmaFlipbook.js
git commit -m "feat(analyse): sprite-sheet loader, vignette, frame painter"
```

---

### Task 4: Rewire `AnalyseBetspot.jsx` + page copy

**Files:**
- Modify: `src/analyse/AnalyseBetspot.jsx`
- Modify: `src/pages/AnalysePage.jsx`

- [ ] **Step 1: Replace the feature imports**

In `src/analyse/AnalyseBetspot.jsx`, replace lines 2–5

```js
import { generateEnergyCanvas } from "./cellularEnergy.js";
import { initWarpAssets, paintEnergyFrame } from "./energyMotion.js";
import { canvasToField, detectHubs } from "./energyHubs.js";
import { loadPlasmaFilaments } from "./plasmaFilaments.js";
```

with

```js
import { initFlipbook, loadPlasmaSheet, paintFlipbookFrame } from "./plasmaFlipbook.js";
```

- [ ] **Step 2: Drop the `bakedRef`, add the sheet URL**

Remove the `bakedRef` line

```js
  const bakedRef = useRef(null);
```

Add, just below the `layerStyle` helper (module scope, above the component) or as a const inside the component near `stageW`:

```js
  const SHEET_URL = "/analyse/plasma-frames.webp";
```

- [ ] **Step 3: Replace the bake effect body**

Replace the async IIFE inside the first `useEffect` (the `loadPlasmaFilaments`/`generateEnergyCanvas` block) with:

```js
    // Load the plasma sprite sheet once, size the canvas to the body, and paint
    // frame 0 as the static image. The reveal loop then flips through frames.
    (async () => {
      try {
        const sheet = await loadPlasmaSheet(SHEET_URL);
        if (cancelled) return;
        const canvas = canvasRef.current;
        if (!canvas) return;

        const w = BODY.width * STAGE.scale;
        const h = BODY.height * STAGE.scale;
        canvas.width = w;
        canvas.height = h;

        const assets = initFlipbook(sheet, w, h);
        motionRef.current = assets;
        paintFlipbookFrame(canvas.getContext("2d"), assets, 0);
        setReady(true);
      } catch (err) {
        console.error("Failed to load plasma sprite sheet", err);
      }
    })();
```

- [ ] **Step 4: Point the rAF loop and cleanup at the flipbook**

In the ambient-motion `useEffect`, change the frame call

```js
    const frame = (now) => {
      paintEnergyFrame(ctx, assets, now - start);
      raf = requestAnimationFrame(frame);
    };
```

to

```js
    const frame = (now) => {
      paintFlipbookFrame(ctx, assets, now - start);
      raf = requestAnimationFrame(frame);
    };
```

and replace the cleanup's static-restore block

```js
      const baked = bakedRef.current;
      if (baked) {
        ctx.globalCompositeOperation = "source-over";
        ctx.globalAlpha = 1;
        ctx.filter = "none";
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(baked, 0, 0);
      }
```

with

```js
      if (assets) paintFlipbookFrame(ctx, assets, 0);
```

(`assets` is already captured at the top of this effect as `motionRef.current`.)

- [ ] **Step 5: Update the page copy**

In `src/pages/AnalysePage.jsx`, replace the subtitle body with:

```
Blue body and outer glow are pure CSS. The inner energy is a looping sequence of
          pre-rendered plasma frames — a 26-frame sprite sheet played as a flipbook, so the
          filament paths continuously reform. Screen-blended over the body and edge-faded so
          it reads as energy contained in the spot. Click to toggle.
```

- [ ] **Step 6: Verify tests, build, and the app**

```bash
npm test && npm run build
```
Expected: passing tests; build succeeds.

```bash
npm run dev
```
Open `/analyse`, click "Reveal energy", and confirm:
1. Energy reveals and the plasma paths visibly reform (branches change), looping ~2.2 s.
2. Hide → static frame 0; re-reveal restarts.
3. Console clean.

- [ ] **Step 7: Commit**

```bash
git add src/analyse/AnalyseBetspot.jsx src/pages/AnalysePage.jsx
git commit -m "feat(analyse): play the plasma sprite sheet as a flipbook"
```

---

### Task 5: Remove the dead bake + warp modules

**Files:**
- Delete: `src/analyse/energyHubs.js`, `src/analyse/__tests__/energyHubs.test.js`
- Delete: `src/analyse/energyMotion.js`, `src/analyse/__tests__/energyMotion.test.js`
- Delete: `src/analyse/cellularEnergy.js`
- Delete: `src/analyse/plasmaFilaments.js`
- Delete (optional): `public/analyse/plasma-source.png` if now unused

- [ ] **Step 1: Confirm nothing imports them**

Run: `grep -rn "energyHubs\|energyMotion\|cellularEnergy\|plasmaFilaments\|generateEnergyCanvas\|initWarpAssets\|paintEnergyFrame" src`
Expected: no matches.

- [ ] **Step 2: Delete the modules and tests**

```bash
git rm src/analyse/energyHubs.js src/analyse/__tests__/energyHubs.test.js \
       src/analyse/energyMotion.js src/analyse/__tests__/energyMotion.test.js \
       src/analyse/cellularEnergy.js src/analyse/plasmaFilaments.js
```

- [ ] **Step 3: Drop the now-unused source PNG if present**

```bash
grep -rn "plasma-source" src && echo "STILL USED — keep it" || git rm --ignore-unmatch public/analyse/plasma-source.png
```

- [ ] **Step 4: Verify suite + build**

Run: `npm test && npm run build`
Expected: `plasmaFlipbook` tests pass (5); build succeeds; no unresolved imports.

- [ ] **Step 5: Commit**

```bash
git add -A src/analyse public/analyse
git commit -m "chore(analyse): remove bake+warp pipeline superseded by flipbook"
```

---

### Task 6: Verify motion + finish

**Files:** none (verification), then branch finish.

- [ ] **Step 1: Prove it reforms (not a shift) in the browser**

With `npm run dev` up, reveal the energy, capture the `.analyse-betspot__energy` canvas via `toDataURL` twice ~120 ms apart (one frame step), decode to `f0.png`/`f1.png`, and run:

```bash
/private/tmp/claude-502/-Users-pavankurmarao-k-Documents-personal-koka-lab/1a70a8e9-77bd-45e3-8ac0-178c6ab392ed/scratchpad/venv/bin/python - "$PWD/f0.png" "$PWD/f1.png" << 'PY'
import sys, numpy as np
from PIL import Image
a=np.asarray(Image.open(sys.argv[1]).convert("L"),np.float32)
b=np.asarray(Image.open(sys.argv[2]).convert("L"),np.float32)
h,w=a.shape; best=1e18
for dy in range(-6,7,2):
  for dx in range(-6,7,2):
    ys,xs=slice(max(0,dy),min(h,h+dy)),slice(max(0,dx),min(w,w+dx))
    ys2,xs2=slice(max(0,-dy),min(h,h-dy)),slice(max(0,-dx),min(w,w-dx))
    best=min(best,float(np.mean((a[ys,xs]-b[ys2,xs2])**2)))
print("resid under best shift (rms):", round(best**0.5,1), "-> >4 means reforming, not a hover/shift")
PY
```
Expected: residual clearly above a few lum levels — confirms topology change, the exact thing the warp failed.

- [ ] **Step 2: Behavioural checks**

Confirm in the browser: loop repeats ~2.2 s; hide → static frame 0; OS Reduce-Motion → static (no loop); tab-hidden → paused; rAF frame-time p95 within a normal budget.

- [ ] **Step 3: Full gate + format**

```bash
npm test && npm run build && npm run format
git status   # revert any prettier churn outside src/analyse + AnalysePage + scripts + docs
```

- [ ] **Step 4: Tune fps if desired**

`FPS` at the top of `plasmaFlipbook.js` (12). Bump toward 24 for faster churn or 8 for slower. Commit any change as `chore(analyse): tune flipbook fps`.

- [ ] **Step 5: Use the superpowers:finishing-a-development-branch skill** for `feature/analyse-ambient-motion`.
