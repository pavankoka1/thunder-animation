/** betspot-frame.svg rounded rect — matches CSS clip-path on canvas/plasma. */
export const BETSPOT_CLIP = {
  x: 0.5,
  y: 0.5,
  width: 83,
  height: 67,
  radius: 11.5,
};

/**
 * Outer visible betspot perimeter — full 84×68 viewBox rounded rect. Sits
 * ~0.5 viewBox outside BETSPOT_CLIP so the neon rim covers the frame bezel
 * and its stroke (betspot-frame.svg rect at 0.5 inset, rx 11.5).
 */
export const BETSPOT_FRAME = {
  x: 0,
  y: 0,
  width: 84,
  height: 68,
  radius: BETSPOT_CLIP.radius + BETSPOT_CLIP.x,
};

/** Chip / betspot center in viewBox coords (84×68). */
export const THUNDER_ORIGIN = {
  x: BETSPOT_CLIP.x + BETSPOT_CLIP.width / 2,
  y: BETSPOT_CLIP.y + BETSPOT_CLIP.height / 2,
};

/** Screen-space quadrants (y grows downward). SW = left-bottom. */
export const BETSPOT_QUADRANT = {
  SW: 0,
  SE: 1,
  NW: 2,
  NE: 3,
};

export function betspotQuadrant(x, y, origin = THUNDER_ORIGIN) {
  const dx = x - origin.x;
  const dy = y - origin.y;
  if (dx <= 0 && dy >= 0) return BETSPOT_QUADRANT.SW;
  if (dx > 0 && dy >= 0) return BETSPOT_QUADRANT.SE;
  if (dx <= 0) return BETSPOT_QUADRANT.NW;
  return BETSPOT_QUADRANT.NE;
}

/** True when the segment tip or most of its length sits in a quadrant. */
export function segmentPrimarilyInQuadrant(segment, quadrant, origin = THUNDER_ORIGIN) {
  if (!segment?.points?.length) return false;
  const tip = segment.points[segment.points.length - 1];
  if (betspotQuadrant(tip.x, tip.y, origin) === quadrant) return true;
  let hits = 0;
  for (const p of segment.points) {
    if (betspotQuadrant(p.x, p.y, origin) === quadrant) hits += 1;
  }
  return hits / segment.points.length >= 0.45;
}

/** Trace a rounded rect with true circular corner arcs (matches SVG rx and CSS round). */
export function roundedRectPath(ctx, clip = BETSPOT_CLIP) {
  const { x, y, width, height, radius } = clip;
  const r = Math.min(radius, width / 2, height / 2);
  const x2 = x + width;
  const y2 = y + height;
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x2 - r, y);
  ctx.arcTo(x2, y, x2, y + r, r);
  ctx.lineTo(x2, y2 - r);
  ctx.arcTo(x2, y2, x2 - r, y2, r);
  ctx.lineTo(x + r, y2);
  ctx.arcTo(x, y2, x, y2 - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}

export function clipBetspot(ctx) {
  roundedRectPath(ctx);
  ctx.clip();
}
