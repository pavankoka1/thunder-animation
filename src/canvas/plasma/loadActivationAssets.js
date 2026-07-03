/**
 * Load assets for betspot activation page.
 *
 * Static svg + plasma layer + extracted inner filament polylines.
 * Motion after formation wiggles those same polylines (innerEnergyMotion.js).
 */
import { SVG_FRAME, SVG_PATHS } from "../frame.js";
import { loadInnerSpotEnergyBundle } from "../innerSpotEnergy.js";
import { loadPlasmaPatternLayer } from "../plasmaPattern.js";
import { buildCausticCanvas } from "./skeletonMask.js";
import { extractFilamentPathsFromPlasma } from "./extractFilamentPaths.js";

const HD_SCALE = 3;
/** Include filament cores + wider glow for a fuller skeleton. */
const INNER_FILAMENT_MIN_LUM = 410;

function rasterizeInnerSpotEnergyHd(energy, scale = HD_SCALE) {
  const { texture, spec } = energy;
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

export async function loadActivationAssets(onPhase) {
  onPhase?.("Loading inner spot energy…");

  const energy = await loadInnerSpotEnergyBundle();

  onPhase?.("Extracting inner filament paths…");
  const hdCanvas = rasterizeInnerSpotEnergyHd(energy, HD_SCALE);
  const innerFilaments = await extractFilamentPathsFromPlasma(
    hdCanvas,
    SVG_FRAME,
    {
      hdScale: HD_SCALE,
      minLum: INNER_FILAMENT_MIN_LUM,
      preErodePx: 0,
      minLengthVb: 0.5,
      chainEdges: true,
      onPhase,
    },
  );

  // Drop debug bitmaps — not needed at runtime, saves ~100 KB.
  innerFilaments.skeletonCanvas = null;
  innerFilaments.brightCanvas = null;

  // eslint-disable-next-line no-console
  console.info("[inner filaments]", innerFilaments.stats);
  if (!innerFilaments.segments?.length) {
    // eslint-disable-next-line no-console
    console.warn(
      "[inner filaments] extraction returned 0 segments",
      innerFilaments.stats,
    );
  }

  onPhase?.("Loading plasma layer…");
  const plasmaLayer = await loadPlasmaPatternLayer(SVG_PATHS.plasma);

  return {
    energy,
    innerFilaments,
    causticCanvas: buildCausticCanvas(plasmaLayer),
  };
}
