import { describe, expect, it } from "vitest";
import { coverTransform, keyframeAt } from "../plasmaPaths.js";

describe("coverTransform", () => {
  it("covers the target with the larger scale and centres the crop", () => {
    const t = coverTransform(400, 325, 438, 204);
    expect(t.scale).toBeCloseTo(Math.max(438 / 400, 204 / 325), 5);
    expect(t.offX).toBeCloseTo(0, 3);
    expect(t.offY).toBeGreaterThan(0);
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
    const b = keyframeAt(600, 6000, 10);
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
