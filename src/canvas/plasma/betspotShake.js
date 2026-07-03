/**
 * Betspot jitter during the vibration phase (~1.5s intro).
 */

/** Shake amplitude in CSS pixels (stage is upscaled × RENDER_SCALE). */
const AMP_PX = 1.85;

/**
 * @param {number} timeMs — wall-clock ms
 * @param {{ intensity?: number }} [opts] — 0…1 scale (0 = no shake)
 * @returns {{ x: number, y: number, rot: number }}
 */
export function betspotShakeOffset(timeMs, opts = {}) {
  const intensity = opts.intensity ?? 1;
  if (intensity <= 0) return { x: 0, y: 0, rot: 0 };

  const t = timeMs * 0.058;
  const a = AMP_PX * intensity;
  const x =
    Math.sin(t * 19.7) * a
    + Math.sin(t * 31.4) * a * 0.52
    + Math.sin(t * 47.8) * a * 0.24;
  const y =
    Math.cos(t * 22.1) * a
    + Math.cos(t * 29.3) * a * 0.48
    + Math.cos(t * 41.6) * a * 0.22;
  const rot =
    Math.sin(t * 16.2) * 0.32 * intensity
    + Math.sin(t * 38.5) * 0.14 * intensity;
  return { x, y, rot };
}
