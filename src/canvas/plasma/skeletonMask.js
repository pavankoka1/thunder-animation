import { BETSPOT_CLIP, THUNDER_ORIGIN } from "../betspotGeometry.js";
import { SVG_FRAME } from "../frame.js";
import { outwardReachFront } from "./outwardSpread.js";

/**
 * All visible plasma pixels inside the betspot (caustics + filaments, not just bright lines).
 * Built once at load — used for rich center bulk and path-adjacent reveal.
 */
export function buildCausticCanvas(plasmaImage, frame = SVG_FRAME) {
  const { width: w, height: h } = frame;
  const off = document.createElement("canvas");
  off.width = w;
  off.height = h;
  const ctx = off.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(plasmaImage, 0, 0, w, h);
  const { data } = ctx.getImageData(0, 0, w, h);

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const out = canvas.getContext("2d").createImageData(w, h);
  const { x, y, width, height } = BETSPOT_CLIP;

  for (let py = 0; py < h; py += 1) {
    for (let px = 0; px < w; px += 1) {
      if (px < x || py < y || px > x + width || py > y + height) continue;

      const i = (py * w + px) * 4;
      const a = data[i + 3];
      if (a < 18) continue;

      const lum = data[i] + data[i + 1] + data[i + 2];
      if (lum < 35) continue;

      const o = i;
      out.data[o] = 255;
      out.data[o + 1] = 255;
      out.data[o + 2] = 255;
      out.data[o + 3] = 255;
    }
  }

  canvas.getContext("2d").putImageData(out, 0, 0);
  return canvas;
}

/** Bright filament skeleton — thin lightning lines for path-following detail. */
export function buildSkeletonCanvas(brightMask) {
  if (!brightMask?.bright) return null;

  const { bright, w, h } = brightMask;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  const img = ctx.createImageData(w, h);

  for (let i = 0; i < bright.length; i += 1) {
    if (!bright[i]) continue;
    const o = i * 4;
    img.data[o] = 255;
    img.data[o + 1] = 255;
    img.data[o + 2] = 255;
    img.data[o + 3] = 255;
  }

  ctx.putImageData(img, 0, 0);
  return canvas;
}

let blurScratch;
let causticScratch;
let gateCanvas;
let gateCtx;
let gateBucket = -1;

function getBlurScratch() {
  if (!blurScratch) {
    const canvas = document.createElement("canvas");
    canvas.width = SVG_FRAME.width;
    canvas.height = SVG_FRAME.height;
    blurScratch = { canvas, ctx: canvas.getContext("2d") };
  }
  return blurScratch;
}

function getCausticScratch() {
  if (!causticScratch) {
    const canvas = document.createElement("canvas");
    canvas.width = SVG_FRAME.width;
    canvas.height = SVG_FRAME.height;
    causticScratch = { canvas, ctx: canvas.getContext("2d") };
  }
  return causticScratch;
}

function getOutwardGateCanvas(origin, progress) {
  const bucket = Math.round(progress * 32);
  if (bucket === gateBucket && gateCanvas) return gateCanvas;

  gateBucket = bucket;
  const p = bucket / 32;

  if (!gateCanvas) {
    gateCanvas = document.createElement("canvas");
    gateCanvas.width = SVG_FRAME.width;
    gateCanvas.height = SVG_FRAME.height;
    gateCtx = gateCanvas.getContext("2d");
  }

  const { width, height } = SVG_FRAME;
  gateCtx.clearRect(0, 0, width, height);

  const front = outwardReachFront(p);
  const grd = gateCtx.createRadialGradient(
    origin.x,
    origin.y,
    0,
    origin.x,
    origin.y,
    front + 8
  );
  grd.addColorStop(0, "#fff");
  grd.addColorStop(0.88, "#fff");
  grd.addColorStop(1, "rgba(255,255,255,0)");
  gateCtx.fillStyle = grd;
  gateCtx.fillRect(0, 0, width, height);

  return gateCanvas;
}

/**
 * Rich center bulk — full caustic art under chip + clusters (lands first, stays visible).
 */
export function paintCenterCausticBulk(mctx, tree, progress) {
  const caustic = tree.causticCanvas;
  if (!caustic || progress <= 0) return;

  const origin = tree.origin ?? THUNDER_ORIGIN;
  const { clusters = [] } = tree;
  const p = Math.max(0, Math.min(1, progress));
  const { canvas: scratch, ctx: sctx } = getCausticScratch();
  const { width, height } = SVG_FRAME;

  sctx.clearRect(0, 0, width, height);
  sctx.drawImage(caustic, 0, 0);

  const coreR = 8 + p * 14;
  const coreGrd = sctx.createRadialGradient(
    origin.x,
    origin.y,
    0,
    origin.x,
    origin.y,
    coreR
  );
  coreGrd.addColorStop(0, "#fff");
  coreGrd.addColorStop(0.5, "#fff");
  coreGrd.addColorStop(0.82, "rgba(255,255,255,0.55)");
  coreGrd.addColorStop(1, "rgba(255,255,255,0)");
  sctx.globalCompositeOperation = "destination-in";
  sctx.fillStyle = coreGrd;
  sctx.fillRect(BETSPOT_CLIP.x, BETSPOT_CLIP.y, BETSPOT_CLIP.width, BETSPOT_CLIP.height);

  for (const c of clusters) {
    const r = 4 + p * 7;
    sctx.save();
    sctx.globalCompositeOperation = "lighter";
    const g = sctx.createRadialGradient(c.x, c.y, 0, c.x, c.y, r);
    g.addColorStop(0, "#fff");
    g.addColorStop(0.6, "rgba(255,255,255,0.7)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    sctx.fillStyle = g;
    sctx.beginPath();
    sctx.arc(c.x, c.y, r, 0, Math.PI * 2);
    sctx.fill();
    sctx.restore();
  }

  sctx.globalCompositeOperation = "source-over";

  mctx.save();
  mctx.globalCompositeOperation = "source-over";
  mctx.drawImage(scratch, 0, 0);
  mctx.restore();
}

/**
 * Reveal caustics along growing paths + outward wave (GPU compositing, no per-pixel loops).
 */
export function paintCausticAlongPaths(mctx, pathMaskCanvas, tree, progress, pathCompletion) {
  const caustic = tree.causticCanvas;
  if (!caustic || progress <= 0) return;

  const origin = tree.origin ?? THUNDER_ORIGIN;
  const { canvas: blur, ctx: bctx } = getBlurScratch();
  const { canvas: scratch, ctx: sctx } = getCausticScratch();
  const { width, height } = SVG_FRAME;

  bctx.clearRect(0, 0, width, height);
  bctx.filter = `blur(${3 + progress * 5}px)`;
  bctx.drawImage(pathMaskCanvas, 0, 0);
  bctx.filter = "none";

  sctx.clearRect(0, 0, width, height);
  sctx.drawImage(caustic, 0, 0);
  sctx.globalCompositeOperation = "destination-in";
  sctx.drawImage(blur, 0, 0);
  sctx.globalCompositeOperation = "destination-in";
  sctx.drawImage(getOutwardGateCanvas(origin, progress), 0, 0);
  sctx.globalCompositeOperation = "source-over";

  mctx.save();
  mctx.globalCompositeOperation = "source-over";
  mctx.globalAlpha = 1;
  mctx.drawImage(scratch, 0, 0);

  const skeleton = tree.skeletonCanvas;
  if (skeleton) {
    sctx.clearRect(0, 0, width, height);
    sctx.drawImage(skeleton, 0, 0);
    sctx.globalCompositeOperation = "destination-in";
    sctx.drawImage(blur, 0, 0);
    sctx.globalCompositeOperation = "destination-in";
    sctx.drawImage(getOutwardGateCanvas(origin, progress), 0, 0);
    sctx.globalCompositeOperation = "source-over";
    mctx.globalCompositeOperation = "lighter";
    mctx.drawImage(scratch, 0, 0);
  }

  mctx.restore();
}

/** @deprecated use paintCausticAlongPaths */
export function paintBrightSkeletonFast(mctx, maskCanvas, tree, progress, pathCompletion) {
  paintCausticAlongPaths(mctx, maskCanvas, tree, progress, pathCompletion);
}

export function resetSkeletonMaskCache() {
  gateBucket = -1;
}
