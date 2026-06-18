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

/** Opaque white core — small chip spark on first frames only. */
function paintSolidCenterCore(mctx, origin, progress) {
  const p = Math.max(0, Math.min(1, progress));
  const r = 5 + p * 7;

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
 * Brief electric flash that rides on top of the masked plasma. Real lightning
 * has an essentially instantaneous attack then a longer fade — modeled here
 * as a sharp ramp to peak in the first ~5% of the timeline, then a smooth
 * decay back to zero by ~p=0.45.
 */
export function thunderFlashStrength(progress) {
  const p = Math.max(0, Math.min(1, progress));
  if (p >= 0.45) return 0;
  if (p <= 0.05) return (p / 0.05) ** 0.7;
  const decay = (p - 0.05) / 0.4;
  return (1 - decay) ** 1.4;
}

function paintThunderFlash(ctx, tree, progress, boltT, origin) {
  ctx.save();
  clipBetspot(ctx);
  ctx.globalCompositeOperation = "lighter";
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  for (const segment of orderedSegments(tree)) {
    // Per-segment LOCAL progress, normalised by this segment's growth
    // window. Each bolt has its own attack/decay flash that fires when
    // the bolt itself spawns — gives the "multiple thunders falling
    // sequentially" feel instead of one global flash everywhere.
    const window = Math.max(1e-5, segment.finishAt - segment.spawnAt);
    const localP = (progress - segment.spawnAt) / window;
    const strength = thunderFlashStrength(localP);
    if (strength < 0.01) continue;

    const drawLen = segmentDrawLengthOutward(segment, boltT, progress, origin);
    if (drawLen <= 0) continue;

    // Find the tip point (last point we'd draw to).
    let tipX = segment.points[0].x;
    let tipY = segment.points[0].y;

    ctx.beginPath();
    ctx.moveTo(segment.points[0].x, segment.points[0].y);
    for (let i = 1; i < segment.points.length; i += 1) {
      if (segment.cumLengths[i] <= drawLen) {
        ctx.lineTo(segment.points[i].x, segment.points[i].y);
        tipX = segment.points[i].x;
        tipY = segment.points[i].y;
      } else {
        const seg0 = segment.points[i - 1];
        const seg1 = segment.points[i];
        const t = (drawLen - segment.cumLengths[i - 1])
          / Math.max(1e-5, segment.cumLengths[i] - segment.cumLengths[i - 1]);
        tipX = seg0.x + (seg1.x - seg0.x) * t;
        tipY = seg0.y + (seg1.y - seg0.y) * t;
        ctx.lineTo(tipX, tipY);
        break;
      }
    }

    // Linear gradient stroke: bright hot at origin, fading out toward the tip.
    // This gives the strike the "intensity concentrated at the source"
    // character of real thunder — the strike erupts from the chip and
    // tapers to a thin sharp line at the edge.
    const startX = segment.points[0].x;
    const startY = segment.points[0].y;
    const haloGrd = ctx.createLinearGradient(startX, startY, tipX, tipY);
    haloGrd.addColorStop(0, `rgba(180, 235, 255, ${0.85 * strength})`);
    haloGrd.addColorStop(0.45, `rgba(150, 225, 255, ${0.45 * strength})`);
    haloGrd.addColorStop(1, `rgba(120, 200, 255, 0)`);

    ctx.strokeStyle = haloGrd;
    ctx.shadowColor = "#aef";
    ctx.shadowBlur = 0.55;
    ctx.lineWidth = 0.5;
    ctx.stroke();

    const coreGrd = ctx.createLinearGradient(startX, startY, tipX, tipY);
    coreGrd.addColorStop(0, `rgba(255, 255, 255, ${1.0 * strength})`);
    coreGrd.addColorStop(0.5, `rgba(255, 255, 255, ${0.7 * strength})`);
    coreGrd.addColorStop(1, `rgba(255, 255, 255, ${0.2 * strength})`);
    ctx.strokeStyle = coreGrd;
    ctx.shadowBlur = 0;
    ctx.lineWidth = 0.2;
    ctx.stroke();
  }

  ctx.restore();
}

/**
 * Reveal plasma by extending trunks + branches outward from center bulk.
 * progress = 1 matches Show pattern exactly.
 * @param {object} [opts]
 * @param {boolean} [opts.skipFlash] - skip the 2D thunder-flash overlay
 *   (WebGL renders sparks in its own shader, doesn't want a doubled flash)
 */
export function paintPlasmaStrike(ctx, plasmaLayer, tree, progress, opts = {}) {
  const { width, height } = SVG_FRAME;
  ctx.clearRect(0, 0, width, height);

  if (!plasmaLayer?.naturalWidth) return;
  if (progress <= 0) return;

  if (!tree?.segments?.length || progress >= 1) {
    paintPlasmaPatternLayer(ctx, plasmaLayer);
    return;
  }

  const mask = paintMask(tree, progress);
  const origin = tree.origin ?? THUNDER_ORIGIN;
  const boltT = boltGrowthProgress(progress);

  ctx.save();
  clipBetspot(ctx);
  ctx.drawImage(plasmaLayer, 0, 0, width, height);
  ctx.globalCompositeOperation = "destination-in";
  ctx.drawImage(mask, 0, 0, width, height);
  ctx.globalCompositeOperation = "source-over";
  ctx.restore();

  if (!opts.skipFlash) {
    // Thunder attack flash — 2D path for the canvas route. WebGL renders
    // this in the fragment shader (see thunderRenderer) for sharper sparks
    // and to keep the GPU paths as the source of truth, so it passes
    // skipFlash:true here.
    paintThunderFlash(ctx, tree, progress, boltT, origin);
  }
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
