import { BETSPOT_CLIP, THUNDER_ORIGIN } from "../betspotGeometry.js";
import { createRng, randRange } from "./random.js";
import { cumulativeLengths, subdivideSegment } from "./geometry.js";

/**
 * @typedef {{ x: number, y: number }} Point
 * @typedef {{
 *   id: number,
 *   depth: number,
 *   points: Point[],
 *   length: number,
 *   cumLengths: number[],
 *   spawnAt: number,
 *   parentId: number | null,
 * }} LightningSegment
 * @typedef {{
 *   origin: Point,
 *   segments: LightningSegment[],
 *   trunkId: number,
 *   totalDuration: number,
 * }} LightningTree
 */

function edgeTarget(origin, rng) {
  const pad = 4;
  const edges = [
    { x: randRange(rng, BETSPOT_CLIP.x + pad, BETSPOT_CLIP.x + BETSPOT_CLIP.width - pad), y: BETSPOT_CLIP.y + pad },
    { x: randRange(rng, BETSPOT_CLIP.x + pad, BETSPOT_CLIP.x + BETSPOT_CLIP.width - pad), y: BETSPOT_CLIP.y + BETSPOT_CLIP.height - pad },
    { x: BETSPOT_CLIP.x + pad, y: randRange(rng, BETSPOT_CLIP.y + pad, BETSPOT_CLIP.y + BETSPOT_CLIP.height - pad) },
    { x: BETSPOT_CLIP.x + BETSPOT_CLIP.width - pad, y: randRange(rng, BETSPOT_CLIP.y + pad, BETSPOT_CLIP.y + BETSPOT_CLIP.height - pad) },
  ];

  // Bias toward upper-right-ish exits like the design art.
  const weights = [1.2, 0.8, 0.7, 1.4];
  const total = weights.reduce((a, b) => a + b, 0);
  let roll = rng() * total;
  for (let i = 0; i < edges.length; i += 1) {
    roll -= weights[i];
    if (roll <= 0) return edges[i];
  }
  return edges[edges.length - 1];
}

function buildBolt(x1, y1, x2, y2, displacement, minLength, rng) {
  return subdivideSegment(x1, y1, x2, y2, displacement, minLength, rng);
}

/**
 * Build a lightning tree: one main trunk from center, branches spawn along it.
 * `spawnAt` is normalized [0,1] along trunk length when a branch begins growing.
 */
export function generateLightningTree(options = {}) {
  const {
    origin = THUNDER_ORIGIN,
    seed = 1337,
    maxDepth = 3,
    branchChance = 0.34,
  } = options;

  const rng = createRng(seed);
  const target = edgeTarget(origin, rng);
  const trunkPoints = buildBolt(origin.x, origin.y, target.x, target.y, 16, 2.4, rng);
  const trunkCum = cumulativeLengths(trunkPoints);
  const trunkLength = trunkCum[trunkCum.length - 1];

  /** @type {LightningSegment[]} */
  const segments = [];
  let nextId = 0;

  const trunk = {
    id: nextId++,
    depth: 0,
    points: trunkPoints,
    length: trunkLength,
    cumLengths: trunkCum,
    spawnAt: 0,
    parentId: null,
  };
  segments.push(trunk);

  function branchSpawnAt(parent, attachDist, parentLen) {
    if (parentLen <= 0) return 1;
    return parent.spawnAt + (attachDist / parentLen) * (1 - parent.spawnAt);
  }

  function addBranch(parentSegment, fromPoints, fromCum, attachIndex, depth) {
    if (depth > maxDepth) return;

    const parentLen = fromCum[fromCum.length - 1];
    const attachDist = fromCum[attachIndex];
    const spawnAt = branchSpawnAt(parentSegment, attachDist, parentLen);

    const prev = fromPoints[Math.max(0, attachIndex - 1)];
    const attach = fromPoints[attachIndex];
    const baseAngle = Math.atan2(attach.y - prev.y, attach.x - prev.x);
    const branchAngle =
      baseAngle + (rng() < 0.5 ? -1 : 1) * randRange(rng, 0.45, 1.15);
    const branchLen = randRange(rng, 8, 18) * (1 - depth * 0.22);

    const end = {
      x: attach.x + Math.cos(branchAngle) * branchLen,
      y: attach.y + Math.sin(branchAngle) * branchLen,
    };

    const points = buildBolt(
      attach.x,
      attach.y,
      end.x,
      end.y,
      9 * (1 - depth * 0.15),
      1.6,
      rng
    );
    const cum = cumulativeLengths(points);
    const length = cum[cum.length - 1];

    const segment = {
      id: nextId++,
      depth,
      points,
      length,
      cumLengths: cum,
      spawnAt,
      parentId: parentSegment.id,
    };
    segments.push(segment);

    for (let i = 2; i < points.length - 1; i += 2) {
      if (rng() < branchChance * (1 - depth * 0.25)) {
        addBranch(segment, points, cum, i, depth + 1);
      }
    }
  }

  for (let i = 2; i < trunkPoints.length - 2; i += 1) {
    if (rng() < branchChance) {
      addBranch(trunk, trunkPoints, trunkCum, i, 1);
    }
  }

  return {
    origin,
    segments,
    trunkId: trunk.id,
    totalDuration: 1,
  };
}

/** Visible length of a segment at global progress t ∈ [0, 1]. */
export function segmentDrawLength(segment, progress) {
  if (progress <= segment.spawnAt) return 0;
  if (segment.spawnAt >= 1) return 0;

  const local = (progress - segment.spawnAt) / (1 - segment.spawnAt);
  const eased = 1 - (1 - local) ** 2.2;
  return segment.length * Math.min(1, Math.max(0, eased));
}

export function treeStats(tree) {
  return {
    segments: tree.segments.length,
    trunkLength: tree.segments.find((s) => s.id === tree.trunkId)?.length ?? 0,
  };
}
