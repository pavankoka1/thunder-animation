/**
 * Inner electric-voronoi plasma — lightning field matching the reference
 * "energy inside active spot" video: dark purple voids, bright glowing filament
 * veins along the cell boundaries, radiant star-burst nodes where veins meet,
 * plus fine crackle. Colours are shared by every betspot (see themes.js).
 */
export const PLASMA_CONFIG = {
  timeScale: 1.0,
  seedSpeed: 0.4,
  seedDrift: 0.5,
  warpSpeed: 0.035,
  warpAmount: 1.7,

  // Larger cells → bulbous plasma voids like the reference.
  cellScaleX: 10.0,
  cellScaleY: 5.0,
  boltWidth: 0.16, // glowing veins (not hairline cracks)
  boltSharp: 2.2, // softer falloff → glow around the vein
  boltVary: 0.5,

  // Two branch layers at different scales/rotations so twigs shoot off the
  // main veins at varied angles — matches the denser fractal look of the
  // reference lightning image (many branches, not just thicker veins).
  branchStrength: 1.3, // radiating filaments off the veins
  branchScale: 10.0,
  branchSharp: 3.2,
  branch2Strength: 0.85, // finer secondary twigs, rotated ~43deg
  branch2Scale: 16.0,
  branch2Sharp: 3.0,

  filStrength: 0.9,
  filScale: 3.4,
  filLo: 0.44,
  filHi: 0.95,

  crispWidth: 0.03, // white-hot vein core
  crispIntensity: 1.1,

  nodeSize: 0.5, // more + bigger radiant star-burst nodes where cells meet
  nodeSharp: 1.5,
  nodeIntensity: 3.2,
  cloudScale: 1.6,
  cloudAmount: 0.55,

  // Purple plasma with white-hot veins (shared across all betspots).
  baseColor: [0.42, 0.14, 0.72],
  haloColor: [0.7, 0.4, 1.0],
  coreColor: [1.0, 0.98, 1.0],
  baseIntensity: 0.35, // darker voids → higher contrast veins
  haloIntensity: 1.6,
  coreIntensity: 1.3,
  coreThreshold: 0.45,

  edgeRadius: 0.74,
  edgeSoftness: 1.08,

  // ---- reveal timing ----
  // Measured from the reference clip: inner energy starts fading in ~90ms
  // after activation (just after the Phase A scale settles) and reaches full
  // opacity over ~400ms with an ease-out curve.
  /** Inner opacity ramp duration (ms). */
  formationMs: 600,
  /** Delay after activation before the inner ramp begins (ms). */
  delayMs: 300,
  /** Easing for the opacity ramp. */
  easing: "easeOut",
};
