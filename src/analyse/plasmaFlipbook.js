/**
 * Sprite-flipbook motion for the analyse betspot.
 *
 * The plasma effect is a pre-rendered 26-frame sheet (400×325 per frame,
 * stacked vertically). We play the frames in sequence so the filament paths
 * genuinely reform. This module is the frame maths plus a thin canvas painter.
 */

import { loadImage } from "../canvas/loadImage.js";

/** Sprite geometry — one frame is 400×325; the sheet stacks them vertically. */
export const FRAME_W = 400;
export const FRAME_H = 325;
/** Playback rate. Tune here. */
export const FPS = 12;

/** Looping frame index for a given time. Safe when count is 0. */
export function frameAt(tMs, fps, count) {
  if (count <= 0) return 0;
  return Math.floor((tMs / 1000) * fps) % count;
}

/**
 * Cover-fit source rect: the centred sub-rect of a single frame that fills the
 * target aspect with no distortion (crops the overflowing axis).
 *
 * @returns {{sx:number, sy:number, sw:number, sh:number}} within one frame
 */
export function coverRect(frameW, frameH, targetW, targetH) {
  const s = Math.max(targetW / frameW, targetH / frameH);
  const sw = targetW / s;
  const sh = targetH / s;
  return { sx: (frameW - sw) / 2, sy: (frameH - sh) / 2, sw, sh };
}

let sheetCache = null;

/**
 * Load the sprite sheet once. count derived from the sheet height.
 * @returns {Promise<{img:HTMLImageElement, frameW:number, frameH:number, count:number}>}
 */
export async function loadPlasmaSheet(url) {
  if (sheetCache) return sheetCache;
  const img = await loadImage(url);
  const count = Math.round(img.naturalHeight / FRAME_H);
  sheetCache = { img, frameW: FRAME_W, frameH: FRAME_H, count };
  return sheetCache;
}

function makeCanvas(w, h) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
}

/** Radial white→transparent vignette so energy fades at the body edges. */
function makeVignette(w, h) {
  const c = makeCanvas(w, h);
  const ctx = c.getContext("2d");
  const cx = w * 0.5;
  const cy = h * 0.5;
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.hypot(cx, cy));
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.6, "rgba(255,255,255,0.92)");
  g.addColorStop(0.85, "rgba(255,255,255,0.5)");
  g.addColorStop(1, "rgba(255,255,255,0.1)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  return c;
}

/**
 * One-time asset bundle: cover-fit rect, a reusable offscreen frame canvas, and
 * the cached edge-fade vignette.
 */
export function initFlipbook(sheet, targetW, targetH) {
  return {
    sheet,
    targetW,
    targetH,
    rect: coverRect(sheet.frameW, sheet.frameH, targetW, targetH),
    frame: makeCanvas(targetW, targetH),
    vignette: makeVignette(targetW, targetH),
  };
}

/**
 * Paint the current flipbook frame into ctx: cover-fit the sprite sub-rect onto
 * the offscreen, mask with the vignette, blit.
 */
export function paintFlipbookFrame(ctx, assets, tMs) {
  if (!assets) return;
  const { sheet, targetW, targetH, rect, frame, vignette } = assets;
  const idx = frameAt(tMs, FPS, sheet.count);

  const fctx = frame.getContext("2d");
  fctx.globalCompositeOperation = "source-over";
  fctx.globalAlpha = 1;
  fctx.clearRect(0, 0, targetW, targetH);
  fctx.drawImage(
    sheet.img,
    rect.sx,
    idx * sheet.frameH + rect.sy,
    rect.sw,
    rect.sh,
    0,
    0,
    targetW,
    targetH
  );
  fctx.globalCompositeOperation = "destination-in";
  fctx.drawImage(vignette, 0, 0);
  fctx.globalCompositeOperation = "source-over";

  ctx.clearRect(0, 0, targetW, targetH);
  ctx.drawImage(frame, 0, 0);
}
