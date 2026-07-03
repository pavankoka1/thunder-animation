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
import {
  getOutwardGateCanvas,
  getOutwardGateRing,
  paintCausticAlongPaths,
  paintCenterCausticBulk,
} from "./skeletonMask.js";
import { strokeDebugPath, strokePartialReveal } from "./strikeMask.js";

// Scratch canvas for compositing skeleton ∩ outward gate. Sized to viewBox.
let thunderScratchCanvas;
let thunderScratchCtx;
function getThunderScratch() {
  if (!thunderScratchCanvas) {
    thunderScratchCanvas = document.createElement("canvas");
    thunderScratchCanvas.width = SVG_FRAME.width;
    thunderScratchCanvas.height = SVG_FRAME.height;
    thunderScratchCtx = thunderScratchCanvas.getContext("2d");
  }
  return { canvas: thunderScratchCanvas, ctx: thunderScratchCtx };
}

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

/**
 * Path mask = the REAL bright filaments from plasma.svg (the white paths
 * the user pointed at as the lightning reference), dilated slightly for
 * soft edges and gated by the expanding radial wave so the reveal travels
 * outward along the filament network.
 *
 * Nothing is drawn in white here — this is just a mask. The plasma image
 * underneath reveals in its NATURAL colours along the filament paths as
 * the wave passes through.
 */
function paintPathMask(tree, progress, _boltT, origin) {
  const { maskCanvas: pmc, maskCtx: pmctx } = getPathMaskSurface();
  pmctx.clearRect(0, 0, SVG_FRAME.width, SVG_FRAME.height);

  const skeleton = tree?.skeletonCanvas;
  if (!skeleton) {
    // Fallback to disc reveal if no skeleton available.
    pmctx.drawImage(getOutwardGateCanvas(origin, progress), 0, 0);
    return pmc;
  }

  pmctx.save();
  pmctx.filter = "blur(0.55px)";
  pmctx.drawImage(skeleton, 0, 0);
  pmctx.filter = "none";
  pmctx.globalCompositeOperation = "destination-in";
  pmctx.drawImage(getOutwardGateCanvas(origin, progress), 0, 0);
  pmctx.globalCompositeOperation = "source-over";
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
 * The bright thunder bolt itself, visibly drawn ON each path. The bolt
 * snaps in at full length (via segmentDrawLength) and this flash is what
 * makes the strike read as "white thunder striking on the path". Peaks at
 * the spawn moment then decays over ~0.65 of the segment's local window —
 * slow enough to be SEEN, so the thunder is the primary visual element
 * while it's alive, leaving the plasma reveal as its "mark" after fading.
 */
export function thunderFlashStrength(progress) {
  const p = Math.max(0, Math.min(1, progress));
  if (p <= 0) return 0;
  if (p >= 0.65) return 0;
  // Instant peak, smooth decay to zero by p=0.65.
  const decay = p / 0.65;
  return (1 - decay) ** 1.5;
}

/**
 * Slow-decay afterglow that picks up where the flash leaves off. Real thunder
 * leaves an ionised channel that glows softly for a moment after the strike —
 * this gives the path a "thunder passed through" feel instead of snapping
 * straight from bright attack to static plasma. Per-segment local progress:
 * ramps up as the flash decays (peaks around localP=0.55), holds, then fades
 * to 0 well past the segment's growth window.
 */
export function thunderAfterglowStrength(localP, globalP) {
  const lp = Math.max(0, Math.min(2.5, localP));
  if (lp <= 0.25) return 0;
  // Smooth onset as the flash decays — peaks ~ lp=0.55.
  const onset = Math.min(1, (lp - 0.25) / 0.30);
  // Long tail that fades over the rest of the segment lifetime and into
  // the settle phase.
  const tail = Math.exp(-Math.max(0, lp - 0.55) * 1.4);
  // Global fade: smoothly drops the whole afterglow to zero by p=1 so the
  // final frame matches plasma.svg exactly (no lingering glow on static).
  const settle = 1 - Math.max(0, Math.min(1, (globalP - 0.82) / 0.18)) ** 1.2;
  return onset * tail * settle;
}

/**
 * Intentionally a no-op. The plasma reveal mask in paintPathMask already
 * uses the actual bright filaments as the reveal source — there is no
 * additional white shape drawn on top. The plasma's own colours become
 * visible along the filament paths as the radial wave sweeps outward;
 * that IS the lightning, no further overlay needed.
 */
function paintThunderFlash(_ctx, _tree, _progress, _boltT, _origin) {
  // no-op
}

/**
 * Draws a thin lingering bright trail along every bolt that's been struck.
 * Each segment has its own onset/decay keyed to its local progress, plus a
 * global "settle" multiplier that fades the whole afterglow to 0 by p≈1.
 * Together with paintThunderFlash this gives the strike a clear phase
 * structure: attack flash → afterglow trail → settle into static pattern.
 */
function paintThunderAfterglow(ctx, tree, progress, boltT, origin) {
  if (progress >= 1) return;
  ctx.save();
  clipBetspot(ctx);
  ctx.globalCompositeOperation = "lighter";
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  for (const segment of orderedSegments(tree)) {
    const window = Math.max(1e-5, segment.finishAt - segment.spawnAt);
    const localP = (progress - segment.spawnAt) / window;
    if (localP <= 0.2) continue;
    const strength = thunderAfterglowStrength(localP, progress);
    if (strength < 0.015) continue;

    const drawLen = segmentDrawLengthOutward(segment, boltT, progress, origin);
    if (drawLen <= 0) continue;

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

    // Two thin passes: a small soft halo (the ionised channel) and a hairline
    // bright core (the residual hot filament). Kept narrow so the trail
    // reads as lightning, not a fat thread.
    const startX = segment.points[0].x;
    const startY = segment.points[0].y;
    const halo = ctx.createLinearGradient(startX, startY, tipX, tipY);
    halo.addColorStop(0, `rgba(150, 215, 255, ${0.42 * strength})`);
    halo.addColorStop(0.6, `rgba(170, 225, 255, ${0.30 * strength})`);
    halo.addColorStop(1, `rgba(190, 230, 255, ${0.12 * strength})`);
    ctx.strokeStyle = halo;
    ctx.shadowColor = "#cef";
    ctx.shadowBlur = 0.45;
    ctx.lineWidth = 0.16;
    ctx.stroke();

    const core = ctx.createLinearGradient(startX, startY, tipX, tipY);
    core.addColorStop(0, `rgba(255, 255, 255, ${0.55 * strength})`);
    core.addColorStop(0.5, `rgba(245, 252, 255, ${0.42 * strength})`);
    core.addColorStop(1, `rgba(220, 240, 255, ${0.20 * strength})`);
    ctx.strokeStyle = core;
    ctx.shadowBlur = 0;
    ctx.lineWidth = 0.06;
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

  // Thunder afterglow trail — soft persistent glow on each bolt that's been
  // drawn so far. Picks up where paintThunderFlash leaves off and lingers
  // until p≈1, giving the strike a "thunder passed through the path" feel
  // instead of snapping straight from the attack flash to the static plasma.
  paintThunderAfterglow(ctx, tree, progress, boltT, origin);

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
