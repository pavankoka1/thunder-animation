/** Outer neon border shader — edit here to tune reveal, widths, flame, colours. */
export const OUTER_CONFIG = {
  coreWidth: 3.0,
  midWidth: 8.0,
  haloWidth: 16.0,

  flameOutreach: 15.0,
  freqAlong: 26.0,
  freqAcross: 26.0,
  flameScroll: 0.35,
  flicker: 3.2,
  innerRaggedFreq: 44.0,
  topBias: 0.25,

  coreColor: [1.0, 0.96, 1.0],
  midColor: [1.0, 0.2, 0.84],
  haloColor: [0.88, 0.11, 0.71],
  coreIntensity: 1.0,
  midIntensity: 1.0,
  haloIntensity: 0.9,

  tailLength: 0.3,
  headBoost: 1.9,
  formationMs: 1000,
  easing: "easeInOut",
  heartbeat: 0.18,
};
