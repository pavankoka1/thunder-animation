import { BETSPOT_CLIP, betspotQuadrant, THUNDER_ORIGIN } from "../betspotGeometry.js";
import { segmentDrawLength } from "./extractArtPaths.js";

/** Furthest corner distance from chip center — outward wave travels this far. */
export const OUTWARD_MAX_DIST =
  Math.hypot(BETSPOT_CLIP.width / 2, BETSPOT_CLIP.height / 2) * 1.06;

/** @deprecated use BETSPOT_QUADRANT from betspotGeometry.js */
export const QUADRANT = {
  SW: 0,
  SE: 1,
  NW: 2,
  NE: 3,
};

/** Progress delay per quadrant — SW (left-bottom) has no delay. */
const QUADRANT_STAGGER = 0.13;

export { betspotQuadrant };

function quadrantLocalProgress(progress, quadrant) {
  const delay = quadrant * QUADRANT_STAGGER;
  if (progress <= delay) return 0;
  const span = 1 - QUADRANT_STAGGER * 3;
  return Math.min(1, (progress - delay) / span);
}

/**
 * Expanding reveal front (viewBox units). Heavily front-loaded — the bolt
 * strikes the edges in roughly the first 30% of the timeline, then the
 * remaining timeline is the caustic afterglow settling into the final
 * pattern. This is what gives the animation a thunder feel rather than
 * a slow frost spread.
 */
export function outwardReachFront(progress) {
  const p = Math.max(0, Math.min(1, progress));
  // Heavy ease-out: derivative is very large near p=0 (lightning attack)
  // and approaches 0 near p=1 (afterglow settle). At p=0.3 we already
  // reach ~76% of the way to the corners.
  const eased = 1 - (1 - p) ** 4.2;
  const coreHold = 5.5;
  return coreHold + eased * (OUTWARD_MAX_DIST - coreHold + 2);
}

/** 0..1 — whether a pixel at `dist` from center is inside the current outward wave. */
export function outwardRevealGate(dist, progress, x, y, origin = THUNDER_ORIGIN) {
  const quadrant = betspotQuadrant(x, y, origin);
  const localP = quadrantLocalProgress(progress, quadrant);
  if (localP <= 0) return 0;

  const front = outwardReachFront(localP);
  // Tighter wavefront — thinner leading edge of the strike.
  const soft = 0.85 + localP * 3.2;
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
 * Each bolt is fully visible the instant it spawns — no wavefront walk
 * along the polyline. That walk is what was reading as "crawling/creeping
 * lines". The strike itself is instantaneous; the visible animation is the
 * staggered SEQUENCE of bolts spawning (the "multiple thunders" feel) plus
 * the per-bolt flash + afterglow.
 */
export function segmentDrawLengthOutward(segment, boltT /*, progress, origin */) {
  return segmentDrawLength(segment, boltT);
}
