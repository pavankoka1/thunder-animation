/** Inner electric-voronoi plasma — edit here to tune bolts, nodes, glow, motion. */
export const PLASMA_CONFIG = {
  timeScale: 1.0,
  seedSpeed: 0.45,
  seedDrift: 0.45,
  warpSpeed: 0.03,
  warpAmount: 1.5,

  cellScaleX: 9.5,
  cellScaleY: 6,
  boltWidth: 0.19,
  boltSharp: 2.1,
  boltVary: 0.5,

  branchStrength: 0.8,
  branchScale: 7.0,
  branchSharp: 3.6,

  filStrength: 0.85,
  filScale: 3.4,
  filLo: 0.46,
  filHi: 0.95,

  crispWidth: 0.035,
  crispIntensity: 1.05,

  nodeSize: 0.33,
  nodeSharp: 2.0,
  nodeIntensity: 1.9,
  cloudScale: 1.6,
  cloudAmount: 0.9,

  baseColor: [0.42, 0.14, 0.72],
  haloColor: [0.66, 0.32, 1.0],
  coreColor: [0.98, 0.94, 1.0],
  baseIntensity: 0.5,
  haloIntensity: 1.3,
  coreIntensity: 1.05,
  coreThreshold: 0.5,

  edgeRadius: 0.72,
  edgeSoftness: 1.06,
};
