import { PLASMA_CONFIG } from "./inner.js";
import { OUTER_CONFIG } from "./outer.js";

export { ANIMATION } from "./animation.js";
export { PLASMA_CONFIG } from "./inner.js";
export {
  BODY,
  CHIP,
  DEFAULT_SIZE_SCALE,
  LAYER_URLS,
  STAGE,
  SUPERSAMPLE,
  TOP_BAR,
} from "./layout.js";
export { OUTER_CONFIG } from "./outer.js";
export { THEMES } from "./themes.js";

/** Frozen inner + outer config for one betspot theme. */
export function themeConfig(theme) {
  return {
    inner: { ...PLASMA_CONFIG, ...theme.inner },
    outer: { ...OUTER_CONFIG, ...theme.outer },
  };
}
