/**
 * Displacement-warp motion for the analyse betspot.
 *
 * The pattern is already baked into the energy canvas. Each frame we resample
 * those pixels through displacement = anchor(x,y) · flow(x,y,t):
 *   • flow — a slow, low-frequency field of summed sinusoids that oscillates
 *     around rest and never drifts (matches the SVGs' zero-net-drift wander)
 *   • anchor — 0 at the 3 bright hubs, ramping to 1 away from them, so the
 *     clusters stay put and the filaments between them flex
 * No new strokes, no overlay: the painted pixels themselves move.
 */

/** Max displacement, energy-canvas px (~0.3% of the 438px width). */
export const MAX_AMP = 1.8;

/** Spatial frequencies (rad/px) → wavelengths ~240–430px, larger than the body. */
const SK1 = 0.0155;
const SK2 = 0.0242;
/** Temporal rates (rad/s) → ~0.2 and ~0.14 Hz. */
const TR1 = 1.3;
const TR2 = 0.9;
/** Two bands per axis, summing to 1 before the MAX_AMP scale (keeps it bounded). */
const A1 = 0.6;
const A2 = 0.4;

/** Anchor ramp radii (px): frozen within R0 of a hub, free beyond R1. */
const R0 = 6;
const R1 = 42;
/** Coarse grid step for the per-frame flow evaluation (px). */
const GRID_STEP = 8;

function smoothstep(a, b, x) {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/**
 * Flow displacement at a point and time, bounded by MAX_AMP on each axis.
 * Pure sinusoids in t → zero temporal mean (no net drift). Deterministic.
 */
export function sampleFlow(x, y, tSec) {
  const dx =
    Math.sin(x * SK1 + y * SK2 * 0.6 + tSec * TR1) * A1 +
    Math.sin(x * SK2 * 0.5 - y * SK1 + tSec * TR2 + 1.7) * A2;
  const dy =
    Math.cos(y * SK1 - x * SK2 * 0.5 + tSec * TR1 * 0.85) * A1 +
    Math.cos(x * SK1 * 0.7 + y * SK2 + tSec * TR2 - 2.1) * A2;
  return { x: dx * MAX_AMP, y: dy * MAX_AMP };
}

/**
 * Per-pixel anchor weight in [0,1]: 0 within R0 of the nearest hub, ramping via
 * smoothstep to 1 beyond R1. With no hubs the whole field is free (1).
 */
export function buildAnchorField(w, h, hubs, r0 = R0, r1 = R1) {
  const field = new Float32Array(w * h);
  if (!hubs.length) {
    field.fill(1);
    return field;
  }
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      let best = Infinity;
      for (let k = 0; k < hubs.length; k += 1) {
        const d = Math.hypot(hubs[k].x - x, hubs[k].y - y);
        if (d < best) best = d;
      }
      field[y * w + x] = smoothstep(r0, r1, best);
    }
  }
  return field;
}

/**
 * Bilinearly sample RGBA from `src` (w×h) at (fx,fy), edge-clamped, writing 4
 * bytes into `out` at offset `oi`. Alpha travels with the colour.
 */
export function bilinearSample(src, w, h, fx, fy, out, oi) {
  const x = fx < 0 ? 0 : fx > w - 1 ? w - 1 : fx;
  const y = fy < 0 ? 0 : fy > h - 1 ? h - 1 : fy;
  const x0 = x | 0;
  const y0 = y | 0;
  const x1 = x0 + 1 < w ? x0 + 1 : x0;
  const y1 = y0 + 1 < h ? y0 + 1 : y0;
  const tx = x - x0;
  const ty = y - y0;
  const i00 = (y0 * w + x0) * 4;
  const i10 = (y0 * w + x1) * 4;
  const i01 = (y1 * w + x0) * 4;
  const i11 = (y1 * w + x1) * 4;
  for (let c = 0; c < 4; c += 1) {
    const top = src[i00 + c] * (1 - tx) + src[i10 + c] * tx;
    const bot = src[i01 + c] * (1 - tx) + src[i11 + c] * tx;
    out[oi + c] = top * (1 - ty) + bot * ty;
  }
}

/**
 * One-time asset bundle. Caches the baked pixels, a reusable output buffer, the
 * anchor field, and coarse flow-grid buffers.
 *
 * @param {HTMLCanvasElement} baked the static energy bake
 * @param {Array<{x,y,strength}>} hubs anchor hubs from detectHubs
 */
export function initWarpAssets(baked, hubs) {
  const w = baked.width;
  const h = baked.height;
  const src = baked.getContext("2d").getImageData(0, 0, w, h).data;
  const out = new ImageData(w, h);
  const anchor = buildAnchorField(w, h, hubs);

  const gw = Math.ceil(w / GRID_STEP) + 1;
  const gh = Math.ceil(h / GRID_STEP) + 1;
  return {
    w,
    h,
    src,
    out,
    anchor,
    gw,
    gh,
    gx: new Float32Array(gw * gh),
    gy: new Float32Array(gw * gh),
  };
}

/**
 * Paint one warped frame: resample the cached bake through the flow field and
 * putImageData. Flow is evaluated on a coarse grid and bilinearly interpolated
 * per pixel to keep trig cheap.
 */
export function paintEnergyFrame(ctx, assets, tMs) {
  const { w, h, src, out, anchor, gw, gh, gx, gy } = assets;
  const t = tMs / 1000;

  for (let gj = 0; gj < gh; gj += 1) {
    for (let gi = 0; gi < gw; gi += 1) {
      const f = sampleFlow(gi * GRID_STEP, gj * GRID_STEP, t);
      const gk = gj * gw + gi;
      gx[gk] = f.x;
      gy[gk] = f.y;
    }
  }

  const dst = out.data;
  for (let y = 0; y < h; y += 1) {
    const gjf = y / GRID_STEP;
    const gj0 = gjf | 0;
    const ty = gjf - gj0;
    const row0 = gj0 * gw;
    const row1 = (gj0 + 1 < gh ? gj0 + 1 : gj0) * gw;
    for (let x = 0; x < w; x += 1) {
      const oi = (y * w + x) * 4;
      const a = anchor[y * w + x];
      if (a <= 0) {
        bilinearSample(src, w, h, x, y, dst, oi);
        continue;
      }
      const gif = x / GRID_STEP;
      const gi0 = gif | 0;
      const tx = gif - gi0;
      const gi1 = gi0 + 1 < gw ? gi0 + 1 : gi0;
      const dxTop = gx[row0 + gi0] * (1 - tx) + gx[row0 + gi1] * tx;
      const dxBot = gx[row1 + gi0] * (1 - tx) + gx[row1 + gi1] * tx;
      const dyTop = gy[row0 + gi0] * (1 - tx) + gy[row0 + gi1] * tx;
      const dyBot = gy[row1 + gi0] * (1 - tx) + gy[row1 + gi1] * tx;
      const dx = (dxTop * (1 - ty) + dxBot * ty) * a;
      const dy = (dyTop * (1 - ty) + dyBot * ty) * a;
      bilinearSample(src, w, h, x - dx, y - dy, dst, oi);
    }
  }

  ctx.putImageData(out, 0, 0);
}
