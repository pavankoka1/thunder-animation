import { describe, expect, it } from "vitest";
import { branchLife, buildNetwork, generateBranch, makeRng, PERIOD } from "../plasmaNetwork.js";

describe("makeRng", () => {
  it("is deterministic for a seed and stays in [0,1)", () => {
    const a = makeRng(123);
    const b = makeRng(123);
    const xs = [a(), a(), a()];
    expect([b(), b(), b()]).toEqual(xs);
    for (const x of xs) {
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
    }
  });

  it("differs across seeds", () => {
    expect(makeRng(1)()).not.toBe(makeRng(2)());
  });
});

describe("generateBranch", () => {
  const hub = { x: 219, y: 102 };

  it("returns polylines with interior vertices, all within bounds", () => {
    const branches = generateBranch(hub, 0.3, 120, 42, 438, 204);
    expect(branches.length).toBeGreaterThanOrEqual(1);
    for (const br of branches) {
      expect(br.points.length).toBeGreaterThanOrEqual(2);
      expect(br.cumLengths.length).toBe(br.points.length);
      expect(br.length).toBeGreaterThan(0);
      for (const p of br.points) {
        expect(p.x).toBeGreaterThanOrEqual(0);
        expect(p.x).toBeLessThanOrEqual(438);
        expect(p.y).toBeGreaterThanOrEqual(0);
        expect(p.y).toBeLessThanOrEqual(204);
      }
    }
    expect(branches[0].points[0].x).toBeCloseTo(hub.x, 5);
    expect(branches[0].points[0].y).toBeCloseTo(hub.y, 5);
  });

  it("is deterministic for a seed and varies with it", () => {
    const a = generateBranch(hub, 0.3, 120, 42, 438, 204);
    const b = generateBranch(hub, 0.3, 120, 42, 438, 204);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    const c = generateBranch(hub, 0.3, 120, 43, 438, 204);
    expect(JSON.stringify(c)).not.toBe(JSON.stringify(a));
  });
});

describe("buildNetwork", () => {
  const hubs = [
    { x: 123, y: 102 },
    { x: 219, y: 102 },
    { x: 315, y: 102 },
  ];

  it("emits several slots per hub with stable identity fields", () => {
    const slots = buildNetwork(438, 204, hubs, { slotsPerHub: 7 });
    expect(slots.length).toBe(21);
    for (const s of slots) {
      expect(hubs).toContainEqual(s.hub);
      expect(Number.isFinite(s.angle)).toBe(true);
      expect(s.baseLength).toBeGreaterThan(0);
      expect(Number.isInteger(s.seed)).toBe(true);
      expect(s.phase).toBeGreaterThanOrEqual(0);
      expect(s.phase).toBeLessThan(PERIOD);
    }
  });
});

describe("branchLife", () => {
  const slots = buildNetwork(438, 204, [{ x: 219, y: 102 }], { slotsPerHub: 12 });

  it("keeps extent/alpha in [0,1] and cycles once per PERIOD", () => {
    const s = slots[0];
    for (let t = 0; t < 20; t += 0.13) {
      const l = branchLife(s, t);
      expect(l.extent).toBeGreaterThanOrEqual(0);
      expect(l.extent).toBeLessThanOrEqual(1);
      expect(l.alpha).toBeGreaterThanOrEqual(0);
      expect(l.alpha).toBeLessThanOrEqual(1);
    }
    expect(branchLife(s, 5).cycle + 1).toBe(branchLife(s, 5 + PERIOD).cycle);
  });

  it("staggers so total live extent stays within a band (not all-on/all-off)", () => {
    const sums = [];
    for (let t = 0; t < 40; t += 0.25) {
      let sum = 0;
      for (const s of slots) sum += branchLife(s, t).extent;
      sums.push(sum);
    }
    const mean = sums.reduce((a, b) => a + b, 0) / sums.length;
    for (const v of sums) {
      expect(v).toBeGreaterThan(mean * 0.55);
      expect(v).toBeLessThan(mean * 1.45);
    }
    expect(mean).toBeGreaterThan(slots.length * 0.4);
  });
});
