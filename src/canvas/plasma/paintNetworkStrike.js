import { BETSPOT_CLIP, clipBetspot, roundedRectPath, THUNDER_ORIGIN } from "../betspotGeometry.js";
import { SVG_FRAME } from "../frame.js";
import { paintPlasmaStatic } from "./paintStrike.js";
import { NETWORK_TIMELINE, networkRevealAt } from "./networkGraph.js";
import { betspotFillBlend } from "./extractArtPaths.js";
import { paintCenterCausticBulk } from "./skeletonMask.js";

const VB = SVG_FRAME;

/**
 * How far behind the leading wavefront the ionized glow extends, in graph-
 * distance units. SHORT so the white-thunder visual is only at/near the
 * leading edge — once the wavefront passes a region, the white fades and
 * the plasma reveal underneath is the only thing left ("pattern formed by
 * the thunder", no persistent painted line on top).
 */
const TRAIL_BAND       = 16;
const WAVE_BAND        = 7.5;
const STEP_FLASH_MS    = 220;
const ORIGIN_BURST_MS  = 280;
/**
 * After the full sequence ends, the trail glow decays over this window before
 * we hand off to paintPlasmaStatic.  Removes the hard-cut feeling.
 */
const SETTLE_MS        = 500;

// ── Persistent offscreen surfaces ────────────────────────────────────────────

let gateCanvas; let gateCtx;
let maskCanvas; let maskCtx;
let trailCanvas; let trailCtx;
let netRevealCanvas; let netRevealCtx;
let waveScratch; let waveScratchCtx;
let headScratch; let headScratchCtx;

function ensureSurface(ref, ctxRef, w, h) {
  if (!ref) {
    ref = document.createElement("canvas");
    ref.width  = w;
    ref.height = h;
    ctxRef = ref.getContext("2d");
  }
  return { canvas: ref, ctx: ctxRef };
}

function getGate(w, h)      { const s = ensureSurface(gateCanvas,      gateCtx,      w, h); gateCanvas      = s.canvas; gateCtx      = s.ctx; return s; }
function getMask(w, h)      { const s = ensureSurface(maskCanvas,      maskCtx,      w, h); maskCanvas      = s.canvas; maskCtx      = s.ctx; return s; }
function getTrail(w, h)     { const s = ensureSurface(trailCanvas,     trailCtx,     w, h); trailCanvas     = s.canvas; trailCtx     = s.ctx; return s; }
function getNetReveal(w, h) { const s = ensureSurface(netRevealCanvas, netRevealCtx, w, h); netRevealCanvas = s.canvas; netRevealCtx = s.ctx; return s; }
function getWave(w, h)      { const s = ensureSurface(waveScratch,     waveScratchCtx, w, h); waveScratch     = s.canvas; waveScratchCtx = s.ctx; return s; }
function getHead(w, h)      { const s = ensureSurface(headScratch,     headScratchCtx, w, h); headScratch     = s.canvas; headScratchCtx = s.ctx; return s; }

// ── Gate: white pixels = network pixels reached by wavefront ─────────────────

function buildRevealGate(graph, frontDist) {
  const { vw, vh, distVB, quadrantVB, onNetwork } = graph;
  const { canvas, ctx } = getGate(vw, vh);
  const img = ctx.createImageData(vw, vh);

  for (let i = 0; i < vw * vh; i += 1) {
    if (!onNetwork[i]) continue;
    const front = frontDist[quadrantVB[i]] ?? 0;
    if (front <= 0 || distVB[i] > front + 0.3) continue;
    const o = i * 4;
    img.data[o] = img.data[o + 1] = img.data[o + 2] = img.data[o + 3] = 255;
  }

  ctx.putImageData(img, 0, 0);
  return canvas;
}

// ── Reveal mask: skeleton ∩ gate + caustic core + gap fill ───────────────────

function buildPathImprintMask(graph, frontDist, progress) {
  const { vw, vh } = graph;
  const { canvas: mc, ctx: mctx } = getMask(vw, vh);
  mctx.setTransform(1, 0, 0, 1, 0, 0);
  mctx.clearRect(0, 0, vw, vh);

  const skeleton = graph.skeletonCanvas;
  if (!skeleton) return mc;

  const gate = buildRevealGate(graph, frontDist);

  // Pass 1 — skeleton ∩ gate at native workmask resolution (no transform).
  // Dilate the 1-px skeleton lines so the plasma reveal swath is similar
  // thickness to the visible plasma filaments, not a hairline trace.
  mctx.save();
  mctx.filter = "blur(1.6px)";
  mctx.drawImage(skeleton, 0, 0);
  mctx.filter = "none";
  mctx.globalCompositeOperation = "destination-in";
  mctx.drawImage(gate, 0, 0);
  mctx.globalCompositeOperation = "source-over";
  mctx.restore();

  // Pass 2 — viewBox-coord overlays (centre bulk + corner fill). Scale the
  // mctx so the existing 84×68-coord painters span the full HD canvas.
  const scaleX = vw / VB.width;
  const scaleY = vh / VB.height;
  mctx.setTransform(scaleX, 0, 0, scaleY, 0, 0);

  if (progress > 0.02 && graph.causticCanvas) {
    paintCenterCausticBulk(mctx, graph, progress);
  }

  const fillBlend = betspotFillBlend(progress, Math.min(1, progress * 1.15));
  if (fillBlend > 0.001) {
    mctx.save();
    roundedRectPath(mctx, BETSPOT_CLIP);
    mctx.clip();
    const { x: ox, y: oy } = THUNDER_ORIGIN;
    const r = 5 + progress * 28;
    const fill = mctx.createRadialGradient(ox, oy, r * 0.2, ox, oy, 42);
    fill.addColorStop(0,    `rgba(255,255,255,${fillBlend * 0.55})`);
    fill.addColorStop(0.55, `rgba(255,255,255,${fillBlend * 0.82})`);
    fill.addColorStop(1,    `rgba(255,255,255,${fillBlend})`);
    mctx.fillStyle = fill;
    mctx.fillRect(BETSPOT_CLIP.x, BETSPOT_CLIP.y, BETSPOT_CLIP.width, BETSPOT_CLIP.height);
    mctx.restore();
  }

  mctx.setTransform(1, 0, 0, 1, 0, 0);
  return mc;
}

// ── Ionized trail: bright decaying glow on recently-struck path pixels ────────

/**
 * Every revealed pixel glows bright white-cyan proportional to how recently
 * the wavefront passed through it.  Pixels right at the front glow at full
 * intensity; pixels TRAIL_BAND graph-units behind have faded to zero.
 *
 * This is the key visual that makes the path feel alive and lit — the
 * "ionized channel" left by a real lightning discharge.
 *
 * trailStrength (0..1) is multiplied in for the settle fade-out.
 */
/**
 * Per-quadrant trail strength for the "strike → flicker → fade" beat.
 * No hold — real lightning fades the moment it stops being struck. Fast
 * exponential fade clears the bright bolt so the plasma reveal underneath
 * is what remains. Inside the active window we add a quick multi-stroke
 * flicker (lightning often re-strikes 2–3× within 100 ms).
 */
const QUAD_FADE_MS = 260;

function quadrantTrailStrengthAt(quadrant, elapsed) {
  let strength = 0;
  for (const seg of NETWORK_TIMELINE.segs) {
    if (!seg.active.includes(quadrant)) continue;
    if (elapsed < seg.start) continue;
    if (elapsed <= seg.end) {
      // Active — full brightness with a fast flicker for the multi-stroke
      // lightning feel. Sin² wiggle around 1.0, never below 0.78.
      const localT = (elapsed - seg.start) / Math.max(1, seg.end - seg.start);
      const flick = 0.85 + 0.15 * Math.abs(Math.sin(localT * Math.PI * 7));
      strength = Math.max(strength, flick);
      continue;
    }
    const since = elapsed - seg.end;
    const f = Math.min(1, since / QUAD_FADE_MS);
    // Sharp exponential decay — the bolt is gone fast.
    strength = Math.max(strength, (1 - f) ** 2.0);
  }
  return strength;
}

/**
 * Bright bolt visualization. Every network pixel from origin to the current
 * wavefront in an active quadrant is lit — the bolt is fully visible as it
 * grows, like real sky lightning. Per-quadrant trail strength fades each
 * struck bolt out after its step ends (HOLD then FADE), leaving the plasma
 * pattern reveal underneath as the mark.
 */
function paintTrailGlow(ctx, graph, frontDist, settleMultiplier, flicker, elapsedMs) {
  const { vw, vh, distVB, quadrantVB, onNetwork } = graph;

  // Pre-compute per-quadrant strength so the inner loop is cheap.
  const quadStrength = {};
  for (const q of [0, 1, 2, 3]) {
    quadStrength[q] = quadrantTrailStrengthAt(q, elapsedMs) * settleMultiplier;
  }

  const anyActive = Object.values(quadStrength).some((v) => v > 0.01);
  if (!anyActive) return;

  const { canvas: tc, ctx: tctx } = getTrail(vw, vh);
  const img = tctx.createImageData(vw, vh);

  for (let i = 0; i < vw * vh; i += 1) {
    if (!onNetwork[i]) continue;
    const quad = quadrantVB[i];
    const qs = quadStrength[quad];
    if (qs <= 0.01) continue;
    const front = frontDist[quad] ?? 0;
    if (front <= 0) continue;
    const d = distVB[i];
    if (d > front + 0.3) continue;

    const behind = front - d;
    const t = front > 0 ? Math.min(1, behind / front) : 0;
    // Intensity: peak white at wavefront → mid-brightness near origin.
    const profile = 0.55 + 0.45 * (1 - t);
    const glow = profile * qs * flicker;
    const a = Math.round(Math.min(1, glow) * 255);
    if (a <= 2) continue;

    const o = i * 4;
    img.data[o]     = 255;
    img.data[o + 1] = 255;
    img.data[o + 2] = 255;
    img.data[o + 3] = a;
  }

  tctx.putImageData(img, 0, 0);

  ctx.save();
  clipBetspot(ctx);
  ctx.globalCompositeOperation = "lighter";
  // Wide outer corona — soft bright glow around the bolt.
  ctx.globalAlpha = 0.55;
  ctx.filter = "blur(2.4px)";
  ctx.drawImage(tc, 0, 0, VB.width, VB.height);
  // Mid halo.
  ctx.globalAlpha = 0.85;
  ctx.filter = "blur(1.0px)";
  ctx.drawImage(tc, 0, 0, VB.width, VB.height);
  // Sharp hot white core.
  ctx.filter = "none";
  ctx.globalAlpha = 1.0;
  ctx.drawImage(tc, 0, 0, VB.width, VB.height);
  ctx.restore();
}

// ── Network overlay on revealed area — makes paths pop ───────────────────────

/**
 * Re-draw the cyan network canvas, but ONLY on pixels in the short trail band
 * behind the wavefront — the boost rides with the thunder head and dies
 * along with the trail glow. Pixels the wavefront already passed beyond
 * TRAIL_BAND have zero boost, so the long-term look is just the plasma
 * reveal underneath, not a persistent cyan-on-cyan paint.
 */
function paintNetworkBoost(ctx, graph, frontDist, trailStrength) {
  const { vw, vh, networkCanvas, onNetwork, distVB, quadrantVB } = graph;
  if (!networkCanvas || trailStrength <= 0) return;

  // Build a soft trail-band gate: white at wavefront → 0 at TRAIL_BAND behind.
  const { canvas: gate, ctx: gctx } = getGate(vw, vh);
  const img = gctx.createImageData(vw, vh);
  for (let i = 0; i < vw * vh; i += 1) {
    if (!onNetwork[i]) continue;
    const front = frontDist[quadrantVB[i]] ?? 0;
    if (front <= 0) continue;
    const d = distVB[i];
    if (d > front + 0.3) continue;
    const behind = front - d;
    if (behind > TRAIL_BAND) continue;
    const t = behind / TRAIL_BAND;
    const a = Math.round((1 - t) ** 1.8 * 255);
    if (a <= 1) continue;
    const o = i * 4;
    img.data[o] = img.data[o + 1] = img.data[o + 2] = 255;
    img.data[o + 3] = a;
  }
  gctx.putImageData(img, 0, 0);

  const { canvas: nr, ctx: nrctx } = getNetReveal(vw, vh);
  nrctx.clearRect(0, 0, vw, vh);
  nrctx.globalCompositeOperation = "source-over";
  nrctx.drawImage(networkCanvas, 0, 0);
  nrctx.globalCompositeOperation = "destination-in";
  nrctx.drawImage(gate, 0, 0);
  nrctx.globalCompositeOperation = "source-over";

  ctx.save();
  clipBetspot(ctx);
  ctx.globalCompositeOperation = "lighter";
  ctx.globalAlpha = 0.5 * trailStrength;
  ctx.drawImage(nr, 0, 0, VB.width, VB.height);
  ctx.restore();
}

// ── Leading wavefront head ────────────────────────────────────────────────────

function thunderFlicker(elapsed) {
  const pulse  = Math.sin(elapsed * 0.22) ** 2;
  const crackle = Math.abs(Math.sin(elapsed * 0.87 + 1.3));
  return 0.60 + pulse * 0.28 + crackle * 0.18;
}

function paintThunderWavefront(ctx, graph, heads, elapsed) {
  if (!heads.length || !graph.networkCanvas) return;

  const { distVB, quadrantVB, onNetwork, vw, vh, networkCanvas } = graph;
  const flicker = thunderFlicker(elapsed);

  const { canvas: wc, ctx: wctx } = getWave(vw, vh);
  const { canvas: hc, ctx: hctx } = getHead(vw, vh);

  ctx.save();
  clipBetspot(ctx);
  ctx.globalCompositeOperation = "lighter";

  for (const head of heads) {
    const band  = WAVE_BAND * (0.9 + 0.1 * flicker);
    const inner = Math.max(0, head.front - band);
    const outer = head.front + band * 0.3;

    const waveImg = wctx.createImageData(vw, vh);
    for (let i = 0; i < vw * vh; i += 1) {
      if (!onNetwork[i]) continue;
      if (quadrantVB[i] !== head.quadrant) continue;
      const d = distVB[i];
      if (d < inner || d > outer) continue;
      const t    = (d - inner) / Math.max(1e-5, outer - inner);
      const peak = 1 - Math.abs(t * 2 - 1);
      const a    = Math.round(peak ** 0.55 * 255 * flicker);
      const o    = i * 4;
      waveImg.data[o] = waveImg.data[o + 1] = waveImg.data[o + 2] = 255;
      waveImg.data[o + 3] = a;
    }

    wctx.putImageData(waveImg, 0, 0);

    // Hot filament: networkCanvas pixels lit by wavefront
    hctx.clearRect(0, 0, vw, vh);
    hctx.globalCompositeOperation = "source-over";
    hctx.drawImage(networkCanvas, 0, 0);
    hctx.globalCompositeOperation = "destination-in";
    hctx.drawImage(wc, 0, 0);
    hctx.globalCompositeOperation = "source-over";

    // Halo
    ctx.globalAlpha = 0.9 * flicker;
    ctx.filter = "blur(0.6px)";
    ctx.drawImage(hc, 0, 0, VB.width, VB.height);
    ctx.filter = "none";
    // White core
    ctx.globalAlpha = flicker;
    ctx.drawImage(hc, 0, 0, VB.width, VB.height);
    // Outer diffuse glow
    ctx.globalAlpha = 0.4 * flicker;
    ctx.filter = "blur(1.4px)";
    ctx.drawImage(wc, 0, 0, VB.width, VB.height);
    ctx.filter = "none";
  }

  ctx.restore();
}

// ── Sparks: small bright electric particles along the active bolt ────────────

/**
 * Pool of short-lived particles emitted along network pixels at/near the
 * leading wavefront. Each spark is a tiny bright dot that fades + scales
 * down over its life. Gives the strike that "crackle" feel — like
 * electricity sputtering off the bolt as it lands.
 *
 * Pool is module-scoped + capped so we never leak particles across runs.
 */
const SPARK_POOL_SIZE = 220;
const SPARK_LIFE_MS = 360;
const sparkPool = [];

function resetSparks() {
  sparkPool.length = 0;
}

function emitSparks(graph, heads, now, intensity) {
  if (!heads.length || intensity <= 0) return;
  const { distVB, quadrantVB, onNetwork, vw, vh } = graph;

  // Build candidate index buffer near each active wavefront. Sample
  // sparingly — too many sparks looks like noise.
  for (const head of heads) {
    const band = WAVE_BAND * 1.6;
    const inner = Math.max(0, head.front - band);
    const outer = head.front + band * 0.4;
    const targetCount = Math.round(6 * intensity);

    // Reservoir-style pick: scan pixels and accept with a probability
    // calibrated to hit ~targetCount picks total.
    let candidates = 0;
    for (let i = 0; i < vw * vh; i += 1) {
      if (!onNetwork[i]) continue;
      if (quadrantVB[i] !== head.quadrant) continue;
      const d = distVB[i];
      if (d < inner || d > outer) continue;
      candidates += 1;
    }
    if (!candidates) continue;
    const acceptP = Math.min(1, targetCount / candidates);
    if (acceptP <= 0) continue;

    for (let i = 0; i < vw * vh; i += 1) {
      if (sparkPool.length >= SPARK_POOL_SIZE) break;
      if (!onNetwork[i]) continue;
      if (quadrantVB[i] !== head.quadrant) continue;
      const d = distVB[i];
      if (d < inner || d > outer) continue;
      if (Math.random() > acceptP) continue;

      const px = (i % vw + 0.5) * (VB.width / vw);
      const py = (Math.floor(i / vw) + 0.5) * (VB.height / vh);
      // Random outward jitter so sparks fly off the bolt
      const jx = (Math.random() - 0.5) * 1.4;
      const jy = (Math.random() - 0.5) * 1.4;
      sparkPool.push({
        x: px + jx,
        y: py + jy,
        // Small outward velocity (viewBox units per ms)
        vx: jx * 0.012,
        vy: jy * 0.012,
        born: now,
        size: 0.5 + Math.random() * 0.8,
      });
    }
  }
}

function paintSparks(ctx, now) {
  if (!sparkPool.length) return;
  ctx.save();
  clipBetspot(ctx);
  ctx.globalCompositeOperation = "lighter";

  // Walk + cull
  for (let i = sparkPool.length - 1; i >= 0; i -= 1) {
    const s = sparkPool[i];
    const age = now - s.born;
    if (age >= SPARK_LIFE_MS) {
      sparkPool.splice(i, 1);
      continue;
    }
    const lifeT = age / SPARK_LIFE_MS;
    const alpha = (1 - lifeT) ** 1.6;
    // Slight outward drift over life
    const x = s.x + s.vx * age;
    const y = s.y + s.vy * age;
    const r = s.size * (1 - lifeT * 0.4);

    const grd = ctx.createRadialGradient(x, y, 0, x, y, r * 2.5);
    grd.addColorStop(0,   `rgba(255,255,255,${alpha})`);
    grd.addColorStop(0.4, `rgba(200,240,255,${alpha * 0.65})`);
    grd.addColorStop(1,   "rgba(140,220,255,0)");
    ctx.fillStyle = grd;
    ctx.beginPath();
    ctx.arc(x, y, r * 2.5, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

// ── Origin burst + step flash ─────────────────────────────────────────────────

function paintOriginBurst(ctx, elapsed) {
  const { x: OX, y: OY } = THUNDER_ORIGIN;

  for (const seg of NETWORK_TIMELINE.segs) {
    const dt = elapsed - seg.start;
    if (dt < 0 || dt > ORIGIN_BURST_MS) continue;
    const t = dt / ORIGIN_BURST_MS;
    const a = (1 - t) ** 1.4;
    const r = 4 + t * 22;       // bigger blast radius for drama
    const grd = ctx.createRadialGradient(OX, OY, 0, OX, OY, r);
    grd.addColorStop(0,    `rgba(255,255,255,${a})`);
    grd.addColorStop(0.35, `rgba(220,250,255,${a * 0.85})`);
    grd.addColorStop(0.7,  `rgba(160,240,255,${a * 0.45})`);
    grd.addColorStop(1,    "rgba(120,240,255,0)");
    ctx.save();
    clipBetspot(ctx);
    ctx.globalCompositeOperation = "lighter";
    ctx.fillStyle = grd;
    ctx.beginPath();
    ctx.arc(OX, OY, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

function paintStepFlash(ctx, elapsed) {
  for (const seg of NETWORK_TIMELINE.segs) {
    const dt = elapsed - seg.start;
    if (dt < 0 || dt > STEP_FLASH_MS) continue;
    const t = dt / STEP_FLASH_MS;
    // Brighter peak + slower fade so the whole betspot momentarily flashes
    // when each strike lands — the "thunder dropped" beat.
    const a = (1 - t) ** 1.6 * 0.7;
    ctx.save();
    clipBetspot(ctx);
    ctx.globalCompositeOperation = "lighter";
    ctx.fillStyle = `rgba(220,245,255,${a})`;
    ctx.fillRect(BETSPOT_CLIP.x, BETSPOT_CLIP.y, BETSPOT_CLIP.width, BETSPOT_CLIP.height);
    ctx.restore();
  }
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * One strike frame.
 *
 * elapsedMs runs from 0 → NETWORK_TIMELINE.total during the strike, then
 * continues into a SETTLE_MS window where the trail glow fades to zero before
 * we hand off to paintPlasmaStatic.  The caller drives the RAF loop.
 */
export function paintNetworkStrikeFrame(ctx, plasmaLayer, graph, elapsedMs, opts = {}) {
  if (!opts.skipClear) {
    ctx.clearRect(0, 0, VB.width, VB.height);
  }

  if (!plasmaLayer?.naturalWidth || !graph) return;

  // Reset the spark pool on the very first frame of a run.
  if (elapsedMs < 16) resetSparks();

  const total    = NETWORK_TIMELINE.total;
  const afterEnd = elapsedMs - total;

  // Settle phase: trail fades, then hand off to full static plasma
  const settling = afterEnd > 0;
  const settleT  = settling ? Math.min(1, afterEnd / SETTLE_MS) : 0;

  if (settleT >= 1) {
    paintPlasmaStatic(ctx, plasmaLayer);
    return;
  }

  const trailStrength = settling ? 1 - settleT : 1;
  const flicker = thunderFlicker(elapsedMs);

  // Use the final fully-revealed frontDist during settle
  const revealElapsed = settling ? total : elapsedMs;
  const { frontDist, heads } = networkRevealAt(revealElapsed, graph.maxByQuadrant);
  const progress = Math.min(1, revealElapsed / total);
  const mask = buildPathImprintMask(graph, frontDist, progress);

  // 1 — Plasma layer revealed through path-imprint mask
  ctx.save();
  clipBetspot(ctx);
  ctx.drawImage(plasmaLayer, 0, 0, VB.width, VB.height);
  ctx.globalCompositeOperation = "destination-in";
  ctx.drawImage(mask, 0, 0, VB.width, VB.height);
  ctx.globalCompositeOperation = "source-over";
  ctx.restore();

  // 2 — Boost brightness of struck filaments along the trail band (fades
  //     with the thunder head, so it doesn't sit as a persistent cyan paint).
  if (trailStrength > 0.05) {
    paintNetworkBoost(ctx, graph, frontDist, trailStrength);
  }

  // 3 — Ionized trail: glowing channel decaying per-quadrant after its
  //     step ends (strike → hold → fade rhythm).
  paintTrailGlow(ctx, graph, frontDist, trailStrength, flicker, elapsedMs);

  // 4 — Step flash fires for every strike (including the very first frame of
  //     SW, before the wavefront has moved). The origin burst + wavefront
  //     head only paint while heads are active.
  if (!settling) {
    paintStepFlash(ctx, elapsedMs);
    paintOriginBurst(ctx, elapsedMs);
    if (heads.length) {
      paintThunderWavefront(ctx, graph, heads, elapsedMs);
      // Spit out fresh sparks at the wavefront — they live ~360 ms then die.
      emitSparks(graph, heads, elapsedMs, 1.0);
    }
  }

  // Paint sparks every frame (active + still-fading from previous frames).
  paintSparks(ctx, elapsedMs);

  // 5 — Crossfade to full plasma. The trail glow is already fading per-
  //     quadrant; the plasma image dissolves in on top of that with a strong
  //     front-loaded ease so it's mostly there by halfway through settle.
  //     This eliminates the "blank frame" between the last bolt fading and
  //     the static plasma appearing.
  if (settling) {
    const dissolveT = Math.min(1, afterEnd / SETTLE_MS);
    // Strong front-loaded ease: ~34% by 10% of settle, ~94% by 50%, 1.0 at
    // 100%. Plasma comes in synchronously with the trail's exponential
    // fade, so there's no dim window between the two.
    const dissolveA = 1 - (1 - dissolveT) ** 4;
    ctx.save();
    clipBetspot(ctx);
    ctx.globalAlpha = dissolveA;
    ctx.drawImage(plasmaLayer, 0, 0, VB.width, VB.height);
    ctx.restore();
  }
}
