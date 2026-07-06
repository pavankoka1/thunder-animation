/**
 * Per-betspot definitions. Inner energy + outer border colours are intentionally
 * NOT overridden here — every betspot shares the same purple plasma / magenta
 * border from the reference assets (see config/inner.js & config/outer.js).
 * Only the CSS body/top-bar colour differs per key.
 */
export const THEMES = [
  { key: "blue", label: "Blue", inner: {}, outer: {} },
  { key: "green", label: "Green", inner: {}, outer: {} },
  { key: "yellow", label: "Yellow", inner: {}, outer: {} },
  { key: "pink", label: "Pink", inner: {}, outer: {} },
];
