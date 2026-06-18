import { pointAtLength } from "../lightning/geometry.js";
import { PLASMA_BOLT_STYLE } from "../../webgl/plasmaBoltStyle.js";

export const PATH_REVEAL = {
  // Hairline crack — uniform thin width for every bolt and fork.
  uniformWidth: 0.55,
  glowBlurMax: 0.7,
};

function revealWidth() {
  return PATH_REVEAL.uniformWidth;
}

function glowForProgress(progress) {
  const t = Math.max(0, Math.min(1, progress));
  // Tight halo throughout — slight attack boost at strike onset, no big
  // soft cloud that reads as "frost".
  const attack = 1 - Math.min(1, t * 3.5);
  return PATH_REVEAL.glowBlurMax * (0.5 + 0.4 * t) + attack * 1.0;
}

/** Reveal plasma along a growing path — uniform thin lightning swath. */
export function strokePartialReveal(ctx, points, cumLengths, drawLength, _depth, progress) {
  if (drawLength <= 0 || points.length < 2) return;

  const tip = pointAtLength(points, cumLengths, drawLength);
  const width = revealWidth();

  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i += 1) {
    if (cumLengths[i] <= drawLength) {
      ctx.lineTo(points[i].x, points[i].y);
    } else {
      ctx.lineTo(tip.x, tip.y);
      break;
    }
  }

  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = "#fff";
  ctx.shadowColor = "#fff";
  ctx.shadowBlur = glowForProgress(progress);
  ctx.lineWidth = width;
  ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.lineWidth = Math.max(0.28, width * 0.38);
  ctx.stroke();
  ctx.restore();
}

/** Thin debug stroke for path overlay. */
export function strokeDebugPath(ctx, points, cumLengths, drawLength) {
  if (drawLength <= 0 || points.length < 2) return;

  const tip = pointAtLength(points, cumLengths, drawLength);

  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i += 1) {
    if (cumLengths[i] <= drawLength) {
      ctx.lineTo(points[i].x, points[i].y);
    } else {
      ctx.lineTo(tip.x, tip.y);
      break;
    }
  }

  ctx.stroke();
}
