/**
 * paintChipBorder — pulsing pink/magenta glow ring around the chip.
 *
 * Matches the energetic "bright border on the balls" detail from the
 * MicrosoftTeams-video (1).mp4 reference: the orange chip sits on top of
 * the inner plasma, with a magenta-pink corona that pulses in brightness
 * along with the inner energy.
 *
 * The chip art itself lives inside the betspot-overlay.svg (a static image
 * we don't modify). We draw the corona on the canvas BELOW the overlay so
 * the chip face stays crisp; the corona ring extends a few px around the
 * chip's outer edge.
 */

import { THUNDER_ORIGIN } from "../betspotGeometry.js";

/**
 * Chip footprint in viewBox coords. The overlay svg is fixed-size at the
 * stage; eyeballed from a /betspot-activation render, the chip is centred
 * on `THUNDER_ORIGIN` with radius ≈ 9.5 viewBox units (= 57 CSS px at our
 * 6× DISPLAY_SCALE).
 */
const CHIP_CENTRE_VB = { x: THUNDER_ORIGIN.x, y: THUNDER_ORIGIN.y };
const CHIP_RADIUS_VB = 10.5;

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} timeMs — animation time in ms (same clock as plasma motion)
 * @param {number} alpha — overall opacity multiplier (caller's fade)
 */
export function paintChipBorder(ctx, timeMs, alpha = 1) {
  if (alpha <= 0) return;

  // Two-frequency pulse — same shape as the plasma shimmer so the chip's
  // glow visibly syncs with the inner energy crackle without locking to a
  // mechanical heartbeat.
  const t = timeMs * 0.001;
  const pulse = 0.55 + 0.30 * Math.sin(t * 2.1) + 0.18 * Math.sin(t * 4.7 + 0.7);
  const eased = Math.max(0.15, Math.min(1, pulse));

  const cx = CHIP_CENTRE_VB.x;
  const cy = CHIP_CENTRE_VB.y;
  const r0 = CHIP_RADIUS_VB - 0.2;  // inner edge of corona — just outside chip rim
  const r1 = CHIP_RADIUS_VB + 4.2;  // wider outer falloff for a visible halo

  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.globalAlpha = alpha;

  // Wide soft halo — magenta corona around the chip.
  const halo = ctx.createRadialGradient(cx, cy, r0, cx, cy, r1);
  halo.addColorStop(0,    `rgba(255, 130, 210, ${0.95 * eased})`);
  halo.addColorStop(0.35, `rgba(255, 90, 185, ${0.55 * eased})`);
  halo.addColorStop(0.7,  `rgba(255, 70, 170, ${0.25 * eased})`);
  halo.addColorStop(1,    `rgba(255, 60, 165, 0)`);
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(cx, cy, r1, 0, Math.PI * 2);
  ctx.fill();

  // Tight bright ring — punches a brighter line right at the chip's edge.
  const ringInner = CHIP_RADIUS_VB - 0.05;
  const ringOuter = CHIP_RADIUS_VB + 0.9;
  const ring = ctx.createRadialGradient(cx, cy, ringInner, cx, cy, ringOuter);
  ring.addColorStop(0,    `rgba(255, 220, 240, 0)`);
  ring.addColorStop(0.4,  `rgba(255, 245, 252, ${1.0 * eased})`);
  ring.addColorStop(1,    `rgba(255, 110, 200, 0)`);
  ctx.fillStyle = ring;
  ctx.beginPath();
  ctx.arc(cx, cy, ringOuter, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}
