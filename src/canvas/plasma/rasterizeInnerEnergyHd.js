import { SVG_FRAME } from "../frame.js";
import { INNER_ENERGY_SPEC } from "../innerSpotEnergy.js";

/** Rasterize inner-spot-energy texture at hdScale × viewBox for extraction. */
export function rasterizeInnerSpotEnergyHd(texture, spec = INNER_ENERGY_SPEC, scale = 3) {
  const { rect, patternTransform, imageSize, groupOpacity } = spec;
  const [a, , , d, , f] = patternTransform;
  const w = Math.round(SVG_FRAME.width * scale);
  const h = Math.round(SVG_FRAME.height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.scale(scale, scale);
  ctx.globalAlpha = groupOpacity;
  ctx.translate(rect.x, rect.y + f * rect.height);
  ctx.scale(a * rect.width, d * rect.height);
  ctx.drawImage(texture, 0, 0, imageSize.width, imageSize.height);
  return canvas;
}
