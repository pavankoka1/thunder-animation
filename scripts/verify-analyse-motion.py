"""Verify the analyse ambient motion matches the reference statistics.

Usage: python3 scripts/verify-analyse-motion.py frame_a.png frame_b.png

frame_a/frame_b are energy-canvas captures (canvas.toDataURL) taken a few
seconds apart while revealed. Needs pillow + numpy. Checks the three
signatures measured from the plasma phase SVGs:
anchored (no drift), re-routing (partial bright turnover), energy conserved.
"""
import sys

import numpy as np
from PIL import Image


def load(path):
    rgba = np.asarray(Image.open(path).convert("RGBA"), np.float32)
    # what 'screen' blending adds: luminance weighted by alpha
    return rgba[..., :3].mean(axis=2) * (rgba[..., 3] / 255)


a = load(sys.argv[1])
b = load(sys.argv[2])
assert a.shape == b.shape, "frames must match"
h, w = a.shape

# 1. No global drift: best integer shift must be (0, 0)
best = (0, 0, 1e18)
for dy in range(-6, 7, 2):
    for dx in range(-6, 7, 2):
        ys, xs = slice(max(0, dy), min(h, h + dy)), slice(max(0, dx), min(w, w + dx))
        ys2, xs2 = slice(max(0, -dy), min(h, h - dy)), slice(max(0, -dx), min(w, w - dx))
        err = float(np.mean((a[ys, xs] - b[ys2, xs2]) ** 2))
        if err < best[2]:
            best = (dx, dy, err)
print(f"drift: best shift = ({best[0]}, {best[1]})")
assert best[:2] == (0, 0), "FAIL: web is drifting"

# 2. Motion present: the pattern actually moved between frames, but subtly
d = np.abs(a - b)
moved = float((d > 8).mean())
print(f"moved fraction (|Δlum|>8) = {moved:.3f} (target 0.02-0.60)")
assert 0.02 < moved < 0.60, "FAIL: too little or too much motion"

# 3. Energy conserved: bright area roughly constant (warp moves, doesn't pulse)
ra, rb = (a > 120).mean(), (b > 120).mean()
print(f"bright area: {ra:.4f} vs {rb:.4f}")
assert abs(ra - rb) / max(ra, rb) < 0.25, "FAIL: field is pulsing globally"

print("OK: anchored, moving, energy-conserving")
