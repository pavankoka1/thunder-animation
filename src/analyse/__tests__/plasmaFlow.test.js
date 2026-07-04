import { describe, expect, it } from "vitest";
import { coverTransform, flowVec, MAX_AMP } from "../plasmaFlow.js";

describe("coverTransform", () => {
  it("covers the target with the larger scale and centres the crop", () => {
    const t = coverTransform(400, 325, 438, 204);
    expect(t.scale).toBeCloseTo(Math.max(438 / 400, 204 / 325), 5);
    expect(t.offX).toBeCloseTo(0, 3);
    expect(t.offY).toBeGreaterThan(0);
  });
});

describe("flowVec", () => {
  it("stays within [-1,1] on each axis", () => {
    let m = 0;
    for (let t = 0; t < 20; t += 0.3) {
      for (let x = 0; x < 440; x += 19) {
        for (let y = 0; y < 210; y += 17) {
          const f = flowVec(x, y, t);
          m = Math.max(m, Math.abs(f.x), Math.abs(f.y));
        }
      }
    }
    expect(m).toBeLessThanOrEqual(1 + 1e-9);
  });

  it("is deterministic and varies across space (local churn, not uniform)", () => {
    expect(flowVec(50, 50, 3)).toEqual(flowVec(50, 50, 3));
    const a = flowVec(50, 50, 3);
    const b = flowVec(200, 120, 3);
    expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThan(0.05);
  });

  it("has ~zero net drift over time at a point (oscillates, no runaway)", () => {
    let sx = 0;
    let sy = 0;
    let n = 0;
    for (let t = 0; t < 300; t += 0.1) {
      const f = flowVec(123, 77, t);
      sx += f.x;
      sy += f.y;
      n += 1;
    }
    expect(Math.abs(sx / n)).toBeLessThan(0.1);
    expect(Math.abs(sy / n)).toBeLessThan(0.1);
  });

  it("exposes a positive churn amplitude", () => {
    expect(MAX_AMP).toBeGreaterThan(0);
  });
});
