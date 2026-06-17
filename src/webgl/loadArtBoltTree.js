import { loadPlasmaAssets } from "../canvas/plasma/index.js";
import { artPathTreeToBoltTree, rasterizePlasmaForWebGL } from "./artBoltTree.js";

/**
 * Load plasma.svg, extract the 3-cluster bolt tree and rasterize the plasma
 * pattern into an offscreen canvas ready for WebGL texImage2D.
 *
 * @param {number} canvasWidth
 * @param {number} canvasHeight
 * @param {string} [plasmaUrl]
 * @returns {Promise<{ boltTree: object, plasmaCanvas: HTMLCanvasElement }>}
 */
export async function loadArtBoltTree(canvasWidth, canvasHeight, plasmaUrl = "/plasma.svg") {
  const { pathTree, plasmaLayer } = await loadPlasmaAssets(plasmaUrl);
  const boltTree = artPathTreeToBoltTree(pathTree, canvasWidth, canvasHeight);
  const plasmaCanvas = rasterizePlasmaForWebGL(plasmaLayer, canvasWidth, canvasHeight);
  return { boltTree, plasmaCanvas };
}
