"""One-time: re-encode the plasma sprite sheet PNG to a compact WebP.

Usage: python3 scripts/encode-plasma-frames.py <source.png> public/analyse/plasma-frames.webp
Needs Pillow. Quality 90 is visually lossless on noisy plasma and ~5x smaller.
Frame geometry is preserved (400x8450, 26 frames of 400x325).
"""
import sys

from PIL import Image

src, out = sys.argv[1], sys.argv[2]
img = Image.open(src)
assert img.size == (400, 8450), f"unexpected sheet size {img.size}"
assert img.height % 325 == 0, "height must be a whole number of 325px frames"
img.save(out, "WEBP", quality=90, method=6)
print(f"wrote {out}  frames={img.height // 325}")
