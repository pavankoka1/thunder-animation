/**
 * Parametric polyline along BETSPOT_FRAME — the rim "filament network"
 * for edge electric arcs (piece 3).
 */

import { BETSPOT_FRAME } from "../betspotGeometry.js";

function pushPoint(points, x, y) {
  const last = points[points.length - 1];
  if (last && last.x === x && last.y === y) return;
  points.push({ x, y });
}

function addLine(points, x0, y0, x1, y1, steps, skipFirst = false) {
  for (let i = skipFirst ? 1 : 0; i <= steps; i += 1) {
    const t = i / steps;
    pushPoint(points, x0 + (x1 - x0) * t, y0 + (y1 - y0) * t);
  }
}

function addArc(points, cx, cy, radius, startAng, endAng, steps, skipFirst = false) {
  for (let i = skipFirst ? 1 : 0; i <= steps; i += 1) {
    const t = i / steps;
    const ang = startAng + (endAng - startAng) * t;
    pushPoint(points, cx + Math.cos(ang) * radius, cy + Math.sin(ang) * radius);
  }
}

/**
 * Clockwise perimeter from the top-left corner (reference video origin).
 * @returns {{ points: {x,y}[], cumLen: number[], totalLength: number }}
 */
export function buildRimBorderPath(clip = BETSPOT_FRAME, edgeSteps = 22, arcSteps = 14) {
  const { x, y, width, height, radius } = clip;
  const r = Math.min(radius, width / 2, height / 2);
  const x2 = x + width;
  const y2 = y + height;
  const points = [];

  // Top-left corner → clockwise around the frame.
  addArc(points, x + r, y + r, r, Math.PI, Math.PI * 1.5, arcSteps);
  addLine(points, x + r, y, x2 - r, y, edgeSteps, true);
  addArc(points, x2 - r, y + r, r, -Math.PI / 2, 0, arcSteps, true);
  addLine(points, x2, y + r, x2, y2 - r, edgeSteps, true);
  addArc(points, x2 - r, y2 - r, r, 0, Math.PI / 2, arcSteps, true);
  addLine(points, x2 - r, y2, x + r, y2, edgeSteps, true);
  addArc(points, x + r, y2 - r, r, Math.PI / 2, Math.PI, arcSteps, true);
  addLine(points, x, y2 - r, x, y + r, edgeSteps, true);

  const cumLen = [0];
  for (let i = 1; i < points.length; i += 1) {
    const dx = points[i].x - points[i - 1].x;
    const dy = points[i].y - points[i - 1].y;
    cumLen.push(cumLen[i - 1] + Math.hypot(dx, dy));
  }

  return { points, cumLen, totalLength: cumLen[cumLen.length - 1] };
}

/** @deprecated alias — path already starts at top-left. */
export function buildRimBorderPathFromTopLeft(clip = BETSPOT_FRAME, edgeSteps = 22, arcSteps = 14) {
  return buildRimBorderPath(clip, edgeSteps, arcSteps);
}

/** Normalise t to [0, 1). */
function normT(t) {
  let v = t % 1;
  if (v < 0) v += 1;
  return v;
}

/**
 * Position + tangent on the border at parametric t ∈ [0, 1].
 * Outward normal assumes clockwise traversal.
 */
export function sampleRimBorderAtT(path, t) {
  const target = normT(t) * path.totalLength;
  const { points, cumLen } = path;

  let idx = 1;
  while (idx < cumLen.length && cumLen[idx] < target) idx += 1;
  const i0 = Math.max(0, idx - 1);
  const i1 = Math.min(i0 + 1, points.length - 1);
  const segLen = cumLen[i1] - cumLen[i0] || 1;
  const local = (target - cumLen[i0]) / segLen;

  const p0 = points[i0];
  const p1 = points[i1];
  const tx = p1.x - p0.x;
  const ty = p1.y - p0.y;
  const len = Math.hypot(tx, ty) || 1;
  const nx = ty / len;
  const ny = -tx / len;

  return {
    x: p0.x + tx * local,
    y: p0.y + ty * local,
    tx: tx / len,
    ty: ty / len,
    nx,
    ny,
  };
}
