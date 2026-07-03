/**
 * Betspot outer rim — neon border formation + heartbeat (outer fringe disabled).
 */

import { BETSPOT_FRAME, roundedRectPath } from "../betspotGeometry.js";
// Outer electric fringe — disabled until outer spread is reworked.
// import { paintElectricFringe, FRINGE_MAX_OUTREACH } from "./paintElectricFringe.js";

const HEARTBEAT_PERIOD_MS = 1000;
const HEARTBEAT_ATTACK = 0.13;
const HEARTBEAT_BASE = 0.38;

/** Rim canvas bleed (no fringe outreach while outer energy is off). */
export const RIM_BLEED = 1.2;

export function rimHeartbeatEnvelope(timeMs) {
  const phase = (timeMs % HEARTBEAT_PERIOD_MS) / HEARTBEAT_PERIOD_MS;
  const base = HEARTBEAT_BASE;
  const peak = 1.0;
  if (phase < HEARTBEAT_ATTACK) {
    const p = phase / HEARTBEAT_ATTACK;
    const rise = 1 - (1 - p) ** 2.6;
    return base + (peak - base) * rise;
  }
  const decay = (phase - HEARTBEAT_ATTACK) / (1 - HEARTBEAT_ATTACK);
  return base + (peak - base) * Math.exp(-decay * 3.4);
}

/**
 * Neon border stack — cyan halo, magenta line, white core.
 * Opacity follows formation (0…1) during intro; heartbeat after complete.
 */
function paintNeonBorder(ctx, formation, timeMs) {
  if (formation <= 0) return;

  const formed = formation >= 1;
  const envelope = formed ? rimHeartbeatEnvelope(timeMs) : 1;
  const alpha = formation * envelope;

  roundedRectPath(ctx, BETSPOT_FRAME);

  ctx.filter = "blur(2.4px)";
  ctx.strokeStyle = `rgba(90, 210, 255, ${0.42 * alpha})`;
  ctx.lineWidth = 2.4;
  ctx.stroke();

  ctx.filter = "blur(0.55px)";
  ctx.strokeStyle = `rgba(255, 70, 195, ${0.78 * alpha})`;
  ctx.lineWidth = 1.15;
  ctx.stroke();

  ctx.filter = "none";
  ctx.strokeStyle = `rgba(255, 255, 255, ${0.92 * alpha})`;
  ctx.lineWidth = 0.48;
  ctx.stroke();
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} formation — 0…1 intro opacity (synced with inner energy)
 * @param {number} [timeMs] — wall-clock for post-formation heartbeat
 */
export function paintEdgeRim(ctx, formation = 1, timeMs = 0) {
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.globalCompositeOperation = "lighter";

  // paintElectricFringe(ctx, sweepElapsedMs, envelope);

  paintNeonBorder(ctx, formation, timeMs);

  ctx.filter = "none";
  ctx.restore();
}
