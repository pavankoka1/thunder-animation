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
