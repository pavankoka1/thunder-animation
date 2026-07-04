import { describe, expect, it } from "vitest";
import { ribbonVertices } from "../boltGL.js";

describe("ribbonVertices", () => {
  it("expands a fully-grown 2-point segment into 6 verts with ±1 across", () => {
    const field = {
      segments: [
        {
          depth: 0,
          spawnAt: 0,
          length: 100,
          points: [
            { x: 0, y: 10 },
            { x: 100, y: 10 },
          ],
          cumLengths: [0, 100],
        },
      ],
    };
    const { data, count } = ribbonVertices(field, 1, () => 4);
    expect(count).toBe(6); // one quad = 2 triangles = 6 verts
    expect(data.length).toBe(6 * 4);
    const across = [];
    for (let i = 0; i < count; i += 1) across.push(data[i * 4 + 2]);
    expect(across.every((v) => v === 1 || v === -1)).toBe(true);
    expect(across).toContain(1);
    expect(across).toContain(-1);
  });

  it("emits nothing for an ungrown segment", () => {
    const field = {
      segments: [
        {
          depth: 0,
          spawnAt: 0.5,
          length: 100,
          points: [
            { x: 0, y: 0 },
            { x: 100, y: 0 },
          ],
          cumLengths: [0, 100],
        },
      ],
    };
    expect(ribbonVertices(field, 0.2, () => 4).count).toBe(0);
  });
});
