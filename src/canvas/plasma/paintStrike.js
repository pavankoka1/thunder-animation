import { BETSPOT_CLIP, clipBetspot, roundedRectPath, THUNDER_ORIGIN } from "../betspotGeometry.js";
import { SVG_FRAME } from "../frame.js";
import { paintPlasmaPatternLayer } from "../plasmaPattern.js";
import {
  betspotFillBlend,
  boltGrowthProgress,
  computePathCompletion,
} from "./extractArtPaths.js";
import {
  OUTWARD_MAX_DIST,
  outwardReachFront,
  segmentDrawLengthOutward,
} from "./outwardSpread.js";
import { paintCausticAlongPaths, paintCenterCausticBulk } from "./skeletonMask.js";
import { strokeDebugPath, strokePartialReveal } from "./strikeMask.js";

let maskCanvas;
let maskCtx;
let pathMaskCanvas;
let pathMaskCtx;

function getMaskSurface() {
  if (!maskCanvas) {
    maskCanvas = document.createElement("canvas");
    maskCanvas.width = SVG_FRAME.width;
    maskCanvas.height = SVG_FRAME.height;
    maskCtx = maskCanvas.getContext("2d");
  }
  return { maskCanvas, maskCtx };
}

function getPathMaskSurface() {
  if (!pathMaskCanvas) {
    pathMaskCanvas = document.createElement("canvas");
    pathMaskCanvas.width = SVG_FRAME.width;
    pathMaskCanvas.height = SVG_FRAME.height;
    pathMaskCtx = pathMaskCanvas.getContext("2d");
  }
  return { maskCanvas: pathMaskCanvas, maskCtx: pathMaskCtx };
}

function orderedSegments(tree) {
  return tree.segmentsByDepth ?? tree.segments;
}

/** Opaque white core — guarantees full-strength plasma at chip on first frames. */
function paintSolidCenterCore(mctx, origin, progress) {
  const p = Math.max(0, Math.min(1, progress));
  const r = 10 + p * 12;

  mctx.save();
  roundedRectPath(mctx, BETSPOT_CLIP);
  mctx.clip();

  const g = mctx.createRadialGradient(origin.x, origin.y, 0, origin.x, origin.y, r);
  g.addColorStop(0, "#fff");
  g.addColorStop(0.75, "#fff");
  g.addColorStop(1, "rgba(255,255,255,0)");
  mctx.fillStyle = g;
  mctx.fillRect(BETSPOT_CLIP.x, BETSPOT_CLIP.y, BETSPOT_CLIP.width, BETSPOT_CLIP.height);
  mctx.restore();
}

function paintPathMask(tree, progress, boltT, origin) {
  const { maskCanvas: pmc, maskCtx: pmctx } = getPathMaskSurface();
  pmctx.clearRect(0, 0, SVG_FRAME.width, SVG_FRAME.height);

  pmctx.save();
  pmctx.lineCap = "round";
  pmctx.lineJoin = "round";
  pmctx.strokeStyle = "#fff";

  for (const segment of orderedSegments(tree)) {
    const drawLen = segmentDrawLengthOutward(segment, boltT, progress, origin);
    if (drawLen <= 0) continue;
    strokePartialReveal(
      pmctx,
      segment.points,
      segment.cumLengths,
      drawLen,
      segment.depth ?? 0,
      progress
    );
  }

  pmctx.restore();
  return pmc;
}

/** Mask: center caustic bulk → paths → caustic spread → edge fill. */
function paintMask(tree, progress) {
  const { maskCanvas: mc, maskCtx: mctx } = getMaskSurface();

  mctx.clearRect(0, 0, SVG_FRAME.width, SVG_FRAME.height);
  if (progress <= 0) return mc;

  const origin = tree.origin ?? THUNDER_ORIGIN;
  const boltT = boltGrowthProgress(progress);
  const pathCompletion = computePathCompletion(tree.segments, boltT);
  const fillBlend = betspotFillBlend(progress, pathCompletion);

  paintSolidCenterCore(mctx, origin, progress);
  paintCenterCausticBulk(mctx, tree, progress);

  const pathMask = paintPathMask(tree, progress, boltT, origin);
  mctx.drawImage(pathMask, 0, 0);

  paintCausticAlongPaths(mctx, pathMask, tree, progress, pathCompletion);

  if (fillBlend > 0.001) {
    mctx.save();
    roundedRectPath(mctx, BETSPOT_CLIP);
    mctx.clip();

    const front = outwardReachFront(progress);
    const fill = mctx.createRadialGradient(
      origin.x,
      origin.y,
      front * 0.2,
      origin.x,
      origin.y,
      OUTWARD_MAX_DIST
    );
    fill.addColorStop(0, `rgba(255,255,255,${fillBlend * 0.55})`);
    fill.addColorStop(0.55, `rgba(255,255,255,${fillBlend * 0.82})`);
    fill.addColorStop(1, `rgba(255,255,255,${fillBlend})`);
    mctx.fillStyle = fill;
    mctx.fillRect(BETSPOT_CLIP.x, BETSPOT_CLIP.y, BETSPOT_CLIP.width, BETSPOT_CLIP.height);
    mctx.restore();
  }

  return mc;
}

/** Full static plasma — matches reference composite. */
export function paintPlasmaStatic(ctx, plasmaLayer) {
  if (!plasmaLayer?.naturalWidth) return;
  paintPlasmaPatternLayer(ctx, plasmaLayer);
}

/**
 * Reveal plasma by extending trunks + branches outward from center bulk.
 * progress = 1 matches Show pattern exactly.
 */
export function paintPlasmaStrike(ctx, plasmaLayer, tree, progress) {
  const { width, height } = SVG_FRAME;
  ctx.clearRect(0, 0, width, height);

  if (!plasmaLayer?.naturalWidth) return;
  if (progress <= 0) return;

  if (!tree?.segments?.length || progress >= 1) {
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
  const origin = tree.origin ?? THUNDER_ORIGIN;

  ctx.save();
  clipBetspot(ctx);
  ctx.globalCompositeOperation = "source-over";
  ctx.strokeStyle = "rgba(120, 255, 220, 0.85)";
  ctx.lineWidth = 0.35;
  ctx.lineCap = "round";

  for (const segment of orderedSegments(tree)) {
    const drawLen = segmentDrawLengthOutward(segment, boltT, progress, origin);
    if (drawLen <= 0) continue;
    strokeDebugPath(ctx, segment.points, segment.cumLengths, drawLen);
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
