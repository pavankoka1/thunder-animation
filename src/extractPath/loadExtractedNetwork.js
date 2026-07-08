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
import { generateCornerPaths } from "./cornerPaths.js";

// The source photo (~1.25:1) is far more square than the wide betspot body
// (~2.15:1); a strict cover-fit crop would crop ~42% off the top+bottom,
// throwing away the corner hub clusters. Capping the crop and letting the
// overshoot axis squash slightly instead keeps every corner on-screen.
const MAX_COVER_STRETCH = 1.18;

/**
 * @param {number} bodyW body width in the SAME pixel space as the renderer's
 *   layout.body.size (i.e. already multiplied by SUPERSAMPLE).
 * @param {number} bodyH
 * @param {{ widthScale?: number, cornerDensity?: number,
 *   cornerRadius?: number }} [options]
 */
export function loadExtractedNetwork(bodyW, bodyH, options = {}) {
  const { widthScale = 1, cornerDensity = 1, cornerRadius } = options;
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

  // Floor in body-canvas px (which is backing px — the canvas is SUPERSAMPLE=4,
  // so 0.8 body px ≈ 0.2 display px). Kept low so thin tendrils stay HAIR-thin
  // and razor-sharp like neural-reference.jpg, rather than the blunt tubes the
  // old higher floor produced. Sub-pixel aliasing (the reason the floor was
  // once raised) is now handled by the 4x supersampled backing plus the
  // in-shader supersampling (SUBPIXEL_OFFSETS in lichtenbergShader.js).
  const WIDTH_FLOOR = 0.8;
  const mapped = rawPaths.map((pts) =>
    pts.map((p) => ({
      x: offX + p.x * iw * scaleX,
      y: offY + p.y * ih * scaleY,
      w: Math.max(WIDTH_FLOOR, p.w * wScale),
    }))
  );

  // Drop the "thorn" spurs. The skeleton trace splits at every junction and
  // endpoint, so the raw data is dominated by TINY fragments — the median path
  // is only ~1.9 body px long and ~75% are under 5px. Rendered, each of those
  // sub-pixel stubs is a little perpendicular barb, so the filaments read as
  // feathery/thorny instead of the clean thin lines of reference.png / the
  // /analyse crack field. Keeping only paths above a real arc-length leaves the
  // significant filaments and reads clean. (This also thins the network, which
  // lowers the per-fragment grid search cost — see spatialGrid.js.)
  const MIN_PATH_LEN = 6; // body px
  const arcLen = (pts) => {
    let len = 0;
    for (let i = 0; i < pts.length - 1; i += 1) {
      len += Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].y - pts[i].y);
    }
    return len;
  };
  const paths = mapped.filter((pts) => pts.length >= 2 && arcLen(pts) >= MIN_PATH_LEN);

  // Augment the sparse body corners with fractal dendritic bursts (see
  // cornerPaths.js) so all four corners read as densely as reference.png's
  // corner hubs. widthScale is passed through so they track the same Width-
  // scale slider as the traced filaments.
  const cornerPaths = generateCornerPaths(bodyW, bodyH, {
    density: cornerDensity,
    widthScale,
    cornerRadius,
  });

  const allPaths = paths.concat(cornerPaths);

  return { paths: allPaths, pointCounts: allPaths.map((p) => p.length) };
}
