/**
 * Bolt re-strike motion for the analyse betspot.
 *
 * The plasma is a handful of dense artwork frames whose bright bolts re-route
 * between frames while the cell structure stays put (measured: ~0 global shift,
 * bolts ~half-overlap). We hold each dense frame, then briefly crossfade to the
 * next — so the bolts appear to re-strike along new paths in place, looping.
 * No sliding of the whole structure, no drawn lines: the real texture, blended.
 */

import { loadImage } from "../canvas/loadImage.js";

/** Full loop length (ms) across all frames. Tune for re-strike cadence. */
export const LOOP_MS = 9000;
/** Fraction of each frame's slot spent holding before the crossfade begins. */
export const HOLD = 0.62;

/** Cover-fit mapping: frame (fw×fh) → target, larger scale, centred crop. */
export function coverTransform(fw, fh, tw, th) {
  const scale = Math.max(tw / fw, th / fh);
  return { scale, offX: (fw - tw / scale) / 2, offY: (fh - th / scale) / 2 };
}

function smoothstep(a, b, x) {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/**
 * Loop position → which two frames and the blend between them. Holds frame k0
 * (blend 0) for the first HOLD of its slot, then crossfades to k1. Clamps
 * negative time (the first rAF timestamp can be marginally < the start).
 */
export function frameBlendAt(tMs, loopMs, count) {
  if (count <= 0) return { k0: 0, k1: 0, blend: 0 };
  const t = tMs > 0 ? tMs : 0;
  const p = ((t / loopMs) * count) % count;
  const k0 = Math.floor(p) % count;
  const slot = p - Math.floor(p);
  return { k0, k1: (k0 + 1) % count, blend: smoothstep(HOLD, 1, slot) };
}

let framesCache = null;

/** Load the packed dense-frame webp once. */
export async function loadFrames(url) {
  if (framesCache) return framesCache;
  framesCache = await loadImage(url);
  return framesCache;
}

function makeCanvas(w, h) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
}

function makeVignette(w, h) {
  const c = makeCanvas(w, h);
  const ctx = c.getContext("2d");
  const cx = w * 0.5;
  const cy = h * 0.5;
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.hypot(cx, cy));
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.62, "rgba(255,255,255,0.95)");
  g.addColorStop(0.85, "rgba(255,255,255,0.55)");
  g.addColorStop(1, "rgba(255,255,255,0.08)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  return c;
}

/**
 * Slice the packed webp into `count` dense frames, cover-fit each onto its own
 * edge-faded canvas. One-time.
 */
export function initFrames(img, tw, th, count) {
  const fw = img.naturalWidth;
  const fh = Math.round(img.naturalHeight / count);
  const { offX, offY } = coverTransform(fw, fh, tw, th);
  const vignette = makeVignette(tw, th);
  const frames = [];
  for (let i = 0; i < count; i += 1) {
    const c = makeCanvas(tw, th);
    const ctx = c.getContext("2d");
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, offX, i * fh + offY, fw - offX * 2, fh - offY * 2, 0, 0, tw, th);
    ctx.globalCompositeOperation = "destination-in";
    ctx.drawImage(vignette, 0, 0);
    ctx.globalCompositeOperation = "source-over";
    frames.push(c);
  }
  return { tw, th, count, frames };
}

/**
 * Paint one frame: hold the current dense frame, briefly crossfading to the
 * next so the bolts re-strike in place. Signature matches the prior painters.
 */
export function paintFramesFrame(ctx, assets, tMs) {
  if (!assets || !assets.count) return;
  const { tw, th, count, frames } = assets;
  const { k0, k1, blend } = frameBlendAt(tMs, LOOP_MS, count);

  ctx.globalCompositeOperation = "source-over";
  ctx.clearRect(0, 0, tw, th);
  ctx.globalAlpha = 1;
  ctx.drawImage(frames[k0], 0, 0);
  if (blend > 0) {
    ctx.globalAlpha = blend;
    ctx.drawImage(frames[k1], 0, 0);
    ctx.globalAlpha = 1;
  }
}
