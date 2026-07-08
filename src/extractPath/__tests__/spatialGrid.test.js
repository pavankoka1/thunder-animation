import { describe, expect, it } from "vitest";
import { buildSegmentGrid, GRID_CELL, MAX_CELL_SCAN } from "../spatialGrid.js";

// A small synthetic network: a few multi-point polylines with modest widths,
// spread across a ~200px square so segments land in several different cells.
function sampleNetwork() {
  return [
    [
      { x: 10, y: 10, w: 2 },
      { x: 60, y: 20, w: 2 },
      { x: 110, y: 60, w: 1.5 },
    ],
    [
      { x: 150, y: 30, w: 3 },
      { x: 170, y: 120, w: 2 },
    ],
    [
      { x: 40, y: 160, w: 2.5 },
      { x: 120, y: 150, w: 2 },
      { x: 190, y: 190, w: 1 },
    ],
  ];
}

// Brute-force nearest segment (the ground truth the grid must reproduce).
function bruteNearest(paths, px, py) {
  let bestD = Infinity;
  let bestSeg = null;
  for (let p = 0; p < paths.length; p += 1) {
    const pts = paths[p];
    for (let i = 0; i < pts.length - 1; i += 1) {
      const a = pts[i];
      const b = pts[i + 1];
      const abx = b.x - a.x;
      const aby = b.y - a.y;
      const len2 = abx * abx + aby * aby;
      const t =
        len2 < 1e-6
          ? 0
          : Math.max(0, Math.min(1, ((px - a.x) * abx + (py - a.y) * aby) / len2));
      const dx = px - (a.x + abx * t);
      const dy = py - (a.y + aby * t);
      const d = Math.hypot(dx, dy);
      if (d < bestD) {
        bestD = d;
        bestSeg = `${p}:${i}`;
      }
    }
  }
  return { bestD, bestSeg };
}

// Replays exactly what the shader's findNearest does, reading the grid's
// packed cellData/segData — so this also validates the data layout.
function gridNearest(grid, paths, px, py) {
  const gx = (px - grid.originX) / grid.cell;
  const gy = (py - grid.originY) / grid.cell;
  if (gx < 0 || gy < 0 || gx >= grid.gw || gy >= grid.gh)
    return { bestD: Infinity, bestSeg: null };
  const cx = Math.floor(gx);
  const cy = Math.floor(gy);
  const cell = (cy * grid.gw + cx) * 4;
  const off = Math.round(grid.cellData[cell]);
  const cnt = Math.round(grid.cellData[cell + 1]);

  let bestD = Infinity;
  let bestSeg = null;
  for (let k = 0; k < cnt; k += 1) {
    const e = (off + k) * 4;
    const p = Math.round(grid.segData[e]);
    const i = Math.round(grid.segData[e + 1]);
    const a = paths[p][i];
    const b = paths[p][i + 1];
    const abx = b.x - a.x;
    const aby = b.y - a.y;
    const len2 = abx * abx + aby * aby;
    const t =
      len2 < 1e-6
        ? 0
        : Math.max(0, Math.min(1, ((px - a.x) * abx + (py - a.y) * aby) / len2));
    const dx = px - (a.x + abx * t);
    const dy = py - (a.y + aby * t);
    const d = Math.hypot(dx, dy);
    if (d < bestD) {
      bestD = d;
      bestSeg = `${p}:${i}`;
    }
  }
  return { bestD, bestSeg };
}

describe("buildSegmentGrid", () => {
  it("exposes sane constants", () => {
    expect(GRID_CELL).toBeGreaterThan(0);
    expect(MAX_CELL_SCAN).toBeGreaterThan(0);
  });

  it("packs a valid, in-bounds cell/segment layout", () => {
    const grid = buildSegmentGrid(sampleNetwork());
    const segEntries = grid.segTexW * grid.segTexH;
    expect(grid.cellData).toHaveLength(grid.gw * grid.gh * 4);
    expect(grid.segData).toHaveLength(segEntries * 4);

    // Every (offset, count) must address a real, non-overlapping run inside
    // segData, and counts never exceed the shader's scan ceiling.
    for (let c = 0; c < grid.gw * grid.gh; c += 1) {
      const off = grid.cellData[c * 4];
      const cnt = grid.cellData[c * 4 + 1];
      expect(Number.isInteger(off)).toBe(true);
      expect(Number.isInteger(cnt)).toBe(true);
      expect(cnt).toBeLessThanOrEqual(MAX_CELL_SCAN);
      expect(off + cnt).toBeLessThanOrEqual(segEntries);
    }
  });

  it("reproduces the brute-force nearest segment wherever a vein is close", () => {
    const paths = sampleNetwork();
    const grid = buildSegmentGrid(paths);

    // Sweep query points across the whole domain. Where the true nearest is
    // reasonably close (well within the per-segment registration radius), the
    // grid MUST return the identical segment and distance — that's the whole
    // guarantee: same result as brute force, less work. Points far from every
    // vein legitimately fall outside the registration radius (there the veins
    // contribute no visible glow anyway), so they're not asserted.
    let checked = 0;
    for (let py = 0; py <= 200; py += 4) {
      for (let px = 0; px <= 200; px += 4) {
        const brute = bruteNearest(paths, px, py);
        if (brute.bestD > 12) continue; // only assert the "near a vein" regime
        const viaGrid = gridNearest(grid, paths, px, py);
        expect(viaGrid.bestSeg).toBe(brute.bestSeg);
        expect(viaGrid.bestD).toBeCloseTo(brute.bestD, 5);
        checked += 1;
      }
    }
    // Guard against the sweep silently asserting nothing.
    expect(checked).toBeGreaterThan(20);
  });

  it("handles an empty network without throwing", () => {
    const grid = buildSegmentGrid([]);
    expect(grid.gw).toBeGreaterThanOrEqual(1);
    expect(grid.gh).toBeGreaterThanOrEqual(1);
    expect(gridNearest(grid, [], 5, 5).bestSeg).toBeNull();
  });
});
