/** Procedural bolt glow — measured from plasma.svg @ 84×68. */
export const PROCEDURAL_BOLT_STYLE = {
  core: [210 / 255, 109 / 255, 245 / 255],
  glow: [184 / 255, 88 / 255, 227 / 255],
  outer: [128 / 255, 52 / 255, 172 / 255],
  layerOpacity: 0.6,
  coreAlpha: 0.82,
  glowAlpha: 0.11,
  outerAlpha: 0.045,
  coreFalloff: 0.32,
  glowSigma: 0.48,
  outerSigma: 0.72,
  revealRadius: 8.0,
};

/** Art strike overlay — thin electric filament while plasma reveals. */
export const ART_STRIKE_BOLT_STYLE = {
  core: [0.95, 0.99, 1.0],
  glow: [0.7, 0.92, 1.0],
  outer: [0.4, 0.72, 1.0],
  layerOpacity: 0.55,
  coreAlpha: 0.55,
  glowAlpha: 0.06,
  outerAlpha: 0.025,
  coreFalloff: 0.16,
  glowSigma: 0.26,
  outerSigma: 0.42,
  revealRadius: 8.0,
};

/** @deprecated use PROCEDURAL_BOLT_STYLE or ART_STRIKE_BOLT_STYLE */
export const PLASMA_BOLT_STYLE = PROCEDURAL_BOLT_STYLE;

export const SVG_REF_SIZE = 84;
