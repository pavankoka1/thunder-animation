import { SVG_FRAME, RENDER_SCALE, SVG_PATHS } from "./frame.js";
import { loadPlasmaAssets, paintPlasmaStatic, paintPlasmaStrike, paintPlasmaPathsDebug } from "./plasma/index.js";

export { SVG_FRAME, RENDER_SCALE, SVG_PATHS };

export async function loadCanvasAssets() {
  return loadPlasmaAssets(SVG_PATHS.plasma);
}

export function setupCanvas(canvas, frame, scale, dpr) {
  const cssWidth = frame.width * scale;
  const cssHeight = frame.height * scale;

  canvas.style.width = `${cssWidth}px`;
  canvas.style.height = `${cssHeight}px`;
  canvas.width = Math.round(cssWidth * dpr);
  canvas.height = Math.round(cssHeight * dpr);

  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context unavailable");

  ctx.setTransform(scale * dpr, 0, 0, scale * dpr, 0, 0);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  return ctx;
}

/**
 * @param {'idle'|'static'|'strike'} mode
 * @param {number} progress 0..1 for strike
 */
export function paintThunders(ctx, assets, mode, progress = 1, { debugPaths = false } = {}) {
  const { width, height } = SVG_FRAME;

  if (mode === "idle") {
    ctx.clearRect(0, 0, width, height);
    return;
  }

  if (!assets?.plasmaLayer) {
    ctx.clearRect(0, 0, width, height);
    return;
  }

  if (mode === "static") {
    paintPlasmaStatic(ctx, assets.plasmaLayer);
    return;
  }

  if (debugPaths) {
    paintPlasmaPathsDebug(ctx, assets.plasmaLayer, assets.pathTree, progress);
    return;
  }

  paintPlasmaStrike(ctx, assets.plasmaLayer, assets.pathTree, progress);
}
