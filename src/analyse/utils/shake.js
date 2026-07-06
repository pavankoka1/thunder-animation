import { betspotShakeOffset } from "../../canvas/plasma/betspotShake.js";
import { ANIMATION } from "../config/animation.js";

/**
 * 0…1 shake envelope during formation: quick attack, ease-out decay, zero after complete.
 */
export function shakeEnvelope(tMs, formationMs, attack = ANIMATION.shakeAttack) {
  const p = Math.min(1, tMs / formationMs);
  if (p >= 1) return 0;
  if (p < attack) return p / attack;
  const q = (p - attack) / (1 - attack);
  return 1 - q * q;
}

/** Apply betspot jitter transform to a DOM element (returns false if cleared). */
export function applyShakeTransform(el, tMs, { formationMs, scale, strength = ANIMATION.shakeStrength }) {
  if (!el) return false;
  const env = shakeEnvelope(tMs, formationMs);
  if (env <= 0) {
    el.style.transform = "";
    return false;
  }
  const { x, y, rot } = betspotShakeOffset(tMs, { intensity: env * strength * scale });
  el.style.transform = `translate(${x}px, ${y}px) rotate(${rot}deg)`;
  return true;
}

export function clearShakeTransform(el) {
  if (el) el.style.transform = "";
}
