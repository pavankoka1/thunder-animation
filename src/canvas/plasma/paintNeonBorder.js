/**
 * Bright neon-pink border around the betspot — matches the chip-video
 * reference (`MicrosoftTeams-video (1).mp4`).
 *
 * Frame-by-frame inspection: the border is a bright magenta/pink core
 * stroke with a wide outer halo and a near-white hot inner highlight, and
 * a subtle brightness heartbeat (~1.2 s).
 *
 * Ramp behaviour (user req #2): the border must already be visibly lit
 * DURING the vibration, not only after formation. We ramp its alpha
 * against the first ~17% of the formation curve so it reaches full
 * brightness ~250 ms into the vibration. The inner energy still fades in
 * over the full 1500 ms — the border is just much faster.
 */

import { BETSPOT_CLIP, roundedRectPath } from "../betspotGeometry.js";

const HEARTBEAT_MS = 1200;

export function borderPulse(timeMs) {
  const phase = (timeMs % HEARTBEAT_MS) / HEARTBEAT_MS;
  return 0.88 + Math.sin(phase * Math.PI * 2) ** 2 * 0.12;
}

/** Wider outer-halo bleed in viewBox units (used to size the rim canvas). */
export const BORDER_BLEED = 4.5;

/** Sharp early ramp so the border lights up during vibration. */
function borderRamp(formation) {
  return Math.max(0, Math.min(1, formation / 0.17));
}

/**
 * Neon-pink rim with magenta halo and white core hairline.
 *
 * @param {CanvasRenderingContext2D} ctx — viewBox-space transform
 * @param {number} formation — 0…1 fade from `formationProgress`
 * @param {number} timeMs — animation clock for the heartbeat
 */
export function paintNeonBorder(ctx, formation, timeMs = 0) {
  if (formation <= 0) return;

  const ramp = borderRamp(formation);
  if (ramp <= 0) return;

  const fullyRamped = ramp >= 0.999;
  const pulse = fullyRamped ? borderPulse(timeMs) : 1.0;
  const alpha = ramp * pulse;

  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  // ---- 1. Wide outer halo (two blurred magenta passes) ------------------
  roundedRectPath(ctx, BETSPOT_CLIP);
  ctx.filter = "blur(3.2px)";
  ctx.strokeStyle = `rgba(255, 80, 200, ${0.50 * alpha})`;
  ctx.lineWidth = 4.0;
  ctx.stroke();

  ctx.filter = "blur(2.0px)";
  ctx.strokeStyle = `rgba(255, 120, 220, ${0.75 * alpha})`;
  ctx.lineWidth = 2.6;
  ctx.stroke();

  // ---- 2. Bright pink mid-stroke ----------------------------------------
  ctx.filter = "blur(0.6px)";
  ctx.strokeStyle = `rgba(255, 175, 235, ${0.95 * alpha})`;
  ctx.lineWidth = 1.25;
  ctx.stroke();

  // ---- 3. Hot white core line (neon "tube" highlight) -------------------
  ctx.filter = "none";
  ctx.strokeStyle = `rgba(255, 252, 254, ${0.95 * alpha})`;
  ctx.lineWidth = 0.55;
  ctx.stroke();

  ctx.restore();
}
