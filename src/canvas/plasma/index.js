import { loadPlasmaPatternLayer } from "../plasmaPattern.js";
import {
  generateArtBasedLightning,
  segmentDrawLength,
  boltGrowthProgress,
  betspotFillBlend,
  computePathCompletion,
  BOLT_PHASE_END,
} from "./extractArtPaths.js";

export {
  segmentDrawLength,
  boltGrowthProgress,
  betspotFillBlend,
  computePathCompletion,
  BOLT_PHASE_END,
} from "./extractArtPaths.js";
export { paintPlasmaStatic, paintPlasmaStrike, paintPlasmaPathsDebug } from "./paintStrike.js";

export async function loadPlasmaAssets(plasmaUrl = "/plasma.svg") {
  const plasmaLayer = await loadPlasmaPatternLayer(plasmaUrl);
  const pathTree = generateArtBasedLightning(plasmaLayer, { width: 84, height: 68 });
  return { plasmaLayer, pathTree };
}
