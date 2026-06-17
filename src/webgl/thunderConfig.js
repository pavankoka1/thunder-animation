/** Shader path budget (trunks + all branches). */
export const MAX_PATHS = 512;

export const MAX_TRUNK_COUNT = 100;

/** Strike animation — normalized timeline is 0–1; durationMs maps it to real time. */
export const DEFAULT_STRIKE_TIMING = {
  /** Wall-clock length of one Play strike (ms). Canvas plasma strike uses 2000. */
  durationMs: 2000,
  /** How long each main bolt takes to reach the edge (0–1 timeline). */
  trunkFinish: 0.72,
  /** Delay between consecutive trunks starting (0–1); auto-clamped when bolt count is high. */
  trunkStagger: 0.045,
  /** Branch reveal window — min/max span on the timeline. */
  branchGrowthMin: 0.055,
  branchGrowthMax: 0.13,
};

export const DEFAULT_THUNDER_CONFIG = {
  /** `art` = paths traced from plasma.svg; `procedural` = generated bolts. */
  boltSource: "art",
  trunkCount: 3,
  thickness: 1,
  branchDensity: 0.45,
  branches: true,
  seed: 42,
  strikeTiming: DEFAULT_STRIKE_TIMING,
};

/**
 * @param {Partial<typeof DEFAULT_STRIKE_TIMING>} [override]
 */
export function resolveStrikeTiming(override = {}) {
  return { ...DEFAULT_STRIKE_TIMING, ...override };
}

/**
 * @param {Partial<typeof DEFAULT_THUNDER_CONFIG>} [override]
 */
export function resolveThunderParams(override = {}) {
  const strikeTiming = resolveStrikeTiming(override.strikeTiming);
  const trunkCount = Math.max(
    1,
    Math.min(MAX_TRUNK_COUNT, override.trunkCount ?? DEFAULT_THUNDER_CONFIG.trunkCount)
  );

  return {
    ...DEFAULT_THUNDER_CONFIG,
    ...override,
    trunkCount,
    strikeTiming,
  };
}

/**
 * @param {typeof DEFAULT_STRIKE_TIMING} a
 * @param {typeof DEFAULT_STRIKE_TIMING} b
 */
export function strikeTimingChanged(a, b) {
  if (!a || !b) return true;
  return (
    a.durationMs !== b.durationMs ||
    a.trunkFinish !== b.trunkFinish ||
    a.trunkStagger !== b.trunkStagger ||
    a.branchGrowthMin !== b.branchGrowthMin ||
    a.branchGrowthMax !== b.branchGrowthMax
  );
}
