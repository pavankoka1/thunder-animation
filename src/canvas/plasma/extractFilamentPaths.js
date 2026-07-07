import { BETSPOT_CLIP } from "../betspotGeometry.js";
import { cumulativeLengths } from "../lightning/geometry.js";
import { isThunderFilament } from "./plasmaPixels.js";

/** Extraction raster cap — keeps getImageData + masks bounded. */
const MAX_HD_SCALE = 4;
/** Skeleton grid cap — higher = longer pixel chains between junctions. */
const SKELETON_MAX_W = 420;
const SKELETON_MAX_H = 340;
/** Refuse to skeletonize if the bright mask is denser than this. */
const MAX_BRIGHT_PIXELS = 60_000;
const MASK_ROW_CHUNK = 32;
const MAX_SKELETON_WALK = 4096;

function yieldToMain() {
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}

function edgeKey(x1, y1, x2, y2) {
  if (y1 < y2 || (y1 === y2 && x1 < x2)) return `${x1},${y1}|${x2},${y2}`;
  return `${x2},${y2}|${x1},${y1}`;
}

function neighbors8(x, y, w, h, mask) {
  const out = [];
  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      if (!dx && !dy) continue;
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      if (mask[ny * w + nx]) out.push({ x: nx, y: ny });
    }
  }
  return out;
}

function degree(x, y, w, h, mask) {
  return neighbors8(x, y, w, h, mask).length;
}

function inBetspot(px, py, w, h) {
  const vx = (px / w) * 84;
  const vy = (py / h) * 68;
  const { x, y, width, height } = BETSPOT_CLIP;
  return vx >= x && vy >= y && vx <= x + width && vy <= y + height;
}

/**
 * Max-pool downsample of a binary mask — cheap and safe for large inputs.
 */
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

  return {
    mask: out,
    w: dstW,
    h: dstH,
    toSourceX: (x) => (x + 0.5) * scaleX - 0.5,
    toSourceY: (y) => (y + 0.5) * scaleY - 0.5,
  };
}

/**
 * Two-pass chamfer distance transform on a binary mask (O(n), no iteration loop).
 */
function chamferDistanceTransform(mask, w, h) {
  const INF = w + h + 4;
  const dist = new Float32Array(w * h);

  for (let i = 0; i < w * h; i += 1) {
    dist[i] = mask[i] ? INF : 0;
  }

  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const i = y * w + x;
      if (!mask[i]) continue;
      if (x > 0) dist[i] = Math.min(dist[i], dist[i - 1] + 1);
      if (y > 0) dist[i] = Math.min(dist[i], dist[i - w] + 1);
      if (x > 0 && y > 0) dist[i] = Math.min(dist[i], dist[i - w - 1] + 1.414);
      if (x < w - 1 && y > 0) dist[i] = Math.min(dist[i], dist[i - w + 1] + 1.414);
    }
  }

  for (let y = h - 1; y >= 0; y -= 1) {
    for (let x = w - 1; x >= 0; x -= 1) {
      const i = y * w + x;
      if (!mask[i]) continue;
      if (x < w - 1) dist[i] = Math.min(dist[i], dist[i + 1] + 1);
      if (y < h - 1) dist[i] = Math.min(dist[i], dist[i + w] + 1);
      if (x < w - 1 && y < h - 1) dist[i] = Math.min(dist[i], dist[i + w + 1] + 1.414);
      if (x > 0 && y < h - 1) dist[i] = Math.min(dist[i], dist[i + w - 1] + 1.414);
    }
  }

  return dist;
}

/** Ridge = local maximum of distance among foreground neighbours → 1px centerline. */
function ridgeSkeletonFromDistance(mask, dist, w, h) {
  const skel = new Uint8Array(w * h);

  for (let y = 1; y < h - 1; y += 1) {
    for (let x = 1; x < w - 1; x += 1) {
      const i = y * w + x;
      if (!mask[i] || dist[i] < 0.55) continue;

      const dv = dist[i];
      let isRidge = true;
      for (let dy = -1; dy <= 1 && isRidge; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          if (!dx && !dy) continue;
          const j = (y + dy) * w + (x + dx);
          if (!mask[j]) continue;
          if (dist[j] > dv + 0.01) {
            isRidge = false;
            break;
          }
        }
      }
      if (isRidge) skel[i] = 1;
    }
  }

  return skel;
}

function pruneSkeletonSpurs(skel, w, h, minLen = 3) {
  const out = new Uint8Array(skel);
  let guard = 0;

  while (guard < 24) {
    guard += 1;
    let changed = false;

    for (let y = 1; y < h - 1; y += 1) {
      for (let x = 1; x < w - 1; x += 1) {
        if (!out[y * w + x] || degree(x, y, w, h, out) !== 1) continue;

        const chain = [{ x, y }];
        const seen = new Set([`${x},${y}`]);
        let prev = null;
        let cur = { x, y };
        let next = neighbors8(x, y, w, h, out)[0];

        while (
          next &&
          degree(next.x, next.y, w, h, out) === 2 &&
          chain.length < MAX_SKELETON_WALK
        ) {
          const key = `${next.x},${next.y}`;
          if (seen.has(key)) break;
          seen.add(key);
          chain.push(next);
          const nbrs = neighbors8(next.x, next.y, w, h, out).filter(
            (n) => !prev || n.x !== prev.x || n.y !== prev.y,
          );
          prev = cur;
          cur = next;
          next = nbrs[0] ?? null;
        }

        if (chain.length < minLen) {
          for (const p of chain) out[p.y * w + p.x] = 0;
          changed = true;
        }
      }
    }

    if (!changed) break;
  }

  return out;
}

async function buildFilamentMaskAsync(data, w, h, minLum, onProgress) {
  const mask = new Uint8Array(w * h);
  let brightCount = 0;

  for (let y0 = 0; y0 < h; y0 += MASK_ROW_CHUNK) {
    const y1 = Math.min(h, y0 + MASK_ROW_CHUNK);
    for (let py = y0; py < y1; py += 1) {
      for (let px = 0; px < w; px += 1) {
        if (!inBetspot(px, py, w, h)) continue;

        const i = (py * w + px) * 4;
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        const a = data[i + 3];
        const lum = r + g + b;

        if (!isThunderFilament(r, g, b, a)) continue;
        if (lum < minLum) continue;

        mask[py * w + px] = 1;
        brightCount += 1;
      }
    }
    onProgress?.(y1 / h);
    // eslint-disable-next-line no-await-in-loop
    await yieldToMain();
  }

  return { mask, brightCount };
}

function isGraphNode(x, y, w, h, skel, junctionDegree = 3) {
  if (!skel[y * w + x]) return false;
  const d = degree(x, y, w, h, skel);
  return d === 1 || d >= junctionDegree;
}

export function traceSkeletonPaths(skel, w, h, mapPoint = (p) => p, junctionDegree = 3) {
  const visited = new Set();
  const paths = [];

  const walkChain = (from, start) => {
    const chain = [mapPoint(start)];
    let prev = from;
    let cur = start;
    visited.add(edgeKey(from.x, from.y, start.x, start.y));
    let steps = 0;

    while (steps++ < MAX_SKELETON_WALK) {
      if (isGraphNode(cur.x, cur.y, w, h, skel, junctionDegree) && (cur.x !== start.x || cur.y !== start.y)) {
        break;
      }

      const nbrs = neighbors8(cur.x, cur.y, w, h, skel).filter(
        (n) => n.x !== prev.x || n.y !== prev.y,
      );
      if (!nbrs.length) break;

      let next = null;
      for (const n of nbrs) {
        const ek = edgeKey(cur.x, cur.y, n.x, n.y);
        if (!visited.has(ek)) {
          next = n;
          break;
        }
      }
      if (!next) break;

      visited.add(edgeKey(cur.x, cur.y, next.x, next.y));
      chain.push(mapPoint(next));
      prev = cur;
      cur = next;

      if (isGraphNode(cur.x, cur.y, w, h, skel, junctionDegree)) break;
    }

    return chain;
  };

  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      if (!isGraphNode(x, y, w, h, skel, junctionDegree)) continue;

      const nbrs = neighbors8(x, y, w, h, skel);
      for (const n of nbrs) {
        const ek = edgeKey(x, y, n.x, n.y);
        if (visited.has(ek)) continue;

        const chain = walkChain({ x, y }, n);
        const full = [mapPoint({ x, y }), ...chain.slice(1)];
        if (full.length >= 2) paths.push(full);
      }
    }
  }

  return paths;
}

/**
 * Trace maximal pixel chains along the skeleton (leaf → junction or leaf → leaf).
 * Produces long polylines with many interior vertices for jitter envelopes.
 */
export function traceSkeletonPolylines(skel, w, h, mapPoint = (p) => p) {
  const visited = new Uint8Array(w * h);
  const paths = [];

  const walkFrom = (x, y) => {
    const chain = [mapPoint({ x, y })];
    visited[y * w + x] = 1;
    let prev = null;
    let cur = { x, y };

    while (true) {
      const nbrs = neighbors8(cur.x, cur.y, w, h, skel).filter(
        (n) => !prev || n.x !== prev.x || n.y !== prev.y,
      );
      let next = null;
      for (const n of nbrs) {
        const ni = n.y * w + n.x;
        if (!visited[ni]) {
          next = n;
          break;
        }
      }
      if (!next) break;
      visited[next.y * w + next.x] = 1;
      chain.push(mapPoint(next));
      prev = cur;
      cur = next;
    }
    return chain;
  };

  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const i = y * w + x;
      if (!skel[i] || visited[i]) continue;
      if (degree(x, y, w, h, skel) === 1) {
        const chain = walkFrom(x, y);
        if (chain.length >= 2) paths.push(chain);
      }
    }
  }

  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const i = y * w + x;
      if (!skel[i] || visited[i]) continue;
      const chain = walkFrom(x, y);
      if (chain.length >= 2) paths.push(chain);
    }
  }

  return paths;
}

export function findJunctions(skel, w, h, mapPoint = (p) => p) {
  const junctions = [];
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      if (!skel[y * w + x]) continue;
      if (degree(x, y, w, h, skel) >= 3) junctions.push(mapPoint({ x, y }));
    }
  }
  return junctions;
}

/** Debug overlay at viewBox size only (5712 px) — never allocates a full-HD bitmap. */
function maskToViewCanvas(mask, srcW, srcH, viewW, viewH) {
  const out = document.createElement("canvas");
  out.width = viewW;
  out.height = viewH;
  const ctx = out.getContext("2d");
  const img = ctx.createImageData(viewW, viewH);
  const sx = srcW / viewW;
  const sy = srcH / viewH;

  for (let vy = 0; vy < viewH; vy += 1) {
    const py = Math.min(srcH - 1, Math.floor(vy * sy));
    for (let vx = 0; vx < viewW; vx += 1) {
      const px = Math.min(srcW - 1, Math.floor(vx * sx));
      if (!mask[py * srcW + px]) continue;
      const o = (vy * viewW + vx) * 4;
      img.data[o] = 255;
      img.data[o + 1] = 255;
      img.data[o + 2] = 255;
      img.data[o + 3] = 255;
    }
  }

  ctx.putImageData(img, 0, 0);
  return out;
}

/** 4-neighbour erosion — shrinks bright blobs before skeletonization. */
export function erodeOnce4(mask, w, h) {
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      if (!mask[y * w + x]) continue;
      if (
        x > 0 && mask[y * w + x - 1] &&
        x < w - 1 && mask[y * w + x + 1] &&
        y > 0 && mask[(y - 1) * w + x] &&
        y < h - 1 && mask[(y + 1) * w + x]
      ) {
        out[y * w + x] = 1;
      }
    }
  }
  return out;
}

export function erodeMask4(mask, w, h, times = 1) {
  let out = mask;
  for (let i = 0; i < times; i += 1) {
    out = erodeOnce4(out, w, h);
  }
  return out;
}

function countMaskOn(mask) {
  let n = 0;
  for (let i = 0; i < mask.length; i += 1) n += mask[i];
  return n;
}

export function pathsToSegments(rawPaths, viewScale, minViewLen) {
  const segments = [];
  let id = 0;

  for (const raw of rawPaths) {
    const points = raw.map((p) => ({
      x: p.x / viewScale,
      y: p.y / viewScale,
    }));

    if (points.length < 2) continue;

    const cumLengths = cumulativeLengths(points);
    const length = cumLengths[cumLengths.length - 1] ?? 0;
    if (length < minViewLen) continue;

    segments.push({
      id: id++,
      depth: 0,
      points,
      length,
      cumLengths,
      parentId: null,
    });
  }

  return segments;
}

/** Quantize endpoints for adjacency (~0.01 viewBox units). */
function endpointKey(x, y) {
  return `${Math.round(x * 100)}_${Math.round(y * 100)}`;
}

/**
 * Merge graph-edge segments through degree-2 junctions into long polylines
 * so jitter envelopes have middle vertices to displace.
 */
export function chainSegments(segments) {
  if (!segments?.length) return [];

  const n = segments.length;
  const visited = new Uint8Array(n);
  const adj = new Map();

  for (let i = 0; i < n; i += 1) {
    const pts = segments[i].points;
    if (pts.length < 2) continue;
    const sk = endpointKey(pts[0].x, pts[0].y);
    const ek = endpointKey(pts[pts.length - 1].x, pts[pts.length - 1].y);
    if (!adj.has(sk)) adj.set(sk, []);
    if (!adj.has(ek)) adj.set(ek, []);
    adj.get(sk).push({ segIndex: i, end: "start" });
    adj.get(ek).push({ segIndex: i, end: "end" });
  }

  const extendForward = (chain) => {
    let tip = chain[chain.length - 1];
    while (true) {
      const entries = adj.get(endpointKey(tip.x, tip.y));
      if (!entries || entries.length < 2) break;
      const unvisited = entries.filter((e) => !visited[e.segIndex]);
      if (unvisited.length !== 1) break;
      const next = unvisited[0];

      visited[next.segIndex] = 1;
      const pts = segments[next.segIndex].points;
      if (next.end === "start") {
        for (let j = 1; j < pts.length; j += 1) {
          chain.push({ x: pts[j].x, y: pts[j].y });
        }
      } else {
        for (let j = pts.length - 2; j >= 0; j -= 1) {
          chain.push({ x: pts[j].x, y: pts[j].y });
        }
      }
      tip = chain[chain.length - 1];
    }
    return chain;
  };

  const extendBackward = (chain) => {
    let tip = chain[0];
    while (true) {
      const entries = adj.get(endpointKey(tip.x, tip.y));
      if (!entries || entries.length < 2) break;
      const unvisited = entries.filter((e) => !visited[e.segIndex]);
      if (unvisited.length !== 1) break;
      const next = unvisited[0];

      visited[next.segIndex] = 1;
      const pts = segments[next.segIndex].points;
      const prefix = [];
      if (next.end === "end") {
        for (let j = 0; j < pts.length - 1; j += 1) {
          prefix.push({ x: pts[j].x, y: pts[j].y });
        }
      } else {
        for (let j = pts.length - 1; j >= 1; j -= 1) {
          prefix.push({ x: pts[j].x, y: pts[j].y });
        }
      }
      chain.unshift(...prefix);
      tip = chain[0];
    }
    return chain;
  };

  const chains = [];
  let id = 0;

  for (let i = 0; i < n; i += 1) {
    if (visited[i]) continue;
    visited[i] = 1;

    let chain = segments[i].points.map((p) => ({ x: p.x, y: p.y }));
    if (chain.length < 2) continue;

    chain = extendForward(chain);
    chain = extendBackward(chain);

    const cumLengths = cumulativeLengths(chain);
    const length = cumLengths[cumLengths.length - 1] ?? 0;
    chains.push({
      id: id++,
      depth: 0,
      points: chain,
      length,
      cumLengths,
      parentId: null,
    });
  }

  return chains;
}

/** Insert interpolated vertices so short skeleton chains can jitter in the middle. */
export function densifySegmentPoints(points, spacingVb = 0.12) {
  if (points.length < 2) return points;
  const out = [{ x: points[0].x, y: points[0].y }];

  for (let i = 1; i < points.length; i += 1) {
    const a = out[out.length - 1];
    const b = points[i];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const dist = Math.hypot(dx, dy);
    const steps = Math.max(1, Math.ceil(dist / spacingVb));
    for (let s = 1; s <= steps; s += 1) {
      const u = s / steps;
      out.push({ x: a.x + dx * u, y: a.y + dy * u });
    }
  }

  return out;
}

async function buildSkeleton(mask, srcW, srcH) {
  let workMask = mask;
  let w = srcW;
  let h = srcH;
  let toSourceX = (x) => x;
  let toSourceY = (y) => y;

  if (w > SKELETON_MAX_W || h > SKELETON_MAX_H) {
    const dstW = Math.min(SKELETON_MAX_W, w);
    const dstH = Math.min(SKELETON_MAX_H, h);
    const down = downsampleMask(mask, srcW, srcH, dstW, dstH);
    workMask = down.mask;
    w = down.w;
    h = down.h;
    toSourceX = down.toSourceX;
    toSourceY = down.toSourceY;
  }

  await yieldToMain();

  const dist = chamferDistanceTransform(workMask, w, h);
  await yieldToMain();

  let skel = ridgeSkeletonFromDistance(workMask, dist, w, h);
  skel = pruneSkeletonSpurs(skel, w, h, 3);

  const mapPoint = (p) => ({ x: toSourceX(p.x), y: toSourceY(p.y) });
  return { skel, w, h, mapPoint };
}

/** Skeletonize a binary mask at HD resolution (exported for video-frame analysis). */
export async function buildSkeletonFromMask(mask, srcW, srcH) {
  return buildSkeleton(mask, srcW, srcH);
}

/**
 * Extract filament branches from the plasma.svg raster (async, memory-safe).
 */
export async function extractFilamentPathsFromPlasma(
  plasmaSource,
  frame,
  {
    minLum = 180,
    hdScale = 3,
    preErodePx = 0,
    minLengthVb = 0.35,
    chainEdges = true,
    onPhase,
  } = {},
) {
  const scale = Math.min(MAX_HD_SCALE, Math.max(1, hdScale));
  const w = Math.round(frame.width * scale);
  const h = Math.round(frame.height * scale);

  onPhase?.("Reading pixels…");
  await yieldToMain();

  let data;
  if (
    plasmaSource instanceof HTMLCanvasElement &&
    plasmaSource.width === w &&
    plasmaSource.height === h
  ) {
    try {
      data = plasmaSource
        .getContext("2d", { willReadFrequently: true })
        .getImageData(0, 0, w, h).data;
    } catch {
      throw new Error(`Canvas read failed at ${scale}× (${w}×${h}). Try 2× resolution.`);
    }
  } else {
    const off = document.createElement("canvas");
    off.width = w;
    off.height = h;
    const ctx = off.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(plasmaSource, 0, 0, w, h);
    try {
      data = ctx.getImageData(0, 0, w, h).data;
    } catch {
      throw new Error(`Canvas too large at ${scale}× (${w}×${h}). Try 2× resolution.`);
    }
  }

  onPhase?.("Detecting bright filaments…");
  let { mask, brightCount } = await buildFilamentMaskAsync(
    data,
    w,
    h,
    minLum,
    (t) => onPhase?.(`Detecting filaments… ${Math.round(t * 100)}%`),
  );

  if (brightCount === 0) {
    return emptyResult(scale, frame, 0);
  }

  if (brightCount > MAX_BRIGHT_PIXELS) {
    onPhase?.("Mask too dense — raising threshold…");
    let lifted = minLum;
    while (brightCount > MAX_BRIGHT_PIXELS && lifted < 700) {
      lifted += 30;
      ({ mask, brightCount } = await buildFilamentMaskAsync(data, w, h, lifted, null));
      await yieldToMain();
    }
    if (brightCount === 0) {
      return emptyResult(scale, frame, 0, `No filaments after auto-threshold (tried ${lifted}).`);
    }
    if (brightCount > MAX_BRIGHT_PIXELS) {
      throw new Error(
        `Too many bright pixels (${brightCount}). Lower resolution or raise brightness floor.`,
      );
    }
  }

  if (preErodePx > 0) {
    onPhase?.(`Eroding mask ${preErodePx}px…`);
    mask = erodeMask4(mask, w, h, preErodePx);
    brightCount = countMaskOn(mask);
    await yieldToMain();
    if (brightCount === 0) {
      return emptyResult(scale, frame, 0, "Mask empty after erosion.");
    }
  }

  onPhase?.("Building skeleton…");
  const { skel, w: skW, h: skH, mapPoint } = await buildSkeleton(mask, w, h);

  let skeletonCount = 0;
  for (let i = 0; i < skel.length; i += 1) skeletonCount += skel[i];

  onPhase?.("Tracing branches…");
  await yieldToMain();

  const junctionDegree = 3;
  const rawPaths = traceSkeletonPaths(skel, skW, skH, mapPoint, junctionDegree);
  const junctions = findJunctions(skel, skW, skH, mapPoint).map((j) => ({
    x: j.x / scale,
    y: j.y / scale,
  }));

  let rawEdgeCount = pathsToSegments(
    traceSkeletonPaths(skel, skW, skH, mapPoint, 3),
    scale,
    0,
  ).length;

  let segments = pathsToSegments(rawPaths, scale, 0);

  if (chainEdges) {
    onPhase?.("Chaining edges…");
    await yieldToMain();
    segments = chainSegments(segments);
    segments = segments
      .map((seg) => {
        const points = densifySegmentPoints(seg.points, 0.08);
        const cumLengths = cumulativeLengths(points);
        return {
          ...seg,
          points,
          cumLengths,
          length: cumLengths[cumLengths.length - 1] ?? 0,
        };
      })
      .filter((seg) => seg.length >= minLengthVb)
      .map((seg, idx) => ({ ...seg, id: idx }));
  } else {
    segments = segments.filter((seg) => seg.length >= minLengthVb);
  }

  const pointCounts = segments.map((s) => s.points.length);
  const avgPoints =
    pointCounts.length > 0
      ? pointCounts.reduce((a, b) => a + b, 0) / pointCounts.length
      : 0;

  onPhase?.("Done");
  await yieldToMain();

  return {
    segments,
    junctions,
    skeletonCanvas: maskToViewCanvas(skel, skW, skH, frame.width, frame.height),
    brightCanvas: maskToViewCanvas(mask, w, h, frame.width, frame.height),
    stats: {
      hdScale: scale,
      rawBrightPixels: brightCount,
      skeletonPixels: skeletonCount,
      pathCount: segments.length,
      rawEdgeCount: chainEdges ? rawEdgeCount : segments.length,
      junctionCount: junctions.length,
      avgPointsPerPath: avgPoints,
      totalLength: segments.reduce((n, s) => n + (s.length || 0), 0),
    },
  };
}

function emptyResult(scale, frame, brightCount, note = "") {
  const blank = document.createElement("canvas");
  blank.width = frame.width;
  blank.height = frame.height;
  return {
    segments: [],
    junctions: [],
    skeletonCanvas: blank,
    brightCanvas: blank,
    stats: {
      hdScale: scale,
      rawBrightPixels: brightCount,
      skeletonPixels: 0,
      pathCount: 0,
      junctionCount: 0,
      avgPointsPerPath: 0,
      totalLength: 0,
      note,
    },
  };
}
