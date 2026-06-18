import { BETSPOT_CLIP, BETSPOT_QUADRANT, THUNDER_ORIGIN, betspotQuadrant, segmentPrimarilyInQuadrant } from "../betspotGeometry.js";
import { createRng, randRange } from "../lightning/random.js";
import { cumulativeLengths, subdivideSegment } from "../lightning/geometry.js";
import { buildCausticCanvas, buildSkeletonCanvas } from "./skeletonMask.js";

export const BOLT_PHASE_END = 1;

const key = (x, y) => `${x},${y}`;

function dist(a, b) {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

/** White / pale filament pixels in the plasma raster (path skeleton). */
function isBright(data, w, x, y) {
  if (x < 0 || y < 0 || x >= w || y < 0) return false;
  const i = (y * w + x) * 4;
  const lum = data[i] + data[i + 1] + data[i + 2];
  return data[i + 3] > 10 && lum > 90 && data[i + 1] > 30;
}

function buildBrightMask(plasmaImage, frame) {
  const { width: w, height: h } = frame;
  const off = document.createElement("canvas");
  off.width = w;
  off.height = h;
  const ctx = off.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(plasmaImage, 0, 0, w, h);
  const { data } = ctx.getImageData(0, 0, w, h);

  const bright = new Uint8Array(w * h);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      bright[y * w + x] = isBright(data, w, x, y) ? 1 : 0;
    }
  }
  return { bright: dilateBright(bright, w, h, 1), w, h, data };
}

/** Bridge 1px gaps so traced paths follow connected filament skeletons. */
function dilateBright(bright, w, h, radius = 1) {
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      if (!bright[y * w + x]) continue;
      for (let dy = -radius; dy <= radius; dy += 1) {
        for (let dx = -radius; dx <= radius; dx += 1) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          out[ny * w + nx] = 1;
        }
      }
    }
  }
  return out;
}

/** K-means — finds the 3 center thunder clusters in the art. */
function findThreeClusters(bright, w, h, origin, radius = 14) {
  const seeds = [];
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      if (!bright[y * w + x]) continue;
      if (dist({ x, y }, origin) > radius) continue;
      seeds.push({ x, y });
    }
  }

  if (seeds.length < 3) {
    return [
      { x: origin.x - 5, y: origin.y - 2 },
      { x: origin.x + 5, y: origin.y - 2 },
      { x: origin.x, y: origin.y + 5 },
    ];
  }

  let c1 = { x: origin.x - 5, y: origin.y - 2 };
  let c2 = { x: origin.x + 5, y: origin.y - 2 };
  let c3 = { x: origin.x, y: origin.y + 5 };

  for (let iter = 0; iter < 14; iter += 1) {
    const groups = [[], [], []];
    for (const p of seeds) {
      const d0 = dist(p, c1);
      const d1 = dist(p, c2);
      const d2 = dist(p, c3);
      const m = Math.min(d0, d1, d2);
      if (m === d0) groups[0].push(p);
      else if (m === d1) groups[1].push(p);
      else groups[2].push(p);
    }
    const avg = (arr, fallback) =>
      arr.length
        ? {
            x: arr.reduce((s, p) => s + p.x, 0) / arr.length,
            y: arr.reduce((s, p) => s + p.y, 0) / arr.length,
          }
        : fallback;
    c1 = avg(groups[0], c1);
    c2 = avg(groups[1], c2);
    c3 = avg(groups[2], c3);
  }

  return [c1, c2, c3].sort((a, b) => a.x - b.x);
}

function getNeighbors(x, y, w, h, bright) {
  const out = [];
  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      if (!dx && !dy) continue;
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      if (bright[ny * w + nx]) out.push({ x: nx, y: ny });
    }
  }
  return out;
}

function simplifyPoints(points, minDist = 0.65) {
  if (points.length <= 2) return points;
  const out = [points[0]];
  for (let i = 1; i < points.length; i += 1) {
    const last = out[out.length - 1];
    const p = points[i];
    if (dist(p, last) >= minDist || i === points.length - 1) out.push(p);
  }
  return out;
}

/**
 * Walk bright pixels away from betspot center, biased along cluster→outward angle.
 */
function traceArtArm(start, bright, w, h, origin, armVisited, preferAngle) {
  const sx = Math.round(start.x);
  const sy = Math.round(start.y);
  const points = [{ x: sx, y: sy }];
  const local = new Set([key(sx, sy)]);
  armVisited.add(key(sx, sy));

  let cur = points[0];
  let lastDist = dist(cur, origin);
  let stalls = 0;

  for (let step = 0; step < 90; step += 1) {
    const nbrs = getNeighbors(cur.x, cur.y, w, h, bright).filter(
      (n) => !local.has(key(n.x, n.y)) && !armVisited.has(key(n.x, n.y))
    );
    if (!nbrs.length) break;

    let best = nbrs[0];
    let bestScore = -Infinity;

    for (const n of nbrs) {
      const outward = dist(n, origin);
      const stepAngle = Math.atan2(n.y - cur.y, n.x - cur.x);
      const align = preferAngle != null ? Math.cos(stepAngle - preferAngle) : 0;
      const score = outward + align * 4;
      if (score > bestScore) {
        bestScore = score;
        best = n;
      }
    }

    const newDist = dist(best, origin);
    if (newDist <= lastDist + 0.15) {
      stalls += 1;
      if (stalls >= 2) break;
    } else {
      stalls = 0;
    }

    lastDist = newDist;
    local.add(key(best.x, best.y));
    armVisited.add(key(best.x, best.y));
    points.push(best);
    cur = best;
  }

  return simplifyPoints(points);
}

function traceSideBranch(fromPoint, firstStep, bright, w, h, origin, branchVisited, maxSteps = 40) {
  const points = [
    { x: fromPoint.x, y: fromPoint.y },
    { x: firstStep.x, y: firstStep.y },
  ];
  const local = new Set([key(fromPoint.x, fromPoint.y), key(firstStep.x, firstStep.y)]);
  branchVisited.add(key(firstStep.x, firstStep.y));

  let prev = fromPoint;
  let stepCur = firstStep;

  for (let step = 0; step < maxSteps; step += 1) {
    const forward = Math.atan2(stepCur.y - prev.y, stepCur.x - prev.x);
    const nbrs = getNeighbors(stepCur.x, stepCur.y, w, h, bright).filter(
      (n) => !local.has(key(n.x, n.y)) && !branchVisited.has(key(n.x, n.y))
    );
    if (!nbrs.length) break;

    const curDist = dist(stepCur, origin);
    let best = null;
    let bestScore = -Infinity;
    for (const n of nbrs) {
      const stepAngle = Math.atan2(n.y - stepCur.y, n.x - stepCur.x);
      const perp = Math.abs(Math.sin(stepAngle - forward));
      const outward = dist(n, origin);
      // Hard-reject inward steps so sub-branches always extend away from origin
      // (the wavefront reveal model assumes monotonic outward growth — without
      // this, branches occasionally curl back toward centre and read as "paint
      // landing from the edge").
      if (outward <= curDist - 0.15) continue;
      const score = outward + perp * 3;
      if (score > bestScore) {
        bestScore = score;
        best = n;
      }
    }
    if (!best) break;

    local.add(key(best.x, best.y));
    branchVisited.add(key(best.x, best.y));
    points.push(best);
    prev = stepCur;
    stepCur = best;
  }

  return simplifyPoints(points, 0.55);
}

function rayToBetspotEdge(ox, oy, angle, clip = BETSPOT_CLIP, pad = 3) {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  let bestT = Infinity;
  if (cos > 0.0001) bestT = Math.min(bestT, (clip.x + clip.width - pad - ox) / cos);
  if (cos < -0.0001) bestT = Math.min(bestT, (clip.x + pad - ox) / cos);
  if (sin > 0.0001) bestT = Math.min(bestT, (clip.y + clip.height - pad - oy) / sin);
  if (sin < -0.0001) bestT = Math.min(bestT, (clip.y + pad - oy) / sin);
  if (!Number.isFinite(bestT) || bestT <= 0) return { x: ox, y: oy };
  return { x: ox + cos * bestT, y: oy + sin * bestT };
}

function extendPathToEdge(points, rng, clip) {
  if (points.length < 2) return points;

  const tip = points[points.length - 1];
  const prev = points[points.length - 2];
  const angle = Math.atan2(tip.y - prev.y, tip.x - prev.x);
  const edge = rayToBetspotEdge(tip.x, tip.y, angle, clip);

  if (dist(tip, edge) < 2) return points;

  const extension = subdivideSegment(
    tip.x,
    tip.y,
    edge.x,
    edge.y,
    randRange(rng, 4, 7),
    1.8,
    rng
  );

  return [...points.slice(0, -1), ...extension];
}

/**
 * Prepend a short jittered link from origin to the trunk's existing start so
 * the path begins at the chip center. Skips when the arm already starts at
 * (or essentially at) origin to avoid creating a zero-length stub.
 */
function anchorArmAtOrigin(armPoints, origin, rng) {
  if (!armPoints.length) return armPoints;
  const first = armPoints[0];
  const d = dist(first, origin);
  if (d < 1) return armPoints;

  // Subdivide so the wavefront sees a smooth growth from origin into the arm
  // instead of one big edge-of-the-stroke jump.
  const link = subdivideSegment(
    origin.x,
    origin.y,
    first.x,
    first.y,
    Math.max(3, Math.round(d * 0.6)),
    0.8,
    rng
  );
  // `link` ends at `first`, so drop the duplicate before concatenating.
  return [...link.slice(0, -1), ...armPoints];
}

/**
 * Jittered ray from origin to the betspot edge in a given direction.
 * Used to synthesize trunks for wing directions the art clusters don't cover,
 * so the strike radiates symmetrically from center to all edges instead of
 * leaving SE/SW empty until sub-branches catch up.
 */
function syntheticArmToEdge(origin, angle, rng, clip = BETSPOT_CLIP) {
  const edge = rayToBetspotEdge(origin.x, origin.y, angle, clip);
  if (dist(origin, edge) < 2) return null;
  return subdivideSegment(
    origin.x,
    origin.y,
    edge.x,
    edge.y,
    randRange(rng, 6, 8),
    1.7,
    rng
  );
}

/** Shortest signed angular distance between two angles (radians). */
function angularDist(a, b) {
  const diff = Math.atan2(Math.sin(a - b), Math.cos(a - b));
  return Math.abs(diff);
}

/**
 * Wing directions the strike should always reach from the center: NW, NE, S,
 * SE, SW (screen-down y-positive coordinate system). If the K-means clusters
 * don't already cover an angle, synthesize a trunk for it so every wing grows
 * outward from the start of the strike.
 */
const WING_ANGLES = [
  -Math.PI * 0.78,        // NW
  -Math.PI * 0.22,        // NE
   Math.PI * 0.5,         // S
   Math.PI * 0.25,        // SE
   Math.PI * 0.75,        // SW
];
const WING_COVERED_THRESHOLD = Math.PI * 0.18;

function makeSegment(id, depth, points, parentId, attachRatio, strokeWidth, clusterId) {
  const cum = cumulativeLengths(points);
  return {
    id,
    depth,
    points,
    length: cum[cum.length - 1],
    cumLengths: cum,
    parentId,
    attachRatio,
    strokeWidth,
    clusterId,
    spawnAt: 0,
    finishAt: 1,
  };
}

function assignTimings(segments, rootIds, origin = THUNDER_ORIGIN) {
  const roots = rootIds.map((id) => segments.find((s) => s.id === id)).filter(Boolean);
  const isSw = (seg) => segmentPrimarilyInQuadrant(seg, BETSPOT_QUADRANT.SW, origin);

  const swRoots = roots.filter(isSw);
  const otherRoots = roots.filter((r) => !isSw(r));

  const swStagger = 0.035;
  const rootGrowth = 0.24;

  swRoots.forEach((root, i) => {
    root.spawnAt = i * swStagger;
    root.finishAt = Math.min(root.spawnAt + rootGrowth, 0.94);
  });

  const otherBase = swRoots.length ? swRoots[swRoots.length - 1].spawnAt + 0.06 : 0;
  otherRoots.forEach((root, i) => {
    root.spawnAt = otherBase + i * 0.09;
    root.finishAt = Math.min(root.spawnAt + 0.22, 0.94);
  });

  function scheduleChildren(parent) {
    const kids = segments
      .filter((s) => s.parentId === parent.id)
      .sort((a, b) => a.attachRatio - b.attachRatio);

    for (const child of kids) {
      const window = parent.finishAt - parent.spawnAt;
      const inSw = isSw(child);

      if (inSw) {
        // SW forks get the same bolt treatment as the hero trunk — longer
        // growth window and earlier spawn so they read as full lightning.
        child.spawnAt = parent.spawnAt + child.attachRatio * window * 0.5;
        const growth = 0.2 + Math.min(child.length * 0.022, 0.1);
        child.finishAt = Math.min(child.spawnAt + growth, 0.97);
      } else {
        child.spawnAt = parent.spawnAt + child.attachRatio ** 1.2 * window * 0.82;
        const growth = 0.06 + child.depth * 0.014 + Math.min(child.length * 0.014, 0.1);
        child.finishAt = Math.min(child.spawnAt + growth, 0.97);
      }
      scheduleChildren(child);
    }
  }

  for (const root of roots) scheduleChildren(root);
}

/** Build a zigzag side branch from a trunk attach point in a given direction. */
function syntheticSideBranch(from, angle, lengthTarget, rng, clip = BETSPOT_CLIP) {
  // Cap branch length to the betspot edge so it doesn't shoot off-canvas.
  const edge = rayToBetspotEdge(from.x, from.y, angle, clip);
  const maxLen = dist(from, edge);
  const len = Math.max(2.5, Math.min(lengthTarget, maxLen * 0.85));
  if (len < 2) return null;
  const tipX = from.x + Math.cos(angle) * len;
  const tipY = from.y + Math.sin(angle) * len;
  return subdivideSegment(
    from.x,
    from.y,
    tipX,
    tipY,
    Math.max(2, Math.round(len * 0.55)),
    0.85,
    rng,
  );
}

/** Higher score = bolt tip reaches further into the left-bottom (SW) quadrant. */
function swQuadrantScore(entry, origin) {
  const tip = entry.points[entry.points.length - 1];
  const dx = tip.x - origin.x;
  const dy = tip.y - origin.y;
  if (dx > 0 || dy < 0) return -1;
  return Math.hypot(-dx, dy);
}

/**
 * Five straight (jittered) lightning bolts from chip origin to wing edges.
 * Each bolt grows a couple of organic perpendicular side-branches so the
 * pattern isn't just five clean radial lines — it reads as forked lightning.
 *
 * Replaces the prior K-means-driven trunk generation: those trunks
 * meandered ~2x longer than straight-line distance, so as the wavefront
 * expanded, the "SW trunk" was actually painting mid-path points in
 * unrelated quadrants and leaving SW under-revealed. This guarantees
 * every wing gets a clean center→edge ray that the wavefront walks at
 * the same rate as the others.
 */
export function generateArtBasedLightning(plasmaImage, frame, origin = THUNDER_ORIGIN) {
  const { bright, w, h } = buildBrightMask(plasmaImage, frame);
  const clusters = findThreeClusters(bright, w, h, origin);
  const rng = createRng(42);
  const segments = [];
  let nextId = 0;
  // `pendingRoots` collects {points, clusterId} entries from both wing and
  // art generation. We commit them to `segments` in an interleaved order so
  // staggered spawnAt assignment in assignTimings produces an alternating
  // wing/art arrival pattern (no all-wings-first-then-all-art clumping).
  const wingRoots = [];
  const artRoots = [];
  const armVisited = new Set();

  // --- 1. Synthetic radial wing bolts (one per wing direction) -----------
  WING_ANGLES.forEach((wingAngle, idx) => {
    const armPoints = syntheticArmToEdge(origin, wingAngle, rng);
    if (!armPoints || armPoints.length < 2) return;
    wingRoots.push({
      points: simplifyPoints(armPoints, 0.55),
      clusterId: idx,
      kind: "wing",
      wingAngle,
    });
  });

  // --- 2. K-means art trunks (walk bright-filament chains) ---------------
  // These trace through the dense filament regions of plasma.svg — that's
  // where the SW/SE quadrants get their "clutter" of fine detail. Without
  // them the synthetic radials alone leave those areas under-revealed.
  for (let ci = 0; ci < clusters.length; ci += 1) {
    const cluster = clusters[ci];
    const preferAngle = Math.atan2(cluster.y - origin.y, cluster.x - origin.x);

    let armPoints = traceArtArm(cluster, bright, w, h, origin, armVisited, preferAngle);
    if (armPoints.length < 2) continue;
    armPoints = anchorArmAtOrigin(armPoints, origin, rng);
    armPoints = extendPathToEdge(armPoints, rng, BETSPOT_CLIP);
    armPoints = simplifyPoints(armPoints, 0.6);

    artRoots.push({
      points: armPoints,
      clusterId: 10 + ci, // 10+ to distinguish from wing cluster ids
      kind: "art",
      rawTrace: armPoints, // for sub-branch generation below
    });
  }

  // --- 3. Compose final root order — all SW-reaching roots first, then the rest.
  const allRoots = [...wingRoots, ...artRoots];
  const swRoots = allRoots
    .filter((r) => swQuadrantScore(r, origin) > 0)
    .sort((a, b) => swQuadrantScore(b, origin) - swQuadrantScore(a, origin));
  const otherRoots = allRoots.filter((r) => swQuadrantScore(r, origin) <= 0);
  const restWing = otherRoots.filter((r) => r.kind === "wing");
  const restArt = otherRoots.filter((r) => r.kind === "art");
  const interleaved = [...swRoots];
  const maxLen = Math.max(restWing.length, restArt.length);
  for (let i = 0; i < maxLen; i += 1) {
    if (i < restWing.length) interleaved.push(restWing[i]);
    if (i < restArt.length) interleaved.push(restArt[i]);
  }

  const rootIds = [];
  for (const entry of interleaved) {
    const arm = makeSegment(nextId++, 0, entry.points, null, 0, 0, entry.clusterId);
    segments.push(arm);
    rootIds.push(arm.id);

    if (entry.kind === "wing") {
      // Perpendicular forks for the synthetic radials.
      const armCum = cumulativeLengths(entry.points);
      const armLen = arm.length;
      const isSwWing = entry.wingAngle > Math.PI * 0.45 && entry.wingAngle < Math.PI * 0.95;
      const branchSpots = isSwWing ? [0.28, 0.44, 0.58, 0.72] : [0.32, 0.55, 0.74];
      for (const spotRatio of branchSpots) {
        let attachIdx = 1;
        for (let i = 1; i < entry.points.length - 1; i += 1) {
          if (armCum[i] / armLen >= spotRatio) {
            attachIdx = i;
            break;
          }
        }
        const attach = entry.points[attachIdx];
        const perpSign = rng() > 0.5 ? 1 : -1;
        const forkAngle = entry.wingAngle + perpSign * (Math.PI * (0.32 + rng() * 0.12));
        const forkLen = (armLen - armCum[attachIdx]) * (0.45 + rng() * 0.25);
        const forkPts = syntheticSideBranch(attach, forkAngle, forkLen, rng);
        if (!forkPts || forkPts.length < 2) continue;

        segments.push(
          makeSegment(
            nextId++,
            1,
            simplifyPoints(forkPts, 0.5),
            arm.id,
            armCum[attachIdx] / armLen,
            0,
            entry.clusterId,
          ),
        );
      }
    } else {
      // Bright-pixel side branches for the art trunks — these are what
      // give SW/SE the dense filament "clutter".
      const armCum = cumulativeLengths(entry.points);
      const armLen = arm.length;
      const branchVisited = new Set(entry.points.map((p) => key(p.x, p.y)));

      for (let i = 1; i < entry.points.length - 1; i += 1) {
        const cur = entry.points[i];
        if (typeof cur.x !== "number" || typeof cur.y !== "number") continue;
        const cx = Math.round(cur.x);
        const cy = Math.round(cur.y);
        if (cx < 0 || cy < 0 || cx >= w || cy >= h) continue;

        const onPath = new Set(entry.points.map((p) => key(p.x, p.y)));
        const attachInSw = betspotQuadrant(cur.x, cur.y, origin) === BETSPOT_QUADRANT.SW;
        const side = getNeighbors(cx, cy, w, h, bright)
          .filter((n) => !onPath.has(key(n.x, n.y)) && !branchVisited.has(key(n.x, n.y)))
          .sort((a, b) => {
            const aSw = betspotQuadrant(a.x, a.y, origin) === BETSPOT_QUADRANT.SW ? 1 : 0;
            const bSw = betspotQuadrant(b.x, b.y, origin) === BETSPOT_QUADRANT.SW ? 1 : 0;
            return bSw - aSw;
          });

        for (const s of side.slice(0, attachInSw ? 3 : 2)) {
          const branchPoints = traceSideBranch(
            { x: cx, y: cy },
            s,
            bright,
            w,
            h,
            origin,
            branchVisited,
          );
          if (branchPoints.length < 2) continue;

          const simplified = simplifyPoints(branchPoints, 0.55);
          if (simplified.length < 2) continue;

          segments.push(
            makeSegment(
              nextId++,
              1,
              simplified,
              arm.id,
              armCum[i] / armLen,
              0,
              entry.clusterId,
            ),
          );
        }
      }
    }
  }

  assignTimings(segments, rootIds, origin);

  const segmentsByDepth = [...segments].sort((a, b) => a.depth - b.depth);

  return {
    origin,
    segments,
    segmentsByDepth,
    trunkId: rootIds[0] ?? null,
    clusters,
    brightMask: { bright, w, h },
    skeletonCanvas: buildSkeletonCanvas({ bright, w, h }),
    causticCanvas: buildCausticCanvas(plasmaImage, frame),
  };
}

export function segmentDrawLength(segment, progress) {
  if (progress <= segment.spawnAt) return 0;
  if (progress >= segment.finishAt) return segment.length;

  const t = (progress - segment.spawnAt) / (segment.finishAt - segment.spawnAt);
  const eased = 1 - (1 - t) ** 2.4;
  return segment.length * eased;
}

/** Length-weighted fraction of total path network drawn at `boltT`. */
export function computePathCompletion(segments, boltT) {
  if (!segments?.length) return 0;

  let drawn = 0;
  let total = 0;
  for (const segment of segments) {
    const len = segment.length || 1;
    total += len;
    drawn += Math.min(len, segmentDrawLength(segment, boltT));
  }
  return total > 0 ? drawn / total : 0;
}

/**
 * Gradual betspot gap-fill — closes corners once paths finish extending (~85%+).
 */
export function betspotFillBlend(progress, pathCompletion = 0) {
  const p = Math.max(0, Math.min(1, progress));
  const c = Math.max(0, Math.min(1, pathCompletion));
  const pathGate = Math.max(0, (c - 0.42) / 0.58);
  const timeGate = Math.max(0, (p - 0.48) / 0.52) ** 1.05;
  return Math.min(1, pathGate * timeGate);
}

export function boltGrowthProgress(progress) {
  return Math.max(0, Math.min(1, progress));
}
