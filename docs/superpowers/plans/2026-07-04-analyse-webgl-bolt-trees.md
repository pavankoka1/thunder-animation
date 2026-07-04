# Analyse WebGL Bolt-Trees + Controls Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development or executing-plans. Steps use `- [ ]`.

**Goal:** Replace the voronoi shader with JS-generated branching bolt-trees from N center clusters, rendered in WebGL2 (ribbon glow, tapering thickness), animated grow→hold→re-strike, with an on-page control panel.

**Architecture:** `boltField.js` (pure) generates clusters→trunk→recursive branches in canvas px. `boltGL.js` tessellates segments into ribbons and draws 3 additive glow passes with a WebGL2 program, clipped to grown length + radial edge fade. `AnalyseBetspot.jsx` runs the strike lifecycle. `PlasmaControls.jsx` (on `AnalysePage`) is a slider/button view over the shared config.

**Tech Stack:** React 19, WebGL2, vitest. Reuses pure `subdivideSegment`/`cumulativeLengths` from `src/canvas/lightning/geometry.js`. No images.

**Spec:** `docs/superpowers/specs/2026-07-04-analyse-webgl-bolt-trees-design.md`
**Branch:** `feature/analyse-ambient-motion`. **Canvas:** 438×204. Prior good states tagged (`analyse-plasma-warp-good`) + in history.

---

### Task 1: `boltField.js` — config + generator + growth (pure, TDD)

**Files:** Create `src/analyse/boltField.js`, Test `src/analyse/__tests__/boltField.test.js`

- [ ] **Step 1 — failing tests** (`src/analyse/__tests__/boltField.test.js`):

```js
import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG, generateField, segmentDrawLength } from "../boltField.js";

const W = 438,
  H = 204;

describe("generateField", () => {
  it("emits the configured cluster count, points in bounds, depth capped, taper", () => {
    const f = generateField(
      { ...DEFAULT_CONFIG, clusterCount: 3, maxDepth: 3, seed: 7 },
      W,
      H
    );
    expect(f.clusters).toHaveLength(3);
    expect(f.segments.length).toBeGreaterThanOrEqual(3);
    let maxDepth = 0;
    const byDepth = {};
    for (const s of f.segments) {
      maxDepth = Math.max(maxDepth, s.depth);
      (byDepth[s.depth] ??= []).push(s.length);
      for (const p of s.points) {
        expect(p.x).toBeGreaterThanOrEqual(0);
        expect(p.x).toBeLessThanOrEqual(W);
        expect(p.y).toBeGreaterThanOrEqual(0);
        expect(p.y).toBeLessThanOrEqual(H);
      }
    }
    expect(maxDepth).toBeLessThanOrEqual(3);
    const avg = (a) => a.reduce((x, y) => x + y, 0) / a.length;
    if (byDepth[0] && byDepth[2]) expect(avg(byDepth[2])).toBeLessThan(avg(byDepth[0])); // taper
  });

  it("is deterministic per seed and varies across seeds", () => {
    const a = JSON.stringify(generateField({ ...DEFAULT_CONFIG, seed: 1 }, W, H));
    expect(a).toBe(JSON.stringify(generateField({ ...DEFAULT_CONFIG, seed: 1 }, W, H)));
    expect(a).not.toBe(
      JSON.stringify(generateField({ ...DEFAULT_CONFIG, seed: 2 }, W, H))
    );
  });
});

describe("segmentDrawLength", () => {
  it("is 0 before spawnAt, grows to full by progress 1, monotonic", () => {
    const seg = { length: 100, spawnAt: 0.2 };
    expect(segmentDrawLength(seg, 0.1)).toBe(0);
    expect(segmentDrawLength(seg, 1)).toBeCloseTo(100, 3);
    expect(segmentDrawLength(seg, 0.6)).toBeGreaterThan(0);
    expect(segmentDrawLength(seg, 0.9)).toBeGreaterThanOrEqual(
      segmentDrawLength(seg, 0.6)
    );
  });
});
```

- [ ] **Step 2 — run, expect FAIL** (`npm test -- boltField`).

- [ ] **Step 3 — implement `src/analyse/boltField.js`:**

```js
/**
 * Branching bolt-tree generator for the analyse betspot (energy-canvas px).
 * N center clusters, each a trunk to an edge + recursive tapering branches.
 * Reuses the home page's fractal midpoint subdivision — pure, no DOM.
 */
import { cumulativeLengths, subdivideSegment } from "../canvas/lightning/geometry.js";

export const DEFAULT_CONFIG = {
  seed: 1337,
  clusterCount: 3,
  clusterSpread: 0.34, // fraction of half-width the origins spread from center
  branchChance: 0.4,
  maxDepth: 3,
  trunkJitter: 26, // trunk midpoint displacement (px)
  branchLenMin: 26,
  branchLenMax: 62,
  // thickness / glow (px + 0..1)
  haloWidth: 9.0,
  midWidth: 4.0,
  coreWidth: 1.8,
  haloColor: [150, 90, 255],
  midColor: [120, 200, 255],
  coreColor: [245, 250, 255],
  haloAlpha: 0.16,
  midAlpha: 0.3,
  coreAlpha: 0.95,
  // motion (ms)
  strikeMs: 900,
  holdMs: 1400,
  restrikeMs: 500,
  // edge fade
  edgeRadius: 0.72,
  edgeSoftness: 1.06,
};

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rr = (rng, lo, hi) => lo + (hi - lo) * rng();
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

function edgeTarget(rng, w, h) {
  const pad = 6;
  const e = [
    { x: rr(rng, pad, w - pad), y: pad },
    { x: rr(rng, pad, w - pad), y: h - pad },
    { x: pad, y: rr(rng, pad, h - pad) },
    { x: w - pad, y: rr(rng, pad, h - pad) },
  ];
  return e[Math.floor(rng() * 4) % 4];
}

/** @returns {{clusters:Array<{x,y}>, segments:Array}} */
export function generateField(config, w, h) {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const rng = mulberry32(cfg.seed);
  const segments = [];
  const clusters = [];
  let id = 0;
  const cx = w / 2;
  const cy = h / 2;

  const clampPts = (pts) =>
    pts.map((p) => ({ x: clamp(p.x, 0, w), y: clamp(p.y, 0, h) }));

  const addBranch = (parent, fromPts, fromCum, attachIdx, depth, clusterId) => {
    if (depth > cfg.maxDepth) return;
    const parentLen = fromCum[fromCum.length - 1];
    const spawnAt =
      parent.spawnAt + (fromCum[attachIdx] / parentLen) * (1 - parent.spawnAt);
    const prev = fromPts[Math.max(0, attachIdx - 1)];
    const at = fromPts[attachIdx];
    const baseAng = Math.atan2(at.y - prev.y, at.x - prev.x);
    const ang = baseAng + (rng() < 0.5 ? -1 : 1) * rr(rng, 0.45, 1.15);
    const len = rr(rng, cfg.branchLenMin, cfg.branchLenMax) * (1 - depth * 0.22);
    const end = { x: at.x + Math.cos(ang) * len, y: at.y + Math.sin(ang) * len };
    const pts = clampPts(
      subdivideSegment(
        at.x,
        at.y,
        end.x,
        end.y,
        cfg.trunkJitter * 0.5 * (1 - depth * 0.15),
        1.6,
        rng
      )
    );
    const cum = cumulativeLengths(pts);
    const seg = {
      id: id++,
      depth,
      points: pts,
      cumLengths: cum,
      length: cum[cum.length - 1],
      spawnAt,
      clusterId,
    };
    segments.push(seg);
    for (let i = 2; i < pts.length - 1; i += 2) {
      if (rng() < cfg.branchChance * (1 - depth * 0.25))
        addBranch(seg, pts, cum, i, depth + 1, clusterId);
    }
  };

  for (let c = 0; c < cfg.clusterCount; c += 1) {
    const ang = (c / cfg.clusterCount) * Math.PI * 2 + rng() * 0.8;
    const rad = cfg.clusterSpread * (w / 2) * (0.3 + rng() * 0.7);
    const origin = {
      x: clamp(cx + Math.cos(ang) * rad, 8, w - 8),
      y: clamp(cy + Math.sin(ang) * rad * 0.5, 8, h - 8),
    };
    clusters.push(origin);
    const target = edgeTarget(rng, w, h);
    const pts = clampPts(
      subdivideSegment(origin.x, origin.y, target.x, target.y, cfg.trunkJitter, 2.2, rng)
    );
    const cum = cumulativeLengths(pts);
    const trunk = {
      id: id++,
      depth: 0,
      points: pts,
      cumLengths: cum,
      length: cum[cum.length - 1],
      spawnAt: 0,
      clusterId: c,
    };
    segments.push(trunk);
    for (let i = 2; i < pts.length - 2; i += 1) {
      if (rng() < cfg.branchChance) addBranch(trunk, pts, cum, i, 1, c);
    }
  }
  return { clusters, segments };
}

/** Grown length of a segment at progress ∈ [0,1] (ease-out), respecting spawnAt. */
export function segmentDrawLength(seg, progress) {
  if (progress <= seg.spawnAt || seg.spawnAt >= 1) return 0;
  const local = (progress - seg.spawnAt) / (1 - seg.spawnAt);
  const eased = 1 - (1 - Math.max(0, Math.min(1, local))) ** 2.2;
  return seg.length * eased;
}
```

- [ ] **Step 4 — run, expect PASS.** **Step 5 — commit** `feat(analyse): branching bolt-tree generator`.

---

### Task 2: `boltGL.js` — WebGL2 ribbon glow renderer (browser-verified)

**Files:** Create `src/analyse/boltGL.js`. No unit test (WebGL); one pure helper `ribbonVertices` is unit-tested in Task 3-adjacent check.

- [ ] **Step 1 — implement.** Ribbon tessellation (pure) + WebGL2 program with 3 additive passes. Full code:

```js
/**
 * WebGL2 renderer: draw bolt-field segments as glowing ribbons. Each segment
 * polyline is expanded to a triangle strip (± normal × halfWidth) with a
 * per-vertex "across" coord (-1..1) so the fragment shader can fade to a soft
 * glow. Drawn in 3 additive passes (halo/mid/core widths) and clipped to the
 * grown length; radial edge-fade keeps the energy in the spot.
 */
import { segmentDrawLength } from "./boltField.js";
import { pointAtLength } from "../canvas/lightning/geometry.js";

const VERT = `#version 300 es
in vec2 a_pos; in float a_across; in float a_taper;
uniform vec2 u_res;
out float v_across; out float v_taper;
void main(){
  v_across = a_across; v_taper = a_taper;
  vec2 clip = (a_pos / u_res) * 2.0 - 1.0;
  gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);
}`;

const FRAG = `#version 300 es
precision highp float;
in float v_across; in float v_taper;
out vec4 o;
uniform vec3 u_color; uniform float u_alpha;
void main(){
  float glow = pow(1.0 - clamp(abs(v_across), 0.0, 1.0), 1.8);
  o = vec4(u_color, glow * u_alpha * v_taper);
}`;

function compile(gl, t, src) {
  const s = gl.createShader(t);
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS))
    throw new Error(gl.getShaderInfoLog(s));
  return s;
}

/**
 * Expand grown polylines into ribbon triangles. Returns interleaved
 * [x,y,across,taper] and the vertex count. `widthFn(depth)` gives the half-width.
 * Pure (no GL) → unit-testable.
 */
export function ribbonVertices(field, progress, widthFn) {
  const out = [];
  for (const seg of field.segments) {
    const drawLen = segmentDrawLength(seg, progress);
    if (drawLen <= 0.5) continue;
    // grown point list (+ interpolated tip)
    const pts = [];
    for (let i = 0; i < seg.points.length; i += 1) {
      if (seg.cumLengths[i] <= drawLen) pts.push(seg.points[i]);
      else {
        pts.push(pointAtLength(seg.points, seg.cumLengths, drawLen));
        break;
      }
    }
    if (pts.length < 2) continue;
    const hw = widthFn(seg.depth);
    // per-vertex normals from segment direction
    for (let i = 0; i < pts.length - 1; i += 1) {
      const a = pts[i],
        b = pts[i + 1];
      const dx = b.x - a.x,
        dy = b.y - a.y;
      const len = Math.hypot(dx, dy) || 1;
      const nx = -dy / len,
        ny = dx / len;
      const taperA = 1 - (i / pts.length) * 0.6;
      const taperB = 1 - ((i + 1) / pts.length) * 0.6;
      // two triangles for the quad a→b
      const p = (x, y, ac, tp) => out.push(x, y, ac, tp);
      p(a.x + nx * hw, a.y + ny * hw, 1, taperA);
      p(a.x - nx * hw, a.y - ny * hw, -1, taperA);
      p(b.x + nx * hw, b.y + ny * hw, 1, taperB);
      p(b.x + nx * hw, b.y + ny * hw, 1, taperB);
      p(a.x - nx * hw, a.y - ny * hw, -1, taperA);
      p(b.x - nx * hw, b.y - ny * hw, -1, taperB);
    }
  }
  return { data: new Float32Array(out), count: out.length / 4 };
}

export function initBoltGL(canvas, config) {
  const gl = canvas.getContext("webgl2", {
    alpha: true,
    premultipliedAlpha: true,
    antialias: true,
  });
  if (!gl) throw new Error("webgl2 unavailable");
  const program = gl.createProgram();
  gl.attachShader(program, compile(gl, gl.VERTEX_SHADER, VERT));
  gl.attachShader(program, compile(gl, gl.FRAGMENT_SHADER, FRAG));
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS))
    throw new Error(gl.getProgramInfoLog(program));
  const buf = gl.createBuffer();
  const aPos = gl.getAttribLocation(program, "a_pos");
  const aAcross = gl.getAttribLocation(program, "a_across");
  const aTaper = gl.getAttribLocation(program, "a_taper");
  const u = {
    res: gl.getUniformLocation(program, "u_res"),
    color: gl.getUniformLocation(program, "u_color"),
    alpha: gl.getUniformLocation(program, "u_alpha"),
  };
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE); // additive glow
  return {
    gl,
    program,
    buf,
    aPos,
    aAcross,
    aTaper,
    u,
    config,
    w: canvas.width,
    h: canvas.height,
  };
}

/** Draw the field grown to `progress` in 3 glow passes. */
export function drawBolts(assets, field, progress) {
  const { gl, program, buf, aPos, aAcross, aTaper, u, config, w, h } = assets;
  gl.viewport(0, 0, w, h);
  gl.clearColor(0, 0, 0, 0);
  gl.clear(gl.COLOR_BUFFER_BIT);
  if (!field) return;
  gl.useProgram(program);
  gl.uniform2f(u.res, w, h);
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  const stride = 16;
  gl.enableVertexAttribArray(aPos);
  gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, stride, 0);
  gl.enableVertexAttribArray(aAcross);
  gl.vertexAttribPointer(aAcross, 1, gl.FLOAT, false, stride, 8);
  gl.enableVertexAttribArray(aTaper);
  gl.vertexAttribPointer(aTaper, 1, gl.FLOAT, false, stride, 12);

  const passes = [
    [config.haloWidth, config.haloColor, config.haloAlpha],
    [config.midWidth, config.midColor, config.midAlpha],
    [config.coreWidth, config.coreColor, config.coreAlpha],
  ];
  for (const [width, color, alpha] of passes) {
    const { data, count } = ribbonVertices(field, progress, () => width * 0.5);
    if (!count) continue;
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW);
    gl.uniform3f(u.color, color[0] / 255, color[1] / 255, color[2] / 255);
    gl.uniform1f(u.alpha, alpha);
    gl.drawArrays(gl.TRIANGLES, 0, count);
  }
}
```

(Edge-fade: applied as a CSS radial-mask on the canvas — simpler than a shader pass; added in Task 4 CSS, or a post pass later. For now rely on the existing betspot rounded clip + a CSS mask.)

- [ ] **Step 2 — quick pure test** for `ribbonVertices` in `boltField.test.js` or a new `boltGL.test.js` (import ribbonVertices; a 2-point horizontal segment grown fully yields 6 verts × 4 floats, across values ±1). Run, pass.
- [ ] **Step 3 — commit** `feat(analyse): webgl ribbon glow renderer`.

---

### Task 3: Rewire `AnalyseBetspot.jsx` strike lifecycle

**Files:** Modify `src/analyse/AnalyseBetspot.jsx`

- [ ] **Step 1** — swap imports to `initBoltGL`, `drawBolts` from `./boltGL.js` and `generateField`, `DEFAULT_CONFIG` from `./boltField.js`. Accept a `config` prop (shared, mutable).
- [ ] **Step 2** — setup effect: `initBoltGL(canvas, config)`; generate first field; store `{ gl assets, field, seed }` in refs; draw progress 0; setReady.
- [ ] **Step 3** — rAF effect: track `phase` clock. Compute progress from elapsed vs `config.strikeMs`; once ≥1, hold `config.holdMs`, then bump seed, regenerate field, reset clock (re-strike). Each frame `drawBolts(assets, field, progress)`. Keep visibility pause, reduced-motion (draw one static full strike, no loop), cleanup draws progress 1 static.
- [ ] **Step 4** — `npm run build` + browser: bolts grow from clusters, branch with thickness, re-strike on loop.
- [ ] **Step 5** — commit `feat(analyse): bolt-tree strike lifecycle`.

---

### Task 4: `PlasmaControls.jsx` panel + `AnalysePage.jsx` wiring + edge-fade CSS

**Files:** Create `src/analyse/PlasmaControls.jsx`; Modify `src/pages/AnalysePage.jsx`, `src/pages/AnalysePage.css`

- [ ] **Step 1** — `AnalysePage` holds `const [config] = useState(() => ({ ...DEFAULT_CONFIG }))` (mutable object ref); pass to `<AnalyseBetspot config={config} />` and `<PlasmaControls config={config} onChange={...} />`.
- [ ] **Step 2** — `PlasmaControls`: collapsible `<details>` panel; a declarative list of `{key,label,min,max,step}` → range inputs that mutate `config[key]` on input (numbers) and force a re-render; color inputs for halo/mid/core (hex→[r,g,b]); buttons Re-strike / Randomize (set `config.seed`) / Reset (Object.assign DEFAULT_CONFIG). Since the renderer reads the same `config` object each frame, edits apply live; buttons call an exposed `restrike()`/`regenerate()` via a ref or a bumped `config.seed` the loop watches.
- [ ] **Step 3** — edge-fade: add a CSS `mask-image: radial-gradient(...)` on `.analyse-betspot__energy` in `AnalysePage.css` so the shader canvas fades at the edges (replaces the in-shader vignette; keeps the renderer simple).
- [ ] **Step 4** — `npm test && npm run build`; browser: sliders visibly change density/thickness/colors/speed; buttons work.
- [ ] **Step 5** — commit `feat(analyse): live control panel + edge-fade`.

---

### Task 5: Remove voronoi + finish

- [ ] **Step 1** — `git rm src/analyse/plasmaGL.js src/analyse/__tests__/plasmaGL.test.js`; `grep -rn "plasmaGL" src` → none.
- [ ] **Step 2** — `npm test && npm run build && npm run format`; revert prettier churn outside `src/analyse` + `src/pages/Analyse*`.
- [ ] **Step 3** — Browser verification pass (screenshots): structure (branches + clusters + thickness), motion (grow + re-strike), controls (a slider + a colour visibly change it), reduced-motion/hidden. Tune `DEFAULT_CONFIG` for the best default look.
- [ ] **Step 4** — commit; then superpowers:finishing-a-development-branch.
