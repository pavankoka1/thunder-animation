import { describe, expect, it } from "vitest";
import { detectHubs } from "../energyHubs.js";

/** Paint a soft round blob of peak strength into a Float32Array field. */
function addBlob(field, w, h, cx, cy, radius, peak) {
  for (let y = Math.max(0, cy - radius); y < Math.min(h, cy + radius); y += 1) {
    for (let x = Math.max(0, cx - radius); x < Math.min(w, cx + radius); x += 1) {
      const d = Math.hypot(x - cx, y - cy) / radius;
      if (d >= 1) continue;
      const v = peak * (1 - d);
      const i = y * w + x;
      if (v > field[i]) field[i] = v;
    }
  }
}

describe("detectHubs", () => {
  it("finds three separated clusters, strongest first", () => {
    const w = 120;
    const h = 60;
    const field = new Float32Array(w * h);
    addBlob(field, w, h, 60, 30, 10, 1.0);
    addBlob(field, w, h, 20, 30, 10, 0.8);
    addBlob(field, w, h, 100, 30, 10, 0.7);

    const hubs = detectHubs(field, w, h, 3, 20);

    expect(hubs).toHaveLength(3);
    expect(Math.hypot(hubs[0].x - 60, hubs[0].y - 30)).toBeLessThan(8);
    const xs = hubs.map((p) => p.x).sort((a, b) => a - b);
    expect(Math.abs(xs[0] - 20)).toBeLessThan(8);
    expect(Math.abs(xs[2] - 100)).toBeLessThan(8);
  });

  it("ignores maxima hugging the border", () => {
    const w = 100;
    const h = 60;
    const field = new Float32Array(w * h);
    addBlob(field, w, h, 2, 2, 3, 1.0); // corner speck — excluded
    addBlob(field, w, h, 50, 30, 10, 0.7);

    const hubs = detectHubs(field, w, h, 2, 20);
    expect(hubs.length).toBeGreaterThanOrEqual(1);
    expect(Math.hypot(hubs[0].x - 50, hubs[0].y - 30)).toBeLessThan(8);
  });

  it("returns nothing for an empty field", () => {
    expect(detectHubs(new Float32Array(40 * 40), 40, 40, 3, 10).length).toBe(0);
  });
});
