import { describe, expect, it } from "vitest";
import { elapsedSeconds } from "../plasmaGL.js";

describe("elapsedSeconds", () => {
  it("converts ms to seconds", () => {
    expect(elapsedSeconds(2000)).toBe(2);
    expect(elapsedSeconds(500)).toBe(0.5);
  });

  it("clamps negative time to 0 (first rAF frame guard)", () => {
    expect(elapsedSeconds(-0.4)).toBe(0);
    expect(elapsedSeconds(0)).toBe(0);
  });
});
