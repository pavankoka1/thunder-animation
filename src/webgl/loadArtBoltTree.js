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
  // padding=0: plasma and paths fill the full canvas — the betspot border/clip
  // is handled by CSS on the outer container, not inside the WebGL canvas.
  const boltTree = artPathTreeToBoltTree(pathTree, canvasWidth, canvasHeight, 0);
  const plasmaCanvas = rasterizePlasmaForWebGL(plasmaLayer, canvasWidth, canvasHeight, 0);
  return { boltTree, plasmaCanvas };
}
