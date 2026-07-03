/**
 * Ambient energy motion for the analyse betspot — the three behaviours
 * measured from the plasma phase references:
 *
 *   • writhe: per-vertex jitter, endpoints pinned, no global drift
 *   • re-routing: per-segment route weights, ~50% of the web lit at once,
 *     length-weighted total normalized so energy redistributes, never pulses
 *   • hub pulse: slow ±10% brightness sine per anchored hub
 *
 * This module is pure math + painting; it owns no state and no rAF loop.
 */

import {
  MAGENTA,
  REACH_STOPS,
  THICK_STOPS,
  VIOLET,
  WHITE,
} from "./cellularEnergy.js";

const TAU = Math.PI * 2;

/** Writhe amplitude in energy-canvas px (0.55 body-units × 3 supersample). */
export const WRITHE_AMP = 1.65;
/** Writhe angular rates (rad/s) — ≈0.35 Hz and ≈0.19 Hz bands. */
const RATE_A = 2.2;
const RATE_B = 1.2;

/** Length-weighted lit fraction target (measured bright IoU ≈ 0.5). */
const TARGET_LIT = 0.5;
/** Per-frame normalization clamp — keeps redistribution gentle. */
const NORM_MIN = 0.6;
const NORM_MAX = 1.6;
/** Segments below this weight are skipped entirely when painting. */
export const WEIGHT_FLOOR = 0.06;

function hash1(n) {
  const s = Math.sin(n * 127.1) * 43758.5453123;
  return s - Math.floor(s);
}

function smoothstep(a, b, x) {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/**
 * Writhe: two-band sinusoidal per-vertex jitter with a sin(πu) envelope so
 * endpoints stay pinned to the skeleton (junctions never move).
 */
export function jitterSegmentPoints(seg, tSec) {
  const src = seg.points;
  const n = src.length;
  const out = new Array(n);
  for (let i = 0; i < n; i += 1) {
    if (i === 0 || i === n - 1) {
      out[i] = { x: src[i].x, y: src[i].y };
      continue;
    }
    const u = i / (n - 1);
    const env = Math.sin(u * Math.PI);
    const seed = seg.id * 1009 + i * 13;
    const jx =
      Math.sin(tSec * RATE_A + seed * 0.013) * WRITHE_AMP * 0.67 +
      Math.sin(tSec * RATE_B + seed * 0.041) * WRITHE_AMP * 0.33;
    const jy =
      Math.cos(tSec * RATE_A * 0.86 + seed * 0.017) * WRITHE_AMP * 0.67 +
      Math.cos(tSec * RATE_B * 1.18 + seed * 0.037) * WRITHE_AMP * 0.33;
    out[i] = { x: src[i].x + jx * env, y: src[i].y + jy * env };
  }
  return out;
}

/** Raw breathing weight for one segment: smooth periodic noise in [0,1]. */
function rawRouteWeight(id, tSec) {
  const period = 4 + hash1(id + 0.17) * 3; // 4–7s, staggered by id
  const phase = hash1(id + 3.7) * TAU;
  const a = Math.sin((tSec / period) * TAU + phase);
  const b = Math.sin((tSec / (period * 1.73)) * TAU + phase * 2.1) * 0.35;
  const v = 0.5 + (0.5 * (a + b)) / 1.35;
  return smoothstep(0.25, 0.75, v);
}

/** Slow ±10% pulse per hub, independent phases. */
function hubPulse(hubIndex, tSec) {
  const period = 5 + hubIndex * 1.7;
  return 1 + 0.1 * Math.sin((tSec / period) * TAU + hubIndex * 2.1);
}

/**
 * Route weights for every segment at time t. Length-weighted sum is
 * normalized toward TARGET_LIT so energy visibly redistributes between
 * branches instead of the whole field pulsing.
 *
 * @returns {Float32Array} weight per segment, aligned with `segments`
 */
export function computeRouteWeights(segments, hubs, tSec, out) {
  const weights =
    out && out.length === segments.length ? out : new Float32Array(segments.length);
  let sum = 0;
  let lenSum = 0;
  for (let i = 0; i < segments.length; i += 1) {
    const seg = segments[i];
    const pulse = hubs.length ? hubPulse(seg.hub ?? 0, tSec) : 1;
    const w = Math.min(1, rawRouteWeight(seg.id, tSec) * pulse);
    weights[i] = w;
    sum += w * seg.length;
    lenSum += seg.length;
  }
  const scale =
    sum > 0 ? Math.min(NORM_MAX, Math.max(NORM_MIN, (TARGET_LIT * lenSum) / sum)) : 1;
  for (let i = 0; i < weights.length; i += 1) {
    weights[i] = Math.min(1, weights[i] * scale);
  }
  return weights;
}

/** Stroke widths (energy-canvas px) and pass alphas — tuned to match the bake. */
const HALO_WIDTH = 5.5;
const MID_WIDTH = 2.2;
const CORE_WIDTH = 1.0;
const HALO_ALPHA = 0.5;
const MID_ALPHA = 0.62;
const CORE_ALPHA = 0.78;
/** One blur applied to the whole halo layer per frame (not per stroke). */
const HALO_LAYER_BLUR_PX = 4;
/** Dimmed baked web that always underlies the strokes. */
const BASE_DIM = 0.55;

function makeCanvas(w, h) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
}

/** White radial gradient canvas for destination-in masking (stops from the bake). */
function makeRadialMask(w, h, stops) {
  const c = makeCanvas(w, h);
  const ctx = c.getContext("2d");
  const cx = w * 0.5;
  const cy = h * 0.5;
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.hypot(cx, cy));
  for (const [offset, alpha] of stops) g.addColorStop(offset, `rgba(255,255,255,${alpha})`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  return c;
}

/**
 * One-time asset bundle for the frame painter.
 *
 * @param {HTMLCanvasElement} baked the existing static energy bake
 * @param {{segments:Array, hubs:Array}} extraction from extractSegments
 */
export function initMotionAssets(baked, extraction) {
  const w = baked.width;
  const h = baked.height;

  const dimmed = makeCanvas(w, h);
  const dctx = dimmed.getContext("2d");
  dctx.globalAlpha = BASE_DIM;
  dctx.drawImage(baked, 0, 0);

  return {
    w,
    h,
    baked,
    dimmed,
    segments: extraction.segments,
    hubs: extraction.hubs,
    weights: new Float32Array(extraction.segments.length),
    reachMask: makeRadialMask(w, h, REACH_STOPS),
    thickMask: makeRadialMask(w, h, THICK_STOPS),
    haloLayer: makeCanvas(w, h),
    reachLayer: makeCanvas(w, h),
  };
}

function strokePolyline(ctx, pts, width, color, alpha) {
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i += 1) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.lineWidth = width;
  ctx.strokeStyle = color;
  ctx.globalAlpha = alpha;
  ctx.stroke();
}

/**
 * Paint one ambient frame onto the energy canvas context.
 * Layers: dimmed bake → halo strokes (thickness-masked, layer-blurred) →
 * mid+core strokes (reach-masked), all lighter-blended like the bake.
 */
export function paintEnergyFrame(ctx, assets, tMs) {
  const { w, h, dimmed, segments, hubs, weights, haloLayer, reachLayer, reachMask, thickMask } =
    assets;
  if (!segments.length) return;
  const t = tMs / 1000;

  computeRouteWeights(segments, hubs, t, weights);

  const hctx = haloLayer.getContext("2d");
  const rctx = reachLayer.getContext("2d");
  for (const c of [hctx, rctx]) {
    c.globalCompositeOperation = "source-over";
    c.globalAlpha = 1;
    c.clearRect(0, 0, w, h);
    c.lineCap = "round";
    c.lineJoin = "round";
    c.globalCompositeOperation = "lighter";
  }

  for (let i = 0; i < segments.length; i += 1) {
    const wgt = weights[i];
    if (wgt < WEIGHT_FLOOR) continue;
    const pts = jitterSegmentPoints(segments[i], t);
    strokePolyline(hctx, pts, HALO_WIDTH * (0.7 + 0.3 * wgt), VIOLET, HALO_ALPHA * wgt);
    strokePolyline(rctx, pts, MID_WIDTH, MAGENTA, MID_ALPHA * wgt);
    strokePolyline(rctx, pts, CORE_WIDTH, WHITE, CORE_ALPHA * wgt);
  }

  hctx.globalCompositeOperation = "destination-in";
  hctx.globalAlpha = 1;
  hctx.drawImage(thickMask, 0, 0);
  rctx.globalCompositeOperation = "destination-in";
  rctx.globalAlpha = 1;
  rctx.drawImage(reachMask, 0, 0);

  ctx.globalCompositeOperation = "source-over";
  ctx.globalAlpha = 1;
  ctx.clearRect(0, 0, w, h);
  ctx.drawImage(dimmed, 0, 0);
  ctx.globalCompositeOperation = "lighter";
  ctx.filter = `blur(${HALO_LAYER_BLUR_PX}px)`;
  ctx.drawImage(haloLayer, 0, 0);
  ctx.filter = "none";
  ctx.drawImage(reachLayer, 0, 0);
  ctx.globalCompositeOperation = "source-over";
}
