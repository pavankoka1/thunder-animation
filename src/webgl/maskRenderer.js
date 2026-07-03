import { BETSPOT_CLIP, roundedRectPath } from "../canvas/betspotGeometry.js";
import { boltGrowthProgress } from "../canvas/plasma/extractArtPaths.js";
import { strokePartialReveal } from "../canvas/plasma/strikeMask.js";
import { cumulativeLengths } from "../canvas/lightning/geometry.js";

function pathDrawRatio(meta, boltT) {
  if (boltT <= meta.spawnAt) return 0;
  if (boltT >= meta.finishAt) return 1;
  const t = (boltT - meta.spawnAt) / (meta.finishAt - meta.spawnAt);
  return 1 - (1 - t) ** 2.4;
}

function scaledClip(map) {
  const s = map.scale;
  return {
    x: BETSPOT_CLIP.x * s + map.ox,
    y: BETSPOT_CLIP.y * s + map.oy,
    width: BETSPOT_CLIP.width * s,
    height: BETSPOT_CLIP.height * s,
    radius: BETSPOT_CLIP.radius * s,
  };
}

function toCanvas2DPath(points, canvasHeight) {
  return points.map((p) => ({ x: p.x, y: canvasHeight - p.y }));
}

export function renderStrikeMask(tree, width, height, progress, target) {
  const canvas = target ?? document.createElement("canvas");
  if (canvas.width !== width) canvas.width = width;
  if (canvas.height !== height) canvas.height = height;

  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, width, height);
  if (progress <= 0 || progress >= 1 || !tree?.paths?.length) return canvas;

  const boltT = boltGrowthProgress(progress);

  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = "#fff";

  if (tree.map) {
    roundedRectPath(ctx, scaledClip(tree.map));
    ctx.clip();
  }

  const ordered = tree.pathMeta
    .map((meta, i) => ({ meta, i }))
    .sort((a, b) => (a.meta.depth ?? 0) - (b.meta.depth ?? 0));

  for (const { meta, i } of ordered) {
    const drawRatio = pathDrawRatio(meta, boltT);
    if (drawRatio <= 0) continue;

    const pts = toCanvas2DPath(tree.paths[i], height);
    const cum = cumulativeLengths(pts);
    const drawLen = cum[cum.length - 1] * drawRatio;

    strokePartialReveal(ctx, pts, cum, drawLen, meta.depth ?? 0, progress);
  }

  ctx.restore();
  return canvas;
}
