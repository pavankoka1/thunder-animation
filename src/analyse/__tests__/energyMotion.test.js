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
