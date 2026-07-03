import { SVG_FRAME } from "../canvas/frame.js";
import { isThunderFilament } from "../canvas/plasma/plasmaPixels.js";
import { createArtCoordinateMap } from "./artBoltTree.js";

/**
 * Build an energy layer: only white / cyan lightning filaments on transparent.
 * Screen-blended over the betspot frame this matches the canvas home page end state.
 *
 * @param {HTMLImageElement} plasmaLayer
 * @param {number} canvasWidth
 * @param {number} canvasHeight
 * @param {number} [padding]
 * @returns {HTMLCanvasElement}
 */
export function rasterizeBrightEnergyForWebGL(
  plasmaLayer,
  canvasWidth,
  canvasHeight,
  padding = 0
) {
  const map = createArtCoordinateMap(canvasWidth, canvasHeight, padding);
  const svgW = Math.round(SVG_FRAME.width * map.scale);
  const svgH = Math.round(SVG_FRAME.height * map.scale);

  const sample = document.createElement("canvas");
  sample.width = svgW;
  sample.height = svgH;
  const sctx = sample.getContext("2d", { willReadFrequently: true });
  sctx.drawImage(plasmaLayer, 0, 0, svgW, svgH);
  const { data } = sctx.getImageData(0, 0, svgW, svgH);

  const out = document.createElement("canvas");
  out.width = canvasWidth;
  out.height = canvasHeight;
  const octx = out.getContext("2d");
  const outData = octx.createImageData(canvasWidth, canvasHeight);

  const ox = Math.round(map.ox);
  const oy = Math.round(map.oy);

  for (let y = 0; y < svgH; y += 1) {
    for (let x = 0; x < svgW; x += 1) {
      const si = (y * svgW + x) * 4;
      const r = data[si];
      const g = data[si + 1];
      const b = data[si + 2];
      const a = data[si + 3];

      if (!isThunderFilament(r, g, b, a)) continue;

      const dx = ox + x;
      const dy = oy + y;
      if (dx < 0 || dy < 0 || dx >= canvasWidth || dy >= canvasHeight) continue;

      const oi = (dy * canvasWidth + dx) * 4;
      // Push filaments toward pale cyan-white for screen blend on blue frame
      const boost = Math.min(1.15, 220 / Math.max(lumish(r, g, b), 1));
      outData.data[oi] = Math.min(255, r * boost);
      outData.data[oi + 1] = Math.min(255, g * boost);
      outData.data[oi + 2] = Math.min(255, Math.min(b, g + 40) * boost);
      outData.data[oi + 3] = Math.min(255, a * 0.95);
    }
  }

  octx.putImageData(outData, 0, 0);
  return out;
}

function lumish(r, g, b) {
  return r + g + b;
}
