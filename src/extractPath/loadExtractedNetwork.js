/**
 * Real pattern extraction — NOT synthetic. `extracted-network.json` is
 * produced by analysing the actual public/analyse/neural-reference.jpg with
 * external image-processing tools (Python + numpy/scipy/scikit-image):
 *   1. threshold the photo into a bright mask,
 *   2. skeletonize it to a 1px centreline graph,
 *   3. compute a distance transform of the mask so every skeleton pixel
 *      carries its REAL local thickness (not a guessed/authored width),
 *   4. trace the skeleton into polylines split at junctions/endpoints,
 *   5. simplify + keep the most significant runs within the shader's path
 *      budget (see lichtenbergTree.js MAX_PATHS/MAX_POINTS_PER_PATH).
 * (Regeneration script kept alongside for reference — see repo docs.)
 *
 * This module just remaps that already-extracted geometry (normalised 0..1
 * in SOURCE PHOTO space) into the betspot body's pixel space for the
 * existing SDF renderer (lichtenbergRenderer.js) to draw — same rendering
 * path as the procedural generator, but every path/width value here is real,
 * traced from the photo, not authored/randomised.
 */
import extracted from "./extracted-network.json";

// The source photo (~1.25:1) is far more square than the wide betspot body
// (~2.15:1); a strict cover-fit crop would crop ~42% off the top+bottom,
// throwing away the corner hub clusters. Capping the crop and letting the
// overshoot axis squash slightly instead keeps every corner on-screen.
const MAX_COVER_STRETCH = 1.18;

/**
 * @param {number} bodyW body width in the SAME pixel space as the renderer's
 *   layout.body.size (i.e. already multiplied by SUPERSAMPLE).
 * @param {number} bodyH
 * @param {{ widthScale?: number }} [options]
 */
export function loadExtractedNetwork(bodyW, bodyH, options = {}) {
  const { widthScale = 1 } = options;
  const { imgWidth: iw, imgHeight: ih, paths: rawPaths } = extracted;

  const bodyAspect = bodyW / bodyH;
  const imgAspect = iw / ih;
  let drawW;
  let drawH;
  if (imgAspect >= bodyAspect) {
    drawH = bodyH;
    drawW = Math.min(bodyH * imgAspect, bodyW * MAX_COVER_STRETCH);
  } else {
    drawW = bodyW;
    drawH = Math.min(bodyW / imgAspect, bodyH * MAX_COVER_STRETCH);
  }
  const offX = (bodyW - drawW) / 2;
  const offY = (bodyH - drawH) / 2;
  const scaleX = drawW / iw;
  const scaleY = drawH / ih;
  const wScale = ((scaleX + scaleY) / 2) * widthScale;

  // Floor kept well above 1 body-canvas px: side-by-side comparison against
  // the reference showed most extracted widths landing sub-pixel at this
  // resolution (46% of points were hitting the old 0.6px floor, median
  // coreSigma ~0.24px) which the Gaussian SDF glow renders as isolated
  // aliased dots instead of a continuous stroke, not the smooth continuous
  // lines the reference has. 1.4px keeps thin tendrils thin but drawable.
  const WIDTH_FLOOR = 1.0;
  const paths = rawPaths.map((pts) =>
    pts.map((p) => ({
      x: offX + p.x * iw * scaleX,
      y: offY + p.y * ih * scaleY,
      w: Math.max(WIDTH_FLOOR, p.w * wScale),
    }))
  );

  return { paths, pointCounts: paths.map((p) => p.length) };
}
