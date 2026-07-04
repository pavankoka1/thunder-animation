/**
 * Branching bolt-tree generator for the analyse betspot (energy-canvas px).
 * N center clusters, each a trunk to an edge + recursive tapering branches.
 * Reuses the home page's fractal midpoint subdivision — pure, no DOM.
 */
import { cumulativeLengths, subdivideSegment } from "../canvas/lightning/geometry.js";

export const DEFAULT_CONFIG = {
  seed: 1337,
  clusterCount: 3,
  clusterSpread: 0.34, // fraction of half-width the origins spread from center
  branchChance: 0.4,
  maxDepth: 3,
  trunkJitter: 26, // trunk midpoint displacement (px)
  branchLenMin: 26,
  branchLenMax: 62,
  // thickness / glow (px + 0..1)
  haloWidth: 9.0,
  midWidth: 4.0,
  coreWidth: 1.8,
  haloColor: [150, 90, 255],
  midColor: [120, 200, 255],
  coreColor: [245, 250, 255],
  haloAlpha: 0.16,
  midAlpha: 0.3,
  coreAlpha: 0.95,
  // motion (ms)
  strikeMs: 900,
  holdMs: 1400,
  restrikeMs: 500,
  // edge fade
  edgeRadius: 0.72,
  edgeSoftness: 1.06,
};

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rr = (rng, lo, hi) => lo + (hi - lo) * rng();
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

function edgeTarget(rng, w, h) {
  const pad = 6;
  const e = [
    { x: rr(rng, pad, w - pad), y: pad },
    { x: rr(rng, pad, w - pad), y: h - pad },
    { x: pad, y: rr(rng, pad, h - pad) },
    { x: w - pad, y: rr(rng, pad, h - pad) },
  ];
  return e[Math.floor(rng() * 4) % 4];
}

/**
 * @returns {{clusters:Array<{x,y}>, segments:Array<{id,depth,points,cumLengths,length,spawnAt,clusterId}>}}
 */
export function generateField(config, w, h) {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const rng = mulberry32(cfg.seed);
  const segments = [];
  const clusters = [];
  let id = 0;
  const cx = w / 2;
  const cy = h / 2;

  const clampPts = (pts) =>
    pts.map((p) => ({ x: clamp(p.x, 0, w), y: clamp(p.y, 0, h) }));

  const addBranch = (parent, fromPts, fromCum, attachIdx, depth, clusterId) => {
    if (depth > cfg.maxDepth) return;
    const parentLen = fromCum[fromCum.length - 1];
    const spawnAt =
      parent.spawnAt + (fromCum[attachIdx] / parentLen) * (1 - parent.spawnAt);
    const prev = fromPts[Math.max(0, attachIdx - 1)];
    const at = fromPts[attachIdx];
    const baseAng = Math.atan2(at.y - prev.y, at.x - prev.x);
    const ang = baseAng + (rng() < 0.5 ? -1 : 1) * rr(rng, 0.45, 1.15);
    const len = rr(rng, cfg.branchLenMin, cfg.branchLenMax) * (1 - depth * 0.22);
    const end = { x: at.x + Math.cos(ang) * len, y: at.y + Math.sin(ang) * len };
    const pts = clampPts(
      subdivideSegment(
        at.x,
        at.y,
        end.x,
        end.y,
        cfg.trunkJitter * 0.5 * (1 - depth * 0.15),
        1.6,
        rng
      )
    );
    const cum = cumulativeLengths(pts);
    const seg = {
      id: id++,
      depth,
      points: pts,
      cumLengths: cum,
      length: cum[cum.length - 1],
      spawnAt,
      clusterId,
    };
    segments.push(seg);
    for (let i = 2; i < pts.length - 1; i += 2) {
      if (rng() < cfg.branchChance * (1 - depth * 0.25))
        addBranch(seg, pts, cum, i, depth + 1, clusterId);
    }
  };

  for (let c = 0; c < cfg.clusterCount; c += 1) {
    const ang = (c / cfg.clusterCount) * Math.PI * 2 + rng() * 0.8;
    const rad = cfg.clusterSpread * (w / 2) * (0.3 + rng() * 0.7);
    const origin = {
      x: clamp(cx + Math.cos(ang) * rad, 8, w - 8),
      y: clamp(cy + Math.sin(ang) * rad * 0.5, 8, h - 8),
    };
    clusters.push(origin);
    const target = edgeTarget(rng, w, h);
    const pts = clampPts(
      subdivideSegment(origin.x, origin.y, target.x, target.y, cfg.trunkJitter, 2.2, rng)
    );
    const cum = cumulativeLengths(pts);
    const trunk = {
      id: id++,
      depth: 0,
      points: pts,
      cumLengths: cum,
      length: cum[cum.length - 1],
      spawnAt: 0,
      clusterId: c,
    };
    segments.push(trunk);
    for (let i = 2; i < pts.length - 2; i += 1) {
      if (rng() < cfg.branchChance) addBranch(trunk, pts, cum, i, 1, c);
    }
  }
  return { clusters, segments };
}

/** Grown length of a segment at progress ∈ [0,1] (ease-out), respecting spawnAt. */
export function segmentDrawLength(seg, progress) {
  if (progress <= seg.spawnAt || seg.spawnAt >= 1) return 0;
  const local = (progress - seg.spawnAt) / (1 - seg.spawnAt);
  const eased = 1 - (1 - Math.max(0, Math.min(1, local))) ** 2.2;
  return seg.length * eased;
}
