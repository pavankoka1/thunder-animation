"""
Real extraction: threshold the actual neural-reference.jpg into a bright
mask, skeletonize it, compute a distance transform for per-pixel thickness,
then trace the 1px skeleton into a graph of polylines (splitting at
junctions/endpoints) — each polyline carries real (x, y, width) samples
pulled straight from the source photo. No synthetic/procedural generation:
the geometry AND thickness come directly from image analysis.

Output feeds src/extractPath/loadExtractedNetwork.js, which remaps it into
the betspot body's pixel space for the existing SDF shader renderer
(lichtenbergRenderer.js) to draw.

Usage (from repo root, needs numpy/scipy/scikit-image/Pillow):
    python3 -m venv /tmp/venv-imgtools
    /tmp/venv-imgtools/bin/pip install numpy scipy scikit-image pillow
    /tmp/venv-imgtools/bin/python3 scripts/extract_lichtenberg_pattern.py
"""

import json

import numpy as np
from PIL import Image
from scipy import ndimage
from skimage.morphology import skeletonize

SRC = "public/analyse/neural-reference.jpg"
OUT = "src/extractPath/extracted-network.json"

# Must match src/extractPath/lichtenbergTree.js's MAX_PATHS / MAX_POINTS_PER_PATH
# (the shader's texture budget) — bump both together if you raise these.
#
# Two hard-won lessons baked into this pipeline (see git history for the
# failed attempts): (1) do NOT length-filter individual edges — the skeleton
# of a dense mesh naturally has huge numbers of very short (often 1-2px)
# inter-junction edges that are real connective tissue, not noise; dropping
# them (or dropping/subsampling ANY edges at all to fit a budget) fragments
# the mesh at every removed edge, rendering as a "beaded"/dashed look
# instead of the reference's continuous strokes. (2) values above ~10-12k
# for MAX_PATHS rendered garbage on this GPU/driver (a per-fragment shader
# loop-bound limit) — so this script CHAINS runs of edges sharing an
# endpoint into far fewer, longer paths (zero geometry lost, just
# repackaged) to fit comfortably under that limit instead of removing data.
MAX_PATHS = 8000
MAX_POINTS_PER_PATH = 12
STEP_PX = 4  # resample spacing along each polyline (image px)

NEIGHBORS8 = [(-1, -1), (-1, 0), (-1, 1), (0, -1), (0, 1), (1, -1), (1, 0), (1, 1)]


def neighbors(skel_set, y, x):
    for dy, dx in NEIGHBORS8:
        p = (y + dy, x + dx)
        if p in skel_set:
            yield p


def trace_from(skel_set, endpoints_and_junctions, start, first_step):
    """Walk the skeleton from `start` through `first_step` until hitting
    another endpoint/junction (or closing a loop back on itself)."""
    poly = [start, first_step]
    prev, cur = start, first_step
    while cur not in endpoints_and_junctions:
        nxts = [p for p in neighbors(skel_set, *cur) if p != prev]
        if not nxts:
            break
        nxt = nxts[0]
        poly.append(nxt)
        prev, cur = cur, nxt
        if cur == start:
            break
    return poly


def smooth_1d(values, window):
    """Simple centred moving average with edge clamping (no numpy conv edge
    artifacts) — smooths pixel-to-pixel distance-transform jitter along a
    polyline so interpolated width doesn't pinch/bulge between resampled
    points (that jitter was rendering as a "beaded" look instead of the
    reference's smooth continuous strokes)."""
    n = len(values)
    if n <= 2:
        return values[:]
    half = window // 2
    out = []
    for i in range(n):
        lo = max(0, i - half)
        hi = min(n, i + half + 1)
        out.append(sum(values[lo:hi]) / (hi - lo))
    return out


def resample(poly, widths, step):
    if len(poly) < 2:
        return poly, widths
    cum = [0.0]
    for i in range(1, len(poly)):
        cum.append(cum[-1] + np.hypot(poly[i][0] - poly[i - 1][0], poly[i][1] - poly[i - 1][1]))
    total = cum[-1]
    if total < 1e-6:
        return [poly[0]], [widths[0]]
    n = max(2, int(total / step) + 1)
    out = []
    out_w = []
    for k in range(n):
        target = total * k / (n - 1)
        j = np.searchsorted(cum, target)
        j = min(max(j, 1), len(poly) - 1)
        t = (target - cum[j - 1]) / max(cum[j] - cum[j - 1], 1e-6)
        y = poly[j - 1][0] + (poly[j][0] - poly[j - 1][0]) * t
        x = poly[j - 1][1] + (poly[j][1] - poly[j - 1][1]) * t
        w = widths[j - 1] + (widths[j] - widths[j - 1]) * t
        out.append((y, x))
        out_w.append(w)
    return out, out_w


def cap_points(pts, maxpts):
    if len(pts) <= maxpts:
        return pts
    step = (len(pts) - 1) / (maxpts - 1)
    return [pts[min(round(i * step), len(pts) - 1)] for i in range(maxpts)]


def main():
    img = Image.open(SRC).convert("RGB")
    arr = np.array(img).astype(np.float32)
    iw, ih = img.size
    lum = 0.299 * arr[..., 0] + 0.587 * arr[..., 1] + 0.114 * arr[..., 2]
    lum_norm = lum / 255.0

    # Percentile threshold (robust to this specific photo's exposure) instead
    # of a fixed absolute cut — keeps faint outer tendrils without also
    # keeping jpeg noise in the pure-black regions.
    thresh = np.percentile(lum_norm, 88)
    mask = lum_norm >= max(thresh, 0.10)
    print(f"mask coverage: {mask.mean()*100:.1f}%  threshold={thresh:.3f}")

    # Drop tiny isolated components (jpeg-block noise specks that cleared the
    # threshold but aren't part of the connected vein network) BEFORE
    # skeletonizing — otherwise each one skeletonizes into its own tiny
    # disconnected fragment that renders as a stray floating dot, visibly
    # unlike the reference's continuous strokes. Filtering on bounding-box
    # EXTENT (not pixel area) is what actually distinguishes a compact round
    # noise blob from a real vein — a thin vein is elongated (large extent)
    # even where its area is small, while a noise blob is compact in both.
    labeled, num = ndimage.label(mask, structure=np.ones((3, 3)))
    objs = ndimage.find_objects(labeled)
    MIN_EXTENT_PX = 9
    small_labels = []
    removed_px = 0
    for i, sl in enumerate(objs):
        if sl is None:
            continue
        h_ext = sl[0].stop - sl[0].start
        w_ext = sl[1].stop - sl[1].start
        if max(h_ext, w_ext) < MIN_EXTENT_PX:
            label_id = i + 1
            small_labels.append(label_id)
            removed_px += int((labeled[sl] == label_id).sum())
    mask = mask & ~np.isin(labeled, small_labels)
    print(
        f"removed {len(small_labels)} noise components ({removed_px}px) with "
        f"bbox extent < {MIN_EXTENT_PX}px"
    )

    # distance transform of the mask -> local half-width (radius) at every pixel
    dist = ndimage.distance_transform_edt(mask)

    skel = skeletonize(mask)
    print(f"skeleton pixel count: {skel.sum()}")

    skel_ys, skel_xs = np.where(skel)
    skel_set = set(zip(skel_ys.tolist(), skel_xs.tolist()))

    degree = {p: sum(1 for _ in neighbors(skel_set, *p)) for p in skel_set}
    endpoints_and_junctions = {p for p, d in degree.items() if d != 2}

    visited_edges = set()
    paths = []
    for p in endpoints_and_junctions:
        for q in neighbors(skel_set, *p):
            poly = trace_from(skel_set, endpoints_and_junctions, p, q)
            full_key = tuple(poly) if poly[0] < poly[-1] else tuple(reversed(poly))
            if full_key in visited_edges:
                continue
            visited_edges.add(full_key)
            paths.append(poly)
    print(f"traced {len(paths)} raw polylines")

    clean_paths = []
    for poly in paths:
        raw_widths = [float(dist[y, x]) for y, x in poly]
        smoothed_widths = smooth_1d(raw_widths, window=7)
        rs, rs_w = resample(poly, smoothed_widths, STEP_PX)
        pts = [{"x": x / iw, "y": y / ih, "w": w} for (y, x), w in zip(rs, rs_w)]
        clean_paths.append(pts)
    print(f"{len(clean_paths)} edges (unfiltered by length)")

    def endpoint_key(pt):
        return (round(pt["x"] * iw), round(pt["y"] * ih))

    # Drop small isolated CLUSTERS of paths — a lone edge (or tiny handful of
    # edges) whose endpoints don't connect to anything else is a genuinely
    # disconnected skeleton fragment (a stray "hair" the mask/extent filter
    # above didn't catch because it's thin-but-elongated), and rendered on
    # its own reads as a floating dash/dot completely unlike the reference's
    # continuous mesh. Group paths into connected components by shared
    # endpoints (union-find) and keep only components with enough paths.
    parent = list(range(len(clean_paths)))

    def find(a):
        while parent[a] != a:
            parent[a] = parent[parent[a]]
            a = parent[a]
        return a

    def union(a, b):
        ra, rb = find(a), find(b)
        if ra != rb:
            parent[ra] = rb

    endpoint_to_paths = {}
    for i, p in enumerate(clean_paths):
        for key in (endpoint_key(p[0]), endpoint_key(p[-1])):
            endpoint_to_paths.setdefault(key, []).append(i)
    for idxs in endpoint_to_paths.values():
        for j in range(1, len(idxs)):
            union(idxs[0], idxs[j])

    cluster_paths = {}
    for i in range(len(clean_paths)):
        cluster_paths.setdefault(find(i), []).append(i)

    # Drop genuinely tiny isolated clusters (1-2 lone edges touching nothing
    # else — real disconnected fragments).
    MIN_CLUSTER_PATHS = 2
    clusters = [idxs for idxs in cluster_paths.values() if len(idxs) >= MIN_CLUSTER_PATHS]
    clean_paths = [clean_paths[i] for idxs in clusters for i in idxs]
    print(f"{len(clean_paths)} edges in {len(clusters)} non-trivial clusters")

    # Merge chains of edges sharing an endpoint into fewer, LONGER paths —
    # this is the actual fix for fitting the shader's path budget: dropping
    # OR subsampling edges (both tried first) inevitably disconnects a dense
    # mesh at every removed edge, reading as "beaded"/dashed instead of the
    # reference's continuous strokes, no matter how the edges are chosen.
    # Chaining loses NO geometry — it only repackages many tiny 2-3 point
    # edges into longer point sequences (up to MAX_POINTS_PER_PATH), which a
    # "path" in the shader's texture format treats identically either way
    # (it's just an ordered point list; segments render the same).
    adjacency = {}
    for i, p in enumerate(clean_paths):
        adjacency.setdefault(endpoint_key(p[0]), []).append((i, True))
        adjacency.setdefault(endpoint_key(p[-1]), []).append((i, False))

    visited = [False] * len(clean_paths)
    merged_paths = []
    for i in range(len(clean_paths)):
        if visited[i]:
            continue
        chain = list(clean_paths[i])
        visited[i] = True
        while len(chain) < MAX_POINTS_PER_PATH:
            key = endpoint_key(chain[-1])
            nxt = next(((j, is_start) for j, is_start in adjacency.get(key, []) if not visited[j]), None)
            if nxt is None:
                break
            j, is_start = nxt
            visited[j] = True
            pts = clean_paths[j]
            chain.extend(pts[1:] if is_start else list(reversed(pts[:-1])))
        merged_paths.append(chain)

    print(f"chained into {len(merged_paths)} merged paths (was {len(clean_paths)} raw edges, 0 geometry dropped)")
    clean_paths = merged_paths

    if len(clean_paths) > MAX_PATHS:
        # Should be rare now that chaining does the heavy lifting, but keep
        # a safety net: drop the shortest merged paths first (least visual
        # impact) rather than exceeding the shader's fixed texture height.
        clean_paths.sort(key=len, reverse=True)
        dropped = len(clean_paths) - MAX_PATHS
        clean_paths = clean_paths[:MAX_PATHS]
        print(f"safety trim: dropped {dropped} shortest merged paths to fit MAX_PATHS={MAX_PATHS}")

    clean_paths = [cap_points(p, MAX_POINTS_PER_PATH) for p in clean_paths]

    pt_counts = [len(p) for p in clean_paths]
    total_pts = sum(pt_counts)
    print(
        f"final: {len(clean_paths)} paths, {total_pts} total points, "
        f"avg {total_pts/max(1,len(clean_paths)):.1f} pts/path"
    )

    widths = [pt["w"] for p in clean_paths for pt in p]
    print(
        f"width(px) stats: min={min(widths):.2f} mean={np.mean(widths):.2f} "
        f"max={max(widths):.2f} p90={np.percentile(widths,90):.2f}"
    )

    with open(OUT, "w") as f:
        json.dump({"imgWidth": iw, "imgHeight": ih, "paths": clean_paths}, f)
    print(f"wrote {OUT}")


if __name__ == "__main__":
    main()
