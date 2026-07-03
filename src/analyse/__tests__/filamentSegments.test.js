import { describe, expect, it } from "vitest";
import { detectHubs } from "../filamentSegments.js";

/** Paint a soft square blob of the given peak strength into a Float32Array grid. */
function addBlob(alpha, w, h, cx, cy, radius, peak) {
  for (let y = Math.max(0, cy - radius); y < Math.min(h, cy + radius); y += 1) {
    for (let x = Math.max(0, cx - radius); x < Math.min(w, cx + radius); x += 1) {
      const d = Math.hypot(x - cx, y - cy) / radius;
      if (d >= 1) continue;
      const v = peak * (1 - d);
      const i = y * w + x;
      if (v > alpha[i]) alpha[i] = v;
    }
  }
}

describe("detectHubs", () => {
  it("finds three separated bright clusters, strongest first", () => {
    const w = 120;
    const h = 60;
    const alpha = new Float32Array(w * h);
    addBlob(alpha, w, h, 60, 30, 10, 1.0); // centre, strongest
    addBlob(alpha, w, h, 20, 30, 10, 0.8);
    addBlob(alpha, w, h, 100, 30, 10, 0.7);

    const hubs = detectHubs(alpha, w, h, 3, 20);

    expect(hubs).toHaveLength(3);
    expect(Math.hypot(hubs[0].x - 60, hubs[0].y - 30)).toBeLessThan(8);
    const xs = hubs.map((p) => p.x).sort((a, b) => a - b);
    expect(Math.hypot(xs[0] - 20, 0)).toBeLessThan(8);
    expect(Math.hypot(xs[2] - 100, 0)).toBeLessThan(8);
  });

  it("returns fewer hubs than requested when the field is empty", () => {
    const hubs = detectHubs(new Float32Array(40 * 40), 40, 40, 3, 10);
    expect(hubs.length).toBeLessThanOrEqual(1);
  });
});
