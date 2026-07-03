/**
 * Procedural plasma-network motion for the analyse betspot.
 *
 * Filaments branch out from three hubs; each branch regenerates on a new jagged
 * route every life-cycle (grow → hold → retract), staggered across branches, so
 * the network's paths continuously reform. Painted with additive neon glow in
 * code — no runtime images.
 */

import { cumulativeLengths, subdivideSegment } from "../canvas/lightning/geometry.js";

/** Deterministic mulberry32 RNG → () => [0,1). */
export function makeRng(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

function grow(x, y, angle, length, rng, w, h, depth, out) {
  const a = angle + (rng() - 0.5) * 0.4;
  const ex = clamp(x + Math.cos(a) * length, 0, w);
  const ey = clamp(y + Math.sin(a) * length, 0, h);
  const raw = subdivideSegment(x, y, ex, ey, length * 0.28, 3, rng);
  const points = raw.map((p) => ({ x: clamp(p.x, 0, w), y: clamp(p.y, 0, h) }));
  const cumLengths = cumulativeLengths(points);
  out.push({ points, cumLengths, length: cumLengths[cumLengths.length - 1] });

  if (depth > 0) {
    const forks = rng() < 0.75 ? 1 : 0;
    for (let f = 0; f <= forks; f += 1) {
      const idx = 1 + Math.floor(rng() * (points.length - 1));
      const start = points[Math.min(idx, points.length - 1)];
      const forkAngle = a + (rng() - 0.5) * 1.3;
      grow(start.x, start.y, forkAngle, length * (0.45 + rng() * 0.2), rng, w, h, depth - 1, out);
    }
  }
  return out;
}

/**
 * Generate one branch's polylines (main + recursive forks) as a jagged
 * lightning path from a hub. Deterministic for `seed`. All points clamped
 * within [0,w]×[0,h].
 *
 * @returns {Array<{points:Array<{x,y}>, cumLengths:number[], length:number}>}
 */
export function generateBranch(hub, angle, length, seed, w, h, depth = 2) {
  return grow(hub.x, hub.y, angle, length, makeRng(seed), w, h, depth, []);
}

/** One life-cycle length in seconds (grow → hold → retract → regrow). */
export const PERIOD = 3.5;

function seedFor(hubIndex, slotIndex) {
  return (Math.imul(hubIndex + 1, 73856093) ^ Math.imul(slotIndex + 1, 19349663)) >>> 0;
}

/**
 * Static branch slots: the identity of each branch (hub, outward angle, base
 * length, seed, staggered phase). The actual jagged path is regenerated per
 * life-cycle in the painter.
 */
export function buildNetwork(w, h, hubs, { slotsPerHub = 7 } = {}) {
  const slots = [];
  const reach = w * 0.34;
  for (let hi = 0; hi < hubs.length; hi += 1) {
    for (let si = 0; si < slotsPerHub; si += 1) {
      const seed = seedFor(hi, si);
      const rng = makeRng(seed);
      const angle = (si / slotsPerHub) * Math.PI * 2 + rng() * 0.6;
      slots.push({
        hubIndex: hi,
        hub: hubs[hi],
        angle,
        baseLength: reach * (0.7 + rng() * 0.6),
        seed,
        phase: rng() * PERIOD,
      });
    }
  }
  return slots;
}

function smoothstep(t) {
  const x = t < 0 ? 0 : t > 1 ? 1 : t;
  return x * x * (3 - 2 * x);
}

/** grow → hold → retract envelope over the [0,1) cycle fraction. */
function envelope(u) {
  const G = 0.28;
  const H = 0.72;
  if (u < G) return smoothstep(u / G);
  if (u < H) return 1;
  return 1 - smoothstep((u - H) / (1 - H));
}

/**
 * Life state of a branch slot at time t: which cycle (→ route seed), how far it
 * has grown (extent), and its painted brightness (alpha, with flicker).
 *
 * @returns {{cycle:number, extent:number, alpha:number}}
 */
export function branchLife(slot, tSec, period = PERIOD) {
  const local = tSec + slot.phase;
  const cycle = Math.floor(local / period);
  const u = local / period - cycle;
  const extent = envelope(u);
  const flicker = 0.78 + 0.22 * Math.sin(tSec * 11 + slot.seed);
  return { cycle, extent, alpha: Math.max(0, Math.min(1, extent * flicker)) };
}

/** Neon glow passes (rgba prefixes; alpha appended per draw). */
const HALO = "rgba(150,70,225,";
const MID = "rgba(210,120,245,";
const CORE = "rgba(250,252,255,";
/** Hubs on the body midline, matching the reference clusters. */
const HUB_XS = [0.28, 0.5, 0.72];
/** Per-vertex paint-time jitter amplitude (px). */
const JITTER = 1.2;

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

/** One-time asset bundle: slots, offscreen, vignette, per-slot path cache. */
export function initNetwork(w, h) {
  const hubs = HUB_XS.map((fx) => ({ x: fx * w, y: h * 0.5 }));
  const slots = buildNetwork(w, h, hubs);
  return {
    w,
    h,
    slots,
    offscreen: makeCanvas(w, h),
    vignette: makeVignette(w, h),
    cache: slots.map(() => ({ cycle: -1, branches: null })),
  };
}

function strokeVisible(ctx, branch, drawLen, tSec, seed, width, style) {
  const pts = branch.points;
  const cum = branch.cumLengths;
  ctx.beginPath();
  let started = false;
  for (let i = 0; i < pts.length; i += 1) {
    if (cum[i] > drawLen) break;
    const jx = Math.sin(tSec * 2.1 + seed + i * 1.3) * JITTER;
    const jy = Math.cos(tSec * 1.7 + seed + i * 1.7) * JITTER;
    const x = pts[i].x + jx;
    const y = pts[i].y + jy;
    if (!started) {
      ctx.moveTo(x, y);
      started = true;
    } else {
      ctx.lineTo(x, y);
    }
  }
  if (!started) return;
  ctx.lineWidth = width;
  ctx.strokeStyle = style;
  ctx.stroke();
}

/**
 * Paint one frame of the reforming network. Regenerates a slot's jagged path
 * when its life-cycle advances; draws the grown portion with additive neon
 * glow; masks with the vignette; blits. Signature matches the prior painters.
 */
export function paintNetworkFrame(ctx, assets, tMs) {
  if (!assets) return;
  const { w, h, slots, offscreen, vignette, cache } = assets;
  const t = tMs / 1000;

  const octx = offscreen.getContext("2d");
  octx.globalCompositeOperation = "source-over";
  octx.globalAlpha = 1;
  octx.clearRect(0, 0, w, h);
  octx.globalCompositeOperation = "lighter";
  octx.lineCap = "round";
  octx.lineJoin = "round";

  for (let i = 0; i < slots.length; i += 1) {
    const slot = slots[i];
    const life = branchLife(slot, t);
    if (life.alpha < 0.02) continue;

    const slotCache = cache[i];
    if (slotCache.cycle !== life.cycle) {
      slotCache.cycle = life.cycle;
      slotCache.branches = generateBranch(
        slot.hub,
        slot.angle,
        slot.baseLength,
        (slot.seed ^ (life.cycle * 0x9e3779b1)) >>> 0,
        w,
        h,
      );
    }

    const a = life.alpha;
    for (const branch of slotCache.branches) {
      const drawLen = life.extent * branch.length;
      strokeVisible(octx, branch, drawLen, t, slot.seed, 4.5, HALO + (0.28 * a).toFixed(3) + ")");
      strokeVisible(octx, branch, drawLen, t, slot.seed, 2.0, MID + (0.5 * a).toFixed(3) + ")");
      strokeVisible(octx, branch, drawLen, t, slot.seed, 0.9, CORE + (0.85 * a).toFixed(3) + ")");
    }
  }

  octx.globalCompositeOperation = "destination-in";
  octx.globalAlpha = 1;
  octx.drawImage(vignette, 0, 0);
  octx.globalCompositeOperation = "source-over";

  ctx.clearRect(0, 0, w, h);
  ctx.drawImage(offscreen, 0, 0);
}
