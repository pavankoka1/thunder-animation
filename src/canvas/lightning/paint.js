import { clipBetspot } from "../betspotGeometry.js";
import { SVG_FRAME } from "../svgRenderer.js";
import { pointAtLength } from "./geometry.js";
import { segmentDrawLength } from "./generate.js";

const GLOW_LAYERS = [
  { width: 5.5, alpha: 0.12, color: "rgba(160, 90, 255, 0.9)" },
  { width: 3.2, alpha: 0.22, color: "rgba(120, 220, 255, 0.95)" },
  { width: 1.4, alpha: 0.85, color: "rgba(240, 250, 255, 1)" },
];

function strokePartial(ctx, points, cumLengths, drawLength) {
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

/**
 * Paint procedural lightning at `progress` ∈ [0, 1].
 * Trunk extends first; branches grow once the trunk reaches their spawn point.
 */
export function paintLightning(ctx, tree, progress) {
  ctx.clearRect(0, 0, SVG_FRAME.width, SVG_FRAME.height);
  if (progress <= 0) return;

  ctx.save();
  clipBetspot(ctx);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.globalCompositeOperation = "source-over";

  const ordered = [...tree.segments].sort((a, b) => a.depth - b.depth);

  for (const layer of GLOW_LAYERS) {
    ctx.globalAlpha = layer.alpha;
    ctx.strokeStyle = layer.color;
    ctx.lineWidth = layer.width;

    for (const segment of ordered) {
      const drawLen = segmentDrawLength(segment, progress);
      strokePartial(ctx, segment.points, segment.cumLengths, drawLen);
    }
  }

  ctx.restore();
}

/** Debug: thin paths only (useful while tuning generator). */
export function paintLightningPaths(ctx, tree, progress) {
  ctx.clearRect(0, 0, SVG_FRAME.width, SVG_FRAME.height);
  if (progress <= 0) return;

  ctx.save();
  clipBetspot(ctx);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = "rgba(140, 240, 255, 0.9)";
  ctx.lineWidth = 0.6;
  ctx.globalAlpha = 0.9;

  for (const segment of tree.segments) {
    const drawLen = segmentDrawLength(segment, progress);
    strokePartial(ctx, segment.points, segment.cumLengths, drawLen);
  }

  ctx.restore();
}
