import { loadPlasmaAssets } from "../canvas/plasma/index.js";
import { loadImage } from "../canvas/loadImage.js";
import { SVG_PATHS } from "../canvas/frame.js";
import { artPathTreeToBoltTree } from "./artBoltTree.js";

/**
 * Load plasma.svg, extract the 3-cluster bolt tree and frame raster for compositing.
 *
 * @param {number} canvasWidth
 * @param {number} canvasHeight
 * @param {string} [plasmaUrl]
 * @returns {Promise<{ boltTree: object, plasmaLayer: CanvasImageSource, pathTree: object, frameImage: HTMLImageElement }>}
 */
export async function loadArtBoltTree(canvasWidth, canvasHeight, plasmaUrl = "/plasma.svg") {
  const [{ pathTree, plasmaLayer }, frameImage] = await Promise.all([
    loadPlasmaAssets(plasmaUrl),
    loadImage(SVG_PATHS.frame),
  ]);
  const boltTree = artPathTreeToBoltTree(pathTree, canvasWidth, canvasHeight, 0);
  return { boltTree, plasmaLayer, pathTree, frameImage };
}
