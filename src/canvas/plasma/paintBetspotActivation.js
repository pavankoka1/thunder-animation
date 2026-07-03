/**
 * Betspot activation — fade-in on the static svg, then the inner energy
 * starts MOVING via wiggling the svg's own filament polylines. No mp4.
 *
 * The static svg and animated polylines cross-fade over the last 250 ms of
 * formation so there is no hard cut when formation hits 1.0.
 */

import { paintInnerSpotEnergy } from "../innerSpotEnergy.js";
import { paintInnerEnergyAnimated } from "./innerEnergyMotion.js";
import { FORMATION_MS } from "./betspotChoreography.js";

const FADE_MS = 250;

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {{ energy, causticCanvas }} assets
 * @param {number} formation 0…1 — fade-in alpha for the static svg
 * @param {number} loopTimeMs — ms since formation hit 1.0
 */
export function paintActivationInner(ctx, assets, formation, loopTimeMs = 0) {
  const { energy } = assets ?? {};
  const { texture } = energy ?? {};

  if (!texture?.naturalWidth || formation <= 0) return;

  const handoff = Math.max(
    0,
    Math.min(
      1,
      (formation - (1 - FADE_MS / FORMATION_MS)) / (FADE_MS / FORMATION_MS),
    ),
  );

  paintInnerSpotEnergy(ctx, texture, formation);

  if (handoff > 0) {
    paintInnerEnergyAnimated(ctx, assets, loopTimeMs, handoff);
  }
}
