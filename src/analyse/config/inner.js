/**
 * Inner plasma — the ORIGINAL electric-plasma treatment (dark purple voids,
 * bright glowing veins, white-hot cores, radiant star-burst nodes, cloud base,
 * slow flowing warp) applied to the NEW path NETWORK traced from the neural
 * reference image (public/analyse/neural-reference.jpg). The shader reads the
 * bolt/node/crisp fields from the image so the paths are the hub-and-spoke web;
 * every colour/texture/motion knob below is the original plasma's, unchanged.
 * Colours are shared by every betspot (see themes.js).
 */
export const PLASMA_CONFIG = {
  timeScale: 1.0,

  // ---- traced network source ----
  // texZoom < 1 pulls into the image centre (trims corner bursts + watermark);
  // the crop keeps the image aspect so the network isn't stretched.
  // Bake fills the whole body (path field is authored at body aspect), so no
  // crop is needed — keep 1.0 (drop below 1 only to hide a watermark).
  texZoom: 1.0,

  // ---- clean baked path field (connected veins + hub blobs) ----
  // The field is now the CLEAN baked graph, not the raw JPG. A sharp LOD reads
  // the veins; a blurred LOD's broad glow is lightly subtracted (deLump) to
  // keep hubs from blooming. Values are gentle since the field is already clean.
  lodSharp: 1, // vein LOD (0 = crisp, full-res; higher = softer veins)
  lodBlur: 2.0, // broad-glow LOD for the de-bloom reference
  deLump: 0.1, // OFF — extraction is now bold/clean, don't subtract the hub away
  boltLo: 0.02, // vein glow floor
  boltHi: 0.5, // vein glow ceiling
  nodeLo: 0.01, // hub node fires only at the brightest hubs (not minor crossings)
  nodeSharp: 2.0, // node falloff
  crispLo: 0.1, // white-hot core threshold
  crispIntensity: 1.1, // white-hot vein core (original)

  // ---- baked path geometry (read by the CPU bake, NOT the shader) ----
  // The paths are strokes drawn once at load in src/analyse/gl/bakeNeuralField.js,
  // so these only apply on a full reload (not live shader tweaks). Defaults = 1.
  pathWidth: 0.65, // multiplier on vein/branch stroke THICKNESS (↑ = thicker paths)
  branchDensity: 0.35, // multiplier on branch-twig COUNT (↓ = fewer paths / sparser)

  // ---- outward energy pulse (gentle; energy reads as flowing from the hub) ----
  flow: 1.0, // outward travel speed
  flowFreq: 10.0, // pulse ring frequency
  flowAmt: 0.1, // pulse depth (gentle)

  // ---- flowing movement ----
  // Original warpAmount (1.7) was tuned for thick Voronoi cells; on thin baked
  // lines that melts them into marble, so use a gentler flow that undulates the
  // paths without smearing them.
  warpSpeed: 0.2, // domain-warp flow speed
  warpAmount: 0.6, // domain-warp depth (gentle — keeps lines readable)

  // Star-burst nodes + procedural cloud base texture (original).
  nodeIntensity: 1.1,
  cloudScale: 1.6,
  cloudAmount: 0.55,

  // Purple plasma with white-hot veins (shared across all betspots).
  baseColor: [0.42, 0.14, 0.72],
  haloColor: [0.7, 0.4, 1.0],
  coreColor: [1.0, 0.98, 1.0],
  baseIntensity: 0.35, // darker voids → higher contrast veins
  haloIntensity: 2.8,
  coreIntensity: 1.3,
  coreThreshold: 0.45,

  edgeRadius: 5,
  edgeSoftness: 3,

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
