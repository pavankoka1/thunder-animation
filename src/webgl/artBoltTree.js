import { cumulativeLengths } from "../canvas/lightning/geometry.js";
import { BOLT_PHASE_END } from "../canvas/plasma/extractArtPaths.js";
import { SVG_FRAME } from "../canvas/frame.js";
import { MAX_PATHS, MAX_POINTS_PER_PATH } from "./generateBoltPath.js";

/**
 * Render the plasma raster layer (already loaded HTMLImageElement) into an
 * offscreen canvas at the target WebGL size, positioned to match the art
 * coordinate map used by artPathTreeToBoltTree.
 *
 * The resulting canvas is passed to gl.texImage2D and sampled in the shader
 * with `texture(u_plasmaTex, vec2(uv.x, 1.0 - uv.y))` to correct for the
 * WebGL vs canvas 2D y-axis flip.
 *
 * @param {HTMLImageElement} plasmaLayer
 * @param {number} canvasWidth
 * @param {number} canvasHeight
 * @returns {HTMLCanvasElement}
 */
export function rasterizePlasmaForWebGL(plasmaLayer, canvasWidth, canvasHeight) {
  const map = createArtCoordinateMap(canvasWidth, canvasHeight);
  const svgW = SVG_FRAME.width * map.scale;
  const svgH = SVG_FRAME.height * map.scale;

  const offscreen = document.createElement("canvas");
  offscreen.width = canvasWidth;
  offscreen.height = canvasHeight;
  const ctx = offscreen.getContext("2d");
  // Draw plasma at (ox, oy) — top-left 2D origin; shader handles y-flip via 1.0 - uv.y
  ctx.drawImage(plasmaLayer, map.ox, map.oy, svgW, svgH);
  return offscreen;
}

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
 * @param {number} canvasWidth
 * @param {number} canvasHeight
 * @param {number} [padding]
 */
export function createArtCoordinateMap(canvasWidth, canvasHeight, padding = 18) {
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
    mapPoint(p) {
      return {
        x: p.x * scale + ox,
        y: canvasHeight - (p.y * scale + oy),
      };
    },
  };
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
    /** Art timings are on bolt timeline — scale to full strike progress. */
    spawnAt: segment.spawnAt * BOLT_PHASE_END,
    finishAt: Math.min(1, segment.finishAt * BOLT_PHASE_END),
  };
}

/**
 * Convert canvas art path tree → WebGL bolt tree (paths + reveal metadata).
 * @param {import("../canvas/plasma/extractArtPaths.js").generateArtBasedLightning extends Function ? ReturnType<...> : any} pathTree
 * @param {number} canvasWidth
 * @param {number} canvasHeight
 */
export function artPathTreeToBoltTree(pathTree, canvasWidth, canvasHeight) {
  const map = createArtCoordinateMap(canvasWidth, canvasHeight);
  const segments = [...(pathTree?.segments ?? [])].sort((a, b) => a.depth - b.depth);

  if (!segments.length) {
    return { paths: [], pointCounts: [], pathMeta: [], clusters: [], origin: null };
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
    source: "art",
  };
}
