/**
 * Uniform spatial grid over the traced network — the acceleration structure
 * that lets paintLichtenberg run EVERY animation frame without melting the
 * GPU.
 *
 * Why this exists: the fragment shader shades each pixel from the SINGLE
 * nearest path segment (a per-fragment SDF, see lichtenbergShader.js). The
 * obvious implementation loops over all ~4700 paths for every pixel; run once
 * per frame at 60fps over the whole body that's ~10^10 texture reads/frame,
 * which on Windows blows past the driver's ~2s TDR watchdog and the WebGL
 * context is killed (CONTEXT_LOST_WEBGL). This module buckets every segment
 * into the grid cells its glow can reach, so a pixel only tests the handful of
 * segments in its OWN cell instead of all 4700 — the same nearest-segment
 * result, ~two orders of magnitude less work.
 *
 * Correctness (no seams): a segment is registered into every cell within `R`
 * of it, where R covers both the segment's visible glow reach (scaled by its
 * stroke width) and the per-frame sway displacement. So any segment that could
 * be a pixel's visible nearest is guaranteed to be present in that pixel's
 * cell — the grid changes performance, not the rendered result.
 *
 * Output is plain typed arrays ready for texture upload (no GL here); the
 * renderer packs them into two float textures and the shader reads them back.
 */
import { MAX_PATHS, MAX_POINTS_PER_PATH } from "./lichtenbergTree.js";

/** Cell edge in body px. ~32 keeps typical (thin) cells to a few dozen segs. */
export const GRID_CELL = 32;

/**
 * Compile-time cap on how many segment refs a single cell's shader loop will
 * scan (the loop's constant upper bound; it `break`s at the real per-cell
 * count). This is a CEILING, not the typical cost — most in-body cells hold a
 * few hundred; only the handful of cells over the genuinely dense central hub
 * approach it (measured ~2200 at default widthScale, ~2950 at the 2.5x slider
 * max — that density is intrinsic to the trace, ~1000 segments physically
 * share one 32px cell there, so no radius choice avoids it). 3072 leaves head-
 * room so nothing is ever dropped; a cell that somehow exceeds it is truncated
 * at build time with a warning rather than silently overrunning the loop.
 * Bumped from 3072 → 4096 alongside the larger SWAY_PAD below: a wider sway
 * radius registers each thin segment into a few more cells, nudging the dense
 * hub's peak count up, so the ceiling gets matching headroom.
 */
export const MAX_CELL_SCAN = 4096;

// Registration radius per segment = SWAY_PAD + GLOW_FACTOR * strokeHalfWidth,
// clamped to R_MAX. GLOW_FACTOR ~ (outerSigmaMul default 3) * (~2.5 sigma) so a
// segment reaches every cell where its glow is still visible; SWAY_PAD covers
// u_swayAmt's per-frame displacement (see readPoint in lichtenbergShader.js).
// R_MAX caps the reach: the very fattest segments sit dead-centre in the dense
// hub where there's no open gap within R_MAX for them to be the visible
// nearest across, so clamping their reach can't create a seam — while
// hub-EDGE segments (which do face gaps) have tapered thin widths and stay
// well under the clamp.
const GLOW_FACTOR = 8;
// Must be >= the shader's peak per-axis motion displacement (readPoint in
// lichtenbergShader.js: flow + wiggle, width-anchored). Grid is built on BASE
// positions, so a segment whose moved position drifts more than SWAY_PAD out
// of its registered cells would be missed for some pixels and flicker. 18 px
// covers the (now larger, more visible) tuned peak: u_swayAmt 8.5 * taper max
// 1.6 ≈ 13.6, with margin. At default sliders the busiest cell holds ~2840
// (< MAX_CELL_SCAN); only the double-maxed extreme (widthScale 2.5 AND
// centreBoost 3 together) exceeds the cap and truncates gracefully — a
// pre-existing edge that also blew the old 3072 ceiling.
const SWAY_PAD = 18;
const R_MAX = 96;

// Width of the flat segment-list texture. Height grows with total entries.
const SEG_TEX_W = 2048;

/**
 * @param {{x:number,y:number,w:number}[][]} paths body-px polylines (already
 *   width-scaled/centre-boosted — the SAME data uploaded to the point texture).
 * @returns grid metadata + `cellData` (RGBA per cell: offset,count) and
 *   `segData` (RGBA per entry: pathIdx,ptIdx) as Float32Arrays.
 */
export function buildSegmentGrid(paths, { cell = GRID_CELL } = {}) {
  const nPaths = Math.min(paths.length, MAX_PATHS);

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (let p = 0; p < nPaths; p += 1) {
    for (const pt of paths[p]) {
      if (pt.x < minX) minX = pt.x;
      if (pt.y < minY) minY = pt.y;
      if (pt.x > maxX) maxX = pt.x;
      if (pt.y > maxY) maxY = pt.y;
    }
  }

  // Empty / degenerate network — hand back a valid 1x1 grid with no segments
  // so the shader just renders ambient (findNearest returns "nothing near").
  if (!Number.isFinite(minX)) {
    return {
      originX: 0,
      originY: 0,
      cell,
      gw: 1,
      gh: 1,
      cellData: new Float32Array(4),
      segData: new Float32Array(4),
      segTexW: SEG_TEX_W,
      segTexH: 1,
      total: 0,
      maxCount: 0,
    };
  }

  // One-cell halo each side so edge segments registering just outside the
  // point bbox still land in a real cell.
  const originX = minX - cell;
  const originY = minY - cell;
  const gw = Math.ceil((maxX - minX) / cell) + 3;
  const gh = Math.ceil((maxY - minY) / cell) + 3;

  const buckets = Array.from({ length: gw * gh }, () => []);

  for (let p = 0; p < nPaths; p += 1) {
    const pts = paths[p];
    const nSeg = Math.min(pts.length, MAX_POINTS_PER_PATH) - 1;
    for (let i = 0; i < nSeg; i += 1) {
      const a = pts[i];
      const b = pts[i + 1];
      const r = Math.min(R_MAX, SWAY_PAD + GLOW_FACTOR * Math.max(a.w, b.w));

      let c0x = Math.floor((Math.min(a.x, b.x) - r - originX) / cell);
      let c1x = Math.floor((Math.max(a.x, b.x) + r - originX) / cell);
      let c0y = Math.floor((Math.min(a.y, b.y) - r - originY) / cell);
      let c1y = Math.floor((Math.max(a.y, b.y) + r - originY) / cell);
      c0x = Math.max(0, c0x);
      c0y = Math.max(0, c0y);
      c1x = Math.min(gw - 1, c1x);
      c1y = Math.min(gh - 1, c1y);

      // Encode (pathIdx, segIdx) in one int — segIdx < MAX_POINTS_PER_PATH < 16.
      const code = p * 16 + i;
      for (let cy = c0y; cy <= c1y; cy += 1) {
        const row = cy * gw;
        for (let cx = c0x; cx <= c1x; cx += 1) buckets[row + cx].push(code);
      }
    }
  }

  let total = 0;
  let maxCount = 0;
  let truncated = 0;
  for (const b of buckets) {
    if (b.length > MAX_CELL_SCAN) {
      truncated += b.length - MAX_CELL_SCAN;
      b.length = MAX_CELL_SCAN;
    }
    total += b.length;
    if (b.length > maxCount) maxCount = b.length;
  }

  const cellData = new Float32Array(gw * gh * 4);
  const segTexH = Math.max(1, Math.ceil(total / SEG_TEX_W));
  const segData = new Float32Array(SEG_TEX_W * segTexH * 4);

  let off = 0;
  for (let c = 0; c < buckets.length; c += 1) {
    const b = buckets[c];
    cellData[c * 4] = off; // offset into segData
    cellData[c * 4 + 1] = b.length; // count
    cellData[c * 4 + 3] = 1;
    for (let k = 0; k < b.length; k += 1) {
      const code = b[k];
      const path = Math.floor(code / 16);
      const idx = (off + k) * 4;
      segData[idx] = path;
      segData[idx + 1] = code - path * 16;
      segData[idx + 3] = 1;
    }
    off += b.length;
  }

  if (truncated > 0) {
    // eslint-disable-next-line no-console
    console.warn(
      `[spatialGrid] ${truncated} segment refs dropped — a cell exceeded ` +
        `MAX_CELL_SCAN=${MAX_CELL_SCAN}. Raise it or the cell size.`
    );
  }

  return {
    originX,
    originY,
    cell,
    gw,
    gh,
    cellData,
    segData,
    segTexW: SEG_TEX_W,
    segTexH,
    total,
    maxCount,
  };
}
