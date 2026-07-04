/**
 * Extracted-web crossfade motion for the analyse betspot.
 *
 * The plasma filament web is extracted from the artwork frames (build-time) as
 * vector polylines. Each keyframe's web is rendered once through the original
 * dense-glow paint (`generateEnergyCanvas` — violet halo / magenta mid /
 * white-hot core, radially masked), then the resulting glow frames are
 * crossfaded in rAF so the web stays present while its paths re-route, looping.
 * No runtime image; the glow frames are baked in code at load from the vectors.
 */

import { generateEnergyCanvas } from "./cellularEnergy.js";
import { BODY, STAGE } from "./spec.js";

/** Cover-fit mapping: frame-space (fw×fh) point → target via X=(x-offX)·scale. */
export function coverTransform(fw, fh, tw, th) {
  const scale = Math.max(tw / fw, th / fh);
  return { scale, offX: (fw - tw / scale) / 2, offY: (fh - th / scale) / 2 };
}

/**
 * Loop position → crossfade pair. p = (t/loop·count) mod count.
 * Clamps negative time to 0 — the first rAF timestamp can be marginally less
 * than the captured start, which would otherwise give a negative modulo (k0=-1).
 */
export function keyframeAt(tMs, loopMs, count) {
  if (count <= 0) return { k0: 0, k1: 0, frac: 0 };
  const t = tMs > 0 ? tMs : 0;
  const p = ((t / loopMs) * count) % count;
  const k0 = Math.floor(p);
  return { k0: k0 % count, k1: (k0 + 1) % count, frac: p - k0 };
}

/** Loop length (ms) for the 10-keyframe crossfade. Tune here. */
const LOOP_MS = 6000;
/** White filament stroke width (px) that feeds the glow paint. Tune for density. */
const WEB_STROKE = 3.2;
/** Soften the web so the violet halo pass has material (matches the original
 * dense soft-grayscale web the paint was designed for). */
const WEB_BLUR_PX = 1.4;

let pathsCache = null;

/** Fetch + cache the extracted keyframe JSON. */
export async function loadPaths(url) {
  if (pathsCache) return pathsCache;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`plasma paths ${res.status}`);
  pathsCache = await res.json();
  return pathsCache;
}

function makeCanvas(w, h) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
}

/**
 * Rasterize one keyframe's cover-transformed polylines into a white-on-transparent
 * "web" canvas — the input the glow paint expects.
 */
function rasterizeWeb(segs, transform, w, h) {
  const { scale, offX, offY } = transform;
  const c = makeCanvas(w, h);
  const ctx = c.getContext("2d");
  ctx.strokeStyle = "rgb(255,255,255)";
  ctx.lineWidth = WEB_STROKE;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.filter = WEB_BLUR_PX > 0 ? `blur(${WEB_BLUR_PX}px)` : "none";
  ctx.beginPath();
  for (const poly of segs) {
    for (let i = 0; i < poly.length; i += 1) {
      const X = (poly[i][0] - offX) * scale;
      const Y = (poly[i][1] - offY) * scale;
      if (i === 0) ctx.moveTo(X, Y);
      else ctx.lineTo(X, Y);
    }
  }
  ctx.stroke();
  ctx.filter = "none";
  return c;
}

/**
 * Bake each keyframe's web through the dense-glow paint → a stack of glow
 * canvases, crossfaded at runtime. Built once at load from the vector data.
 */
export function initPaths(json, tw, th) {
  const transform = coverTransform(json.w, json.h, tw, th);
  const glows = json.frames.map((segs) => {
    const web = rasterizeWeb(segs, transform, tw, th);
    return generateEnergyCanvas(BODY.width, BODY.height, STAGE.scale, { web });
  });
  return { tw, th, count: glows.length, glows };
}

/**
 * Paint one crossfaded frame: alpha-blend two consecutive glow keyframes so the
 * web is always present and its paths re-route between keyframes. Signature
 * matches the prior painters.
 */
export function paintPathsFrame(ctx, assets, tMs) {
  if (!assets || !assets.count) return;
  const { tw, th, count, glows } = assets;
  const { k0, k1, frac } = keyframeAt(tMs, LOOP_MS, count);

  ctx.globalCompositeOperation = "source-over";
  ctx.clearRect(0, 0, tw, th);
  ctx.globalAlpha = 1 - frac;
  ctx.drawImage(glows[k0], 0, 0);
  ctx.globalAlpha = frac;
  ctx.drawImage(glows[k1], 0, 0);
  ctx.globalAlpha = 1;
}
