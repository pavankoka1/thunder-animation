import { describe, expect, it } from "vitest";
import { WRITHE_AMP, computeRouteWeights, jitterSegmentPoints } from "../energyMotion.js";

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
