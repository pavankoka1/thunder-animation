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
    expect(r.sw / r.sh).toBeCloseTo(438 / 204, 3);
    expect(r.sx).toBeCloseTo(0, 3);
    expect(r.sy).toBeGreaterThan(0);
    expect(r.sx + r.sw).toBeLessThanOrEqual(400 + 1e-6);
    expect(r.sy + r.sh).toBeLessThanOrEqual(325 + 1e-6);
    expect(r.sy).toBeCloseTo((325 - r.sh) / 2, 3);
  });

  it("handles a target taller than the frame (crops width)", () => {
    const r = coverRect(400, 325, 100, 400);
    expect(r.sw / r.sh).toBeCloseTo(100 / 400, 3);
    expect(r.sy).toBeCloseTo(0, 3);
    expect(r.sx).toBeGreaterThan(0);
  });
});
