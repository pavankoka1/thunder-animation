export function distance(a, b) {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

export function polylineLength(points) {
  let length = 0;
  for (let i = 1; i < points.length; i += 1) {
    length += distance(points[i - 1], points[i]);
  }
  return length;
}

/** Cumulative arc length at each vertex (same length as points). */
export function cumulativeLengths(points) {
  const lengths = [0];
  for (let i = 1; i < points.length; i += 1) {
    lengths.push(lengths[i - 1] + distance(points[i - 1], points[i]));
  }
  return lengths;
}

/** Point at distance `d` along polyline (clamped). */
export function pointAtLength(points, cumLengths, d) {
  const total = cumLengths[cumLengths.length - 1];
  if (total <= 0) return { ...points[0] };
  const target = Math.max(0, Math.min(d, total));

  for (let i = 1; i < points.length; i += 1) {
    if (target <= cumLengths[i]) {
      const segLen = cumLengths[i] - cumLengths[i - 1];
      const t = segLen > 0 ? (target - cumLengths[i - 1]) / segLen : 0;
      return {
        x: points[i - 1].x + (points[i].x - points[i - 1].x) * t,
        y: points[i - 1].y + (points[i].y - points[i - 1].y) * t,
      };
    }
  }

  return { ...points[points.length - 1] };
}

/** Subdivide segment with midpoint displacement (classic lightning fractal). */
export function subdivideSegment(x1, y1, x2, y2, displacement, minLength, rng) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const segLen = Math.hypot(dx, dy);

  if (displacement < minLength || segLen < minLength) {
    return [
      { x: x1, y: y1 },
      { x: x2, y: y2 },
    ];
  }

  const mx = (x1 + x2) / 2 + (rng() - 0.5) * displacement;
  const my = (y1 + y2) / 2 + (rng() - 0.5) * displacement;

  const left = subdivideSegment(x1, y1, mx, my, displacement * 0.52, minLength, rng);
  const right = subdivideSegment(mx, my, x2, y2, displacement * 0.52, minLength, rng);

  return [...left.slice(0, -1), ...right];
}
