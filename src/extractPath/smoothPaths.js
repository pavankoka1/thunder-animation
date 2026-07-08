import { MAX_POINTS_PER_PATH } from "./lichtenbergTree.js";

/** One pass of Chaikin's corner-cutting on an open polyline. */
export function chaikinSmooth(points, iterations = 1) {
  if (iterations <= 0 || points.length < 2) return points;

  let pts = points;
  for (let iter = 0; iter < iterations; iter += 1) {
    if (pts.length < 2) break;
    const next = [];
    for (let i = 0; i < pts.length - 1; i += 1) {
      const p0 = pts[i];
      const p1 = pts[i + 1];
      next.push({
        x: 0.75 * p0.x + 0.25 * p1.x,
        y: 0.75 * p0.y + 0.25 * p1.y,
        w: 0.75 * p0.w + 0.25 * p1.w,
      });
      next.push({
        x: 0.25 * p0.x + 0.75 * p1.x,
        y: 0.25 * p0.y + 0.75 * p1.y,
        w: 0.25 * p0.w + 0.75 * p1.w,
      });
    }
    pts = next;
  }
  return pts;
}

/** Uniform arc-length resample (keeps endpoints, caps point count). */
export function resampleArcLength(points, maxPoints = MAX_POINTS_PER_PATH) {
  if (points.length <= maxPoints) return points;
  if (points.length < 2) return points;

  const cum = [0];
  for (let i = 1; i < points.length; i += 1) {
    cum.push(cum[i - 1] + Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y));
  }
  const total = cum[cum.length - 1];
  if (total < 1e-6) return points.slice(0, maxPoints);

  const out = [points[0]];
  for (let k = 1; k < maxPoints - 1; k += 1) {
    const target = (total * k) / (maxPoints - 1);
    let j = 1;
    while (j < cum.length && cum[j] < target) j += 1;
    j = Math.min(Math.max(j, 1), points.length - 1);
    const segLen = cum[j] - cum[j - 1];
    const t = segLen > 1e-6 ? (target - cum[j - 1]) / segLen : 0;
    const a = points[j - 1];
    const b = points[j];
    out.push({
      x: a.x + (b.x - a.x) * t,
      y: a.y + (b.y - a.y) * t,
      w: a.w + (b.w - a.w) * t,
    });
  }
  out.push(points[points.length - 1]);
  return out;
}

/**
 * Optional runtime smoothing on already-extracted paths.
 * @param {{x:number,y:number,w:number}[][]} paths
 * @param {{ iterations?: number, maxPoints?: number }} [options]
 */
export function smoothPaths(paths, options = {}) {
  const { iterations = 0, maxPoints = MAX_POINTS_PER_PATH } = options;
  if (iterations <= 0) return paths;

  return paths.map((path) => {
    if (path.length < 2) return path;
    return resampleArcLength(chaikinSmooth(path, iterations), maxPoints);
  });
}
