import { describe, expect, it } from "vitest";
import { PLASMA_CONFIG } from "../config/inner.js";
import { elapsedSeconds } from "../utils/time.js";

describe("elapsedSeconds", () => {
  it("converts ms to seconds", () => {
    expect(elapsedSeconds(1000)).toBeCloseTo(1);
    expect(elapsedSeconds(2500)).toBeCloseTo(2.5);
  });

  it("clamps the negative first-frame timestamp to 0", () => {
    expect(elapsedSeconds(-3)).toBe(0);
    expect(elapsedSeconds(0)).toBe(0);
  });
});

describe("PLASMA_CONFIG", () => {
  it("exposes tunable numeric keys", () => {
    for (const key of [
      "cellScaleX",
      "cellScaleY",
      "boltWidth",
      "boltSharp",
      "boltVary",
      "branchStrength",
      "crispIntensity",
      "haloIntensity",
      "coreIntensity",
      "timeScale",
      "seedSpeed",
    ]) {
      expect(PLASMA_CONFIG).toHaveProperty(key);
      expect(typeof PLASMA_CONFIG[key]).toBe("number");
    }
  });

  it("stores colours as 0..1 rgb triples", () => {
    for (const key of ["baseColor", "haloColor", "coreColor"]) {
      expect(PLASMA_CONFIG[key]).toHaveLength(3);
      for (const c of PLASMA_CONFIG[key]) {
        expect(c).toBeGreaterThanOrEqual(0);
        expect(c).toBeLessThanOrEqual(1);
      }
    }
  });
});
