/** Shared choreography — shake envelope, canvas visibility. */

export const ANIMATION = {
  /** Canvas opacity when energy is revealed (fade-in is shader u_opacity). */
  energyOpacity: 1,
  /** Shake amplitude multiplier (see betspotShake.js). */
  shakeStrength: 3.4,
  /** Fraction of formationMs spent ramping shake in. */
  shakeAttack: 0.08,
};
