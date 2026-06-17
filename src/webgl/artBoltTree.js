import { cumulativeLengths } from "../canvas/lightning/geometry.js";
import { SVG_FRAME } from "../canvas/frame.js";
import { MAX_PATHS, MAX_POINTS_PER_PATH } from "./generateBoltPath.js";

function downsamplePoints(points, maxPoints) {
  if (points.length <= maxPoints) return points;
  const step = (points.length - 1) / (maxPoints - 1);
  return Array.from({ length: maxPoints }, (_, i) => {
    const idx = Math.min(Math.round(i * step), points.length - 1);
    return points[idx];
  });
}

/**
 * Map plasma viewBox (84×68, y-down) into WebGL canvas pixels (y-up).
 */
export function createArtCoordinateMap(canvasWidth, canvasHeight, padding = 0) {
  const sx = (canvasWidth - padding * 2) / SVG_FRAME.width;
  const sy = (canvasHeight - padding * 2) / SVG_FRAME.height;
  const scale = Math.min(sx, sy);
  const ox = (canvasWidth - SVG_FRAME.width * scale) / 2;
  const oy = (canvasHeight - SVG_FRAME.height * scale) / 2;

  return {
    scale,
    ox,
    oy,
    canvasHeight,
    canvasWidth,
    mapPoint(p) {
      return {
        x: p.x * scale + ox,
        y: canvasHeight - (p.y * scale + oy),
      };
    },
  };
}

export function rasterizePlasmaForWebGL(plasmaLayer, canvasWidth, canvasHeight, padding = 0) {
  const map = createArtCoordinateMap(canvasWidth, canvasHeight, padding);
  const svgW = SVG_FRAME.width * map.scale;
  const svgH = SVG_FRAME.height * map.scale;

  const offscreen = document.createElement("canvas");
  offscreen.width = canvasWidth;
  offscreen.height = canvasHeight;
  const ctx = offscreen.getContext("2d");
  ctx.drawImage(plasmaLayer, map.ox, map.oy, svgW, svgH);
  return offscreen;
}

function makePathMetaFromSegment(segment) {
  const points = segment.points;
  const cum = segment.cumLengths ?? cumulativeLengths(points);
  const totalLen = cum[cum.length - 1] || 1;
  const cumRatios = cum.map((d) => d / totalLen);

  return {
    parentPath: -1,
    attachRatio: segment.attachRatio ?? 0,
    pathLength: totalLen,
    cumRatios,
    /** Timings on bolt timeline (0–1), same as canvas extractArtPaths */
    spawnAt: segment.spawnAt,
    finishAt: segment.finishAt,
    strokeWidth: segment.strokeWidth ?? 2.6,
    depth: segment.depth ?? 0,
  };
}

export function artPathTreeToBoltTree(pathTree, canvasWidth, canvasHeight, padding = 0) {
  const map = createArtCoordinateMap(canvasWidth, canvasHeight, padding);
  const segments = [...(pathTree?.segments ?? [])].sort((a, b) => a.depth - b.depth);

  if (!segments.length) {
    return { paths: [], pointCounts: [], pathMeta: [], clusters: [], origin: null, map };
  }

  const idToPathIdx = new Map();
  const paths = [];
  const pathMeta = [];

  for (const segment of segments) {
    if (paths.length >= MAX_PATHS) break;

    const mapped = downsamplePoints(
      segment.points.map((p) => map.mapPoint(p)),
      MAX_POINTS_PER_PATH
    );

    const pathIdx = paths.length;
    idToPathIdx.set(segment.id, pathIdx);
    paths.push(mapped);

    const meta = makePathMetaFromSegment(segment);
    if (segment.parentId != null && idToPathIdx.has(segment.parentId)) {
      meta.parentPath = idToPathIdx.get(segment.parentId);
    } else {
      meta.parentPath = -1;
    }
    pathMeta.push(meta);
  }

  const clusters = (pathTree.clusters ?? []).map((c) => map.mapPoint(c));
  const origin = pathTree.origin ? map.mapPoint(pathTree.origin) : null;

  return {
    paths,
    pointCounts: paths.map((p) => p.length),
    pathMeta,
    clusters,
    origin,
    map,
    source: "art",
  };
}
