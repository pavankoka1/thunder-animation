/**
 * Extracted-web crossfade motion for the analyse betspot.
 *
 * The plasma filament web is extracted from the artwork frames (build-time) as
 * vector polylines; ~10 keyframes are crossfaded here so the dense web is always
 * present and its paths re-route in place, looping seamlessly. Painted as
 * violet-halo / white-core glow strokes — no runtime image.
 */

/** Cover-fit mapping: frame-space (fw×fh) point → target via X=(x-offX)·scale. */
export function coverTransform(fw, fh, tw, th) {
  const scale = Math.max(tw / fw, th / fh);
  return { scale, offX: (fw - tw / scale) / 2, offY: (fh - th / scale) / 2 };
}

/**
 * Loop position → crossfade pair. p = (t/loop·count) mod count.
 * Clamps negative time to 0 — the first rAF timestamp can be marginally less
 * than the captured start, which would otherwise give a negative modulo (k0=-1).
 */
export function keyframeAt(tMs, loopMs, count) {
  if (count <= 0) return { k0: 0, k1: 0, frac: 0 };
  const t = tMs > 0 ? tMs : 0;
  const p = ((t / loopMs) * count) % count;
  const k0 = Math.floor(p);
  return { k0: k0 % count, k1: (k0 + 1) % count, frac: p - k0 };
}

/** Loop length (ms) for the 10-keyframe crossfade. Tune here. */
const LOOP_MS = 6000;
/** Glow passes: [width, "rgb(...)", alphaScale]. Tuned bright over blue. */
const PASSES = [
  [4.0, "rgb(150,70,225)", 0.5],
  [2.0, "rgb(210,120,245)", 0.62],
  [0.9, "rgb(250,252,255)", 0.98],
];

let pathsCache = null;

/** Fetch + cache the extracted keyframe JSON. */
export async function loadPaths(url) {
  if (pathsCache) return pathsCache;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`plasma paths ${res.status}`);
  pathsCache = await res.json();
  return pathsCache;
}

function makeCanvas(w, h) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
}

function makeVignette(w, h) {
  const c = makeCanvas(w, h);
  const ctx = c.getContext("2d");
  const cx = w * 0.5;
  const cy = h * 0.5;
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.hypot(cx, cy));
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.6, "rgba(255,255,255,0.92)");
  g.addColorStop(0.85, "rgba(255,255,255,0.5)");
  g.addColorStop(1, "rgba(255,255,255,0.08)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  return c;
}

/**
 * Cover-transform every polyline once and build one Path2D per keyframe (all
 * that keyframe's segments in a single path), plus a reusable offscreen and the
 * edge-fade vignette.
 */
export function initPaths(json, tw, th) {
  const { scale, offX, offY } = coverTransform(json.w, json.h, tw, th);
  const keyframes = json.frames.map((segs) => {
    const path = new Path2D();
    for (const poly of segs) {
      for (let i = 0; i < poly.length; i += 1) {
        const X = (poly[i][0] - offX) * scale;
        const Y = (poly[i][1] - offY) * scale;
        if (i === 0) path.moveTo(X, Y);
        else path.lineTo(X, Y);
      }
    }
    return path;
  });
  return {
    tw,
    th,
    count: keyframes.length,
    keyframes,
    offscreen: makeCanvas(tw, th),
    vignette: makeVignette(tw, th),
  };
}

function drawKeyframe(ctx, path, opacity) {
  for (const [width, color, aScale] of PASSES) {
    ctx.globalAlpha = Math.min(1, opacity * aScale);
    ctx.lineWidth = width;
    ctx.strokeStyle = color;
    ctx.stroke(path);
  }
}

/**
 * Paint one crossfaded frame: two consecutive keyframes with opacities summing
 * to 1 (web always present), masked by the vignette, blitted. Signature matches
 * the prior painters.
 */
export function paintPathsFrame(ctx, assets, tMs) {
  if (!assets) return;
  const { tw, th, count, keyframes, offscreen, vignette } = assets;
  const { k0, k1, frac } = keyframeAt(tMs, LOOP_MS, count);

  const octx = offscreen.getContext("2d");
  octx.globalCompositeOperation = "source-over";
  octx.globalAlpha = 1;
  octx.clearRect(0, 0, tw, th);
  octx.globalCompositeOperation = "lighter";
  octx.lineCap = "round";
  octx.lineJoin = "round";

  drawKeyframe(octx, keyframes[k0], 1 - frac);
  drawKeyframe(octx, keyframes[k1], frac);

  octx.globalCompositeOperation = "destination-in";
  octx.globalAlpha = 1;
  octx.drawImage(vignette, 0, 0);
  octx.globalCompositeOperation = "source-over";

  ctx.clearRect(0, 0, tw, th);
  ctx.drawImage(offscreen, 0, 0);
}
