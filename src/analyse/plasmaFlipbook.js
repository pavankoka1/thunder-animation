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
