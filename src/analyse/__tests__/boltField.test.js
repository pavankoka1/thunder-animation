import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG, generateField, segmentDrawLength } from "../boltField.js";

const W = 438;
const H = 204;

describe("generateField", () => {
  it("emits the configured cluster count, points in bounds, depth capped, taper", () => {
    const f = generateField({ ...DEFAULT_CONFIG, clusterCount: 3, maxDepth: 3, seed: 7 }, W, H);
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
    if (byDepth[0] && byDepth[2]) expect(avg(byDepth[2])).toBeLessThan(avg(byDepth[0]));
  });

  it("is deterministic per seed and varies across seeds", () => {
    const a = JSON.stringify(generateField({ ...DEFAULT_CONFIG, seed: 1 }, W, H));
    expect(a).toBe(JSON.stringify(generateField({ ...DEFAULT_CONFIG, seed: 1 }, W, H)));
    expect(a).not.toBe(JSON.stringify(generateField({ ...DEFAULT_CONFIG, seed: 2 }, W, H)));
  });
});

describe("segmentDrawLength", () => {
  it("is 0 before spawnAt, grows to full by progress 1, monotonic", () => {
    const seg = { length: 100, spawnAt: 0.2 };
    expect(segmentDrawLength(seg, 0.1)).toBe(0);
    expect(segmentDrawLength(seg, 1)).toBeCloseTo(100, 3);
    expect(segmentDrawLength(seg, 0.6)).toBeGreaterThan(0);
    expect(segmentDrawLength(seg, 0.9)).toBeGreaterThanOrEqual(segmentDrawLength(seg, 0.6));
  });
});
