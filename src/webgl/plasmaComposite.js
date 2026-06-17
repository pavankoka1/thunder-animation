import { BETSPOT_CLIP, roundedRectPath } from "../canvas/betspotGeometry.js";
import { SVG_FRAME } from "../canvas/frame.js";
import { paintPlasmaStatic, paintPlasmaStrike } from "../canvas/plasma/paintStrike.js";

let plasmaScratchCanvas;

function getPlasmaScratch() {
  if (!plasmaScratchCanvas) {
    plasmaScratchCanvas = document.createElement("canvas");
    plasmaScratchCanvas.width = SVG_FRAME.width;
    plasmaScratchCanvas.height = SVG_FRAME.height;
  }
  return {
    canvas: plasmaScratchCanvas,
    ctx: plasmaScratchCanvas.getContext("2d"),
  };
}

function drawFrameBase(ctx, frameImage, appearance) {
  const { width: w, height: h } = SVG_FRAME;
  if (frameImage?.naturalWidth) {
    ctx.drawImage(frameImage, 0, 0, w, h);
    return;
  }

  const grd = ctx.createLinearGradient(0, 0, 0, h);
  grd.addColorStop(0, appearance?.bgTop ?? "#36EBF2");
  grd.addColorStop(1, appearance?.bgBottom ?? "#00A2FF");
  ctx.fillStyle = grd;
  ctx.fillRect(0, 0, w, h);
}

function paintPlasmaLayerOnly(ctx, plasmaLayer, pathTree, progress, mode) {
  const { width: w, height: h } = SVG_FRAME;
  ctx.clearRect(0, 0, w, h);
  if (mode === "idle" || progress <= 0) return;
  if (mode === "static") {
    paintPlasmaStatic(ctx, plasmaLayer);
  } else {
    paintPlasmaStrike(ctx, plasmaLayer, pathTree, progress);
  }
}

/**
 * Offscreen surface — same pixel size as BetspotCanvas (84×68 viewBox × scale).
 */
export function createPlasmaCompositeSurface(pixelWidth, pixelHeight) {
  const canvas = document.createElement("canvas");
  canvas.width = pixelWidth;
  canvas.height = pixelHeight;
  const scale = pixelWidth / SVG_FRAME.width;
  return { canvas, scale };
}

/**
 * Match the home-page stack: frame (or gradient) + plasma with `screen` blend.
 * The result is opaque final betspot colours — no purple interior wash.
 *
 * @param {{ canvas: HTMLCanvasElement, scale: number }} surface
 * @param {CanvasImageSource | null} frameImage
 * @param {CanvasImageSource | null} plasmaLayer
 * @param {object | null} pathTree
 * @param {number} progress
 * @param {'idle' | 'strike' | 'static'} mode
 * @param {{ bgTop?: string, bgBottom?: string }} [appearance]
 */
export function paintPlasmaComposite(
  surface,
  frameImage,
  plasmaLayer,
  pathTree,
  progress,
  mode = "strike",
  appearance = {}
) {
  const { canvas, scale } = surface;
  const ctx = canvas.getContext("2d");
  const { width: w, height: h } = SVG_FRAME;

  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  ctx.clearRect(0, 0, w, h);
  drawFrameBase(ctx, frameImage, appearance);

  if (mode !== "idle" && progress > 0 && plasmaLayer) {
    const { canvas: scratch, ctx: scratchCtx } = getPlasmaScratch();
    paintPlasmaLayerOnly(scratchCtx, plasmaLayer, pathTree, progress, mode);

    ctx.save();
    roundedRectPath(ctx, BETSPOT_CLIP);
    ctx.clip();
    ctx.globalCompositeOperation = "screen";
    ctx.drawImage(scratch, 0, 0, w, h);
    ctx.globalCompositeOperation = "source-over";
    ctx.restore();
  }

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  return canvas;
}
