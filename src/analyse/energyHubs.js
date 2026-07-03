/**
 * Anchor-hub detection for the analyse betspot warp.
 *
 * The 3 "clutters" the reference SVGs pivot around are the brightest clusters
 * of the painted pattern. We read them straight off the baked canvas
 * (luminance × alpha), blur heavily, and pick separated maxima.
 */

/** Hub maxima this close to the border are ignored (texture edges glow). */
const HUB_MARGIN_FRAC = 0.08;

function boxBlurPass(src, dst, w, h, r, horizontal) {
  const lineCount = horizontal ? h : w;
  const lineLen = horizontal ? w : h;
  const stride = horizontal ? 1 : w;
  const lineStride = horizontal ? w : 1;
  const norm = 1 / (2 * r + 1);

  for (let l = 0; l < lineCount; l += 1) {
    const base = l * lineStride;
    let sum = 0;
    for (let i = -r; i <= r; i += 1) {
      const idx = Math.min(lineLen - 1, Math.max(0, i));
      sum += src[base + idx * stride];
    }
    for (let i = 0; i < lineLen; i += 1) {
      dst[base + i * stride] = sum * norm;
      const addIdx = Math.min(lineLen - 1, i + r + 1);
      const subIdx = Math.max(0, i - r);
      sum += src[base + addIdx * stride] - src[base + subIdx * stride];
    }
  }
}

/**
 * Brightest separated clusters of a scalar field: triple box blur ≈ gaussian,
 * then greedy maxima with a suppression radius and a border-margin exclusion.
 *
 * @param {Float32Array} field row-major, any non-negative scale
 * @returns {Array<{x:number,y:number,strength:number}>} strongest first
 */
export function detectHubs(field, w, h, count = 3, minSep = Math.round(Math.min(w, h) / 3)) {
  const r = Math.max(2, Math.round(Math.min(w, h) / 12));
  const a = Float32Array.from(field);
  const b = new Float32Array(w * h);
  for (let pass = 0; pass < 3; pass += 1) {
    boxBlurPass(a, b, w, h, r, true);
    boxBlurPass(b, a, w, h, r, false);
  }

  const work = Float32Array.from(a);
  const mx = Math.round(w * HUB_MARGIN_FRAC);
  const my = Math.round(h * HUB_MARGIN_FRAC);
  for (let yy = 0; yy < h; yy += 1) {
    if (yy < my || yy >= h - my) {
      work.fill(0, yy * w, (yy + 1) * w);
    } else {
      work.fill(0, yy * w, yy * w + mx);
      work.fill(0, yy * w + w - mx, (yy + 1) * w);
    }
  }

  const hubs = [];
  for (let k = 0; k < count; k += 1) {
    let bi = -1;
    let bv = 1e-4;
    for (let i = 0; i < work.length; i += 1) {
      if (work[i] > bv) {
        bv = work[i];
        bi = i;
      }
    }
    if (bi < 0) break;
    const x = bi % w;
    const y = (bi / w) | 0;
    hubs.push({ x, y, strength: a[bi] });

    const x0 = Math.max(0, x - minSep);
    const x1 = Math.min(w, x + minSep);
    for (let yy = Math.max(0, y - minSep); yy < Math.min(h, y + minSep); yy += 1) {
      work.fill(0, yy * w + x0, yy * w + x1);
    }
  }
  return hubs;
}

/**
 * Read a canvas into a scalar field = (luminance/255) × (alpha/255), in [0,1].
 * Uses the painted pattern itself, so hubs sit on the visible bright clusters.
 */
export function canvasToField(canvas) {
  const w = canvas.width;
  const h = canvas.height;
  const data = canvas.getContext("2d").getImageData(0, 0, w, h).data;
  const field = new Float32Array(w * h);
  for (let i = 0; i < w * h; i += 1) {
    const o = i * 4;
    const lum = (data[o] + data[o + 1] + data[o + 2]) / 3;
    field[i] = (lum / 255) * (data[o + 3] / 255);
  }
  return { field, w, h };
}
