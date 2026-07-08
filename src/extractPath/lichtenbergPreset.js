/**
 * Shared preset for the extracted-Lichtenberg inner plasma.
 *
 * These are the extract-path page's current DEFAULT slider values plus the
 * fixed style constants it paints with — the single source of truth so the
 * /extract-path tuning page and the /analyse betspots stay in sync (both
 * import from here). ExtractPathPage seeds its sliders from LICHTENBERG_DEFAULTS
 * and rebuilds style/network through the helpers below; AnalyseBetspot uses the
 * defaults as-is.
 */
import { loadExtractedNetwork } from "./loadExtractedNetwork.js";

/** Current default slider values (the "main" values). */
export const LICHTENBERG_DEFAULTS = {
  widthScale: 3,
  thickness: 1,
  centerBoost: 1.15,
  edgeMix: 1.0,
  intensity: 0.5,
  cornerDensity: 1,
  movement: 8.5,
};

/**
 * Build the paintLichtenberg style object from slider-style values. The colour
 * constants and sigma/alpha ratios are the extract-path defaults (sampled from
 * reference.png — near-white cores cooling to pale cyan, tight halos, faint
 * ambient, late violet edge tint). `thickness`, `edgeMix`, `intensity` and
 * `movement` are the tunable multipliers.
 */
export function buildLichtenbergStyle(values = {}) {
  const {
    thickness = LICHTENBERG_DEFAULTS.thickness,
    edgeMix = LICHTENBERG_DEFAULTS.edgeMix,
    intensity = LICHTENBERG_DEFAULTS.intensity,
    movement = LICHTENBERG_DEFAULTS.movement,
  } = values;

  return {
    // Sharp filaments, tight halos (hair-thin razor-crisp lines on a dark
    // ground, like neural-reference.jpg — wide halos wash the veins into milk).
    coreSigmaMul: 0.52 * thickness,
    glowSigmaMul: 0.8 * thickness,
    outerSigmaMul: 1.6 * thickness,
    // intensity scales all three vein alphas together (brightness only).
    coreAlpha: 1.0 * intensity,
    glowAlpha: 0.24 * intensity,
    outerAlpha: 0.05 * intensity,
    // Vein peaks near-white, cooling to pale cyan; body already blue so
    // glow/outer stay in the cyan-blue family.
    coreColor: [0.97, 0.99, 1.0],
    glowColor: [0.62, 0.86, 1.0],
    outerColor: [0.45, 0.68, 0.95],
    // Faint fill so the violet edge reads in open corners without hazing lines.
    ambientColor: [0.4, 0.7, 0.95],
    ambientAlpha: 0.035,
    // Radial violet/magenta edge tint (late, fast transition near the rim).
    edgeColor: [1.0, 0.1, 0.7],
    edgeStart: 0.05,
    edgePow: 1.0,
    edgeMix,
    // Flow-field sway amplitude (body px). See readPoint in lichtenbergShader.js.
    swayAmt: movement,
  };
}

/**
 * Build + centre-boost the traced network for a given body size. Points closer
 * to the body centre get progressively thicker (matching the photo's dominant
 * central hub), with a floor so the corners aren't starved.
 *
 * @param {number} bodyW body width in renderer px (already ×SUPERSAMPLE)
 * @param {number} bodyH
 * @param {{ widthScale?: number, centerBoost?: number, cornerDensity?: number,
 *   cornerRadius?: number }} [values]
 */
export function buildLichtenbergNetwork(bodyW, bodyH, values = {}) {
  const {
    widthScale = LICHTENBERG_DEFAULTS.widthScale,
    centerBoost = LICHTENBERG_DEFAULTS.centerBoost,
    cornerDensity = LICHTENBERG_DEFAULTS.cornerDensity,
    cornerRadius,
  } = values;

  const network = loadExtractedNetwork(bodyW, bodyH, {
    widthScale,
    cornerDensity,
    cornerRadius,
  });

  const cx = bodyW / 2;
  const cy = bodyH / 2;
  const maxR = Math.hypot(cx, cy);
  const boostFloor = 1.15;
  for (const path of network.paths) {
    for (const p of path) {
      const r = Math.hypot(p.x - cx, p.y - cy) / maxR; // 0 centre, 1 corner
      const boost = boostFloor + (centerBoost - boostFloor) * (1 - r);
      p.w *= boost;
    }
  }

  return network;
}
