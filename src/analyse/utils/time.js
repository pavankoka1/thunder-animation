import { applyEasing } from "./easing.js";

/** Shader clock in seconds; clamps negative rAF timestamps to 0. */
export function elapsedSeconds(tMs) {
  return (tMs > 0 ? tMs : 0) * 0.001;
}

/** 0…1 formation progress from elapsed ms and outer config. */
export function formationProgress(tMs, formationMs, easing = "linear") {
  return applyEasing(tMs / formationMs, easing);
}
