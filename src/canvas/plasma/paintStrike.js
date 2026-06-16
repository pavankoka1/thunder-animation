import { clipBetspot, roundedRectPath } from "../betspotGeometry.js";
import { SVG_FRAME } from "../frame.js";
import { paintPlasmaPatternLayer } from "../plasmaPattern.js";
import {
  betspotFillBlend,
  boltGrowthProgress,
  segmentDrawLength,
} from "./extractArtPaths.js";
import { pointAtLength } from "../lightning/geometry.js";

let maskCanvas;
let maskCtx;

function getMaskSurface() {
  if (!maskCanvas) {
    maskCanvas = document.createElement("canvas");
    maskCanvas.width = SVG_FRAME.width;
    maskCanvas.height = SVG_FRAME.height;
    maskCtx = maskCanvas.getContext("2d");
  }
  return { maskCanvas, maskCtx };
}

function strokePartial(ctx, points, cumLengths, drawLength, lineWidth) {
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

  ctx.lineWidth = lineWidth;
  ctx.stroke();
}

function paintMask(tree, progress) {
  const { maskCanvas: mc, maskCtx: mctx } = getMaskSurface();
  const { width, height } = SVG_FRAME;

  mctx.clearRect(0, 0, width, height);
  if (progress <= 0) return mc;

  const boltT = boltGrowthProgress(progress);
  const fillBlend = betspotFillBlend(progress);

  mctx.save();
  mctx.lineCap = "round";
  mctx.lineJoin = "round";
  mctx.strokeStyle = "#fff";

  const ordered = [...tree.segments].sort((a, b) => a.depth - b.depth);

  for (const segment of ordered) {
    const drawLen = segmentDrawLength(segment, boltT);
    if (drawLen <= 0) continue;
    strokePartial(mctx, segment.points, segment.cumLengths, drawLen, segment.strokeWidth ?? 2.6);
  }

  if (fillBlend > 0) {
    mctx.globalAlpha = fillBlend;
    mctx.fillStyle = "#fff";
    roundedRectPath(mctx);
    mctx.fill();
    mctx.globalAlpha = 1;
  }

  mctx.restore();
  return mc;
}

/** Full static plasma — matches reference composite. */
export function paintPlasmaStatic(ctx, plasmaLayer) {
  if (!plasmaLayer?.naturalWidth) return;
  paintPlasmaPatternLayer(ctx, plasmaLayer);
}

/**
 * Reveal plasma along a growing bolt tree, then fill the whole betspot.
 */
export function paintPlasmaStrike(ctx, plasmaLayer, tree, progress) {
  const { width, height } = SVG_FRAME;
  ctx.clearRect(0, 0, width, height);

  if (!plasmaLayer?.naturalWidth) return;
  if (progress <= 0) return;

  if (!tree?.segments?.length) {
    paintPlasmaPatternLayer(ctx, plasmaLayer);
    return;
  }

  const mask = paintMask(tree, progress);

  ctx.save();
  clipBetspot(ctx);
  ctx.drawImage(plasmaLayer, 0, 0, width, height);
  ctx.globalCompositeOperation = "destination-in";
  ctx.drawImage(mask, 0, 0, width, height);
  ctx.globalCompositeOperation = "source-over";
  ctx.restore();
}

/** Debug overlay: path skeleton on top of strike. */
export function paintPlasmaPathsDebug(ctx, plasmaLayer, tree, progress) {
  paintPlasmaStrike(ctx, plasmaLayer, tree, progress);

  if (!tree?.segments?.length) return;

  const boltT = boltGrowthProgress(progress);

  ctx.save();
  clipBetspot(ctx);
  ctx.globalCompositeOperation = "source-over";
  ctx.strokeStyle = "rgba(120, 255, 220, 0.85)";
  ctx.lineWidth = 0.5;
  ctx.lineCap = "round";

  for (const segment of tree.segments) {
    const drawLen = segmentDrawLength(segment, boltT);
    strokePartial(ctx, segment.points, segment.cumLengths, drawLen, 0.5);
  }

  if (tree.clusters?.length) {
    ctx.fillStyle = "rgba(255, 220, 80, 0.9)";
    for (const c of tree.clusters) {
      ctx.beginPath();
      ctx.arc(c.x, c.y, 1.2, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  ctx.restore();
}
