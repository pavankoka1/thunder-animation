/**
 * One-shot clockwise thunder generation around the betspot rim.
 *
 * Reference video: a single bolt originates at the top-left corner and
 * travels clockwise until the full perimeter is covered — not a repeating loop.
 * Each segment stays lit once the sweep passes; unswept border stays dark.
 */

import { buildRimBorderPath, sampleRimBorderAtT } from "./rimBorderPath.js";

/** Max outward extent from BETSPOT_FRAME (viewBox). */
export const FRINGE_MAX_OUTREACH = 5.0;

/** Duration of the one-shot clockwise sweep (ms). Video fringe builds ~1.0–1.8s. */
export const TRAVEL_DURATION_MS = 1900;

const PATH_SAMPLES = 420;
const NEEDLES_PER_SAMPLE = 10;

/** Bright band at the traveling head (fraction of perimeter). */
const HEAD_FRAC = 0.048;
/** Trail width behind the head while sweeping. */
const TRAIL_FRAC = 0.16;
/** Lit intensity on permanently swept segments (after head passes). */
const SWEPT_BASE = 0.58;

let borderPath = null;

function ensureBorderPath() {
  if (!borderPath) borderPath = buildRimBorderPath();
  return borderPath;
}

function hash(n) {
  const x = Math.sin(n * 127.1 + n * 311.7) * 43758.5453;
  return x - Math.floor(x);
}

/** Ease-in-out for natural sweep pacing. */
export function sweepProgress(sweepElapsedMs) {
  const raw = Math.min(1, sweepElapsedMs / TRAVEL_DURATION_MS);
  return raw < 0.5
    ? 2 * raw * raw
    : 1 - ((-2 * raw + 2) ** 2) / 2;
}

/**
 * Intensity at border param t for a one-shot sweep.
 * @param {number} t — position on path 0…1 (0 = top-left, clockwise)
 * @param {number} sweepElapsedMs — ms since sweep started
 * @returns {number} 0…1
 */
export function rimWaveIntensityAtT(t, sweepElapsedMs) {
  if (sweepElapsedMs >= TRAVEL_DURATION_MS) {
    return 0.52 + hash(t * 137 + sweepElapsedMs * 0.002) * 0.16;
  }

  const head = sweepProgress(sweepElapsedMs);
  const ahead = t - head;
  const behind = head - t;

  // Traveling head — brightest at current position
  if (ahead >= 0 && ahead < HEAD_FRAC) {
    return 0.92 + (1 - ahead / HEAD_FRAC) * 0.08;
  }

  // Trail just behind the head
  if (behind > 0 && behind <= TRAIL_FRAC) {
    const u = behind / TRAIL_FRAC;
    return 0.5 + (1 - u) * 0.42;
  }

  // Already swept earlier in the lap (clockwise from top-left)
  if (behind > TRAIL_FRAC) {
    return SWEPT_BASE + hash(t * 53) * 0.12;
  }

  return 0;
}

/** Whether the one-shot sweep has finished. */
export function isRimSweepComplete(sweepElapsedMs) {
  return sweepElapsedMs >= TRAVEL_DURATION_MS;
}

/**
 * Jagged leader bolt at the sweep head — visible "thunder" origin traveling the rim.
 */
function paintLeaderBolt(ctx, path, headT, phase, globalBoost) {
  const span = 0.055;
  const steps = 14;
  const pts = [];

  for (let i = 0; i <= steps; i += 1) {
    const localT = headT - span * (1 - i / steps);
    const s = sampleRimBorderAtT(path, localT);
    const jit = (hash(i * 17.3 + phase) - 0.5) * 1.4;
    const outJit = 0.15 + hash(i * 9.1 + phase) * 2.8;
    pts.push({
      x: s.x + s.nx * outJit + s.tx * jit,
      y: s.y + s.ny * outJit + s.ty * jit,
      nx: s.nx,
      ny: s.ny,
    });
  }

  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  // Outer violet bloom
  ctx.filter = "blur(3px)";
  ctx.lineWidth = 2.4;
  ctx.strokeStyle = `rgba(180, 40, 255, ${0.45 * globalBoost})`;
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i += 1) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.stroke();

  // White core
  ctx.filter = "blur(0.6px)";
  ctx.lineWidth = 1.1;
  ctx.strokeStyle = `rgba(255, 255, 255, ${0.85 * globalBoost})`;
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i += 1) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.stroke();

  // Outward forks from midpoint
  const mid = pts[Math.floor(pts.length / 2)];
  for (let f = 0; f < 4; f += 1) {
    const seed = f * 31.7 + phase;
    const ang = (hash(seed) - 0.5) * 0.9;
    let nx = mid.nx + ang * 0.35;
    let ny = mid.ny - ang * 0.35;
    const len = Math.hypot(nx, ny) || 1;
    nx /= len;
    ny /= len;
    const forkLen = 1.2 + hash(seed + 1) * 3.5;
    ctx.filter = "blur(1px)";
    ctx.lineWidth = 0.7;
    ctx.strokeStyle = `rgba(255, 200, 255, ${0.55 * globalBoost})`;
    ctx.beginPath();
    ctx.moveTo(mid.x, mid.y);
    ctx.lineTo(mid.x + nx * forkLen, mid.y + ny * forkLen);
    ctx.stroke();
  }

  ctx.filter = "none";
  ctx.restore();
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} sweepElapsedMs — ms since sweep started (not wall clock)
 * @param {number} [pulse] — 0…1 extra swell after sweep completes
 */
export function paintElectricFringe(ctx, sweepElapsedMs, pulse = 1) {
  const path = ensureBorderPath();
  const complete = isRimSweepComplete(sweepElapsedMs);
  const phase = sweepElapsedMs * 0.018;
  const globalBoost = complete ? 0.55 + pulse * 0.45 : 0.95;
  const head = complete ? 1 : sweepProgress(sweepElapsedMs);

  if (!complete) {
    paintLeaderBolt(ctx, path, head, phase, globalBoost);
  }

  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  function strokeNeedleLayer(filter, lineWidth, rgb, alphaBase, lenScale) {
    ctx.filter = filter;
    ctx.lineWidth = lineWidth;
    ctx.beginPath();
    for (let i = 0; i < PATH_SAMPLES; i += 1) {
      const t = i / PATH_SAMPLES;
      const wave = rimWaveIntensityAtT(t, sweepElapsedMs);
      if (wave < 0.04) continue;

      const s = sampleRimBorderAtT(path, t);
      for (let n = 0; n < NEEDLES_PER_SAMPLE; n += 1) {
        const seed = i * 19.1 + n * 41.3;
        const flick = hash(seed + phase) * hash(seed * 2.1 + phase * 0.9);
        if (flick < 0.08 + (1 - wave) * 0.12) continue;

        const angJit = (hash(seed + 1.7) - 0.5) * 0.58;
        let nx = s.nx + angJit * s.tx;
        let ny = s.ny + angJit * s.ty;
        const nlen = Math.hypot(nx, ny) || 1;
        nx /= nlen;
        ny /= nlen;

        const len = (0.4 + hash(seed + 2.3 + phase) * 4.2) * lenScale * wave * globalBoost;
        const root = 0.02 + hash(seed + 3.1) * 0.22;
        const x0 = s.x + s.nx * root;
        const y0 = s.y + s.ny * root;
        ctx.moveTo(x0, y0);
        ctx.lineTo(x0 + nx * len, y0 + ny * len);
      }
    }
    const [r, g, b] = rgb;
    ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, ${alphaBase * globalBoost})`;
    ctx.stroke();
  }

  strokeNeedleLayer("blur(2.8px)", 1.2, [80, 10, 185], 0.38, 1.2);
  strokeNeedleLayer("blur(1.2px)", 1.25, [220, 45, 255], 0.58, 1.0);
  strokeNeedleLayer("blur(0.4px)", 0.55, [255, 240, 255], 0.75, 0.6);

  ctx.filter = "none";
  ctx.restore();
}
