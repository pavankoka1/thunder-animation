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
