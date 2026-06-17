import { pointAtLength } from "../lightning/geometry.js";
import { PLASMA_BOLT_STYLE } from "../../webgl/plasmaBoltStyle.js";

export const PATH_REVEAL = {
  radiusByDepth: [
    PLASMA_BOLT_STYLE.revealRadius * 0.68,
    PLASMA_BOLT_STYLE.revealRadius * 0.52,
    PLASMA_BOLT_STYLE.revealRadius * 0.38,
  ],
  glowBlurMax: 2.8,
};

function revealWidth(depth, progress) {
  const d = Math.min(depth ?? 0, PATH_REVEAL.radiusByDepth.length - 1);
  const base = PATH_REVEAL.radiusByDepth[d];
  const t = Math.max(0, Math.min(1, progress));
  const scale = 0.38 + 0.62 * t ** 1.15;
  return base * scale;
}

function glowForProgress(progress) {
  const t = Math.max(0, Math.min(1, progress));
  return PATH_REVEAL.glowBlurMax * (0.45 + 0.55 * t);
}

/** Reveal plasma along a growing path — soft glow swath for visible caustics under screen blend. */
export function strokePartialReveal(ctx, points, cumLengths, drawLength, depth, progress) {
  if (drawLength <= 0 || points.length < 2) return;

  const tip = pointAtLength(points, cumLengths, drawLength);
  const width = revealWidth(depth, progress);

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
  ctx.lineWidth = Math.max(1.4, width * 0.48);
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
