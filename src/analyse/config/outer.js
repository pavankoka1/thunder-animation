/**
 * Outer neon border shader — clockwise perimeter reveal with a leading head.
 *
 * Reveal: the outline draws itself clockwise from the top-centre, a bright
 * spark head leading the trail, over formationMs. Once closed it stays lit and
 * settles into a gentle breathing pulse.
 */
export const OUTER_CONFIG = {
  coreWidth: 3.0,
  midWidth: 8.0,
  haloWidth: 16.0,

  flameOutreach: 15.0,
  freqAlong: 26.0,
  freqAcross: 26.0,
  flameScroll: 0.35,
  flicker: 2.2,
  innerRaggedFreq: 44.0,
  topBias: 0.25,

  // Magenta default — themes override to match each body colour.
  coreColor: [1.0, 0.96, 1.0],
  midColor: [1.0, 0.2, 0.84],
  haloColor: [0.88, 0.11, 0.71],
  coreIntensity: 1.0,
  midIntensity: 1.0,
  haloIntensity: 0.9,

  tailLength: 0.3,
  headBoost: 1.9,
  heartbeat: 0.08, // gentle breathing pulse (measured ±5%)

  // Rounded IRREGULAR bumps ("lumps") bulging outward from the border, rendered
  // as their OWN additive shell — completely separate from core/mid/halo, never
  // touching d/dEff (so the main band flow is untouched no matter how these are
  // tuned). lumpCount discrete gaussians (see OUTER_FRAG), each with a
  // hash-jittered centre (irregular spacing), width and height; the whole
  // crown DRIFTS and each lump BREATHES out of sync. Seam-free (wrapped
  // distance in perimeter s). Single-tone glow (core colour only, the inner
  // hot layer) — no outer mid-colour halo blended in further out.
  // Keep lumpWidth small vs the slot spacing (1/lumpCount) so neighbours stay
  // distinct lumps; lumpSoft must stay > 0 or the shell edge goes hard/spiky.
  lumpCount: 16, // number of lumps around the perimeter (density)
  lumpAmount: 12.0, // max outward reach (px) of a unit-height lump
  lumpWidth: 0.01, // half-width of each lump in perimeter fraction (s units)
  lumpSoft: 8, // softness (px) of the shell's outer falloff (>0)
  lumpDrift: 0.03, // drift speed of the whole crown (loops/sec)
  lumpBreath: 5, // breathing angular speed (rad/sec) of lump heights
  lumpJitter: 0.85, // spacing irregularity (0 = even, 1 = ±half-slot)
  lumpGlow: 0.9, // overall additive brightness of the lump layer

  // ---- irregular surface wobble ----
  // Pushes the WHOLE neon outline (crisp core + glow bands) in and out along
  // the perimeter with seam-free, two-octave noise, so the border is an
  // IRREGULAR wavy curve instead of a clean rounded rectangle (see OUTER_FRAG
  // dWob). Set wobbleAmount to 0 to get the old perfectly-smooth outline back.
  wobbleAmount: 4.0, // ± reach of the wobble in px (0 disables)
  wobbleFreq: 6.0, // ~number of undulations around the perimeter (higher = more, finer)
  wobbleSpeed: 0.2, // drift/animation rate of the wobble

  // ---- reveal timing ----
  // Measured from the reference clip: the outer crawl starts in parallel with
  // the Phase A scale/glow (t=0, no lag) and closes the loop in ~350ms. The
  // head's progress along the perimeter must ease-in-out (slow start, fast
  // middle, slow finish) — do not switch this to linear/easeOut.
  /** Clockwise draw duration (ms) — how long the head takes to circle the card. */
  formationMs: 600,
  /** Delay before the border begins drawing (ms). 0 = starts with the scale/glow. */
  delayMs: 300,
  /** Easing for the trace — must stay ease-in-out per the reference clip. */
  easing: "easeInOut",
};
