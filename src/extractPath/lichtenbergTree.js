/**
 * Procedural Lichtenberg-figure generator.
 *
 * The reference image (public/analyse/neural-reference.jpg) is a real
 * Lichtenberg figure — the fractal, dendritic branching pattern produced by
 * electrical discharge finding paths of least resistance through an
 * insulator. The physically-accurate way to generate one (Dielectric
 * Breakdown Model / Diffusion-Limited Aggregation) means iteratively solving
 * Laplace's equation or growing a particle aggregate — far too expensive for
 * a real-time fragment shader. The established real-time approximation
 * (used by e.g. stompchicken/lichtenberg and most game lightning VFX) is a
 * recursive branching fractal: each "arm" is a midpoint-displaced line
 * (classic fractal lightning, see canvas/lightning/geometry.js
 * subdivideSegment) that occasionally forks into thinner child arms,
 * tapering hub -> tip. That's what this module builds, rooted at multiple
 * hub positions (mirroring the reference's several bright convergence
 * points: one dominant centre + edge/corner clusters).
 *
 * Output is plain data (arrays of {x,y,w} points per path) — no GL calls
 * here. lichtenbergRenderer.js packs it into textures and draws it with a
 * per-fragment nearest-segment SDF (same technique as
 * src/webgl/thunderRenderer.js's boltDistance, generalised to vary glow
 * width per point so the taper reads in the render, not just the geometry).
 */
import { cumulativeLengths, subdivideSegment } from "../canvas/lightning/geometry.js";
import { createRng, randRange } from "../canvas/lightning/random.js";

// Shared with the real extracted network (see scripts/extract_lichtenberg_pattern.py
// + loadExtractedNetwork.js) — that trace keeps up to 8000 edges / 12
// points-per-edge, proportionally subsampled across every connected cluster
// so small corner/edge hub clusters keep their shape instead of being
// dropped for a few giant clusters (never length-filters individual edges,
// which was fragmenting the mesh — see the script's comments). Values above
// ~10-12k paths rendered garbage on this GPU/driver (likely a per-fragment
// loop-bound limit) — keep MAX_PATHS comfortably under that.
export const MAX_PATHS = 8000;
export const MAX_POINTS_PER_PATH = 12;

function downsample(points, maxPoints) {
  if (points.length <= maxPoints) return points;
  const step = (points.length - 1) / (maxPoints - 1);
  return Array.from({ length: maxPoints }, (_, i) => {
    const idx = Math.min(Math.round(i * step), points.length - 1);
    return points[idx];
  });
}

/** One fractal arm from (x0,y0) to (x0+cos*len, y0+sin*len), width tapering hub->tip. */
function buildArmPath(x0, y0, angle, len, jitterFrac, w0, w1, rng) {
  const x1 = x0 + Math.cos(angle) * len;
  const y1 = y0 + Math.sin(angle) * len;
  const raw = subdivideSegment(x0, y0, x1, y1, len * jitterFrac, 4, rng);
  const pts = downsample(raw, MAX_POINTS_PER_PATH);
  const cum = cumulativeLengths(pts);
  const total = cum[cum.length - 1] || 1;
  return pts.map((p, i) => ({ x: p.x, y: p.y, w: w0 + (w1 - w0) * (cum[i] / total) }));
}

/**
 * Grow one hub's dendritic burst: `armCount` primary directions, each arm
 * recursing (continue + occasional fork) `depth` generations deep, width
 * halving-ish each generation — this self-similarity across scales is the
 * defining fractal property of a real Lichtenberg figure. `budget` caps how
 * many paths THIS hub may contribute (independent of the other hubs) so one
 * dense hub can't starve the rest of the network of its share of MAX_PATHS.
 */
function growHub(hx, hy, opts, rng, out) {
  const { armCount, armLen, depth, branchProb, forkSpread, hubWidth, minLenFrac, budget } = opts;
  const startLen = out.length;

  function grow(x0, y0, angle, len, gen, width) {
    if (out.length >= MAX_PATHS || out.length - startLen >= budget) return;
    if (len < armLen * minLenFrac || gen > depth) return;

    const w0 = width;
    const w1 = width * 0.55;
    const jitter = 0.16 + rng() * 0.1;
    const path = buildArmPath(x0, y0, angle, len, jitter, w0, w1, rng);
    out.push(path);
    const tip = path[path.length - 1];

    const nextLen = len * (0.6 + rng() * 0.14);
    const nextAngle = angle + randRange(rng, -0.3, 0.3) * (1 / (gen + 1));
    grow(tip.x, tip.y, nextAngle, nextLen, gen + 1, w1 * 0.85);

    if (
      rng() < branchProb - gen * 0.1 &&
      out.length < MAX_PATHS &&
      out.length - startLen < budget
    ) {
      const side = rng() < 0.5 ? -1 : 1;
      const forkAngle = angle + side * forkSpread * (0.55 + rng() * 0.6);
      const forkLen = len * (0.42 + rng() * 0.28);
      grow(tip.x, tip.y, forkAngle, forkLen, gen + 1, w1 * 0.62);
    }
  }

  const baseAngle = rng() * Math.PI * 2;
  for (let i = 0; i < armCount; i += 1) {
    const angle = baseAngle + (i / armCount) * Math.PI * 2 + randRange(rng, -0.25, 0.25);
    grow(hx, hy, angle, armLen * (0.85 + rng() * 0.3), 0, hubWidth);
  }
}

/** Thin curved thread linking two hubs — reads as the web's cross-connections. */
function buildBridge(a, b, rng, width) {
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  const raw = subdivideSegment(a.x, a.y, b.x, b.y, len * 0.22, 6, rng);
  const pts = downsample(raw, MAX_POINTS_PER_PATH);
  return pts.map((p) => ({ x: p.x, y: p.y, w: width }));
}

/**
 * The network is anchored at 9 fixed hub positions (matching the reference
 * photo's layout: one dominant centre, 4 edge midpoints, 4 corners), each
 * independently sized/branched via `hubDensity`, plus a sparse spanning-tree
 * of bridges between neighbouring hubs so it reads as one connected web
 * instead of isolated stars.
 */
export function generateLichtenbergNetwork(width, height, options = {}) {
  const { seed = 1, hubDensity = {}, globalScale = 1 } = options;
  const rng = createRng(seed);
  const diag = Math.hypot(width, height);
  const m = Math.min(width, height) * 0.1;

  const hubs = {
    center: { x: width * 0.5, y: height * 0.5, base: 1.4 },
    top: { x: width * 0.5, y: m, base: 0.85 },
    bottom: { x: width * 0.5, y: height - m, base: 0.85 },
    left: { x: m, y: height * 0.5, base: 0.85 },
    right: { x: width - m, y: height * 0.5, base: 0.85 },
    cornerTL: { x: m, y: m, base: 1.0 },
    cornerTR: { x: width - m, y: m, base: 1.0 },
    cornerBL: { x: m, y: height - m, base: 1.0 },
    cornerBR: { x: width - m, y: height - m, base: 1.0 },
  };

  // Reserve each hub its own slice of the MAX_PATHS budget up front so a
  // dense centre burst can't (as it did before this fix) consume the whole
  // texture budget and leave later hubs — or the connecting bridges — with
  // nothing. Reserve a little headroom for the inter-hub bridges below.
  const hubEntries = Object.entries(hubs).filter(([key]) => (hubDensity[key] ?? 1) > 0);
  const bridgeReserve = Math.min(hubEntries.length, 12);
  const perHubBudget = Math.max(6, Math.floor((MAX_PATHS - bridgeReserve) / hubEntries.length));

  const paths = [];
  const hubList = [];
  for (const [key, hub] of hubEntries) {
    const density = (hubDensity[key] ?? 1) * hub.base;
    hubList.push(hub);
    growHub(
      hub.x,
      hub.y,
      {
        armCount: Math.max(3, Math.round(3 + density * 2)),
        armLen: diag * 0.1 * globalScale * (0.7 + density * 0.5),
        depth: density > 1.1 ? 4 : 3,
        branchProb: 0.45,
        forkSpread: 0.85,
        hubWidth: diag * 0.005 * globalScale * (0.7 + density * 0.6),
        minLenFrac: 0.16,
        budget: perHubBudget,
      },
      rng,
      paths
    );
  }

  // Sparse nearest-neighbour bridges so the hubs read as one connected web.
  const connected = new Set();
  for (let i = 0; i < hubList.length && paths.length < MAX_PATHS; i += 1) {
    let best = -1;
    let bestD = Infinity;
    for (let j = 0; j < hubList.length; j += 1) {
      if (i === j) continue;
      const d = Math.hypot(hubList[i].x - hubList[j].x, hubList[i].y - hubList[j].y);
      if (d < bestD) {
        bestD = d;
        best = j;
      }
    }
    if (best < 0) continue;
    const key = i < best ? `${i}-${best}` : `${best}-${i}`;
    if (connected.has(key)) continue;
    connected.add(key);
    paths.push(buildBridge(hubList[i], hubList[best], rng, diag * 0.002 * globalScale));
  }

  return { paths, pointCounts: paths.map((p) => p.length) };
}
