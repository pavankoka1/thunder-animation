/**
 * Filament web extraction for the analyse betspot.
 *
 * We do NOT blit the plasma texture onto the spot. We use the shared plasma
 * PNG only as a *source of paths*: `isThunderFilament` (the same bright-web
 * detector the home-page path extractor uses) tells us which pixels belong to
 * the cellular lightning network vs. the deep-purple cells. We keep the web,
 * drop the cells, and hand back a soft grayscale "web canvas" (white filaments
 * on transparent) in body-space.
 *
 * The painter then recolours, radially masks and glows that web — the source
 * texture's own colour is discarded entirely.
 */

import { loadImage } from "../canvas/loadImage.js";
import { isThunderFilament } from "../canvas/plasma/plasmaPixels.js";

const SOURCE_URL = "/analyse/plasma-source.png";

/** Luminance window that maps filament brightness → web alpha. */
const LUM_LO = 120;
const LUM_HI = 250;

let cache = null;

function smoothstep(a, b, x) {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/** Draw a body-aspect crop of the source so cells stay roughly circular. */
function cropSourceToBody(img, w, h) {
  const targetAspect = w / h;
  const srcAspect = img.naturalWidth / img.naturalHeight;

  let sx = 0;
  let sy = 0;
  let sw = img.naturalWidth;
  let sh = img.naturalHeight;

  if (srcAspect > targetAspect) {
    sw = img.naturalHeight * targetAspect;
    sx = (img.naturalWidth - sw) / 2;
  } else {
    sh = img.naturalWidth / targetAspect;
    sy = (img.naturalHeight - sh) / 2;
  }

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, w, h);
  return ctx.getImageData(0, 0, w, h);
}

/**
 * Build the web canvas: white with per-pixel alpha = filament strength.
 * Deep-purple cell pixels (rejected by isThunderFilament) become transparent.
 */
function buildWebCanvas(imageData, w, h) {
  const src = imageData.data;
  const out = document.createElement("canvas");
  out.width = w;
  out.height = h;
  const ctx = out.getContext("2d");
  const dst = ctx.createImageData(w, h);
  const d = dst.data;

  for (let i = 0; i < w * h; i += 1) {
    const o = i * 4;
    const r = src[o];
    const g = src[o + 1];
    const b = src[o + 2];
    const a = src[o + 3];
    if (!isThunderFilament(r, g, b, a)) continue;

    const lum = (r + g + b) / 3;
    const strength = smoothstep(LUM_LO, LUM_HI, lum);
    if (strength <= 0) continue;

    d[o] = 255;
    d[o + 1] = 255;
    d[o + 2] = 255;
    d[o + 3] = Math.round(strength * 255);
  }

  ctx.putImageData(dst, 0, 0);
  return out;
}

/**
 * @param {number} width  body width (working units, e.g. 146)
 * @param {number} height body height (working units, e.g. 68)
 * @param {number} scale  supersample
 * @returns {Promise<{ web: HTMLCanvasElement, width:number, height:number }>}
 */
export async function loadPlasmaFilaments(width, height, scale = 3) {
  if (cache) return cache;

  const img = await loadImage(SOURCE_URL);
  const w = Math.round(width * scale);
  const h = Math.round(height * scale);

  const imageData = cropSourceToBody(img, w, h);
  const web = buildWebCanvas(imageData, w, h);

  cache = { web, width, height };
  return cache;
}
