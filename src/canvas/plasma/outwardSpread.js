import { BETSPOT_CLIP, THUNDER_ORIGIN } from "../betspotGeometry.js";
import { segmentDrawLength } from "./extractArtPaths.js";

/** Furthest corner distance from chip center — outward wave travels this far. */
export const OUTWARD_MAX_DIST =
  Math.hypot(BETSPOT_CLIP.width / 2, BETSPOT_CLIP.height / 2) * 1.06;

/**
 * Expanding reveal front (viewBox units). Starts tight on the center bulk, reaches edges at progress=1.
 */
export function outwardReachFront(progress) {
  const p = Math.max(0, Math.min(1, progress));
  const eased = 1 - (1 - p) ** 1.55;
  const coreHold = 5.5;
  return coreHold + eased * (OUTWARD_MAX_DIST - coreHold + 2);
}

/** 0..1 — whether a pixel at `dist` from center is inside the current outward wave. */
export function outwardRevealGate(dist, progress) {
  const front = outwardReachFront(progress);
  const soft = 2.8 + progress * 4.5;
  const inner = front - soft;

  if (dist <= inner) return 1;
  if (dist >= front + soft) return 0;

  const t = (dist - inner) / (2 * soft);
  return 1 - t * t * (3 - 2 * t);
}

export function distFromOrigin(x, y, origin = THUNDER_ORIGIN) {
  return Math.hypot(x - origin.x, y - origin.y);
}

/**
 * Path timing capped by outward wave — center segments appear first, tips reach edges last.
 */
export function segmentDrawLengthOutward(segment, boltT, progress, origin = THUNDER_ORIGIN) {
  const timed = segmentDrawLength(segment, boltT);
  if (timed <= 0) return 0;

  let allowed = 0;
  for (let i = 0; i < segment.points.length; i += 1) {
    const cum = segment.cumLengths[i];
    if (cum > timed) break;

    const p = segment.points[i];
    if (outwardRevealGate(distFromOrigin(p.x, p.y, origin), progress) <= 0.04) break;
    allowed = cum;
  }

  return allowed;
}
