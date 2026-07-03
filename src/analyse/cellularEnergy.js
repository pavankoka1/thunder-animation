/**
 * Inner energy painter — recolours the extracted plasma filament web.
 *
 * Input is a grayscale "web canvas" (white filaments, transparent cells) from
 * `loadPlasmaFilaments`. Here we give it the "thunder struck the centre and
 * spread outward" feel:
 *
 *   • the web is radially masked — full strength at the hub, fading to a faint
 *     wisp at the edges
 *   • it is re-tinted in three stacked passes: a wide violet halo, a magenta
 *     mid-glow and a white-hot core
 *   • a soft central flash biases the brightest energy to the middle
 *
 * The source texture's own colour is never used, and the dark cell interiors
 * stay transparent so the CSS blue body shows through (screen blend).
 */

const VIOLET = "rgb(150, 70, 225)";
const MAGENTA = "rgb(210, 120, 245)";
const WHITE = "rgb(250, 250, 255)";

function makeCanvas(w, h) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
}

/** Fade the web from centre → edges so it reads as radiating from the middle. */
function radialMaskWeb(web, w, h) {
  const c = makeCanvas(w, h);
  const ctx = c.getContext("2d");
  ctx.drawImage(web, 0, 0, w, h);

  const cx = w * 0.5;
  const cy = h * 0.5;
  const r = Math.hypot(cx, cy);
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
  g.addColorStop(0, "rgba(255, 255, 255, 1)");
  g.addColorStop(0.5, "rgba(255, 255, 255, 0.92)");
  g.addColorStop(0.8, "rgba(255, 255, 255, 0.6)");
  g.addColorStop(1, "rgba(255, 255, 255, 0.18)");

  ctx.globalCompositeOperation = "destination-in";
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  return c;
}

/** Recolour a white/alpha web to a flat colour, optionally blurred (glow). */
function tint(web, w, h, cssColor, blurPx) {
  const c = makeCanvas(w, h);
  const ctx = c.getContext("2d");
  if (blurPx > 0) ctx.filter = `blur(${blurPx}px)`;
  ctx.drawImage(web, 0, 0, w, h);
  ctx.filter = "none";
  ctx.globalCompositeOperation = "source-in";
  ctx.fillStyle = cssColor;
  ctx.fillRect(0, 0, w, h);
  return c;
}

function paintCenterFlash(ctx, w, h) {
  const cx = w * 0.5;
  const cy = h * 0.5;
  const r = Math.min(w, h) * 0.5;
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
  g.addColorStop(0, "rgba(225, 205, 255, 0.16)");
  g.addColorStop(0.5, "rgba(180, 110, 240, 0.08)");
  g.addColorStop(1, "rgba(150, 70, 225, 0)");
  ctx.globalCompositeOperation = "lighter";
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
}

/**
 * Bake the energy layer.
 *
 * @param {number} width  body width (working units)
 * @param {number} height body height (working units)
 * @param {number} scale  supersample
 * @param {{ web: HTMLCanvasElement }} data extracted web
 */
export function generateEnergyCanvas(width, height, scale, data) {
  const w = Math.round(width * scale);
  const h = Math.round(height * scale);
  const canvas = makeCanvas(w, h);
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, w, h);

  const web = data?.web;
  if (!web) return canvas;

  const masked = radialMaskWeb(web, w, h);

  const halo = tint(masked, w, h, VIOLET, 2.4 * scale);
  const mid = tint(masked, w, h, MAGENTA, 0.8 * scale);
  const core = tint(masked, w, h, WHITE, 0);

  paintCenterFlash(ctx, w, h);

  ctx.globalCompositeOperation = "lighter";
  ctx.globalAlpha = 0.5;
  ctx.drawImage(halo, 0, 0);
  ctx.globalAlpha = 0.72;
  ctx.drawImage(mid, 0, 0);
  ctx.globalAlpha = 0.82;
  ctx.drawImage(core, 0, 0);

  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";
  return canvas;
}
