/** Animation modes for inner-energy lab + production renderer. */

export const ANIM_MODES = {
  BOTH: "jitter+brightness",
  JITTER: "jitter-only",
  BRIGHT: "brightness-only",
  STATIC: "static",
};

/**
 * Per-vertex position jitter with sin envelope (endpoints pinned).
 * @returns {Array<{x,y}>}
 */
export function applyAnimation(seg, t, mode, ampVb, freqHz) {
  const src = seg.points;
  const n = src.length;
  if (n < 2) return src.map((p) => ({ ...p }));

  const jitter =
    mode === ANIM_MODES.BOTH || mode === ANIM_MODES.JITTER;

  const out = new Array(n);
  for (let i = 0; i < n; i++) {
    const u = n === 1 ? 0 : i / (n - 1);
    const env = Math.sin(u * Math.PI);
    const seed = seg.id * 1009 + i * 13;
    let jx = 0;
    let jy = 0;
    if (jitter) {
      jx =
        Math.sin(t * freqHz * 1.7 + seed * 0.013) * ampVb +
        Math.sin(t * freqHz * 0.9 + seed * 0.041) * ampVb * 0.5;
      jy =
        Math.cos(t * freqHz * 1.5 + seed * 0.017) * ampVb +
        Math.cos(t * freqHz * 1.1 + seed * 0.037) * ampVb * 0.5;
    }
    out[i] = { x: src[i].x + jx * env, y: src[i].y + jy * env };
  }
  return out;
}

/** Per-segment brightness multiplier for breathing filaments. */
export function brightnessFor(seg, t, mode) {
  if (mode !== ANIM_MODES.BOTH && mode !== ANIM_MODES.BRIGHT) return 1;
  const s = seg.id * 0.37;
  return (
    0.45 +
    0.4 * Math.sin(t * 1.6 + s) +
    0.15 * Math.sin(t * 2.7 + s * 1.3)
  );
}

export function strokePolyline(ctx, pts, width, color, blur) {
  if (pts.length < 2) return;
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.lineWidth = width;
  ctx.strokeStyle = color;
  ctx.filter = blur > 0 ? `blur(${blur}px)` : "none";
  ctx.stroke();
  ctx.filter = "none";
}

const dimmedBaseCache = new WeakMap();

/** Purple plasma backdrop with bright filaments softened (not fully knocked out). */
export function ensureDimmedBase(texture) {
  const cached = dimmedBaseCache.get(texture);
  if (cached) return cached;

  const tw = texture.naturalWidth;
  const th = texture.naturalHeight;
  const c = document.createElement("canvas");
  c.width = tw;
  c.height = th;
  const ctx = c.getContext("2d");
  ctx.drawImage(texture, 0, 0);
  const img = ctx.getImageData(0, 0, tw, th);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const lum = d[i] + d[i + 1] + d[i + 2];
    if (lum > 540) {
      // Keep a faint ghost so extraction gaps are not black holes.
      d[i] = Math.round(d[i] * 0.42);
      d[i + 1] = Math.round(d[i + 1] * 0.34);
      d[i + 2] = Math.round(d[i + 2] * 0.62);
    } else if (lum > 380) {
      d[i] = Math.round(d[i] * 0.72);
      d[i + 1] = Math.round(d[i + 1] * 0.68);
      d[i + 2] = Math.round(d[i + 2] * 0.82);
    }
  }
  ctx.putImageData(img, 0, 0);
  dimmedBaseCache.set(texture, c);
  return c;
}
