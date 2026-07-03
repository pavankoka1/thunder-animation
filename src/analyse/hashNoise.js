/** Deterministic hash + value-noise helpers — no dependencies. */

export function hash2(x, y, seed = 0) {
  const s = Math.sin(x * 127.1 + y * 311.7 + seed * 74.7) * 43758.5453123;
  return s - Math.floor(s);
}

function smoothstep(t) {
  return t * t * (3 - 2 * t);
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function valueNoise(x, y, seed) {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = smoothstep(x - x0);
  const fy = smoothstep(y - y0);

  const n00 = hash2(x0, y0, seed);
  const n10 = hash2(x0 + 1, y0, seed);
  const n01 = hash2(x0, y0 + 1, seed);
  const n11 = hash2(x0 + 1, y0 + 1, seed);

  return lerp(lerp(n00, n10, fx), lerp(n01, n11, fx), fy);
}

/** Fractal value noise, normalized to [0, 1]. */
export function fbm(x, y, seed, octaves = 4) {
  let amp = 0.5;
  let freq = 1;
  let sum = 0;
  let norm = 0;

  for (let i = 0; i < octaves; i += 1) {
    sum += valueNoise(x * freq, y * freq, seed + i * 19.7) * amp;
    norm += amp;
    amp *= 0.5;
    freq *= 2.05;
  }

  return sum / norm;
}

/** Ridged fractal noise — sharp thin fibres, normalized to [0, 1]. */
export function ridgedFbm(x, y, seed, octaves = 4) {
  let amp = 0.5;
  let freq = 1;
  let sum = 0;
  let norm = 0;

  for (let i = 0; i < octaves; i += 1) {
    const n = valueNoise(x * freq, y * freq, seed + i * 19.7);
    const ridge = 1 - Math.abs(n * 2 - 1);
    sum += ridge * ridge * amp;
    norm += amp;
    amp *= 0.5;
    freq *= 2.15;
  }

  return sum / norm;
}
