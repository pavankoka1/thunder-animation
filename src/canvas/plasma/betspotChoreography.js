/**
 * Betspot activation timeline — matches reference videos.
 *
 * Phase 1 (0…VIBRATION_MS): betspot vibrates; inner energy and neon border
 * ramp from opacity 0 → 1 together.
 * Phase 2 (after FORMATION_MS): inner plasma / filament paths drift in a loop.
 * Outer electric fringe is disabled for now (see paintEdgeRim).
 */

/** Betspot shake duration (ms). */
export const VIBRATION_MS = 1500;

/** Inner energy + neon border formation — same window as vibration. */
export const FORMATION_MS = 1500;

export function introElapsed(timeMs, introStartMs) {
  return timeMs - introStartMs;
}

export function easeOutCubic(t) {
  const c = Math.max(0, Math.min(1, t));
  return 1 - (1 - c) ** 3;
}

/** 0…1 opacity ramp for inner energy and neon border during intro. */
export function formationProgress(elapsedMs) {
  return easeOutCubic(elapsedMs / FORMATION_MS);
}

export function isVibrating(elapsedMs) {
  return elapsedMs < VIBRATION_MS;
}

export function isFormationComplete(elapsedMs) {
  return elapsedMs >= FORMATION_MS;
}

/**
 * Shake intensity 0…1 — full during vibration, soft fade at end of phase.
 */
export function vibrationIntensity(elapsedMs) {
  if (elapsedMs >= VIBRATION_MS) return 0;
  const fadeStart = VIBRATION_MS - 250;
  if (elapsedMs < fadeStart) return 1;
  return (VIBRATION_MS - elapsedMs) / (VIBRATION_MS - fadeStart);
}

/** Loop animation time — only advances after formation is complete. */
export function innerLoopTimeMs(elapsedMs, wallTimeMs, introStartMs) {
  if (!isFormationComplete(elapsedMs)) return 0;
  return wallTimeMs - introStartMs - FORMATION_MS;
}
