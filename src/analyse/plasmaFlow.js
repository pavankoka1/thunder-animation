/**
 * Amoeba/plasma flow for the analyse betspot.
 *
 * We do NOT draw new paths. We take the dense plasma texture (the same artwork
 * the home-page pattern uses) and warp it each frame with a slow, turbulent,
 * spatially-varying flow field — so the existing filaments bend and churn in
 * place like plasma/amoeba. Edge-faded so it reads as energy contained in the
 * spot; screen-blended over the blue body by CSS.
 */

import { loadImage } from "../canvas/loadImage.js";

/** Max churn displacement in energy-canvas px. Tune for more/less motion. */
export const MAX_AMP = 9;
/** Coarse grid step (px) for evaluating the flow, bilerp'd per pixel. */
const GRID_STEP = 8;

/** Cover-fit mapping: texture (fw×fh) → target, larger scale, centred crop. */
export function coverTransform(fw, fh, tw, th) {
  const scale = Math.max(tw / fw, th / fh);
  return { scale, offX: (fw - tw / scale) / 2, offY: (fh - th / scale) / 2 };
}

/**
 * Turbulent domain-warp flow at (x,y,t), each axis in [-1,1]. Several sinusoid
 * octaves at different scales/directions/phases → neighbouring regions flow
 * differently (churn), and pure sinusoids in t mean zero net drift.
 */
export function flowVec(x, y, tSec) {
  const dx =
    Math.sin(x * 0.02 + y * 0.013 + tSec * 0.9) * 1.0 +
    Math.sin(x * 0.045 - y * 0.031 + tSec * 0.6 + 2.1) * 0.6 +
    Math.sin(x * 0.008 + y * 0.05 + tSec * 1.3 + 4.0) * 0.5;
  const dy =
    Math.cos(y * 0.019 - x * 0.012 + tSec * 0.8) * 1.0 +
    Math.cos(y * 0.043 + x * 0.028 + tSec * 0.7 + 1.3) * 0.6 +
    Math.cos(y * 0.009 - x * 0.047 + tSec * 1.1 + 3.2) * 0.5;
  return { x: dx / 2.1, y: dy / 2.1 };
}

let textureCache = null;

/** Load the dense plasma texture once. */
export async function loadTexture(url) {
  if (textureCache) return textureCache;
  textureCache = await loadImage(url);
  return textureCache;
}

function makeCanvas(w, h) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
}

/**
 * One-time asset bundle: the cover-fit texture pixels, a reusable output buffer,
 * a per-pixel radial edge-fade alpha, and coarse flow-grid buffers.
 */
export function initFlow(img, tw, th) {
  const { scale, offX, offY } = coverTransform(img.naturalWidth, img.naturalHeight, tw, th);
  const base = makeCanvas(tw, th);
  const bctx = base.getContext("2d");
  bctx.imageSmoothingEnabled = true;
  bctx.imageSmoothingQuality = "high";
  bctx.drawImage(
    img,
    offX,
    offY,
    img.naturalWidth - offX * 2,
    img.naturalHeight - offY * 2,
    0,
    0,
    tw,
    th,
  );
  const src = bctx.getImageData(0, 0, tw, th).data;

  // radial edge-fade alpha (1 centre → ~0.08 edge)
  const vig = new Float32Array(tw * th);
  const cx = tw * 0.5;
  const cy = th * 0.5;
  const rMax = Math.hypot(cx, cy);
  for (let y = 0; y < th; y += 1) {
    for (let x = 0; x < tw; x += 1) {
      const d = Math.hypot(x - cx, y - cy) / rMax;
      const t = d < 0.6 ? 1 : d > 1 ? 0.08 : 1 - ((d - 0.6) / 0.4) * 0.92;
      vig[y * tw + x] = t;
    }
  }

  const gw = Math.ceil(tw / GRID_STEP) + 1;
  const gh = Math.ceil(th / GRID_STEP) + 1;
  return {
    tw,
    th,
    src,
    out: new ImageData(tw, th),
    vig,
    gw,
    gh,
    gx: new Float32Array(gw * gh),
    gy: new Float32Array(gw * gh),
  };
}

/**
 * Paint one warped frame: churn the dense texture through the flow field and
 * putImageData. Flow is evaluated on a coarse grid and bilerp'd per pixel.
 * Same signature as the prior painters.
 */
export function paintFlowFrame(ctx, assets, tMs) {
  if (!assets) return;
  const { tw, th, src, out, vig, gw, gh, gx, gy } = assets;
  const t = tMs / 1000;
  const dst = out.data;

  for (let gj = 0; gj < gh; gj += 1) {
    for (let gi = 0; gi < gw; gi += 1) {
      const f = flowVec(gi * GRID_STEP, gj * GRID_STEP, t);
      const k = gj * gw + gi;
      gx[k] = f.x * MAX_AMP;
      gy[k] = f.y * MAX_AMP;
    }
  }

  for (let y = 0; y < th; y += 1) {
    const gjf = y / GRID_STEP;
    const gj0 = gjf | 0;
    const ty = gjf - gj0;
    const row0 = gj0 * gw;
    const row1 = (gj0 + 1 < gh ? gj0 + 1 : gj0) * gw;
    for (let x = 0; x < tw; x += 1) {
      const gif = x / GRID_STEP;
      const gi0 = gif | 0;
      const tx = gif - gi0;
      const gi1 = gi0 + 1 < gw ? gi0 + 1 : gi0;
      const dx =
        (gx[row0 + gi0] * (1 - tx) + gx[row0 + gi1] * tx) * (1 - ty) +
        (gx[row1 + gi0] * (1 - tx) + gx[row1 + gi1] * tx) * ty;
      const dy =
        (gy[row0 + gi0] * (1 - tx) + gy[row0 + gi1] * tx) * (1 - ty) +
        (gy[row1 + gi0] * (1 - tx) + gy[row1 + gi1] * tx) * ty;

      // sample the texture at (x+dx, y+dy), edge-clamped, bilinear
      let sxp = x + dx;
      let syp = y + dy;
      sxp = sxp < 0 ? 0 : sxp > tw - 1 ? tw - 1 : sxp;
      syp = syp < 0 ? 0 : syp > th - 1 ? th - 1 : syp;
      const sx0 = sxp | 0;
      const sy0 = syp | 0;
      const sx1 = sx0 + 1 < tw ? sx0 + 1 : sx0;
      const sy1 = sy0 + 1 < th ? sy0 + 1 : sy0;
      const fx = sxp - sx0;
      const fy = syp - sy0;
      const i00 = (sy0 * tw + sx0) * 4;
      const i10 = (sy0 * tw + sx1) * 4;
      const i01 = (sy1 * tw + sx0) * 4;
      const i11 = (sy1 * tw + sx1) * 4;
      const oi = (y * tw + x) * 4;
      for (let c = 0; c < 3; c += 1) {
        const top = src[i00 + c] * (1 - fx) + src[i10 + c] * fx;
        const bot = src[i01 + c] * (1 - fx) + src[i11 + c] * fx;
        dst[oi + c] = top * (1 - fy) + bot * fy;
      }
      dst[oi + 3] = vig[y * tw + x] * 255;
    }
  }

  ctx.putImageData(out, 0, 0);
}
