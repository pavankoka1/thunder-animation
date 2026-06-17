import { BETSPOT_CLIP, THUNDER_ORIGIN } from "../betspotGeometry.js";
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

    let best = nbrs[0];
    let bestScore = -Infinity;
    for (const n of nbrs) {
      const stepAngle = Math.atan2(n.y - stepCur.y, n.x - stepCur.x);
      const perp = Math.abs(Math.sin(stepAngle - forward));
      const outward = dist(n, origin);
      const score = outward + perp * 3;
      if (score > bestScore) {
        bestScore = score;
        best = n;
      }
    }

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

function assignTimings(segments, rootIds) {
  const roots = rootIds.map((id) => segments.find((s) => s.id === id)).filter(Boolean);

  roots.forEach((root, i) => {
    root.spawnAt = i * 0.02;
    root.finishAt = 0.82 + i * 0.08;
  });

  function scheduleChildren(parent) {
    const kids = segments
      .filter((s) => s.parentId === parent.id)
      .sort((a, b) => a.attachRatio - b.attachRatio);

    for (const child of kids) {
      const window = parent.finishAt - parent.spawnAt;
      // Branches closer to center spawn first; edge branches follow the outward wave
      child.spawnAt = parent.spawnAt + child.attachRatio ** 1.2 * window * 0.86;
      const growth = 0.07 + child.depth * 0.018 + Math.min(child.length * 0.016, 0.12);
      child.finishAt = Math.min(child.spawnAt + growth, 0.97);
      scheduleChildren(child);
    }
  }

  for (const root of roots) scheduleChildren(root);
}

/**
 * Extract the 3 center thunder clusters from plasma art, trace their lines outward,
 * add sub-branches along bright pixels, extend toward betspot edges.
 */
export function generateArtBasedLightning(plasmaImage, frame, origin = THUNDER_ORIGIN) {
  const { bright, w, h } = buildBrightMask(plasmaImage, frame);
  const clusters = findThreeClusters(bright, w, h, origin);
  const rng = createRng(42);
  const segments = [];
  let nextId = 0;
  const rootIds = [];
  const armVisited = new Set();

  for (let ci = 0; ci < clusters.length; ci += 1) {
    const cluster = clusters[ci];
    const preferAngle = Math.atan2(cluster.y - origin.y, cluster.x - origin.x);

    let armPoints = traceArtArm(cluster, bright, w, h, origin, armVisited, preferAngle);
    if (armPoints.length < 2) continue;

    armPoints = extendPathToEdge(armPoints, rng, BETSPOT_CLIP);
    armPoints = simplifyPoints(armPoints, 0.6);

    const arm = makeSegment(
      nextId++,
      0,
      armPoints,
      null,
      0,
      0,
      ci
    );
    segments.push(arm);
    rootIds.push(arm.id);

    const armCum = cumulativeLengths(armPoints);
    const branchVisited = new Set(armPoints.map((p) => key(p.x, p.y)));

    for (let i = 1; i < armPoints.length - 1; i += 1) {
      const cur = armPoints[i];
      const onPath = new Set(armPoints.map((p) => key(p.x, p.y)));

      const side = getNeighbors(cur.x, cur.y, w, h, bright).filter(
        (n) => !onPath.has(key(n.x, n.y)) && !branchVisited.has(key(n.x, n.y))
      );

      for (const s of side.slice(0, 2)) {
        const branchPoints = traceSideBranch(cur, s, bright, w, h, origin, branchVisited);
        if (branchPoints.length < 2) continue;

        const simplified = simplifyPoints(branchPoints, 0.55);
        if (simplified.length < 2) continue;

        const attachRatio = armCum[i] / arm.length;
        const branchId = nextId++;
        segments.push(
          makeSegment(
            branchId,
            1,
            simplified,
            arm.id,
            attachRatio,
            0,
            ci
          )
        );

        for (let j = 2; j < simplified.length - 1; j += 2) {
          const bCur = simplified[j];
          const bOnPath = new Set(simplified.map((p) => key(p.x, p.y)));
          const bSide = getNeighbors(bCur.x, bCur.y, w, h, bright).filter(
            (n) => !bOnPath.has(key(n.x, n.y)) && !branchVisited.has(key(n.x, n.y))
          );

          if (!bSide.length || rng() > 0.5) continue;

          const sub = traceSideBranch(bCur, bSide[0], bright, w, h, origin, branchVisited, 25);
          if (sub.length < 2) continue;

          const subCum = cumulativeLengths(simplified);
          segments.push(
            makeSegment(
              nextId++,
              2,
              simplifyPoints(sub, 0.5),
              branchId,
              subCum[j] / subCum[subCum.length - 1],
              0,
              ci
            )
          );
        }
      }
    }
  }

  assignTimings(segments, rootIds);

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
