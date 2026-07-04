import { describe, expect, it } from "vitest";
import { coverTransform, frameBlendAt, HOLD } from "../plasmaFrames.js";

describe("coverTransform", () => {
  it("covers the target with the larger scale and centres the crop", () => {
    const t = coverTransform(400, 325, 438, 204);
    expect(t.scale).toBeCloseTo(Math.max(438 / 400, 204 / 325), 5);
    expect(t.offX).toBeCloseTo(0, 3);
    expect(t.offY).toBeGreaterThan(0);
  });
});

describe("frameBlendAt", () => {
  it("holds the current frame (blend 0) early in each slot", () => {
    const r = frameBlendAt(0, 9000, 10);
    expect(r.k0).toBe(0);
    expect(r.k1).toBe(1);
    expect(r.blend).toBe(0);
    expect(frameBlendAt(0.4 * 900, 9000, 10).blend).toBe(0);
  });

  it("crossfades to the next frame late in the slot", () => {
    const nearEnd = frameBlendAt(0.99 * 900, 9000, 10);
    expect(nearEnd.blend).toBeGreaterThan(0.5);
    expect(nearEnd.blend).toBeLessThanOrEqual(1);
  });

  it("pairs consecutive frames and wraps, blend in [0,1], negative time clamped", () => {
    for (let t = -50; t < 30000; t += 137) {
      const { k0, k1, blend } = frameBlendAt(t, 9000, 10);
      expect(k0).toBeGreaterThanOrEqual(0);
      expect(k0).toBeLessThan(10);
      expect(k1).toBe((k0 + 1) % 10);
      expect(blend).toBeGreaterThanOrEqual(0);
      expect(blend).toBeLessThanOrEqual(1);
    }
  });

  it("is safe when count is 0", () => {
    expect(frameBlendAt(500, 9000, 0)).toEqual({ k0: 0, k1: 0, blend: 0 });
  });

  it("exposes a hold fraction in (0,1)", () => {
    expect(HOLD).toBeGreaterThan(0);
    expect(HOLD).toBeLessThan(1);
  });
});
