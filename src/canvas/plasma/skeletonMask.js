import { BETSPOT_CLIP, THUNDER_ORIGIN } from "../betspotGeometry.js";
import { SVG_FRAME } from "../frame.js";
import { OUTWARD_MAX_DIST, outwardReachFront } from "./outwardSpread.js";

function clamp01(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function resolveOrigin(tree) {
  const o = tree?.origin ?? THUNDER_ORIGIN;
  const x = Number(o?.x);
  const y = Number(o?.y);
  return {
    x: Number.isFinite(x) ? x : THUNDER_ORIGIN.x,
    y: Number.isFinite(y) ? y : THUNDER_ORIGIN.y,
  };
}

function finiteRadius(r, fallback = 1) {
  const n = Number(r);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

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
let ringCanvas;
let ringCtx;
let ringBucket = -1;

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

/**
 * Radial RING gate — only the wave FRONT is white, both inside and outside
 * are transparent. As `progress` advances, the bright ring sweeps outward
 * from origin. Used to gate the thunder visual so it reads as a moving
 * shockwave passing through the filaments, not a cloud filling a disc.
 */
export function getOutwardGateRing(origin, progress, halfWidth = 5.5) {
  const bucket = Math.round(clamp01(progress) * 64);
  if (bucket === ringBucket && ringCanvas) return ringCanvas;
  ringBucket = bucket;
  const p = bucket / 64;

  if (!ringCanvas) {
    ringCanvas = document.createElement("canvas");
    ringCanvas.width = SVG_FRAME.width;
    ringCanvas.height = SVG_FRAME.height;
    ringCtx = ringCanvas.getContext("2d");
  }

  const { width, height } = SVG_FRAME;
  ringCtx.clearRect(0, 0, width, height);

  const front = outwardReachFront(p);
  // Use a single radius large enough that all stops are < 1.
  const totalR = Math.max(OUTWARD_MAX_DIST, front + halfWidth + 4);
  const inner = Math.max(0, (front - halfWidth) / totalR);
  const peak = Math.min(1, front / totalR);
  const outer = Math.min(1, (front + halfWidth) / totalR);

  const grd = ringCtx.createRadialGradient(
    origin.x, origin.y, 0,
    origin.x, origin.y, finiteRadius(totalR, 8),
  );
  grd.addColorStop(0, "rgba(255,255,255,0)");
  if (inner > 0.0001) grd.addColorStop(inner, "rgba(255,255,255,0)");
  grd.addColorStop(peak, "rgba(255,255,255,1)");
  if (outer < 0.9999) grd.addColorStop(outer, "rgba(255,255,255,0)");
  grd.addColorStop(1, "rgba(255,255,255,0)");

  ringCtx.fillStyle = grd;
  ringCtx.fillRect(0, 0, width, height);
  return ringCanvas;
}

export function getOutwardGateCanvas(origin, progress) {
  // Radial gate that expands outward from origin with the wavefront —
  // restores the "thunder spreading" feel: caustic spread is contained
  // to a growing disc around origin, not splashed across the whole
  // betspot at once. Combined with segmentDrawLengthOutward, the bolt
  // tips walk this front along their actual polyline geometry.
  const bucket = Math.round(clamp01(progress) * 32);
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
    finiteRadius(front + 8, 8),
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

  const origin = resolveOrigin(tree);
  const { clusters = [] } = tree;
  const p = clamp01(progress);
  // Bolts fire first — the caustic afterglow ramps in *after* the strike,
  // not alongside it. Without this delay the central bulk renders as a
  // wide cyan disc at frame 1, making the strike read as a frost spread
  // instead of a sharp lightning crack.
  const causticGate = Math.max(0, (p - 0.18) / 0.7) ** 1.4;
  if (!Number.isFinite(causticGate) || causticGate <= 0) return;
  const popped = 1 - (1 - causticGate) ** 3.5;
  const { canvas: scratch, ctx: sctx } = getCausticScratch();
  const { width, height } = SVG_FRAME;

  sctx.clearRect(0, 0, width, height);
  sctx.drawImage(caustic, 0, 0);

  const coreR = finiteRadius(5 + popped * 9, 5);
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
    const cx = Number(c?.x);
    const cy = Number(c?.y);
    if (!Number.isFinite(cx) || !Number.isFinite(cy)) continue;

    const r = finiteRadius(4 + popped * 7, 4);
    sctx.save();
    sctx.globalCompositeOperation = "lighter";
    const g = sctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    g.addColorStop(0, "#fff");
    g.addColorStop(0.6, "rgba(255,255,255,0.7)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    sctx.fillStyle = g;
    sctx.beginPath();
    sctx.arc(cx, cy, r, 0, Math.PI * 2);
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

  const origin = resolveOrigin(tree);
  const p = clamp01(progress);
  const { canvas: blur, ctx: bctx } = getBlurScratch();
  const { canvas: scratch, ctx: sctx } = getCausticScratch();
  const { width, height } = SVG_FRAME;

  // Very tight blur — keeps the caustic close to the bolt path instead of
  // spreading into a wide cloud that reads as a "fat thread" around each
  // bolt. Was 0.28 + p*3.6 (up to ~3.5 viewBox = 14 CSS px halo on each side).
  const blurRadius = 0.2 + Math.max(0, (p - 0.2)) * 0.6;
  const skeletonBlur = 0.15 + Math.max(0, (p - 0.2)) * 0.45;
  bctx.clearRect(0, 0, width, height);
  bctx.filter = `blur(${blurRadius}px)`;
  bctx.drawImage(pathMaskCanvas, 0, 0);
  bctx.filter = "none";

  sctx.clearRect(0, 0, width, height);
  sctx.drawImage(caustic, 0, 0);
  sctx.globalCompositeOperation = "destination-in";
  sctx.drawImage(blur, 0, 0);
  sctx.globalCompositeOperation = "destination-in";
  sctx.drawImage(getOutwardGateCanvas(origin, p), 0, 0);
  sctx.globalCompositeOperation = "source-over";

  mctx.save();
  mctx.globalCompositeOperation = "source-over";
  mctx.globalAlpha = 1;
  mctx.drawImage(scratch, 0, 0);

  const skeleton = tree.skeletonCanvas;
  if (skeleton) {
    bctx.clearRect(0, 0, width, height);
    bctx.filter = `blur(${skeletonBlur}px)`;
    bctx.drawImage(pathMaskCanvas, 0, 0);
    bctx.filter = "none";

    sctx.clearRect(0, 0, width, height);
    sctx.drawImage(skeleton, 0, 0);
    sctx.globalCompositeOperation = "destination-in";
    sctx.drawImage(blur, 0, 0);
    sctx.globalCompositeOperation = "destination-in";
    sctx.drawImage(getOutwardGateCanvas(origin, p), 0, 0);
    sctx.globalCompositeOperation = "source-over";
    mctx.globalCompositeOperation = "lighter";
    mctx.globalAlpha = 0.92 + p * 0.08;
    mctx.drawImage(scratch, 0, 0);
    mctx.globalAlpha = 1;
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
