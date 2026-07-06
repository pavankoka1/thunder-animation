/**
 * Shared choreography for the Analyse betspot, timed from frame-by-frame
 * measurement of `Pachinko UI Animation SuperBall_1 1.mov`. All phases are
 * triggered together the moment `revealed` flips true — no vibration:
 *
 *   Phase A — scale IN -> OUT -> settle : starts t=0,    ~350ms (CSS transform)
 *   Phase A — glow (pill + whole body)  : starts t=0,    rise/hold/decay below
 *   Phase B — inner energy 0 -> 1       : starts t=90ms, ~400ms (WebGL shader u_opacity, ease-out)
 *   Phase C — outer clockwise crawl     : starts t=0,    ~350ms (WebGL shader u_reveal, ease-in-out)
 */
export const ANIMATION = {
  /** Canvas target opacity once energy is active (fade is a real CSS transition, see AnalysePage.css). */
  energyOpacity: 1,

  /**
   * Phase A: the betspot scales IN (compresses), then OUT (overshoots past
   * 100%), then settles just under full size. Measured from the reference
   * clip (chip diameter dipped to ~95%, overshot to ~101.5%, settled ~95%).
   * No vibration/shake.
   */
  scale: {
    durationMs: 500,
    /** cubic-bezier for the in/out/settle motion. */
    easing: "cubic-bezier(0.22, 1, 0.36, 1)",
  },

  /**
   * Glow — applied to BOTH the top-centre pill and the whole betspot body (a
   * soft ambient magenta bloom radiating past the card edges, separate from
   * the crisp WebGL outer-border crawl). Measured from the reference clip:
   * the glow rises with the scale/crawl, keeps building while the outer
   * energy is "charging", then relaxes to a calmer resting brightness once
   * the outer energy is done (~1.8s after activation) and stays there.
   *
   * NOTE: the keyframe stop percentages in AnalysePage.css (17% / 87%) are
   * derived from these three values (350 / 1450 / 280 -> total 2080ms). If
   * you change riseMs/holdMs/decayMs here, recompute those percentages too.
   */
  glow: {
    riseMs: 350,
    holdMs: 1450,
    decayMs: 280,
    /** Easing for the rise into peak brightness. */
    riseEasing: "cubic-bezier(0.16, 1, 0.3, 1)",
    /** Easing for the decay down to resting brightness. */
    decayEasing: "ease-in-out",
  },
};
