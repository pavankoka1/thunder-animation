import { BETSPOT_QUADRANT, THUNDER_ORIGIN, betspotQuadrant } from "../betspotGeometry.js";
import { SVG_FRAME } from "../frame.js";
import { buildCausticCanvas } from "./skeletonMask.js";

const VB = SVG_FRAME;
const GRAPH_MAX_W = 420;
const GRAPH_MAX_H = 340;
const MIN_SPECK = 18;

const Q = BETSPOT_QUADRANT;

/** Build bright-pixel mask from raw crop RGBA (same rules as PathsPage network). */
export function buildBrightMask(data, cw, ch, threshold) {
  const mask = new Uint8Array(cw * ch);
  for (let y = 0; y < ch; y += 1) {
    for (let x = 0; x < cw; x += 1) {
      const i = (y * cw + x) * 4;
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const a = data[i + 3];
      if (a < 12) continue;
      if (r + g + b < threshold) continue;
      if (r > g + 45 && b > g + 25 && g < 85) continue;
      mask[y * cw + x] = 1;
    }
  }
  removeSpecks(mask, cw, ch, MIN_SPECK);
  return mask;
}

/**
 * Zhang-Suen morphological thinning. Iteratively peels border pixels of
 * filament blobs until only 1-pixel-wide skeleton lines remain. Converts
 * the "cluster" look (thick irregular blobs) into clean line geometry
 * with branches preserved.
 *
 * Reference: T.Y. Zhang & C.Y. Suen, "A Fast Parallel Algorithm for
 * Thinning Digital Patterns", CACM 1984.
 */
function thinMask(mask, cw, ch, maxIter = 35) {
  const w = cw;
  const h = ch;
  const data = mask;

  // Neighbour offsets in Zhang-Suen order:
  //   P9 P2 P3
  //   P8 P1 P4
  //   P7 P6 P5
  const N = [
    [0, -1], [1, -1], [1, 0], [1, 1],
    [0, 1], [-1, 1], [-1, 0], [-1, -1],
  ];

  const at = (x, y) => (x < 0 || y < 0 || x >= w || y >= h ? 0 : data[y * w + x]);
  const toRemove = [];

  const subIter = (step) => {
    toRemove.length = 0;
    for (let y = 1; y < h - 1; y += 1) {
      for (let x = 1; x < w - 1; x += 1) {
        if (!data[y * w + x]) continue;
        // Read 8-neighbourhood in order P2..P9.
        const p = N.map(([dx, dy]) => at(x + dx, y + dy));
        // B(P1) = number of non-zero neighbours.
        let bp = 0;
        for (const v of p) bp += v;
        if (bp < 2 || bp > 6) continue;
        // A(P1) = number of 0→1 transitions in P2..P9..P2 (clockwise).
        let ap = 0;
        for (let k = 0; k < 8; k += 1) {
          if (p[k] === 0 && p[(k + 1) & 7] === 1) ap += 1;
        }
        if (ap !== 1) continue;
        const [p2, p3, p4, p5, p6, p7, p8] = p;
        if (step === 0) {
          if (p2 * p4 * p6 !== 0) continue;
          if (p4 * p6 * p8 !== 0) continue;
        } else {
          if (p2 * p4 * p8 !== 0) continue;
          if (p2 * p6 * p8 !== 0) continue;
        }
        toRemove.push(y * w + x);
        // suppress unused warnings
        void p3; void p5; void p7;
      }
    }
    for (const idx of toRemove) data[idx] = 0;
    return toRemove.length;
  };

  for (let iter = 0; iter < maxIter; iter += 1) {
    const a = subIter(0);
    const b = subIter(1);
    if (a === 0 && b === 0) break;
  }
}

function removeSpecks(mask, cw, ch, minSize) {
  const seen = new Uint8Array(cw * ch);
  for (let start = 0; start < cw * ch; start += 1) {
    if (!mask[start] || seen[start]) continue;
    const stack = [start];
    seen[start] = 1;
    const comp = [start];
    while (stack.length) {
      const idx = stack.pop();
      const x = idx % cw;
      const y = (idx - x) / cw;
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          if (!dx && !dy) continue;
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= cw || ny >= ch) continue;
          const nIdx = ny * cw + nx;
          if (!mask[nIdx] || seen[nIdx]) continue;
          seen[nIdx] = 1;
          comp.push(nIdx);
          stack.push(nIdx);
        }
      }
    }
    if (comp.length < minSize) for (const idx of comp) mask[idx] = 0;
  }
}

function downsampleMask(mask, srcW, srcH, dstW, dstH) {
  const out = new Uint8Array(dstW * dstH);
  const scaleX = srcW / dstW;
  const scaleY = srcH / dstH;

  for (let ty = 0; ty < dstH; ty += 1) {
    const y0 = Math.floor(ty * scaleY);
    const y1 = Math.min(srcH, Math.ceil((ty + 1) * scaleY));
    for (let tx = 0; tx < dstW; tx += 1) {
      const x0 = Math.floor(tx * scaleX);
      const x1 = Math.min(srcW, Math.ceil((tx + 1) * scaleX));
      let on = 0;
      for (let py = y0; py < y1 && !on; py += 1) {
        for (let px = x0; px < x1; px += 1) {
          if (mask[py * srcW + px]) {
            on = 1;
            break;
          }
        }
      }
      out[ty * dstW + tx] = on;
    }
  }

  return { mask: out, w: dstW, h: dstH, scaleX, scaleY };
}

/** BFS graph distance from chip centre along the filament mask. */
function buildGraphDistance(mask, gw, gh, origin = THUNDER_ORIGIN) {
  const dist = new Float32Array(gw * gh);
  dist.fill(Number.POSITIVE_INFINITY);

  const ogx = (origin.x / VB.width) * gw;
  const ogy = (origin.y / VB.height) * gh;

  let seedDist = Number.POSITIVE_INFINITY;
  const seeds = [];

  for (let y = 0; y < gh; y += 1) {
    for (let x = 0; x < gw; x += 1) {
      const i = y * gw + x;
      if (!mask[i]) continue;
      const d = Math.hypot(x - ogx, y - ogy);
      if (d < seedDist - 0.01) {
        seedDist = d;
        seeds.length = 0;
        seeds.push(i);
      } else if (Math.abs(d - seedDist) < 1.05) {
        seeds.push(i);
      }
    }
  }

  if (!seeds.length) return dist;

  const queue = [];
  for (const i of seeds) {
    dist[i] = 0;
    queue.push(i);
  }

  let head = 0;
  while (head < queue.length) {
    const idx = queue[head++];
    const x = idx % gw;
    const y = (idx - x) / gw;
    const base = dist[idx];

    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        if (!dx && !dy) continue;
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= gw || ny >= gh) continue;
        const ni = ny * gw + nx;
        if (!mask[ni]) continue;
        const step = dx && dy ? 1.414 : 1;
        const nd = base + step;
        if (nd < dist[ni]) {
          dist[ni] = nd;
          queue.push(ni);
        }
      }
    }
  }

  return dist;
}

/**
 * Build the cyan network canvas at the work-mask's native resolution
 * (~420×340). The previous version downsampled to 84×68 viewBox px which
 * turned the thin filament lines into ~6×6 blocky chunks on display.
 * Rendering at full work-mask res preserves the 1px skeleton lines.
 */
function maskToViewCanvas(mask, gw, gh, data, cw, ch) {
  const net = document.createElement("canvas");
  net.width = gw;
  net.height = gh;
  const ctx = net.getContext("2d");
  const out = ctx.createImageData(gw, gh);
  const csx = cw / gw;
  const csy = ch / gh;

  let brightPixels = 0;

  for (let gy = 0; gy < gh; gy += 1) {
    for (let gx = 0; gx < gw; gx += 1) {
      if (!mask[gy * gw + gx]) continue;
      const cx = Math.min(cw - 1, Math.floor(gx * csx));
      const cy = Math.min(ch - 1, Math.floor(gy * csy));
      const si = (cy * cw + cx) * 4;
      const lum = data[si] + data[si + 1] + data[si + 2];
      const t = Math.min(1, lum / 765);
      const o = (gy * gw + gx) * 4;
      out.data[o] = Math.round(150 + t * 105);     // R
      out.data[o + 1] = 255;                        // G
      out.data[o + 2] = Math.round(245 + t * 10);   // B
      out.data[o + 3] = Math.round(220 + t * 35);   // A
      brightPixels += 1;
    }
  }

  ctx.putImageData(out, 0, 0);
  return { canvas: net, brightPixels };
}

/**
 * Pure white skeleton at work-mask resolution. Used as the mask source for
 * the strike reveal — at full resolution the lines stay sharp when drawn
 * over the viewBox at display scale.
 */
function buildSkeletonCanvas(mask, gw, gh) {
  const canvas = document.createElement("canvas");
  canvas.width = gw;
  canvas.height = gh;
  const ctx = canvas.getContext("2d");
  const img = ctx.createImageData(gw, gh);

  for (let i = 0; i < mask.length; i += 1) {
    if (!mask[i]) continue;
    const o = i * 4;
    img.data[o] = 255;
    img.data[o + 1] = 255;
    img.data[o + 2] = 255;
    img.data[o + 3] = 255;
  }

  ctx.putImageData(img, 0, 0);
  return canvas;
}

/**
 * Per-pixel distance + quadrant fields built at the WORK-MASK resolution
 * (typically 420×340 — HD enough that the strike animation reads as clean
 * thin lines, not 84×68 viewBox blocks). The fields keep the names `distVB`,
 * `quadrantVB`, `onNetwork`, `vw`, `vh` so the existing paint code in
 * paintNetworkStrike.js still works without changes — it just operates on
 * a larger array now.
 */
function buildViewFields(mask, gw, gh, graphDist) {
  const distVB = new Float32Array(gw * gh);
  const quadrantVB = new Uint8Array(gw * gh);
  const onNetwork = new Uint8Array(gw * gh);
  const maxByQuadrant = { [Q.SW]: 0, [Q.SE]: 0, [Q.NW]: 0, [Q.NE]: 0 };
  distVB.fill(Number.POSITIVE_INFINITY);

  // Map graph-grid pixels back into viewBox coordinates so the quadrant
  // assignment matches the betspot geometry the rest of the app uses.
  const vbPerGridX = VB.width / gw;
  const vbPerGridY = VB.height / gh;

  for (let y = 0; y < gh; y += 1) {
    for (let x = 0; x < gw; x += 1) {
      const i = y * gw + x;
      if (!mask[i]) continue;
      const d = graphDist[i];
      if (!Number.isFinite(d)) continue;
      onNetwork[i] = 1;
      distVB[i] = d;
      const vbX = (x + 0.5) * vbPerGridX;
      const vbY = (y + 0.5) * vbPerGridY;
      const q = betspotQuadrant(vbX, vbY);
      quadrantVB[i] = q;
      if (d > maxByQuadrant[q]) maxByQuadrant[q] = d;
    }
  }

  return { distVB, quadrantVB, onNetwork, maxByQuadrant, vw: gw, vh: gh };
}

/**
 * Full network graph from raw PNG crop — thick filaments + graph-distance fields.
 */
export function buildNetworkGraph(data, cw, ch, threshold, plasmaLayer = null) {
  const fullMask = buildBrightMask(data, cw, ch, threshold);

  let gw = cw;
  let gh = ch;
  let workMask = fullMask;

  if (cw > GRAPH_MAX_W || ch > GRAPH_MAX_H) {
    const down = downsampleMask(fullMask, cw, ch, GRAPH_MAX_W, GRAPH_MAX_H);
    workMask = down.mask;
    gw = down.w;
    gh = down.h;
  }

  // Thin the blob mask to 1px-wide centerlines so the network reads as proper
  // branching filament paths instead of irregular clusters. We keep a copy of
  // the pre-thinned mask in case any caller wants the original; for the
  // strike + display we use the thinned skeleton everywhere.
  thinMask(workMask, gw, gh);
  removeSpecks(workMask, gw, gh, 6);

  const graphDist = buildGraphDistance(workMask, gw, gh);
  const { canvas: networkCanvas, brightPixels } = maskToViewCanvas(
    workMask,
    gw,
    gh,
    data,
    cw,
    ch,
  );
  const skeletonCanvas = buildSkeletonCanvas(workMask, gw, gh);
  const fields = buildViewFields(workMask, gw, gh, graphDist);

  const graph = {
    networkCanvas,
    skeletonCanvas,
    brightPixels,
    gw,
    gh,
    origin: THUNDER_ORIGIN,
    causticCanvas: plasmaLayer ? buildCausticCanvas(plasmaLayer) : null,
    ...fields,
  };

  return graph;
}

/** Logical regions used in the strike choreography. */
export const NETWORK_REGION = {
  SW: [Q.SW],
  E: [Q.SE, Q.NE],
  N: [Q.NW],
  ALL: [Q.SW, Q.SE, Q.NW, Q.NE],
};

// First SW strike is the HERO — bigger, longer, more dramatic so it reads as
// the lead bolt. Subsequent strikes are tighter so the sequence keeps real-
// lightning pacing without dragging.
export const NETWORK_SEQUENCE = [
  { key: "SW",  regions: NETWORK_REGION.SW,  to: 0.7, dur: 760, label: "South-west strike", hero: true },
  { key: "E",   regions: NETWORK_REGION.E,   to: 1.0, dur: 420, label: "Eastern strikes" },
  { key: "N",   regions: NETWORK_REGION.N,   to: 1.0, dur: 440, label: "Northern thunder" },
  { key: "ALL", regions: NETWORK_REGION.ALL, to: 1.0, dur: 520, label: "Full discharge" },
];

function buildTimeline() {
  const segs = [];
  const cur = { [Q.SW]: 0, [Q.SE]: 0, [Q.NW]: 0, [Q.NE]: 0 };
  let t = 0;
  for (const step of NETWORK_SEQUENCE) {
    const from = { ...cur };
    const to = { ...cur };
    for (const q of step.regions) to[q] = Math.max(to[q], step.to);
    segs.push({ start: t, end: t + step.dur, from, to, active: step.regions, label: step.label });
    Object.assign(cur, to);
    t += step.dur;
  }
  return { segs, total: t };
}

export const NETWORK_TIMELINE = buildTimeline();

/**
 * Fast attack with visible deceleration — wavefront surges out in the first half,
 * then clearly decelerates into the target position so you can *see* it land, not
 * just snap there.  ^4 hits 94% at t=0.5 and 99% at t=0.7 — the final 30% of the
 * duration is a perceptible slow-down rather than invisible crawl.
 */
const easeOutQuart = (t) => 1 - (1 - t) ** 4;

/**
 * Per-quadrant reveal fraction (0..1 of that quadrant's graph span) at elapsed ms.
 * Also returns wavefront heads for active strikes.
 */
export function networkRevealAt(elapsed, maxByQuadrant) {
  const frac = { [Q.SW]: 0, [Q.SE]: 0, [Q.NW]: 0, [Q.NE]: 0 };
  const heads = [];

  for (const seg of NETWORK_TIMELINE.segs) {
    if (elapsed >= seg.end) {
      Object.assign(frac, seg.to);
    } else if (elapsed >= seg.start) {
      const lt = easeOutQuart((elapsed - seg.start) / (seg.end - seg.start));
      for (const q of [Q.SW, Q.SE, Q.NW, Q.NE]) {
        frac[q] = seg.from[q] + (seg.to[q] - seg.from[q]) * lt;
      }
      for (const q of seg.active) {
        if (seg.to[q] <= seg.from[q]) continue;
        const maxD = maxByQuadrant[q] || 0;
        if (maxD <= 0) continue;
        heads.push({ quadrant: q, front: frac[q] * maxD, maxD });
      }
    }
  }

  const frontDist = {};
  for (const q of [Q.SW, Q.SE, Q.NW, Q.NE]) {
    frontDist[q] = frac[q] * (maxByQuadrant[q] || 0);
  }

  return { frac, frontDist, heads };
}
