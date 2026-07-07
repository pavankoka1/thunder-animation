/**
 * Inner plasma — a PROCEDURAL Voronoi/Worley cellular-crack vein field (see
 * gl/shaders.js worley3()), tuned by Python pixel analysis of
 * public/analyse/reference.png and public/analyse/inner-energy.png:
 * skeletonising + distance-transforming the extracted vein masks showed
 * ~20% coverage, median stroke ~1-1.5 design px (up to ~3-6px at multi-cell
 * junctions), and — the key finding — FULL edge-to-edge coverage with NO
 * open gaps. That ruled out the previous "traced neural photo + hub-burst
 * clipping" approach (which left large open areas between isolated bursts,
 * not present in the reference) in favour of a cellular crack field, which
 * covers 100% of the card by construction and reproduces the measured
 * thickness/coverage almost exactly (see docs in shaders.js). Colours are
 * shared by every betspot (see themes.js).
 */
export const PLASMA_CONFIG = {
  timeScale: 1.0,

  // ---- procedural Voronoi/Worley cellular-crack vein field ----
  // crackScale = Voronoi cell density (x,y) — 10x5 matches BOTH the original
  // warp's cell grid AND the best-fit to the measured coverage/thickness
  // stats (Python: cellScale=(10,5), threshold@20th-pct → coverage 20.0%,
  // thickness mean 1.56 design px vs reference's measured 1.58/20.0%).
  crackScale: [10, 5],
  // F2-F1 threshold (Worley "edge" distance, cell-grid units): controls vein
  // thickness/coverage. 0.08 was picked by rendering this exact pipeline in
  // Python and re-running the same skeletonise+distance-transform analysis
  // used on reference.png: thickness mean 1.57 design px vs reference's
  // measured 1.57 (matched to 2 decimal places).
  crackWidth: 0.08,
  // Multiplier on crackWidth for the (F3-F1) triple-junction glow radius —
  // where 3 cells meet, giving the reference's occasional brighter/thicker
  // convergence spots (a natural side-effect of the cellular field, not a
  // separately-placed hub).
  junctionWidthMul: 1.6,
  boltLo: 0.0, // extra contrast shaping on the crack mask (0 = no floor cut)
  boltHi: 1.0,
  nodeLo: 0.2, // triple-junction glow floor
  nodeSharp: 2.0, // node falloff
  // Threshold ON the crack field itself (0..1, same scale as bolt) — picks
  // out only the deepest/brightest part of each vein's cross-section as a
  // white-hot hairline core, matching the reference's bright-white centre
  // fading to a softer cyan halo at each vein's edges.
  crispLo: 0.55,
  crispIntensity: 1.1,

  // ---- outward energy pulse (gentle; energy reads as flowing from the hub) ----
  flow: 1.0, // outward travel speed
  flowFreq: 10.0, // pulse ring frequency
  flowAmt: 0.1, // pulse depth (gentle)

  // ---- flowing movement ----
  // Warps the sample coordinate fed into the crack field (see worley3() in
  // shaders.js) so the whole web breathes/undulates over time instead of
  // sitting on dead-straight Voronoi edges. Also the main knob for organic
  // irregularity: reference.png/inner-energy.png have noticeably irregular
  // cell sizes/curvy boundaries, not clean polygons — 1.4 (Python-rendered
  // + visually compared) matches that "cracked ice" look while staying
  // readable; much higher starts pinching off little closed loops.
  warpSpeed: 0.2, // domain-warp flow speed
  warpAmount: 1.4, // domain-warp depth (organic cell-boundary irregularity)

  // Star-burst nodes + procedural cloud base texture (original).
  nodeIntensity: 1.1,
  cloudScale: 1.6,
  cloudAmount: 0.55,

  // Palette sampled from reference.png body pixels (712×424):
  //   void gaps  #214c75  hue ~209° — dark blue-teal between veins
  //   veins      #b5e2f8  hue ~200° — bright cyan-white filaments
  // Void darkness is mostly the CSS body showing through screen blend — keep
  // baseIntensity low so gaps stay dark; veins carry the cyan highlight.
  baseColor: [0.13, 0.30, 0.46],
  haloColor: [0.71, 0.89, 0.97],
  coreColor: [1.0, 0.98, 1.0],
  baseIntensity: 0.18,
  haloIntensity: 1.8,
  coreIntensity: 1.2,
  coreThreshold: 0.45,

  edgeRadius: 5,
  edgeSoftness: 3,

  // ---- reveal timing ----
  // Measured from the reference clip: inner energy starts fading in ~90ms
  // after activation (just after the Phase A scale settles) and reaches full
  // opacity over ~400ms with an ease-out curve.
  /** Inner opacity ramp duration (ms). */
  formationMs: 800,
  /** Delay after activation before the inner ramp begins (ms). */
  delayMs: 300,
  /** Easing for the opacity ramp. */
  easing: "easeOut",
};
