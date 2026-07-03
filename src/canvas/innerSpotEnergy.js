/**
 * inner-spot-energy.svg — fixed base layer (never pans).
 */

import { loadImage } from "./loadImage.js";
import { BETSPOT_FRAME, roundedRectPath } from "./betspotGeometry.js";

export const INNER_SPOT_ENERGY_URL = "/inner-spot-energy.svg";

export const INNER_ENERGY_SPEC = {
  groupOpacity: 0.8,
  rect: { x: -20, y: -22, width: 132, height: 109.823 },
  patternTransform: [0.000733138, 0, 0, 0.00088118, 0, -0.00800003],
  imageSize: { width: 1364, height: 1153 },
};

/** Ramp filament motion after formation — avoids handoff pop. */
export const MOTION_RAMP_MS = 400;

let bundlePromise = null;

async function parseTextureHref(url = INNER_SPOT_ENERGY_URL) {
  const markup = await fetch(url).then((r) => {
    if (!r.ok) throw new Error(`Failed to fetch ${url}`);
    return r.text();
  });
  const hrefMatch = markup.match(/xlink:href="(data:image\/[^"]+)"/);
  if (!hrefMatch) throw new Error("inner-spot-energy.svg: embedded image not found");
  return hrefMatch[1];
}

function clipInnerEnergy(ctx) {
  roundedRectPath(ctx, BETSPOT_FRAME);
  ctx.clip();
}

/**
 * Fixed inner energy — pattern locked at scroll (0,0). Never call with offset.
 */
export function paintInnerSpotEnergy(ctx, texture, opacity) {
  if (!texture || opacity <= 0) return;

  const { rect, patternTransform, imageSize, groupOpacity } = INNER_ENERGY_SPEC;
  const [a, , , d, , f] = patternTransform;
  const tw = imageSize.width;
  const th = imageSize.height;

  ctx.save();
  clipInnerEnergy(ctx);
  ctx.globalAlpha = opacity * groupOpacity;
  ctx.globalCompositeOperation = "source-over";
  ctx.translate(rect.x, rect.y + f * rect.height);
  ctx.scale(a * rect.width, d * rect.height);
  ctx.drawImage(texture, 0, 0, tw, th, 0, 0, tw, th);
  ctx.restore();
}

export function motionStrength(loopTimeMs) {
  if (loopTimeMs <= 0) return 0;
  const m = Math.min(1, loopTimeMs / MOTION_RAMP_MS);
  return m * m * (3 - 2 * m);
}

export async function loadInnerSpotEnergyBundle(url = INNER_SPOT_ENERGY_URL) {
  if (bundlePromise) return bundlePromise;

  bundlePromise = (async () => {
    const textureHref = await parseTextureHref(url);
    const texture = await loadImage(textureHref);
    if (!texture.naturalWidth) throw new Error("Plasma texture empty");
    return { texture, spec: INNER_ENERGY_SPEC };
  })();

  return bundlePromise;
}
