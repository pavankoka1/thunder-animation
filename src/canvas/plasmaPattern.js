import { loadImage } from "./loadImage.js";
import { clipBetspot } from "./betspotGeometry.js";
import { SVG_FRAME } from "./frame.js";

/**
 * Parsed from plasma.svg.
 * The embedded PNG (1364×1153) is placed in a pattern that fills a rect
 * larger than the viewport — only a sub-region of the PNG is actually visible
 * in the 84×68 SVG viewBox.
 */
export const PLASMA_SPEC = {
  groupOpacity: 0.6,
  rect: { x: -20.25, y: -21, width: 132, height: 109.823 },
  patternTransform: [0.000733138, 0, 0, 0.00088118, 0, -0.00800003],
  imageSize: { width: 1364, height: 1153 },
};

/**
 * Maps an (svgX, svgY) coordinate in the 84×68 viewBox to the corresponding
 * pixel position inside the raw 1364×1153 PNG texture.
 */
export function svgToTexturePixel(svgX, svgY) {
  const { rect, patternTransform } = PLASMA_SPEC;
  const [a, , , d, , f] = patternTransform;
  const bboxX = (svgX - rect.x) / rect.width;
  const bboxY = (svgY - rect.y) / rect.height;
  return {
    x: bboxX / a,
    y: (bboxY - f) / d,
  };
}

/**
 * Visible crop of the raw PNG that corresponds to the 84×68 SVG viewport.
 * Returns integer pixel bounds.
 */
export function getTextureCropForViewport() {
  const tl = svgToTexturePixel(0, 0);
  const br = svgToTexturePixel(SVG_FRAME.width, SVG_FRAME.height);
  return {
    x: Math.floor(tl.x),
    y: Math.floor(tl.y),
    w: Math.ceil(br.x) - Math.floor(tl.x),
    h: Math.ceil(br.y) - Math.floor(tl.y),
  };
}

const plasmaSvgCache = new Map();
let viewLayerPromise = null;

/**
 * Parse plasma.svg once and cache it. Returns { textureHref, spec }.
 */
export async function parsePlasmaSvg(url = "/plasma.svg") {
  const cached = plasmaSvgCache.get(url);
  if (cached) return cached;

  const promise = fetch(url)
    .then((r) => {
      if (!r.ok) throw new Error(`Failed to fetch ${url}`);
      return r.text();
    })
    .then((markup) => {
      const hrefMatch = markup.match(/xlink:href="(data:image\/[^"]+)"/);
      if (!hrefMatch) throw new Error("plasma.svg: embedded image not found");
      return { textureHref: hrefMatch[1], spec: PLASMA_SPEC };
    });

  plasmaSvgCache.set(url, promise);
  return promise;
}

/**
 * Load the raw 1364×1153 PNG texture from inside plasma.svg and return an
 * offscreen canvas containing only the viewport-visible crop (~868×703 px).
 *
 * This is the high-fidelity source for filament detection — we work from the
 * actual PNG pixels, not a blurry 84×68 re-rasterization.
 */
export async function loadPlasmaTextureCrop(url = "/plasma.svg") {
  const { textureHref } = await parsePlasmaSvg(url);
  const img = await loadImage(textureHref);
  const crop = getTextureCropForViewport();

  const canvas = document.createElement("canvas");
  canvas.width = crop.w;
  canvas.height = crop.h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(img, crop.x, crop.y, crop.w, crop.h, 0, 0, crop.w, crop.h);
  return { canvas, crop };
}

/**
 * Rasterize plasma at viewBox size (84×68) — cached for the full session.
 */
export async function loadPlasmaPatternLayer(url = "/plasma.svg") {
  if (!viewLayerPromise) {
    viewLayerPromise = rasterizePlasmaViewLayer(url);
  }
  return viewLayerPromise;
}

async function rasterizePlasmaViewLayer(url) {
  const { textureHref, spec } = await parsePlasmaSvg(url);
  const { rect, patternTransform, imageSize, groupOpacity } = spec;
  const [a, , , d, , f] = patternTransform;
  const { width, height } = SVG_FRAME;

  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"`,
    ` width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
    `<g opacity="${groupOpacity}">`,
    `<rect x="${rect.x}" y="${rect.y}" width="${rect.width}" height="${rect.height}"`,
    ` fill="url(#p)"/></g>`,
    `<defs><pattern id="p" patternContentUnits="objectBoundingBox" width="1" height="1">`,
    `<use xlink:href="#t" transform="matrix(${a} 0 0 ${d} 0 ${f})"/>`,
    `</pattern><image id="t" width="${imageSize.width}" height="${imageSize.height}"`,
    ` preserveAspectRatio="none" xlink:href="${textureHref}"/></defs></svg>`,
  ].join("");

  const blobUrl = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
  try {
    const img = await loadImage(blobUrl);
    if (!img.naturalWidth) throw new Error("Plasma layer rasterized to empty image");
    return img;
  } finally {
    URL.revokeObjectURL(blobUrl);
  }
}

export function createPlasmaRasterCanvas(scale, sourceLayer) {
  const w = Math.round(SVG_FRAME.width * Math.max(1, scale));
  const h = Math.round(SVG_FRAME.height * Math.max(1, scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(sourceLayer, 0, 0, w, h);
  return canvas;
}

/**
 * Re-render plasma.svg at `scale` × viewBox size.
 * Unlike createPlasmaRasterCanvas, this renders the actual SVG (including
 * the pattern transform) at the target resolution instead of upscaling the
 * blurry 84×68 bitmap.  Uses the cached textureHref so the multi-MB PNG is
 * only fetched once per session.
 */
export async function renderPlasmaAtScale(scale = 5, url = "/plasma.svg") {
  if (scale <= 1) return loadPlasmaPatternLayer(url);

  const { textureHref, spec } = await parsePlasmaSvg(url);
  const { rect, patternTransform, imageSize, groupOpacity } = spec;
  const [a, , , d, , f] = patternTransform;
  const vbW   = SVG_FRAME.width;
  const vbH   = SVG_FRAME.height;
  const width  = Math.round(vbW * scale);
  const height = Math.round(vbH * scale);

  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"`,
    ` width="${width}" height="${height}" viewBox="0 0 ${vbW} ${vbH}">`,
    `<g opacity="${groupOpacity}">`,
    `<rect x="${rect.x}" y="${rect.y}" width="${rect.width}" height="${rect.height}" fill="url(#p)"/>`,
    `</g><defs>`,
    `<pattern id="p" patternContentUnits="objectBoundingBox" width="1" height="1">`,
    `<use xlink:href="#t" transform="matrix(${a} 0 0 ${d} 0 ${f})"/>`,
    `</pattern>`,
    `<image id="t" width="${imageSize.width}" height="${imageSize.height}"`,
    ` preserveAspectRatio="none" xlink:href="${textureHref}"/></defs></svg>`,
  ].join("");

  const blobUrl = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
  try {
    const img = await loadImage(blobUrl);
    if (!img.naturalWidth) throw new Error("Plasma render empty at scale " + scale);
    return img;
  } finally {
    URL.revokeObjectURL(blobUrl);
  }
}

export async function loadPlasmaPatternLayerAtScale(scale = 1, url = "/plasma.svg") {
  const base = await loadPlasmaPatternLayer(url);
  if (scale <= 1) return base;
  return createPlasmaRasterCanvas(scale, base);
}

export function paintPlasmaPatternLayer(ctx, layerImage) {
  const { width, height } = SVG_FRAME;
  ctx.clearRect(0, 0, width, height);
  ctx.save();
  clipBetspot(ctx);
  ctx.drawImage(layerImage, 0, 0, width, height);
  ctx.restore();
}
