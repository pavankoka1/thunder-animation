/**
 * Plasma thunder — measured from plasma.svg raster @ 84×68.
 * Pale core runs: median 1px wide; glow: purple (184, 88, 227).
 */
export const PLASMA_BOLT_STYLE = {
  /** Hair-thin pale lavender-white core */
  core: [210 / 255, 109 / 255, 245 / 255],
  /** Body glow on the filament */
  glow: [184 / 255, 88 / 255, 227 / 255],
  /** Soft outer halo */
  outer: [128 / 255, 52 / 255, 172 / 255],
  /** plasma.svg <g opacity="0.6"> */
  layerOpacity: 0.6,
  coreAlpha: 0.82,
  glowAlpha: 0.11,
  outerAlpha: 0.045,
  /** Falloff scales in viewBox pixels (84 wide) */
  coreFalloff: 0.32,
  glowSigma: 0.48,
  outerSigma: 0.72,
  /**
   * How far (viewBox units) around each revealed bolt segment the plasma
   * texture fills in.  8 vb-units × scale(4) = 32 px on the 336-wide canvas.
   */
  revealRadius: 8.0,
};

export const SVG_REF_SIZE = 84;
