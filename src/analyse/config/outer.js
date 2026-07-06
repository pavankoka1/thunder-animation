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

  // Small bright flecks/bumps poking outward from the border, rendered as
  // their OWN independent additive layer — completely separate from the
  // core/mid/halo bands above (see OUTER_FRAG: this used to be baked into
  // the core/mid distance fields, which made every spike peak jump to the
  // main band's brightest point and broke the flow of the main energy with
  // sudden pops; now it's a thin glowing shell added on top that never
  // touches d/dEff/core/mid/halo, so the main flow is untouched no matter
  // how these values are tuned). spikeFreq controls how many flecks fit
  // around the perimeter; spikeAmount is how far they poke out and
  // spikeWidth is how thin/fat each fleck's glow shell is (both in the same
  // px-ish units as coreWidth/midWidth/haloWidth). Ridge noise keeps them
  // pointed rather than rolling bumps. IMPORTANT: comparing the reference
  // sprite frames (32/35/39/44) shows each spike's POSITION is frozen —
  // only its brightness shimmers. spikeSpeed must only drive that in-place
  // shimmer, never a domain scroll (a scroll makes the whole ring look like
  // a moving stream, not spikes).
  spikeFreq: 1,
  spikeAmount: 10.0,
  spikeWidth: 2.0, // thickness of each fleck's glow shell
  spikeSharpness: 1.8, // lower = fatter triangular teeth, higher = thin needles
  spikeSpeed: 1.2, // how fast each spike shimmers in place (NOT a travel speed)
  spikeGlow: 0.6, // brightness of each spike fleck

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
