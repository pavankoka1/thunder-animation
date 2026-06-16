import { loadImage } from "./loadImage.js";
import { clipBetspot } from "./betspotGeometry.js";
import { SVG_FRAME } from "./frame.js";

/**
 * Parsed from plasma.svg — pattern rect, transform, and embedded image size.
 * Opacity lives in the SVG group (0.6); screen blend is applied via CSS on the canvas.
 */
export const PLASMA_SPEC = {
  groupOpacity: 0.6,
  rect: { x: -20.25, y: -21, width: 132, height: 109.823 },
  patternTransform: [0.000733138, 0, 0, 0.00088118, 0, -0.00800003],
  imageSize: { width: 1364, height: 1153 },
};

/**
 * Parse plasma.svg and return the embedded pattern texture URL + spec.
 */
export async function parsePlasmaSvg(url = "/plasma.svg") {
  const markup = await fetch(url).then((r) => {
    if (!r.ok) throw new Error(`Failed to fetch ${url}`);
    return r.text();
  });

  const hrefMatch = markup.match(/xlink:href="(data:image\/[^"]+)"/);
  if (!hrefMatch) {
    throw new Error("plasma.svg: embedded pattern image not found");
  }

  return { textureHref: hrefMatch[1], spec: PLASMA_SPEC };
}

/**
 * Build a viewBox-sized raster of the plasma pattern layer.
 */
export async function loadPlasmaPatternLayer(url = "/plasma.svg") {
  const { textureHref, spec } = await parsePlasmaSvg(url);
  const { rect, patternTransform, imageSize, groupOpacity } = spec;
  const [a, , , d, , f] = patternTransform;
  const { width, height } = SVG_FRAME;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><g opacity="${groupOpacity}"><rect x="${rect.x}" y="${rect.y}" width="${rect.width}" height="${rect.height}" fill="url(#plasmaPattern)"/></g><defs><pattern id="plasmaPattern" patternContentUnits="objectBoundingBox" width="1" height="1"><use xlink:href="#plasmaTexture" transform="matrix(${a} 0 0 ${d} 0 ${f})"/></pattern><image id="plasmaTexture" width="${imageSize.width}" height="${imageSize.height}" preserveAspectRatio="none" xlink:href="${textureHref}"/></defs></svg>`;

  const blobUrl = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));

  try {
    const img = await loadImage(blobUrl);
    if (!img.naturalWidth || !img.naturalHeight) {
      throw new Error("Plasma layer rasterized to an empty image");
    }
    return img;
  } finally {
    URL.revokeObjectURL(blobUrl);
  }
}

/** Paint extracted plasma pattern layer at native viewBox size (static reference). */
export function paintPlasmaPatternLayer(ctx, layerImage) {
  const { width, height } = SVG_FRAME;
  ctx.clearRect(0, 0, width, height);
  ctx.save();
  clipBetspot(ctx);
  ctx.drawImage(layerImage, 0, 0, width, height);
  ctx.restore();
}
