"""One-time: extract filament polylines from the plasma sprite sheet.

Usage: python3 scripts/extract-plasma-paths.py <sheet.png> public/analyse/plasma-paths.json
Needs Pillow + scikit-image. Emits ~10 keyframes of traced, simplified polylines
in frame coords (400x325): {"w":400,"h":325,"frames":[[[[x,y],...],...],...]}.
"""
import json
import sys

import numpy as np
from PIL import Image
from skimage.measure import approximate_polygon
from skimage.morphology import remove_small_objects, skeletonize

FH, FW, N = 325, 400, 26
KEYFRAMES = 10
THRESH = 150
MIN_OBJ = 12
TOL = 1.4

src, out = sys.argv[1], sys.argv[2]
a = np.asarray(Image.open(src).convert("L"), np.float32)
assert a.shape[0] == FH * N and a.shape[1] == FW, f"unexpected sheet {a.shape}"


def trace(skel):
    H, W = skel.shape
    S = skel.astype(np.uint8)

    def nb(y, x):
        o = []
        for dy in (-1, 0, 1):
            for dx in (-1, 0, 1):
                if dy or dx:
                    ny, nx = y + dy, x + dx
                    if 0 <= ny < H and 0 <= nx < W and S[ny, nx]:
                        o.append((ny, nx))
        return o

    deg = {}
    ys, xs = np.where(S)
    for y, x in zip(ys, xs):
        deg[(y, x)] = len(nb(y, x))
    seen = set()
    polys = []

    def edge(p, q):
        return (p, q) if p < q else (q, p)

    for start in [k for k, d in deg.items() if d == 1 or d >= 3]:
        for n in nb(*start):
            if edge(start, n) in seen:
                continue
            seen.add(edge(start, n))
            p = [start, n]
            prev, cur = start, n
            while deg.get(cur, 0) == 2:
                nn = [q for q in nb(*cur) if q != prev and edge(cur, q) not in seen]
                if not nn:
                    break
                seen.add(edge(cur, nn[0]))
                p.append(nn[0])
                prev, cur = cur, nn[0]
            polys.append(p)
    return polys


idxs = [round(i * N / KEYFRAMES) for i in range(KEYFRAMES)]
frames = []
for i in idxs:
    g = a[i * FH:(i + 1) * FH]
    skel = skeletonize(remove_small_objects(g > THRESH, min_size=MIN_OBJ))
    simp = []
    for p in trace(skel):
        s = approximate_polygon(np.array(p, np.float32), tolerance=TOL)
        if len(s) >= 2:
            simp.append([[int(round(x)), int(round(y))] for (y, x) in s])
    frames.append(simp)

with open(out, "w") as f:
    json.dump({"w": FW, "h": FH, "frames": frames}, f, separators=(",", ":"))
print(f"wrote {out}  keyframes={len(frames)}  segs={sum(len(fr) for fr in frames)}")
