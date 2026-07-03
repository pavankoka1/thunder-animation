/**
 * Bright filament / caustic pixel — white lightning paths in plasma.svg,
 * excluding deep-purple plasma cells between them.
 */
export function isThunderFilament(r, g, b, a = 255) {
  if (a < 10) return false;
  const lum = r + g + b;
  if (lum < 90 || g < 30) return false;

  const purpleness = (r + b) * 0.5 - g;
  if (purpleness > 42 && g < 88 && lum < 300) return false;

  return true;
}
