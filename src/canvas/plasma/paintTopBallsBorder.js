/**
 * Pulsing neon border + drop shadow on the holder pill containing the 5
 * small balls at the top of the betspot.
 *
 * Per the reference (`MicrosoftTeams-video (1).mp4`) the border + shadow
 * sit on the whole holder rectangle, not on each ball individually. The
 * holder is a rounded pill (svg pixel-perfect bounds):
 *
 *   x:21..63 (w=42), y:4..14 (h=10), corner radius = 5
 *
 * Drawn on the FX layer (above overlay) so the magenta corona lands on
 * top of the holder edge and the shadow grounds it visually.
 */

const HOLDER = {
  x: 21,
  y: 4,
  w: 42,
  h: 10,
  r: 5,
};

/** Rounded-rect path matching the holder's svg shape. */
function holderPath(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}

/**
 * @param {CanvasRenderingContext2D} ctx — viewBox-space ctx
 * @param {number} timeMs — animation clock
 * @param {number} alpha — caller's fade
 */
export function paintTopBallsBorder(ctx, timeMs, alpha = 1) {
  if (alpha <= 0) return;

  // Same two-frequency pulse as the chip border + rim so the whole
  // betspot's neon throbs together.
  const t = timeMs * 0.001;
  const pulse = 0.55 + 0.30 * Math.sin(t * 2.1) + 0.18 * Math.sin(t * 4.7 + 0.7);
  const eased = Math.max(0.25, Math.min(1, pulse));

  ctx.save();

  // ---- Drop shadow below the holder (normal blend, dark plum) ---------
  ctx.globalCompositeOperation = "source-over";
  ctx.globalAlpha = alpha * 0.55;
  ctx.shadowColor = "rgba(20, 0, 30, 0.85)";
  ctx.shadowBlur = 4.5;
  ctx.shadowOffsetY = 1.2;
  ctx.fillStyle = "rgba(0, 0, 0, 0.001)";
  holderPath(ctx, HOLDER.x, HOLDER.y, HOLDER.w, HOLDER.h, HOLDER.r);
  ctx.fill();
  ctx.shadowColor = "transparent";
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;

  // ---- Wide outer halo (magenta corona, two blurred passes) -----------
  ctx.globalCompositeOperation = "lighter";

  holderPath(ctx, HOLDER.x, HOLDER.y, HOLDER.w, HOLDER.h, HOLDER.r);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  ctx.filter = "blur(2.6px)";
  ctx.strokeStyle = `rgba(255, 90, 200, ${0.65 * eased * alpha})`;
  ctx.lineWidth = 3.4;
  ctx.stroke();

  ctx.filter = "blur(1.4px)";
  ctx.strokeStyle = `rgba(255, 130, 220, ${0.85 * eased * alpha})`;
  ctx.lineWidth = 1.9;
  ctx.stroke();

  // ---- Bright pink mid-stroke right on the edge -----------------------
  ctx.filter = "blur(0.4px)";
  ctx.strokeStyle = `rgba(255, 180, 240, ${0.95 * eased * alpha})`;
  ctx.lineWidth = 0.9;
  ctx.stroke();

  // ---- Hot white core hairline ---------------------------------------
  ctx.filter = "none";
  ctx.strokeStyle = `rgba(255, 252, 254, ${0.95 * eased * alpha})`;
  ctx.lineWidth = 0.4;
  ctx.stroke();

  ctx.restore();
}
