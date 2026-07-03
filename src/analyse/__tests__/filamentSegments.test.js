import { describe, expect, it } from "vitest";
import { detectHubs, segmentsFromMask, tagSegmentsWithHubs } from "../filamentSegments.js";

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

  it("ignores maxima hugging the border", () => {
    const w = 100;
    const h = 60;
    const alpha = new Float32Array(w * h);
    addBlob(alpha, w, h, 2, 2, 3, 1.0); // bright corner speck — should be excluded
    addBlob(alpha, w, h, 50, 30, 10, 0.7);

    const hubs = detectHubs(alpha, w, h, 2, 20);

    expect(hubs.length).toBeGreaterThanOrEqual(1);
    expect(Math.hypot(hubs[0].x - 50, hubs[0].y - 30)).toBeLessThan(8);
  });
});

describe("segmentsFromMask", () => {
  it("traces a thick mesh mask into segments with interior vertices", async () => {
    // Thick strokes + closed-mesh topology, like the real filament web. The
    // shared skeleton pipeline aggressively prunes leaf-ended 1px hairlines,
    // so those are not a supported input — the plasma web never produces them.
    const w = 80;
    const h = 60;
    const mask = new Uint8Array(w * h);
    const thick = (x, y) => {
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          const xx = x + dx;
          const yy = y + dy;
          if (xx >= 0 && yy >= 0 && xx < w && yy < h) mask[yy * w + xx] = 1;
        }
      }
    };
    for (let x = 10; x <= 70; x += 1) {
      thick(x, 10); // top edge
      thick(x, 30); // horizontal mid
      thick(x, 50); // bottom edge
    }
    for (let y = 10; y <= 50; y += 1) {
      thick(10, y); // left edge
      thick(40, y); // vertical mid
      thick(70, y); // right edge
    }

    const segments = await segmentsFromMask(mask, w, h);

    expect(segments.length).toBeGreaterThanOrEqual(2);
    const totalLength = segments.reduce((n, s) => n + s.length, 0);
    expect(totalLength).toBeGreaterThan(60);
    for (const seg of segments) {
      expect(seg.points.length).toBeGreaterThanOrEqual(3);
      for (const p of seg.points) {
        expect(p.x).toBeGreaterThanOrEqual(0);
        expect(p.x).toBeLessThan(w);
        expect(p.y).toBeGreaterThanOrEqual(0);
        expect(p.y).toBeLessThan(h);
      }
    }
    // ids are dense and unique
    expect(new Set(segments.map((s) => s.id)).size).toBe(segments.length);
  });

  it("keeps thin 1px strokes intact (connectivity-preserving thinning)", async () => {
    const w = 60;
    const h = 40;
    const mask = new Uint8Array(w * h);
    for (let x = 5; x <= 55; x += 1) mask[20 * w + x] = 1; // horizontal hairline
    for (let y = 5; y <= 35; y += 1) mask[y * w + 30] = 1; // vertical hairline

    const segments = await segmentsFromMask(mask, w, h);

    expect(segments.length).toBeGreaterThanOrEqual(2);
    const totalLength = segments.reduce((n, s) => n + s.length, 0);
    expect(totalLength).toBeGreaterThan(40);
  });
});

describe("tagSegmentsWithHubs", () => {
  it("assigns each segment to its nearest hub by midpoint", () => {
    const segments = [
      { id: 0, points: [{ x: 0, y: 0 }, { x: 10, y: 0 }], length: 10 },
      { id: 1, points: [{ x: 90, y: 0 }, { x: 100, y: 0 }], length: 10 },
    ];
    const hubs = [
      { x: 5, y: 0, strength: 1 },
      { x: 95, y: 0, strength: 0.8 },
    ];
    const tagged = tagSegmentsWithHubs(segments, hubs);
    expect(tagged[0].hub).toBe(0);
    expect(tagged[1].hub).toBe(1);
  });
});
