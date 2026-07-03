/**
 * Inner betspot energy — plasma filaments with intro ramp + loop drift.
 *
 * Reference: energy inside active spot.mp4 — dense purple network that
 * shimmers and drifts after formation. No procedural crackle bolts.
 */

import { BETSPOT_CLIP, clipBetspot, roundedRectPath } from "../betspotGeometry.js";
import { SVG_FRAME } from "../frame.js";
import { paintPlasmaPatternLayer } from "../plasmaPattern.js";

const VB = SVG_FRAME;

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {HTMLCanvasElement|Image} plasmaLayer
 * @param {{ networkCanvas?: HTMLCanvasElement } | null} graph
 * @param {number} wallTimeMs
 * @param {number} formation — 0…1 intro opacity (inner + border formation)
 * @param {number} loopTimeMs — ms since formation completed (0 during intro)
 */
export function paintInnerEnergy(ctx, plasmaLayer, graph, wallTimeMs, formation = 1, loopTimeMs = 0) {
  if (formation <= 0) return;

  const formed = formation >= 1;
  const loopT = loopTimeMs * 0.001;

  // Subtle shimmer once fully formed (energy inside active spot loop).
  const flicker = formed
    ? 0.72 + Math.sin(loopT * 2.4) ** 2 * 0.18 + Math.abs(Math.sin(loopT * 6.7)) * 0.1
    : 1;
  const pulse = formed
    ? 0.68 + Math.sin(loopT * 0.9) * 0.12
    : 0.5 + formation * 0.18;

  // Drifting UV offsets — paths move "here & there" like plasma.
  const plasmaDx = formed ? Math.sin(loopT * 1.15) * 1.1 + Math.sin(loopT * 2.05 + 0.6) * 0.55 : 0;
  const plasmaDy = formed ? Math.cos(loopT * 1.35) * 0.85 + Math.cos(loopT * 1.85 + 1.1) * 0.45 : 0;
  const netDx = formed ? Math.sin(loopT * 1.55 + 1.3) * 1.4 + Math.sin(loopT * 2.8) * 0.35 : 0;
  const netDy = formed ? Math.cos(loopT * 1.25 + 0.4) * 1.1 + Math.cos(loopT * 2.35 + 0.9) * 0.4 : 0;
  const netSkew = formed ? Math.sin(loopT * 0.95) * 0.018 : 0;

  const masterAlpha = formation * flicker;

  ctx.save();
  clipBetspot(ctx);

  // Magenta energy wash — builds with formation.
  roundedRectPath(ctx, BETSPOT_CLIP);
  ctx.fillStyle = `rgba(155, 30, 125, ${(0.32 + pulse * 0.14) * masterAlpha})`;
  ctx.fill();

  if (plasmaLayer?.naturalWidth) {
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    ctx.globalAlpha = (0.35 + pulse * 0.28) * masterAlpha;
    ctx.translate(plasmaDx, plasmaDy);
    ctx.drawImage(plasmaLayer, 0, 0, VB.width, VB.height);
    ctx.restore();
  }

  const network = graph?.networkCanvas;
  if (network) {
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.translate(VB.width / 2 + netDx, VB.height / 2 + netDy);
    ctx.rotate(netSkew);
    ctx.translate(-VB.width / 2, -VB.height / 2);

    ctx.filter = "blur(0.65px)";
    ctx.globalAlpha = (0.22 + flicker * 0.26) * masterAlpha;
    ctx.drawImage(network, 0, 0, VB.width, VB.height);

    ctx.filter = "none";
    ctx.globalAlpha = (0.38 + flicker * 0.38) * masterAlpha;
    ctx.drawImage(network, 0, 0, VB.width, VB.height);
    ctx.restore();
  }

  ctx.globalCompositeOperation = "source-over";
  ctx.restore();
}

/**
 * Full inner state with static plasma base (end of strike / home page).
 */
export function paintInnerEnergyStatic(ctx, plasmaLayer) {
  if (!plasmaLayer?.naturalWidth) return;
  paintPlasmaPatternLayer(ctx, plasmaLayer);
}
