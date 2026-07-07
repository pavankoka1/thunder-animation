/**
 * Bake the neural reference image into a CLEAN, CONNECTED glow field for the
 * inner plasma. Sampling the raw JPG reads as disconnected blobby specks, so:
 *   1. build our OWN bright mask (simple luminance-sum threshold — no betspot
 *      colour filter, no speck removal that could wipe faint filaments),
 *   2. skeletonise + trace a CONNECTED graph of CURVED polylines,
 *   3. add CURVED synthetic branches rooted on existing nodes to fill the
 *      edges/corners (stay connected by construction),
 *   4. rasterise glowing veins (tapered hub→tip) with bright hub blobs.
 * If extraction yields too little (or throws), fall back to a fully synthetic
 * connected dendrite network so the field is NEVER empty.
 *
 * Runs EXACTLY ONCE (memoised) and is shared by all four betspots; only the GL
 * upload repeats per renderer.
 */
import {
  buildSkeletonFromMask,
  chainSegments,
  densifySegmentPoints,
  findJunctions,
  pathsToSegments,
  traceSkeletonPaths,
} from "../../canvas/plasma/extractFilamentPaths.js";
import { cumulativeLengths, subdivideSegment } from "../../canvas/lightning/geometry.js";
import { createRng, randRange } from "../../canvas/lightning/random.js";
import { PLASMA_CONFIG } from "../config/inner.js";
import { BODY, LAYER_URLS, SUPERSAMPLE } from "../config/layout.js";

// --- tunables ---
// Moderate threshold: capture the real DISTRIBUTED network (bold trunks + the
// connections between hubs), while dropping the faintest fuzz. Too low → fuzz
// marble; too high → almost nothing (falls back to the synthetic network).
const BRIGHT_THRESHOLD = 200; // r+g+b sum floor for a "bright filament" pixel
const MIN_LEN_PX = 5; // drop skeleton edges shorter than this (image px)
const DENSIFY_PX = 3; // resample vertex spacing so curves stay smooth
const MIN_SEGMENTS = 20; // below this, use the synthetic fallback
const BAKE_SS = 2; // bake supersample over the body canvas

// The source photo is close to square (~1.25:1) but the body is a wide card
// (~2.15:1); a strict cover-fit crops ~42% off the top+bottom to fill the
// width, which throws away the source's corner hub clusters. Cap how far the
// fit is allowed to zoom in one axis and make up the rest with a mild
// anisotropic squash instead — the network is an organic fractal web, not a
// recognisable shape, so a modest squeeze reads as denser, not "wrong".
const MAX_COVER_STRETCH = 1.3;

// A hub candidate is a near-white blob CENTRE in the source photo (distinct
// from ordinary vein pixels, which are dimmer/cooler) — these are the actual
// authored "neuron" nodes in the reference, not generic skeleton crossings
// (per-junction dots were tried before and rejected as "scattered specks").
const HUB_BRIGHT_THRESHOLD = 680; // r+g+b sum floor for a hub-blob core (near white)
const HUB_MIN_PIXELS = 10; // drop noise specks
const HUB_MAX_COUNT = 9; // cap extra hubs so it stays a handful of real nodes

const BAKE_W = Math.round(BODY.width * SUPERSAMPLE * BAKE_SS); // 1168
const BAKE_H = Math.round(BODY.height * SUPERSAMPLE * BAKE_SS); // 544
const DIAG = Math.hypot(BAKE_W, BAKE_H);

// Config knobs (read once at bake time): stroke thickness + branch-twig count.
const WIDTH_SCALE = PLASMA_CONFIG.pathWidth ?? 1;
const DENSITY_SCALE = PLASMA_CONFIG.branchDensity ?? 1;

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = "async";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`failed to load ${src}`));
    img.src = src;
  });
}

/** Our own bright mask: keep pixels whose luminance sum clears the threshold. */
function brightMask(data, w, h, thresh) {
  const mask = new Uint8Array(w * h);
  for (let i = 0, p = 0; i < mask.length; i += 1, p += 4) {
    if (data[p] + data[p + 1] + data[p + 2] >= thresh) mask[i] = 1;
  }
  return mask;
}

/**
 * Find the real hub-blob centres in the source photo: connected components of
 * near-white pixels (flood fill), centroid + pixel count per component. Used
 * to place MULTIPLE node glows matching the reference's distributed hubs,
 * instead of a single synthetic centre.
 */
function findHubCandidates(data, w, h, thresh, minPixels) {
  const mask = new Uint8Array(w * h);
  for (let i = 0, p = 0; i < mask.length; i += 1, p += 4) {
    if (data[p] + data[p + 1] + data[p + 2] >= thresh) mask[i] = 1;
  }

  const visited = new Uint8Array(w * h);
  const stack = [];
  const hubs = [];

  for (let start = 0; start < mask.length; start += 1) {
    if (!mask[start] || visited[start]) continue;
    stack.length = 0;
    stack.push(start);
    visited[start] = 1;
    let sumX = 0;
    let sumY = 0;
    let count = 0;

    while (stack.length) {
      const idx = stack.pop();
      const x = idx % w;
      const y = (idx / w) | 0;
      sumX += x;
      sumY += y;
      count += 1;
      if (x > 0 && mask[idx - 1] && !visited[idx - 1]) {
        visited[idx - 1] = 1;
        stack.push(idx - 1);
      }
      if (x < w - 1 && mask[idx + 1] && !visited[idx + 1]) {
        visited[idx + 1] = 1;
        stack.push(idx + 1);
      }
      if (y > 0 && mask[idx - w] && !visited[idx - w]) {
        visited[idx - w] = 1;
        stack.push(idx - w);
      }
      if (y < h - 1 && mask[idx + w] && !visited[idx + w]) {
        visited[idx + w] = 1;
        stack.push(idx + w);
      }
    }

    if (count >= minPixels) {
      hubs.push({ x: sumX / count, y: sumY / count, weight: count });
    }
  }

  hubs.sort((a, b) => b.weight - a.weight);
  return hubs;
}

/** Extract a connected graph of curved polylines from the image (source px). */
async function extractGraph(img) {
  const iw = img.naturalWidth;
  const ih = img.naturalHeight;
  const off = document.createElement("canvas");
  off.width = iw;
  off.height = ih;
  const ictx = off.getContext("2d", { willReadFrequently: true });
  ictx.drawImage(img, 0, 0);
  const { data } = ictx.getImageData(0, 0, iw, ih);

  const mask = brightMask(data, iw, ih, BRIGHT_THRESHOLD);
  const { skel, w, h, mapPoint } = await buildSkeletonFromMask(mask, iw, ih);

  // traceSkeletonPaths splits at junctions (degree 1 or >=3) → true connected
  // edges (NOT traceSkeletonPolylines, which cuts through junctions).
  const rawPaths = traceSkeletonPaths(skel, w, h, mapPoint, 3);
  const junctions = findJunctions(skel, w, h, mapPoint);
  const hubCandidates = findHubCandidates(data, iw, ih, HUB_BRIGHT_THRESHOLD, HUB_MIN_PIXELS);

  let segs = pathsToSegments(rawPaths, 1, MIN_LEN_PX);
  segs = chainSegments(segs);
  segs = segs.map((s) => ({
    ...s,
    points: densifySegmentPoints(s.points, DENSIFY_PX),
  }));

  return { segs, junctions, hubCandidates, iw, ih };
}

/**
 * Cover-fit mapping image-source px → bake px (keeps aspect, crops overflow),
 * with the crop capped at MAX_COVER_STRETCH — beyond that we squash the
 * overshoot axis anisotropically instead of cropping further, so distributed
 * content near the source's edges (hub clusters) survives into the bake.
 */
function coverMapping(iw, ih) {
  const bodyAspect = BAKE_W / BAKE_H;
  const imgAspect = iw / ih;
  let drawW;
  let drawH;
  if (imgAspect >= bodyAspect) {
    drawH = BAKE_H;
    drawW = BAKE_H * imgAspect;
    drawW = Math.min(drawW, BAKE_W * MAX_COVER_STRETCH);
  } else {
    drawW = BAKE_W;
    drawH = BAKE_W / imgAspect;
    drawH = Math.min(drawH, BAKE_H * MAX_COVER_STRETCH);
  }
  const offX = (BAKE_W - drawW) / 2;
  const offY = (BAKE_H - drawH) / 2;
  return (p) => ({ x: offX + (p.x / iw) * drawW, y: offY + (p.y / ih) * drawH });
}

function norm(dx, dy) {
  const len = Math.hypot(dx, dy) || 1;
  return { x: dx / len, y: dy / len };
}

/**
 * Fallback network (only used if extraction fails): a DISTRIBUTED web — hubs
 * scattered across the whole frame, each connected to its nearest neighbours by
 * curved edges, plus a few short branches. This mirrors the reference's
 * distributed mesh (NOT a central radial starburst).
 */
function syntheticNetwork() {
  const rng = createRng(0x51ab7e);
  const cols = 5;
  const rows = 3;
  const hubs = [];
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      hubs.push({
        x: ((c + 0.5) / cols) * BAKE_W + randRange(rng, -50, 50),
        y: ((r + 0.5) / rows) * BAKE_H + randRange(rng, -40, 40),
      });
    }
  }
  const segs = [];
  for (let i = 0; i < hubs.length; i += 1) {
    const near = hubs
      .map((h, j) => ({ j, d: Math.hypot(h.x - hubs[i].x, h.y - hubs[i].y) }))
      .filter((o) => o.j !== i)
      .sort((a, b) => a.d - b.d);
    const links = 2 + (rng() < 0.5 ? 1 : 0);
    for (let n = 0; n < links && n < near.length; n += 1) {
      const b = hubs[near[n].j];
      const len = near[n].d;
      const pts = subdivideSegment(hubs[i].x, hubs[i].y, b.x, b.y, len * 0.18, len * 0.08, rng);
      segs.push({ points: pts, base: 2.4 });
    }
    const arms = 2 + Math.floor(rng() * 3);
    for (let a = 0; a < arms; a += 1) {
      const ang = randRange(rng, 0, Math.PI * 2);
      const len = randRange(rng, 0.05, 0.12) * DIAG;
      const tip = { x: hubs[i].x + Math.cos(ang) * len, y: hubs[i].y + Math.sin(ang) * len };
      const pts = subdivideSegment(hubs[i].x, hubs[i].y, tip.x, tip.y, len * 0.22, len * 0.1, rng);
      segs.push({ points: pts, base: 1.6 });
    }
  }
  return { segs, junctions: hubs };
}

/**
 * Fill sparse edges by EXTENDING leaf filaments along their OWN tangent — an
 * organic continuation of the path, curved via subdivideSegment. Crucially NOT
 * radial-from-centre (that produced a starburst): each extension carries on the
 * direction the real filament was already heading, so the distributed network
 * reaches the rim naturally and stays connected.
 */
function addBranchFill(segsBake) {
  const rng = createRng(0x9e3aa21);
  const branches = [];

  for (const s of segsBake) {
    const pts = s.points;
    if (pts.length < 2) continue;
    for (const endIdx of [0, pts.length - 1]) {
      const tip = pts[endIdx];
      const border = Math.min(tip.x, BAKE_W - tip.x, tip.y, BAKE_H - tip.y) / BAKE_W;
      if (border > 0.2) continue; // only near the edges
      if (rng() > 0.6) continue; // only some leaves
      const prev = endIdx === 0 ? pts[1] : pts[pts.length - 2];
      const tang = norm(tip.x - prev.x, tip.y - prev.y); // outward along the filament
      const a = Math.atan2(tang.y, tang.x) + randRange(rng, -0.4, 0.4);
      const len = randRange(rng, 0.05, 0.11) * DIAG;
      const t2 = { x: tip.x + Math.cos(a) * len, y: tip.y + Math.sin(a) * len };
      const bp = subdivideSegment(tip.x, tip.y, t2.x, t2.y, len * 0.25, len * 0.12, rng);
      bp[0] = { x: tip.x, y: tip.y };
      branches.push({ points: bp, base: 1.4 });
    }
  }

  return { branches, hubBlobs: [] };
}

/**
 * Stroke one polyline as a CRISP thin vein: a tight dim halo + a hard bright
 * core. No wide bloom pass — with hundreds of densely-packed segments a wide
 * additive pass merges everything into a milky wash (reads as "marble"), which
 * is exactly what we're avoiding. Width tapers hub→tip.
 */
function strokePath(ctx, points, baseW) {
  if (points.length < 2) return;
  const cum = cumulativeLengths(points);
  const total = cum[cum.length - 1] || 1;
  const passes = [
    { wScale: 2.1, alpha: 0.16 }, // halo
    { wScale: 0.75, alpha: 1.0 }, // crisp core
  ];
  for (const pass of passes) {
    for (let i = 1; i < points.length; i += 1) {
      const tpar = cum[i] / total; // 0 at hub → 1 at tip
      const taper = 1.0 - 0.7 * tpar;
      ctx.strokeStyle = `rgba(255,255,255,${pass.alpha})`;
      ctx.lineWidth = Math.max(0.5, baseW * pass.wScale * taper * WIDTH_SCALE);
      ctx.beginPath();
      ctx.moveTo(points[i - 1].x, points[i - 1].y);
      ctx.lineTo(points[i].x, points[i].y);
      ctx.stroke();
    }
  }
}

function hubBlob(ctx, x, y, r) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, "rgba(255,255,255,0.95)");
  g.addColorStop(0.3, "rgba(255,255,255,0.5)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

/**
 * Densify the web to match the reference's fine dense plasma: spawn curved
 * twigs off interior points of every extracted vein (and a second-level fork),
 * each rooted ON the vein so it stays connected. This fills the empty gaps
 * with organic branching instead of leaving bare blue.
 */
function densifyBranches(segsBake) {
  const rng = createRng(0x7a2c11);
  const twigs = [];
  for (const s of segsBake) {
    const pts = s.points;
    if (pts.length < 4) continue;
    // 2–4 twigs per vein at density 1.0; scales with branchDensity.
    const n = Math.max(0, Math.round((2 + Math.floor(rng() * 3)) * DENSITY_SCALE));
    for (let k = 0; k < n; k += 1) {
      const i = 1 + Math.floor(rng() * (pts.length - 2));
      const at = pts[i];
      const prev = pts[i - 1];
      const baseAng = Math.atan2(at.y - prev.y, at.x - prev.x);
      const ang = baseAng + (rng() < 0.5 ? -1 : 1) * randRange(rng, 0.4, 1.1);
      const len = randRange(rng, 0.03, 0.09) * DIAG;
      const tip = { x: at.x + Math.cos(ang) * len, y: at.y + Math.sin(ang) * len };
      const tp = subdivideSegment(at.x, at.y, tip.x, tip.y, len * 0.3, len * 0.12, rng);
      tp[0] = { x: at.x, y: at.y };
      twigs.push({ points: tp, base: 1.4 });
      // second-level fork off the twig (shares a vertex → connected)
      if (rng() < 0.45 && tp.length > 3) {
        const m = tp[Math.floor(tp.length * 0.6)];
        const a2 = ang + (rng() < 0.5 ? -1 : 1) * randRange(rng, 0.3, 0.9);
        const l2 = len * randRange(rng, 0.4, 0.7);
        const t2 = { x: m.x + Math.cos(a2) * l2, y: m.y + Math.sin(a2) * l2 };
        const tp2 = subdivideSegment(m.x, m.y, t2.x, t2.y, l2 * 0.3, l2 * 0.14, rng);
        tp2[0] = { x: m.x, y: m.y };
        twigs.push({ points: tp2, base: 1.0 });
      }
    }
  }
  return twigs;
}

/**
 * Central hub: place a node at the canvas centre (where the image's diffuse
 * central glow — which doesn't skeletonise into lines — maps) and EXTEND the
 * nearest real path nodes into it with curved connectors, so the distributed
 * web visibly converges on a central hub (a neural network, not an empty core).
 * Curvature + connecting to real nodes at varied distances keeps it organic
 * rather than a clean radial starburst.
 */
function addCentralHub(segsBake) {
  const rng = createRng(0x0ce27e);
  const hub = { x: BAKE_W * 0.5, y: BAKE_H * 0.5 };
  const segs = [];

  // (a) Tie the hub into the web: connect the nearest real path nodes to it.
  const eps = [];
  for (const s of segsBake) {
    const p = s.points;
    if (p.length >= 2) eps.push(p[0], p[p.length - 1]);
  }
  const near = eps
    .map((p) => ({ p, d: Math.hypot(p.x - hub.x, p.y - hub.y) }))
    .filter((o) => o.d > DIAG * 0.04 && o.d < DIAG * 0.42)
    .sort((a, b) => a.d - b.d)
    .slice(0, 12);
  for (const { p } of near) {
    const len = Math.hypot(p.x - hub.x, p.y - hub.y);
    const pts = subdivideSegment(hub.x, hub.y, p.x, p.y, len * 0.16, len * 0.08, rng);
    pts[0] = { x: hub.x, y: hub.y };
    segs.push({ points: pts, base: 2.4 });
  }

  // (b) FILL the empty central patch: the image centre is a diffuse glow that
  // doesn't skeletonise into lines, so seed our own curved dendrites radiating
  // from the hub (varied length + strong curvature + jittered angle so it's a
  // neural soma, not a clean starburst). These get twig-densified downstream to
  // match the surrounding density.
  const arms = 14;
  for (let k = 0; k < arms; k += 1) {
    const a = (k / arms) * Math.PI * 2 + randRange(rng, -0.4, 0.4);
    const len = randRange(rng, 0.08, 0.3) * DIAG;
    const tip = { x: hub.x + Math.cos(a) * len, y: hub.y + Math.sin(a) * len };
    const pts = subdivideSegment(hub.x, hub.y, tip.x, tip.y, len * 0.32, len * 0.07, rng);
    pts[0] = { x: hub.x, y: hub.y };
    segs.push({ points: pts, base: 2.2 });
  }
  return { segs, hub };
}

function bakeToCanvas(segsBake, branchData, hubs) {
  const canvas = document.createElement("canvas");
  canvas.width = BAKE_W;
  canvas.height = BAKE_H;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, BAKE_W, BAKE_H);
  ctx.globalCompositeOperation = "lighter";
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  for (const s of segsBake) strokePath(ctx, s.points, s.base ?? 2.8);
  for (const b of branchData.branches) strokePath(ctx, b.points, b.base);

  // Bright hub node(s): the central synthetic hub plus the real bright-blob
  // hubs extracted from the source photo (findHubCandidates) — NOT every
  // skeleton junction, which read as scattered specks when tried before.
  // Secondary hubs are drawn a little smaller so the centre stays the
  // dominant focal point, matching the reference's one strong core + several
  // dimmer distributed nodes.
  for (const h of hubs) {
    const isSecondary = h.primary === false;
    hubBlob(ctx, h.x, h.y, isSecondary ? 13 : 18);
    hubBlob(ctx, h.x, h.y, isSecondary ? 5 : 8);
  }

  ctx.globalCompositeOperation = "source-over";
  return canvas;
}

async function buildField(img) {
  let segsBake = null;
  let extraHubs = [];
  try {
    const { segs, iw, ih, hubCandidates } = await extractGraph(img);
    // eslint-disable-next-line no-console
    console.info(`[neural bake] extracted ${segs.length} connected path segments`);
    if (segs.length >= MIN_SEGMENTS) {
      const toBake = coverMapping(iw, ih);
      segsBake = segs.map((s) => ({ ...s, base: 2.8, points: s.points.map(toBake) }));

      // Keep only hubs that survived the crop and aren't right on top of the
      // central hub (already-sorted by weight, so this keeps the strongest).
      const margin = 10;
      extraHubs = hubCandidates
        .map(toBake)
        .filter(
          (p) => p.x > margin && p.x < BAKE_W - margin && p.y > margin && p.y < BAKE_H - margin,
        )
        .filter((p) => Math.hypot(p.x - BAKE_W / 2, p.y - BAKE_H / 2) > DIAG * 0.08)
        .slice(0, HUB_MAX_COUNT);
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[neural bake] extraction failed → synthetic fallback", err);
  }

  if (!segsBake) {
    // eslint-disable-next-line no-console
    console.warn("[neural bake] using synthetic dendrite network fallback");
    const syn = syntheticNetwork();
    segsBake = syn.segs;
  }

  const branchData = addBranchFill(segsBake);
  const central = addCentralHub(segsBake);
  // Densify AFTER seeding the central dendrites so the previously-empty centre
  // gets the same twig treatment as the rest of the web.
  const seeded = [...segsBake, ...central.segs];
  const twigs = densifyBranches(seeded);
  const allSegs = [...seeded, ...twigs];
  const hubs = [
    { x: central.hub.x, y: central.hub.y, primary: true },
    ...extraHubs.map((h) => ({ x: h.x, y: h.y, primary: false })),
  ];
  return bakeToCanvas(allSegs, branchData, hubs);
}

let bakedPromise = null;

/**
 * One-time (memoised) bake shared across all betspots. Resolves to an
 * HTMLCanvasElement (BAKE_W×BAKE_H) that setReferenceImage uploads as u_tex.
 * Never resolves to an empty field: extraction failure → synthetic network.
 */
export function getBakedNeuralCanvas() {
  if (!bakedPromise) {
    bakedPromise = loadImage(LAYER_URLS.neural)
      .then(buildField)
      .catch((err) => {
        // eslint-disable-next-line no-console
        console.error("[neural bake] image load failed → synthetic fallback", err);
        const syn = syntheticNetwork();
        const central = addCentralHub(syn.segs);
        const twigs = densifyBranches(syn.segs);
        return bakeToCanvas(
          [...syn.segs, ...central.segs, ...twigs],
          addBranchFill(syn.segs),
          [central.hub],
        );
      });
  }
  return bakedPromise;
}
