/**
 * Filament segment extraction for the analyse betspot's ambient motion.
 *
 * Consumes the web canvas already produced by `loadPlasmaFilaments` (white
 * filaments on transparent, energy-canvas space) and returns polyline
 * segments plus the anchored hub positions the reference SVG phases showed.
 * Reuses the exported, frame-agnostic tracing helpers from the home page's
 * extractor — no shared code is modified. Skeletonization is local
 * (Zhang–Suen thinning): the home extractor's ridge skeleton fragments the
 * web's thick glow mask into confetti, while thinning preserves connectivity
 * by construction.
 */

import {
  chainSegments,
  densifySegmentPoints,
  pathsToSegments,
  traceSkeletonPaths,
} from "../canvas/plasma/extractFilamentPaths.js";

/** Web alpha above this counts as filament when building the skeleton mask. */
const MASK_ALPHA = 0.45;
/** Drop chained segments shorter than this (energy-canvas px). */
const MIN_SEGMENT_LEN = 6;
/** Vertex spacing after densify (energy-canvas px) — writhe needs interior vertices. */
const DENSIFY_SPACING = 2;
/** Leaf spurs shorter than this are trimmed off the thinned skeleton. */
const SPUR_MIN_LEN = 5;
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
 * Find the brightest energy clusters: triple box blur ≈ gaussian, then greedy
 * maxima with a suppression radius. Mirrors how the reference hubs were found.
 *
 * @param {Float32Array} alpha web alpha in [0,1], row-major
 * @returns {Array<{x:number,y:number,strength:number}>} strongest first
 */
export function detectHubs(
  alpha,
  w,
  h,
  count = 3,
  minSep = Math.round(Math.min(w, h) / 3)
) {
  const r = Math.max(2, Math.round(Math.min(w, h) / 12));
  let a = Float32Array.from(alpha);
  let b = new Float32Array(w * h);
  for (let pass = 0; pass < 3; pass += 1) {
    boxBlurPass(a, b, w, h, r, true);
    boxBlurPass(b, a, w, h, r, false);
  }

  const work = Float32Array.from(a);
  // Texture edges glow — never let a hub land in the border band.
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
 * Zhang–Suen thinning: erode the mask to a 1px skeleton without ever breaking
 * connectivity. The shared ridge skeleton fragments thick glow masks; this
 * cannot, which is why the analyse extractor uses it instead.
 */
export function thinMask(mask, w, h) {
  const m = Uint8Array.from(mask);
  let changed = true;
  let guard = 0;

  while (changed && guard < 100) {
    guard += 1;
    changed = false;
    for (let phase = 0; phase < 2; phase += 1) {
      const del = [];
      for (let y = 1; y < h - 1; y += 1) {
        for (let x = 1; x < w - 1; x += 1) {
          const i = y * w + x;
          if (!m[i]) continue;
          // clockwise neighbours from north
          const p = [
            m[i - w],
            m[i - w + 1],
            m[i + 1],
            m[i + w + 1],
            m[i + w],
            m[i + w - 1],
            m[i - 1],
            m[i - w - 1],
          ];
          const on = p[0] + p[1] + p[2] + p[3] + p[4] + p[5] + p[6] + p[7];
          if (on < 2 || on > 6) continue;
          let transitions = 0;
          for (let k = 0; k < 8; k += 1) {
            if (!p[k] && p[(k + 1) % 8]) transitions += 1;
          }
          if (transitions !== 1) continue;
          if (phase === 0) {
            if (p[0] && p[2] && p[4]) continue;
            if (p[2] && p[4] && p[6]) continue;
          } else {
            if (p[0] && p[2] && p[6]) continue;
            if (p[0] && p[4] && p[6]) continue;
          }
          del.push(i);
        }
      }
      if (del.length) {
        changed = true;
        for (const i of del) m[i] = 0;
      }
    }
  }
  return m;
}

function skelNeighbors(m, w, h, x, y, out) {
  out.length = 0;
  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      if (!dx && !dy) continue;
      const nx = x + dx;
      const ny = y + dy;
      if (nx >= 0 && ny >= 0 && nx < w && ny < h && m[ny * w + nx]) out.push([nx, ny]);
    }
  }
  return out;
}

/** Trim leaf spurs shorter than minLen off a thinned skeleton (junctions kept). */
export function pruneLeafSpurs(skel, w, h, minLen = SPUR_MIN_LEN) {
  const m = Uint8Array.from(skel);
  const nbrs = [];

  for (let pass = 0; pass < 6; pass += 1) {
    let removed = 0;
    for (let y = 0; y < h; y += 1) {
      for (let x = 0; x < w; x += 1) {
        if (!m[y * w + x] || skelNeighbors(m, w, h, x, y, nbrs).length !== 1) continue;

        const chain = [[x, y]];
        let px = x;
        let py = y;
        let [cx, cy] = nbrs[0];
        while (chain.length < minLen) {
          const nn = skelNeighbors(m, w, h, cx, cy, nbrs).filter(
            ([nx, ny]) => nx !== px || ny !== py
          );
          chain.push([cx, cy]);
          if (nn.length !== 1) break;
          px = cx;
          py = cy;
          [cx, cy] = nn[0];
        }
        const tip = chain[chain.length - 1];
        const tipDegree = skelNeighbors(m, w, h, tip[0], tip[1], nbrs).length;
        if (chain.length < minLen && tipDegree !== 1) {
          for (const [qx, qy] of chain.slice(0, -1)) {
            m[qy * w + qx] = 0;
            removed += 1;
          }
        }
      }
    }
    if (!removed) break;
  }
  return m;
}

/**
 * Skeletonize a binary mask (thin + spur-trim) and trace it into densified
 * polyline segments. Pure (no DOM) — points stay in mask/energy-canvas
 * pixel coordinates.
 *
 * @returns {Promise<Array<{id:number, points:Array<{x,y}>, length:number}>>}
 */
export async function segmentsFromMask(mask, w, h) {
  const skel = pruneLeafSpurs(thinMask(mask, w, h), w, h);
  const raw = traceSkeletonPaths(skel, w, h, (p) => p, 3);
  let segments = chainSegments(pathsToSegments(raw, 1, 0));

  return segments
    .map((seg) => ({ ...seg, points: densifySegmentPoints(seg.points, DENSIFY_SPACING) }))
    .filter((seg) => seg.points.length >= 3 && seg.length >= MIN_SEGMENT_LEN)
    .map((seg, idx) => ({ id: idx, points: seg.points, length: seg.length }));
}

/** Tag each segment with the index of the hub nearest its midpoint. */
export function tagSegmentsWithHubs(segments, hubs) {
  if (!hubs.length) return segments.map((seg) => ({ ...seg, hub: 0 }));
  return segments.map((seg) => {
    const mid = seg.points[(seg.points.length / 2) | 0];
    let best = 0;
    let bestD = Infinity;
    for (let k = 0; k < hubs.length; k += 1) {
      const d = Math.hypot(hubs[k].x - mid.x, hubs[k].y - mid.y);
      if (d < bestD) {
        bestD = d;
        best = k;
      }
    }
    return { ...seg, hub: best };
  });
}

/** Read the web canvas's alpha channel into a Float32Array in [0,1]. */
export function webCanvasToAlpha(web) {
  const w = web.width;
  const h = web.height;
  const data = web.getContext("2d").getImageData(0, 0, w, h).data;
  const alpha = new Float32Array(w * h);
  for (let i = 0; i < w * h; i += 1) alpha[i] = data[i * 4 + 3] / 255;
  return { alpha, w, h };
}

/**
 * Full extraction for the betspot: web canvas → { segments, hubs }.
 * Canvas-dependent wrapper around the pure helpers above.
 */
export async function extractSegments(web) {
  const { alpha, w, h } = webCanvasToAlpha(web);
  const mask = new Uint8Array(w * h);
  for (let i = 0; i < alpha.length; i += 1) mask[i] = alpha[i] > MASK_ALPHA ? 1 : 0;

  const hubs = detectHubs(alpha, w, h);
  const segments = tagSegmentsWithHubs(await segmentsFromMask(mask, w, h), hubs);
  return { segments, hubs };
}
