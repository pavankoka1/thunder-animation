/**
 * Inner-energy motion — wiggle the svg's own filament polylines in place.
 *
 * After formation completes the static white filaments are dimmed out of the
 * base texture; the same extracted polylines are re-stroked each frame with
 * per-vertex sinusoidal jitter. Segment points are in viewBox (84×68) coords.
 */

import { BETSPOT_FRAME, roundedRectPath } from "../betspotGeometry.js";
import { INNER_ENERGY_SPEC } from "../innerSpotEnergy.js";

const RAMP_MS = 700;

/** Jitter amplitude in viewBox units (~5–8 texture px). */
const JITTER_A = 0.55;
const JITTER_B = 0.32;

const dimmedBaseCache = new WeakMap();

function smoothstep01(t) {
  const x = Math.max(0, Math.min(1, t));
  return x * x * (3 - 2 * x);
}

function rgbaWithAlpha(rgba, alpha) {
  const m = rgba.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
  if (!m) return rgba;
  const a = (parseFloat(m[4] ?? "1") * alpha).toFixed(3);
  return `rgba(${m[1]},${m[2]},${m[3]},${a})`;
}

function ensureDimmedBase(texture) {
  const cached = dimmedBaseCache.get(texture);
  if (cached) return cached;

  const tw = texture.naturalWidth;
  const th = texture.naturalHeight;
  const c = document.createElement("canvas");
  c.width = tw;
  c.height = th;
  const ctx = c.getContext("2d");
  ctx.drawImage(texture, 0, 0);
  const img = ctx.getImageData(0, 0, tw, th);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i];
    const g = d[i + 1];
    const b = d[i + 2];
    if (r + g + b > 540) {
      d[i] = Math.round(r * 0.42);
      d[i + 1] = Math.round(g * 0.34);
      d[i + 2] = Math.round(b * 0.62);
    } else if (r + g + b > 380) {
      d[i] = Math.round(r * 0.72);
      d[i + 1] = Math.round(g * 0.68);
      d[i + 2] = Math.round(b * 0.82);
    }
  }
  ctx.putImageData(img, 0, 0);
  dimmedBaseCache.set(texture, c);
  return c;
}

function strokePolyline(ctx, pts, width, color, blur) {
  if (pts.length < 2) return;
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.lineWidth = width;
  ctx.strokeStyle = color;
  ctx.filter = blur > 0 ? `blur(${blur}px)` : "none";
  ctx.stroke();
  ctx.filter = "none";
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {{ energy, innerFilaments }} assets
 * @param {number} timeMs — ms since formation completed
 * @param {number} handoff — 0…1 cross-fade from static svg to animated strokes
 */
export function paintInnerEnergyAnimated(ctx, assets, timeMs, handoff = 1) {
  const { energy, innerFilaments } = assets ?? {};
  const texture = energy?.texture;
  const segments = innerFilaments?.segments;
  if (!texture?.naturalWidth || handoff <= 0) return;

  const { rect, patternTransform, imageSize, groupOpacity } = INNER_ENERGY_SPEC;
  const [a, , , d, , f] = patternTransform;
  const tw = imageSize.width;
  const th = imageSize.height;

  // Purple plasma backdrop — bright filaments knocked out of the texture.
  ctx.save();
  roundedRectPath(ctx, BETSPOT_FRAME);
  ctx.clip();
  ctx.globalAlpha = handoff * groupOpacity;
  ctx.globalCompositeOperation = "source-over";
  ctx.translate(rect.x, rect.y + f * rect.height);
  ctx.scale(a * rect.width, d * rect.height);
  ctx.drawImage(ensureDimmedBase(texture), 0, 0, tw, th);
  ctx.restore();

  if (!segments?.length) return;

  const ramp = smoothstep01(Math.max(0, timeMs) / RAMP_MS);
  const t = Math.max(0, timeMs) * 0.001;

  // Filament strokes in viewBox space.
  ctx.save();
  roundedRectPath(ctx, BETSPOT_FRAME);
  ctx.clip();
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "lighter";
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  const haloColor = rgbaWithAlpha("rgba(255,180,235,0.45)", handoff);
  const midColor = rgbaWithAlpha("rgba(255,215,245,0.78)", handoff);
  const coreColor = rgbaWithAlpha("rgba(255,252,254,0.95)", handoff);

  for (const seg of segments) {
    const src = seg.points;
    const n = src.length;
    if (n < 2) continue;

    const pts = new Array(n);
    for (let i = 0; i < n; i++) {
      const u = n === 1 ? 0 : i / (n - 1);
      const env = Math.sin(u * Math.PI);
      const seed = seg.id * 1009 + i * 13;
      const jx =
        Math.sin(t * 1.7 + seed * 0.013) * JITTER_A +
        Math.sin(t * 0.9 + seed * 0.041) * JITTER_B;
      const jy =
        Math.cos(t * 1.5 + seed * 0.017) * JITTER_A +
        Math.cos(t * 1.1 + seed * 0.037) * JITTER_B;
      const k = env * ramp;
      pts[i] = { x: src[i].x + jx * k, y: src[i].y + jy * k };
    }

    strokePolyline(ctx, pts, 1.80, haloColor, 0.55);
    strokePolyline(ctx, pts, 0.75, midColor, 0.14);
    strokePolyline(ctx, pts, 0.32, coreColor, 0);
  }

  ctx.restore();
}
