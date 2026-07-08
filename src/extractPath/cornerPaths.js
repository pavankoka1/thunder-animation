/**
 * Corner-burst augmentation for the extracted network.
 *
 * The traced photo (neural-reference.jpg) is squarer (~1.25:1) than the wide
 * betspot body (~2.15:1) and its top/bottom get cropped ~7% by the cover-fit
 * in loadExtractedNetwork, so the body's four ROUNDED CORNERS end up sparser
 * than reference.png — which shows a bright dendritic hub tucked into each
 * corner. This module grows a small fractal Lichtenberg burst that fans INWARD
 * from each corner (reusing the exact midpoint-displacement fractal the
 * procedural generator uses — see lichtenbergTree.js / geometry.js
 * subdivideSegment), so the added filaments read as native to the traced web,
 * not as a foreign overlay. loadExtractedNetwork appends these to the real
 * traced paths; the spatial grid + SDF shader treat them identically.
 */
import { cumulativeLengths, subdivideSegment } from "../canvas/lightning/geometry.js";
import { createRng, randRange } from "../canvas/lightning/random.js";
import { MAX_POINTS_PER_PATH } from "./lichtenbergTree.js";

function downsample(points, maxPoints) {
  if (points.length <= maxPoints) return points;
  const step = (points.length - 1) / (maxPoints - 1);
  return Array.from({ length: maxPoints }, (_, i) => {
    const idx = Math.min(Math.round(i * step), points.length - 1);
    return points[idx];
  });
}

/** One fractal arm (x0,y0) -> (x0+cos*len, y0+sin*len), width tapering hub->tip. */
function buildArm(x0, y0, angle, len, jitterFrac, w0, w1, rng) {
  const x1 = x0 + Math.cos(angle) * len;
  const y1 = y0 + Math.sin(angle) * len;
  const raw = subdivideSegment(x0, y0, x1, y1, len * jitterFrac, 4, rng);
  const pts = downsample(raw, MAX_POINTS_PER_PATH);
  const cum = cumulativeLengths(pts);
  const total = cum[cum.length - 1] || 1;
  return pts.map((p, i) => ({ x: p.x, y: p.y, w: w0 + (w1 - w0) * (cum[i] / total) }));
}

/**
 * Grow the four corner bursts.
 *
 * @param {number} bodyW body width in renderer px (already ×SUPERSAMPLE)
 * @param {number} bodyH
 * @param {{ density?: number, widthScale?: number, seed?: number,
 *   cornerRadius?: number }} [options]
 *   density     — 0 disables; ~1 is a natural match, higher = busier corners.
 *   widthScale  — multiplied into stroke width so corner filaments track the
 *                 same Width-scale slider as the traced paths.
 *   cornerRadius— body rounded-corner radius (px); the hub is anchored at the
 *                 corner TIP so the burst reads as starting from the corner
 *                 with no gap (instead of set back inside the body).
 * @returns {{x:number,y:number,w:number}[][]} paths, in body px
 */
export function generateCornerPaths(bodyW, bodyH, options = {}) {
  const { density = 1, widthScale = 1, seed = 7, cornerRadius } = options;
  if (density <= 0) return [];

  const rng = createRng(seed);
  const diag = Math.hypot(bodyW, bodyH);
  // Anchor each burst right at the visible corner TIP. On a rounded rect the
  // outermost visible point along the 45° diagonal sits r*(1 - 1/√2) in from
  // the true (square) corner; anchoring a hair further in than that puts the
  // bright core just inside the body at the very corner, so the spokes appear
  // to originate FROM the corner with no gap. (Anything outside the round is
  // clipped by the shader's inBody mask anyway.)
  const r = cornerRadius ?? Math.min(bodyW, bodyH) * 0.14;
  // Per-axis offset of the visible corner tip on a rounded rect is r*(1-1/√2)
  // ≈ 0.293r; sit the hub a hair inside that so the bright knot lands right at
  // the corner tip (no gap) while staying just within the clip.
  const anchor = r * 0.33;

  // Each corner fans into the body: direction points toward the interior
  // (screen space, y down), spread is the half-fan around that direction.
  const QUARTER = Math.PI / 4;
  const corners = [
    { x: anchor, y: anchor, dir: QUARTER }, // TL -> down-right
    { x: bodyW - anchor, y: anchor, dir: 3 * QUARTER }, // TR -> down-left
    { x: anchor, y: bodyH - anchor, dir: -QUARTER }, // BL -> up-right
    { x: bodyW - anchor, y: bodyH - anchor, dir: -3 * QUARTER }, // BR -> up-left
  ];

  // Many thin radiating spokes (a starburst), NOT a few thick arms — matches
  // neural-reference.jpg's corner hubs: a dense knot of hair-thin filaments.
  const armCount = Math.max(6, Math.round(9 + density * 6));
  const armLen = diag * 0.085 * (0.7 + density * 0.35);
  // Hair-thin, tracking the traced tendrils (median ~0.8px, p90 ~1.75px at
  // widthScale 1). A slightly wider innermost core (×widthScale) tapers fast
  // to a fine tip — the bright-hub look comes from MANY spokes converging plus
  // the glow, not from thick strokes.
  const hubWidth = 0.95 * widthScale;
  const depth = density > 1.2 ? 4 : 3;
  const branchProb = 0.5;
  const forkSpread = 0.8;
  const minLen = armLen * 0.16;
  // Cap paths PER corner so a high density can't explode the path count (each
  // path is a fixed texture row + grid registrations — see spatialGrid.js).
  const budgetPerCorner = Math.round(75 * (0.5 + density));
  const halfFan = 1.15; // radians each side of `dir` — a wide inward starburst

  const out = [];

  for (const c of corners) {
    const startCount = out.length;

    const grow = (x0, y0, angle, len, gen, width) => {
      if (out.length - startCount >= budgetPerCorner) return;
      if (len < minLen || gen > depth) return;

      const w0 = width;
      const w1 = width * 0.55;
      const jitter = 0.16 + rng() * 0.1;
      out.push(buildArm(x0, y0, angle, len, jitter, w0, w1, rng));
      const tip = out[out.length - 1][out[out.length - 1].length - 1];

      const nextLen = len * (0.6 + rng() * 0.14);
      const nextAngle = angle + randRange(rng, -0.3, 0.3) * (1 / (gen + 1));
      grow(tip.x, tip.y, nextAngle, nextLen, gen + 1, w1 * 0.85);

      if (rng() < branchProb - gen * 0.1 && out.length - startCount < budgetPerCorner) {
        const side = rng() < 0.5 ? -1 : 1;
        const forkAngle = angle + side * forkSpread * (0.55 + rng() * 0.6);
        grow(tip.x, tip.y, forkAngle, len * (0.42 + rng() * 0.28), gen + 1, w1 * 0.62);
      }
    };

    for (let i = 0; i < armCount; i += 1) {
      // Spread the primary arms across the inward-facing fan so the burst
      // opens into the body instead of spraying back off-canvas.
      const t = armCount === 1 ? 0.5 : i / (armCount - 1);
      const angle = c.dir - halfFan + t * (2 * halfFan) + randRange(rng, -0.12, 0.12);
      grow(c.x, c.y, angle, armLen * (0.85 + rng() * 0.3), 0, hubWidth);
    }
  }

  return out;
}
