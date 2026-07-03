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
