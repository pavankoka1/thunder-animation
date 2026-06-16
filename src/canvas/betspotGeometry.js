/** betspot-frame.svg rounded rect — matches CSS clip-path on canvas/plasma. */
export const BETSPOT_CLIP = {
  x: 0.5,
  y: 0.5,
  width: 83,
  height: 67,
  radius: 11.5,
};

/** Chip / betspot center in viewBox coords (84×68). */
export const THUNDER_ORIGIN = {
  x: BETSPOT_CLIP.x + BETSPOT_CLIP.width / 2,
  y: BETSPOT_CLIP.y + BETSPOT_CLIP.height / 2,
};

export function roundedRectPath(ctx, clip = BETSPOT_CLIP) {
  const { x, y, width, height, radius } = clip;
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width - r, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + r);
  ctx.lineTo(x + width, y + height - r);
  ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  ctx.lineTo(x + r, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

export function clipBetspot(ctx) {
  roundedRectPath(ctx);
  ctx.clip();
}
