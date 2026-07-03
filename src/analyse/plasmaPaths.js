/**
 * Extracted-web crossfade motion for the analyse betspot.
 *
 * The plasma filament web is extracted from the artwork frames (build-time) as
 * vector polylines; ~10 keyframes are crossfaded here so the dense web is always
 * present and its paths re-route in place, looping seamlessly. Painted as
 * violet-halo / white-core glow strokes — no runtime image.
 */

/** Cover-fit mapping: frame-space (fw×fh) point → target via X=(x-offX)·scale. */
export function coverTransform(fw, fh, tw, th) {
  const scale = Math.max(tw / fw, th / fh);
  return { scale, offX: (fw - tw / scale) / 2, offY: (fh - th / scale) / 2 };
}

/** Loop position → crossfade pair. p = (t/loop·count) mod count. */
export function keyframeAt(tMs, loopMs, count) {
  if (count <= 0) return { k0: 0, k1: 0, frac: 0 };
  const p = ((tMs / loopMs) * count) % count;
  const k0 = Math.floor(p);
  return { k0: k0 % count, k1: (k0 + 1) % count, frac: p - k0 };
}
