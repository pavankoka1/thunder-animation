import { cumulativeLengths, subdivideSegment } from "../canvas/lightning/geometry.js";
import { createRng } from "../canvas/lightning/random.js";
import {
  MAX_PATHS,
  MAX_TRUNK_COUNT,
  resolveStrikeTiming,
} from "./thunderConfig.js";

export { MAX_PATHS } from "./thunderConfig.js";

export const MAX_POINTS_PER_PATH = 64;

function clamp01(v) {
  return Math.max(0, Math.min(1, v));
}

function downsamplePoints(points, maxPoints) {
  if (points.length <= maxPoints) return points;
  const step = (points.length - 1) / (maxPoints - 1);
  return Array.from({ length: maxPoints }, (_, i) => {
    const idx = Math.min(Math.round(i * step), points.length - 1);
    return points[idx];
  });
}

function rayToRectEdge(ox, oy, angle, width, height, pad = 6) {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  let bestT = Infinity;

  if (cos > 1e-5) bestT = Math.min(bestT, (width - pad - ox) / cos);
  if (cos < -1e-5) bestT = Math.min(bestT, (pad - ox) / cos);
  if (sin > 1e-5) bestT = Math.min(bestT, (height - pad - oy) / sin);
  if (sin < -1e-5) bestT = Math.min(bestT, (pad - oy) / sin);

  return { x: ox + cos * bestT, y: oy + sin * bestT };
}

/** Center → edge main bolt in a given direction. */
function buildTrunkFromCenter(width, height, angle, rng) {
  const cx = width * 0.5;
  const cy = height * 0.5;
  const edge = rayToRectEdge(cx, cy, angle, width, height);
  return downsamplePoints(
    subdivideSegment(cx, cy, edge.x, edge.y, height * 0.09, 5, rng),
    MAX_POINTS_PER_PATH
  );
}

function pickTrunkAngles(rng, trunkCount) {
  const base = rng() * Math.PI * 2;
  return Array.from({ length: trunkCount }, (_, i) => {
    const even = base + (i / trunkCount) * Math.PI * 2;
    return even + (rng() - 0.5) * 0.35;
  });
}

function buildBranch(attach, angle, length, displacement, rng) {
  const endX = attach.x + Math.cos(angle) * length;
  const endY = attach.y + Math.sin(angle) * length;
  const points = subdivideSegment(attach.x, attach.y, endX, endY, displacement, 5, rng);
  return downsamplePoints(points, MAX_POINTS_PER_PATH);
}

function attachRatioOnPath(points, index) {
  const cum = cumulativeLengths(points);
  const total = cum[cum.length - 1];
  return total > 0 ? cum[index] / total : 0;
}

function makePathMeta(points, parentPath, attachRatio) {
  const cum = cumulativeLengths(points);
  const totalLen = cum[cum.length - 1] || 1;
  const cumRatios = cum.map((d) => d / totalLen);
  return {
    parentPath,
    attachRatio,
    pathLength: totalLen,
    cumRatios,
    spawnAt: 0,
    finishAt: 1,
  };
}

/**
 * @param {{ parentPath: number, attachRatio: number, spawnAt: number, finishAt: number, pathLength: number }[]} pathMeta
 * @param {ReturnType<typeof resolveStrikeTiming>} timing
 */
export function assignStrikeTimings(pathMeta, timing) {
  const trunkIndices = [];
  for (let i = 0; i < pathMeta.length; i += 1) {
    if (pathMeta[i].parentPath < 0) trunkIndices.push(i);
  }

  const n = trunkIndices.length;
  const tailRoom = 0.02;
  const maxStagger =
    n > 1 ? Math.max(0, (1 - timing.trunkFinish - tailRoom) / (n - 1)) : 0;
  const stagger = Math.min(timing.trunkStagger, maxStagger);

  trunkIndices.forEach((idx, i) => {
    pathMeta[idx].spawnAt = i * stagger;
    pathMeta[idx].finishAt = Math.min(0.99, i * stagger + timing.trunkFinish);
  });

  for (let i = 0; i < pathMeta.length; i += 1) {
    const child = pathMeta[i];
    if (child.parentPath < 0) continue;

    const parent = pathMeta[child.parentPath];
    if (!parent) continue;

    const window = parent.finishAt - parent.spawnAt;
    child.spawnAt = parent.spawnAt + child.attachRatio * window * 0.92;
    const growth =
      timing.branchGrowthMin +
      Math.min(child.pathLength / 500, 1) *
        (timing.branchGrowthMax - timing.branchGrowthMin);
    child.finishAt = Math.min(child.spawnAt + growth, 0.98);
  }
}

/** Re-apply timing to an existing tree (e.g. after slider change). */
export function applyStrikeTimingsToTree(tree, strikeTiming) {
  assignStrikeTimings(tree.pathMeta, resolveStrikeTiming(strikeTiming));
}

/**
 * Side branches for one trunk only — grows outward as the main bolt reaches each point.
 */
function addTrunkBranches(trunk, trunkPathIdx, paths, pathMeta, width, height, density, rng, pathLimit) {
  const maxBranches = Math.max(1, pathLimit - paths.length);
  const targetBranches = Math.max(1, Math.round(1 + density * (maxBranches - 1)));
  const spacing = Math.max(2, Math.floor(trunk.length / (targetBranches + 2)));

  for (let i = spacing; i < trunk.length - spacing && paths.length < pathLimit; i += spacing) {
    if (rng() > 0.25 + density * 0.75) continue;

    const attach = trunk[i];
    const attachRatio = attachRatioOnPath(trunk, i);
    const prev = trunk[Math.max(0, i - 1)];
    const trunkAngle = Math.atan2(attach.y - prev.y, attach.x - prev.x);
    const side = rng() > 0.5 ? 1 : -1;
    const spread = 0.35 + rng() * 0.85;
    const branchAngle = trunkAngle + side * spread;
    const length = width * (0.06 + rng() * 0.14 * (0.35 + density));
    const displacement = height * (0.03 + rng() * 0.05);

    paths.push(buildBranch(attach, branchAngle, length, displacement, rng));
    pathMeta.push(makePathMeta(paths[paths.length - 1], trunkPathIdx, attachRatio));

    if (
      density > 0.55 &&
      paths.length < pathLimit &&
      rng() < density - 0.35
    ) {
      const branchAngle2 = trunkAngle - side * (spread * 0.65 + rng() * 0.4);
      const length2 = length * (0.55 + rng() * 0.35);
      paths.push(
        buildBranch(attach, branchAngle2, length2, displacement * 0.7, rng)
      );
      pathMeta.push(
        makePathMeta(paths[paths.length - 1], trunkPathIdx, attachRatio)
      );
    }
  }
}

/**
 * @param {number} strikeProgress 0–1 global strike timeline
 * @param {{ parentPath: number, spawnAt: number, finishAt: number }[]} pathMeta
 * @param {number} numPaths
 * @returns {Float32Array}
 */
export function computePathReveals(strikeProgress, pathMeta, numPaths) {
  const reveals = new Float32Array(MAX_PATHS);

  for (let p = 0; p < numPaths; p += 1) {
    const m = pathMeta[p];
    if (!m) {
      reveals[p] = 0;
      continue;
    }

    if (strikeProgress < m.spawnAt) {
      reveals[p] = 0;
      continue;
    }

    const span = m.finishAt - m.spawnAt;
    reveals[p] = span > 0 ? clamp01((strikeProgress - m.spawnAt) / span) : 1;
  }

  return reveals;
}

/**
 * @param {number} width
 * @param {number} height
 * @param {import("./thunderConfig.js").DEFAULT_THUNDER_CONFIG & { strikeTiming?: Partial<import("./thunderConfig.js").DEFAULT_STRIKE_TIMING> }} options
 */
export function generateBoltTree(width, height, options = {}) {
  const {
    branchDensity = 0.45,
    branches = true,
    seed = 42,
    trunkCount = 3,
    strikeTiming: strikeTimingOverride,
  } = options;

  const strikeTiming = resolveStrikeTiming(strikeTimingOverride);
  const rng = createRng(seed);
  const density = Math.max(0, Math.min(1, branchDensity));
  const paths = [];
  const pathMeta = [];

  const count = Math.max(1, Math.min(MAX_TRUNK_COUNT, trunkCount));
  const trunkAngles = pickTrunkAngles(rng, count);
  const pathsPerBolt = Math.max(1, Math.floor(MAX_PATHS / count));

  for (const angle of trunkAngles) {
    if (paths.length >= MAX_PATHS) break;

    const trunk = buildTrunkFromCenter(width, height, angle, rng);
    const trunkPathIdx = paths.length;
    paths.push(trunk);
    pathMeta.push(makePathMeta(trunk, -1, 0));

    if (branches && density > 0) {
      const boltPathLimit = Math.min(MAX_PATHS, trunkPathIdx + pathsPerBolt);
      addTrunkBranches(
        trunk,
        trunkPathIdx,
        paths,
        pathMeta,
        width,
        height,
        density,
        rng,
        boltPathLimit
      );
    }
  }

  assignStrikeTimings(pathMeta, strikeTiming);
  return { paths, pointCounts: paths.map((p) => p.length), pathMeta };
}

/** @deprecated use generateBoltTree */
export function generateBoltPath(width, height, seed = 42) {
  return generateBoltTree(width, height, { branches: false, seed, trunkCount: 1 }).paths[0];
}

export const BOLT_MAX_POINTS = MAX_POINTS_PER_PATH;
