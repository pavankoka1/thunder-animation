import { MAX_CELL_SCAN } from "./spatialGrid.js";
import { MAX_PATHS, MAX_POINTS_PER_PATH } from "./lichtenbergTree.js";

// In-shader supersampling of the glow field: each listed [x,y] is a sub-pixel
// offset findNearest is evaluated at, then averaged, to fight thin-stroke
// "beading" (see the long note in main()). Each extra sample re-runs the
// expensive per-fragment nearest-search — the single biggest cost on the dense
// central hub and the dominant frame-time term on integrated GPUs — so keep
// this list short. One centred sample is enough here because the canvas backing
// is ALREADY SUPERSAMPLE=4: every display pixel integrates ~16 backing-pixel
// evaluations through the 4:1 CSS downscale, which supplies the antialiasing
// the original 4 in-shader samples were added for (verified: no beading, 60fps
// on Intel UHD, vs. the context-losing brute-force original). Add offsets back
// (e.g. a 2- or 4-tap jittered grid) only if a lower-SUPERSAMPLE target ever
// reintroduces beading.
const SUBPIXEL_OFFSETS = [
  [0.33, 0.33],
  [0.67, 0.67],
];
const NSUB = SUBPIXEL_OFFSETS.length;
const SUB_INV = (1 / NSUB).toFixed(6);
// GLSL ES 3.00 array-constructor form and the ES 1.00 element-assignment form.
const SUB_DECL_ES3 = `vec2 offsets[${NSUB}] = vec2[${NSUB}](${SUBPIXEL_OFFSETS.map(
  ([x, y]) => `vec2(${x.toFixed(3)}, ${y.toFixed(3)})`
).join(", ")});`;
const SUB_DECL_ES1 = `vec2 offsets[${NSUB}];\n  ${SUBPIXEL_OFFSETS.map(
  ([x, y], i) => `offsets[${i}] = vec2(${x.toFixed(3)}, ${y.toFixed(3)});`
).join("\n  ")}`;

export const VERT = `#version 300 es
layout(location = 0) in vec2 a_pos;
void main() { gl_Position = vec4(a_pos, 0.0, 1.0); }
`;

/**
 * Renders the extracted Lichtenberg network with a per-fragment
 * nearest-segment SDF (same technique as src/webgl/thunderRenderer.js's
 * boltDistance), generalised to carry a per-point WIDTH so the glow itself
 * tapers hub -> tip instead of a single global stroke width — that taper is
 * what makes a fractal branch structure actually read as "electrical"
 * rather than a uniform wireframe.
 *
 * PERFORMANCE: findNearest does NOT loop over all paths. Each fragment reads
 * only the segment list of its own cell in the uniform spatial grid (see
 * spatialGrid.js) — a couple dozen segments in open areas, a few hundred in
 * the dense hub — instead of all ~4700 paths. That's what makes running this
 * every animation frame (so u_swayAmt can move the paths) affordable rather
 * than a GPU-watchdog (TDR) kill. The grid registers each segment into every
 * cell its glow can still reach, so the nearest-segment result is identical to
 * the brute-force loop; only the cost changes.
 */
export const FRAG = `#version 300 es
precision highp float;
out vec4 o_color;

uniform vec2 u_res;
uniform vec2 u_bodyOffset;
uniform float u_radius;
uniform float u_time;
// Per-path travelling-wave sway (px): each path's own points shift by a
// smoothly along-path-varying offset, hashed to an independent phase/speed
// per path, so paths genuinely move (not just a resampled static image) —
// see readPoint(). Neighbouring points on the SAME path stay close in phase
// so the line stays a coherent connected stroke, just undulating.
uniform float u_swayAmt;

uniform sampler2D u_pointTex; // (x, y, width_px, 1) per point

// Spatial grid acceleration (see spatialGrid.js). u_gridTex holds
// (offset, count) per cell; u_segTex is the flat (pathIdx, ptIdx) list those
// offsets point into. u_gridOrigin/u_cellSize map body px -> cell coords.
uniform sampler2D u_gridTex;
uniform sampler2D u_segTex;
uniform vec2 u_gridOrigin;
uniform float u_cellSize;
uniform vec2 u_gridDim;    // grid cells (w, h)
uniform vec2 u_segTexDim;  // segment texture (w, h)

uniform float u_coreSigmaMul, u_glowSigmaMul, u_outerSigmaMul;
uniform float u_coreAlpha, u_glowAlpha, u_outerAlpha;
uniform vec3 u_coreColor, u_glowColor, u_outerColor;

// Radial edge tint: sampling reference.png's actual pixels (Python, hue vs.
// distance-from-body-centre) showed the energy is cyan/blue for ~75-80% of
// the body's radius, then rotates hue fast — 205 deg -> 295 deg — right at
// the outer ~20%, reading as a violet/magenta edge blending into the
// betspot's own outer neon border. u_edgeColor/u_edgeStart/u_edgePow
// reproduce that measured curve (a plateau + late, fast transition), not a
// uniform gradient from the centre.
uniform vec3 u_edgeColor;
uniform float u_edgeStart, u_edgePow, u_edgeMix;
// Ambient fill, independent of vein proximity: reference.png reads
// as a filled "energy field" (even the gaps between veins glow faintly),
// not sparse lines on flat black — without this the edge tint above only
// affects pixels already close to a vein, which is too little of the
// canvas near the corners (mostly open space) to ever read as violet.
uniform vec3 u_ambientColor;
uniform float u_ambientAlpha;
uniform float u_plasmaBright; // brightness of the violet gap-fill plasma (slider)

float hash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }

// Worley/Voronoi "crack" field for the violet GAP-FILL veins (same technique as
// /analyse's inner plasma): F2-F1 traces thin cell-EDGE lines, so it fills the
// open spaces with a dense, thin, branching vein network — not round dots.
vec2 hash2(vec2 p) {
  vec2 q = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
  return fract(sin(q) * 43758.5453);
}
float worleyCrack(vec2 p) {
  vec2 ip = floor(p), fp = fract(p);
  float f1 = 8.0, f2 = 8.0;
  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      vec2 g = vec2(float(x), float(y));
      float d = length(g + hash2(ip + g) - fp);
      if (d < f1) { f2 = f1; f1 = d; } else if (d < f2) { f2 = d; }
    }
  }
  return f2 - f1;
}

float sdRoundBox(vec2 p, vec2 b, float r) {
  vec2 q = abs(p) - (b - vec2(r));
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}

vec3 readPoint(int pathIdx, int ptIdx) {
  float u = (float(ptIdx) + 0.5) / float(${MAX_POINTS_PER_PATH});
  float v = (float(pathIdx) + 0.5) / float(${MAX_PATHS});
  vec3 p = texture(u_pointTex, vec2(u, v)).xyz; // x,y in body px; z = width px

  // Motion: a single low-frequency spatial FLOW field (function of BASE
  // position) sweeps the whole web in slow swirls, so neighbouring filaments
  // drift together and cross/MIX — the morphing look of the reference clip,
  // not each line jittering in isolation. Deliberately just ONE sin+cos: this
  // runs per readPoint INSIDE the per-fragment nearest search, so every extra
  // trig term is multiplied by the (dense) per-cell segment count and costs
  // real frame rate on integrated GPUs. Amplitude is WIDTH-anchored — thin
  // tips wave, thick hubs barely move, so filaments undulate from a fixed
  // bright root (keeps the hubs stable/sharp). Peak per-axis displacement
  // (u_swayAmt * 1.6) stays under spatialGrid.js SWAY_PAD so the grid never
  // misses a moved segment (which would flicker).
  float ft = u_time * 0.85;
  vec2 fp = p.xy * 0.032;
  vec2 flow = vec2(sin(fp.y + ft), cos(fp.x - ft * 0.9));
  float taper = clamp(2.2 / (p.z + 0.8), 0.25, 1.6);
  p.xy += flow * u_swayAmt * taper;
  return p;
}

void findNearest(vec2 p, out float bestD, out float bestW) {
  bestD = 1e9;
  bestW = 1.0;

  // Which grid cell is this pixel in? Outside the grid -> nothing near.
  vec2 g = (p - u_gridOrigin) / u_cellSize;
  if (g.x < 0.0 || g.y < 0.0 || g.x >= u_gridDim.x || g.y >= u_gridDim.y) return;
  vec2 cellUv = (floor(g) + 0.5) / u_gridDim;
  vec2 cellInfo = texture(u_gridTex, cellUv).xy; // (offset, count)
  int off = int(cellInfo.x + 0.5);
  int cnt = int(cellInfo.y + 0.5);

  for (int k = 0; k < ${MAX_CELL_SCAN}; k++) {
    if (k >= cnt) break;
    float fidx = float(off + k);
    float row = floor(fidx / u_segTexDim.x);
    float col = fidx - row * u_segTexDim.x;
    vec2 segUv = (vec2(col, row) + 0.5) / u_segTexDim;
    vec2 seg = texture(u_segTex, segUv).xy; // (pathIdx, ptIdx)
    int path = int(seg.x + 0.5);
    int i = int(seg.y + 0.5);

    vec3 pa = readPoint(path, i);
    vec3 pb = readPoint(path, i + 1);
    vec2 a = pa.xy;
    vec2 b = pb.xy;
    vec2 ab = b - a;
    float len2 = dot(ab, ab);
    float t = len2 < 1e-6 ? 0.0 : clamp(dot(p - a, ab) / len2, 0.0, 1.0);
    float d = length(p - (a + ab * t));
    if (d < bestD) {
      bestD = d;
      bestW = mix(pa.z, pb.z, t);
    }
  }
}

void main() {
  vec2 pix = gl_FragCoord.xy - u_bodyOffset;
  vec2 halfRes = u_res * 0.5;

  float sd = sdRoundBox(pix - halfRes, halfRes, u_radius);
  float inBody = 1.0 - smoothstep(-1.0, 1.0, sd);
  // Fragments fully outside the rounded body contribute nothing (everything
  // below is multiplied by inBody) — skip the per-sample nearest search
  // entirely for them. On this stage the body only covers ~half the canvas,
  // so this alone roughly halves the shaded fragment count.
  if (inBody <= 0.0) { o_color = vec4(0.0); return; }

  // 0 deep inside the body, 1 right at the border — using the rounded-rect
  // SDF (distance to the NEAREST edge/corner) instead of raw distance from
  // centre. This body is wide (~2.15:1): a plain length(pix-centre)/
  // half-diagonal metric reaches ~1.0 quickly along the left/right edges
  // but barely moves along the top/bottom edges (a point at the middle of
  // the top edge is only ~42% of the half-diagonal from centre), so the
  // violet tint below only ever showed up near the left/right corners.
  // The SDF is isotropic — equally close to 0 approaching ANY edge or
  // corner — so this rings the WHOLE perimeter evenly, matching the
  // reference where the violet reads all the way around.
  float insetDist = min(halfRes.x, halfRes.y) * 0.4;
  float edgeT = 1.0 - clamp(-sd / insetDist, 0.0, 1.0);
  float edgeMixT = pow(clamp((edgeT - u_edgeStart) / max(1.0 - u_edgeStart, 1e-4), 0.0, 1.0), u_edgePow) * u_edgeMix;
  // Core stays closer to white-hot even near the edge (real electrical
  // cores read hot regardless of position) — only mix it partway.
  vec3 coreColorAt = mix(u_coreColor, u_edgeColor, edgeMixT * 0.55);
  vec3 glowColorAt = mix(u_glowColor, u_edgeColor, edgeMixT);
  vec3 outerColorAt = mix(u_outerColor, u_edgeColor, edgeMixT);

  // A pure per-fragment-centre Gaussian SDF sample aliases badly on thin
  // (sub-pixel) strokes: exp(-d^2/2s^2) legitimately equals 1 exactly ON the
  // line, but most pixel CENTRES never land exactly on a thin curved line,
  // so whether a given pixel lights up becomes a hard, high-frequency
  // yes/no — reading as scattered "beads" along every stroke instead of the
  // reference's smooth continuous lines. MSAA doesn't help here (it only
  // antialiases geometric primitive edges, not a value computed inside the
  // fragment shader) — this needs real supersampling of the glow field
  // itself: evaluate at jittered sub-pixel offsets and average (count set by
  // SUBPIXEL_OFFSETS in the JS module; the SUPERSAMPLE=4 canvas backing already
  // supplies most of the antialiasing, so a small count suffices here).
  ${SUB_DECL_ES3}

  vec3 col = vec3(0.0);
  float nearestD = 1e9;
  for (int s = 0; s < ${NSUB}; s++) {
    vec2 samplePix = pix + offsets[s] - vec2(0.5);
    float bestD, bestW;
    findNearest(samplePix, bestD, bestW);
    nearestD = min(nearestD, bestD);

    // CORE uses analytical stroke COVERAGE (like SDF vector-line rendering)
    // instead of a point-sampled Gaussian: a Gaussian only reaches full
    // brightness exactly ON the mathematical centreline, so a thin stroke —
    // whose centreline rarely lands exactly on a pixel centre — reads as
    // dim/aliased next to a thick hub blob that always has full-brightness
    // pixels nearby. Coverage instead gives ANY pixel within the stroke's
    // real half-width full brightness, with a fixed ~1px antialiased edge,
    // so thin and thick strokes read at the SAME peak brightness (matching
    // the reference, where a thin tendril is just as crisp as a thick
    // trunk — only the width differs, not the intensity).
    float coreHalfW = max(0.4, bestW * u_coreSigmaMul);
    float core = (1.0 - smoothstep(coreHalfW - 0.5, coreHalfW + 0.5, bestD)) * u_coreAlpha;

    float glowSigma = max(0.5, bestW * u_glowSigmaMul);
    float outerSigma = max(0.8, bestW * u_outerSigmaMul);
    // Screen-blending onto the CSS body has steeply diminishing returns in
    // whichever channel the body is already near-saturated in (its own
    // blue) — boosting glow/outer AMOUNT (not just colour) near the edge is
    // what actually punches the violet shift through that ceiling.
    float edgeBoost = 1.0 + edgeMixT * 4.5;
    float glow = exp(-(bestD * bestD) / (2.0 * glowSigma * glowSigma)) * u_glowAlpha * edgeBoost;
    float outer = exp(-(bestD * bestD) / (2.0 * outerSigma * outerSigma)) * u_outerAlpha * edgeBoost;

    // Gentle energy shimmer + hub twinkle — the "sparks", /analyse-style. Both
    // are functions of POSITION / stroke-width only, NEVER of along-path
    // position, so they modulate brightness smoothly and radially and can't
    // paint the perpendicular bands a per-along term would (those read as the
    // "thorns" a travelling-spark attempt produced). Shimmer = a slow
    // travelling brightness wave over the whole web; hub twinkle = thick
    // convergence points flaring, phase varied by local width so it stays
    // smooth along a filament (no banding).
    float shimmer = 0.82 + 0.18 * sin(u_time * 2.0 + samplePix.x * 0.04 + samplePix.y * 0.06);
    float hub = smoothstep(3.5, 8.0, bestW);
    float hubTw = 0.5 + 0.5 * sin(u_time * 2.7 + bestW * 1.5);

    // FINE SPECKLE grain hugging the veins. reference.png carries small (~1-3px)
    // bright dots clustered right next to every filament — Python high-pass of
    // the plasma measured ~76% of specks within 3px of a vein (vs 34% area), so
    // they cling to the paths rather than filling the gaps. A per-cell hash
    // picks a sparse set of points; each twinkles on its own phase; a
    // exp(-bestD^2) gate keeps them near the veins. Position/width based only
    // (never along-path) so it can't band into thorns. This is the "noise
    // particles" that make the field read as live energy, not clean vectors.
    vec2 scell = floor(samplePix / 2.2);          // ~1-2px speck cells (backing px)
    float sh = hash(scell * 1.7 + 11.3);
    float twk = 0.3 + 0.7 * sin(u_time * 5.0 + sh * 61.7); // per-cell twinkle
    float speck = smoothstep(0.9, 1.0, sh) * max(twk, 0.0); // sparse: top ~10% cells
    float speckNear = exp(-(bestD * bestD) / (2.0 * 3.5 * 3.5)); // hug within ~3.5px
    col += (outerColorAt * outer + glowColorAt * glow + coreColorAt * core) * shimmer +
           vec3(0.92, 0.97, 1.0) * core * hub * hubTw * 0.7 +
           vec3(0.88, 0.96, 1.0) * speck * speckNear * 0.6;
  }
  col *= ${SUB_INV};

  // VIOLET GAP PARTICLES — fill the open spaces BETWEEN the veins so the body
  // reads as a full energy FIELD (reference.png is filled edge-to-edge, cyan on
  // the veins drifting to violet in the gaps and at the border), not sparse
  // lines on blue. gapMask is the INVERSE of vein-proximity (~0 on/near a vein,
  // ~1 out in the gaps). Two scales give "noise & particles": sparse bright
  // twinkling particles + a finer, denser violet grain that fills the field.
  // Computed ONCE per fragment (a fill texture needs no supersampling).
  // Colour is violet, leaning toward the magenta edge tint near the border.
  float gapMask = smoothstep(3.0, 12.0, nearestD);
  vec3 violetCol = mix(vec3(0.52, 0.30, 0.95), u_edgeColor, edgeMixT * 0.6);
  // Move the plasma IN SYNC with the traced veins: reuse the EXACT same flow
  // field readPoint() displaces the veins by (same 0.85 time-rate, 0.032
  // spatial frequency, same u_swayAmt from the Movement slider), warping the
  // Worley sample coordinate. So the whole field — traced veins + violet fill —
  // drifts and morphs together as one animation, and both freeze together under
  // reduced motion (swayAmt 0).
  float ft = u_time * 0.85;
  vec2 fp = pix * 0.032;
  vec2 veinFlow = vec2(sin(fp.y + ft), cos(fp.x - ft * 0.9));
  vec2 vp = (pix + veinFlow * u_swayAmt) / 26.0;           // flow-warped cell coords
  float crack = worleyCrack(vp);
  float vein = 1.0 - smoothstep(0.0, 0.07, crack);         // THIN cell-edge veins
  float veinCore = 1.0 - smoothstep(0.0, 0.025, crack);    // brighter hairline centre
  // Small violet TRANSITION sparks through the plasma (like the older near-vein
  // sparks, but violet and in the fill): a sparse per-cell hash that fades fully
  // in and out over time — the twinkle "transition".
  vec2 spc = floor(pix / 3.2);
  float sphv = hash(spc * 2.9 + 7.3);
  float sparkV = smoothstep(0.93, 1.0, sphv) * max(0.0, sin(u_time * 4.0 + sphv * 55.0));
  col += violetCol * gapMask * (vein * 0.5 + veinCore * 0.55 + sparkV * 1.3) * u_plasmaBright;

  // Ambient fill uses the SAME radial mix as the veins, so the violet edge
  // reads clearly even in the open space between branches (most of the
  // area near a rounded corner), not just directly on top of a line.
  // Screen-blending onto the (already blue, near-saturated-in-B) CSS body
  // has steeply diminishing returns in whichever channel the body is
  // already bright in — more blue on top of near-maxed blue barely moves
  // the composited result. Boosting the ambient AMOUNT (not just its
  // colour) near the edge is what actually punches a visible violet shift
  // through that saturation, on top of u_edgeColor itself leaning hard
  // toward magenta (high R, low G) where the body has real headroom.
  vec3 ambientColorAt = mix(u_ambientColor, u_edgeColor, edgeMixT);
  col += ambientColorAt * u_ambientAlpha * (1.0 + edgeMixT * 7.0);

  float a = clamp(max(max(col.r, col.g), col.b), 0.0, 1.0) * inBody;
  o_color = vec4(col * inBody, a);
}
`;

export const VERT_GL1 = `
attribute vec2 a_pos;
void main() { gl_Position = vec4(a_pos, 0.0, 1.0); }
`;

/**
 * GLSL ES 1.00 (WebGL1) mirror of FRAG, used when WebGL2 isn't available.
 * Same math throughout — differences are syntax-only: texture2D() instead
 * of texture(), gl_FragColor instead of out vec4, attribute instead of
 * layout(location=0) in, and no array-constructor initializer (ES 3.00
 * only) for the sub-pixel offsets. See FRAG for the rendering rationale and
 * the spatial-grid performance note.
 */
export const FRAG_GL1 = `
precision highp float;

uniform vec2 u_res;
uniform vec2 u_bodyOffset;
uniform float u_radius;
uniform float u_time;
uniform float u_swayAmt;

uniform sampler2D u_pointTex;

uniform sampler2D u_gridTex;
uniform sampler2D u_segTex;
uniform vec2 u_gridOrigin;
uniform float u_cellSize;
uniform vec2 u_gridDim;
uniform vec2 u_segTexDim;

uniform float u_coreSigmaMul, u_glowSigmaMul, u_outerSigmaMul;
uniform float u_coreAlpha, u_glowAlpha, u_outerAlpha;
uniform vec3 u_coreColor, u_glowColor, u_outerColor;

uniform vec3 u_edgeColor;
uniform float u_edgeStart, u_edgePow, u_edgeMix;
uniform vec3 u_ambientColor;
uniform float u_ambientAlpha;
uniform float u_plasmaBright; // brightness of the violet gap-fill plasma (slider)

float hash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }

// Worley/Voronoi "crack" field for the violet GAP-FILL veins (same technique as
// /analyse's inner plasma): F2-F1 traces thin cell-EDGE lines, so it fills the
// open spaces with a dense, thin, branching vein network — not round dots.
vec2 hash2(vec2 p) {
  vec2 q = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
  return fract(sin(q) * 43758.5453);
}
float worleyCrack(vec2 p) {
  vec2 ip = floor(p), fp = fract(p);
  float f1 = 8.0, f2 = 8.0;
  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      vec2 g = vec2(float(x), float(y));
      float d = length(g + hash2(ip + g) - fp);
      if (d < f1) { f2 = f1; f1 = d; } else if (d < f2) { f2 = d; }
    }
  }
  return f2 - f1;
}

float sdRoundBox(vec2 p, vec2 b, float r) {
  vec2 q = abs(p) - (b - vec2(r));
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}

vec3 readPoint(int pathIdx, int ptIdx) {
  float u = (float(ptIdx) + 0.5) / float(${MAX_POINTS_PER_PATH});
  float v = (float(pathIdx) + 0.5) / float(${MAX_PATHS});
  vec3 p = texture2D(u_pointTex, vec2(u, v)).xyz;

  // Motion: a single low-frequency spatial FLOW field (function of BASE
  // position) sweeps the whole web in slow swirls, so neighbouring filaments
  // drift together and cross/MIX — the morphing look of the reference clip,
  // not each line jittering in isolation. Deliberately just ONE sin+cos: this
  // runs per readPoint INSIDE the per-fragment nearest search, so every extra
  // trig term is multiplied by the (dense) per-cell segment count and costs
  // real frame rate on integrated GPUs. Amplitude is WIDTH-anchored — thin
  // tips wave, thick hubs barely move, so filaments undulate from a fixed
  // bright root (keeps the hubs stable/sharp). Peak per-axis displacement
  // (u_swayAmt * 1.6) stays under spatialGrid.js SWAY_PAD so the grid never
  // misses a moved segment (which would flicker).
  float ft = u_time * 0.85;
  vec2 fp = p.xy * 0.032;
  vec2 flow = vec2(sin(fp.y + ft), cos(fp.x - ft * 0.9));
  float taper = clamp(2.2 / (p.z + 0.8), 0.25, 1.6);
  p.xy += flow * u_swayAmt * taper;
  return p;
}

void findNearest(vec2 p, out float bestD, out float bestW) {
  bestD = 1e9;
  bestW = 1.0;

  vec2 g = (p - u_gridOrigin) / u_cellSize;
  if (g.x < 0.0 || g.y < 0.0 || g.x >= u_gridDim.x || g.y >= u_gridDim.y) return;
  vec2 cellUv = (floor(g) + 0.5) / u_gridDim;
  vec2 cellInfo = texture2D(u_gridTex, cellUv).xy;
  int off = int(cellInfo.x + 0.5);
  int cnt = int(cellInfo.y + 0.5);

  for (int k = 0; k < ${MAX_CELL_SCAN}; k++) {
    if (k >= cnt) break;
    float fidx = float(off + k);
    float row = floor(fidx / u_segTexDim.x);
    float col = fidx - row * u_segTexDim.x;
    vec2 segUv = (vec2(col, row) + 0.5) / u_segTexDim;
    vec2 seg = texture2D(u_segTex, segUv).xy;
    int path = int(seg.x + 0.5);
    int i = int(seg.y + 0.5);

    vec3 pa = readPoint(path, i);
    vec3 pb = readPoint(path, i + 1);
    vec2 a = pa.xy;
    vec2 b = pb.xy;
    vec2 ab = b - a;
    float len2 = dot(ab, ab);
    float t = len2 < 1e-6 ? 0.0 : clamp(dot(p - a, ab) / len2, 0.0, 1.0);
    float d = length(p - (a + ab * t));
    if (d < bestD) {
      bestD = d;
      bestW = mix(pa.z, pb.z, t);
    }
  }
}

void main() {
  vec2 pix = gl_FragCoord.xy - u_bodyOffset;
  vec2 halfRes = u_res * 0.5;

  float sd = sdRoundBox(pix - halfRes, halfRes, u_radius);
  float inBody = 1.0 - smoothstep(-1.0, 1.0, sd);
  if (inBody <= 0.0) { gl_FragColor = vec4(0.0); return; }

  float insetDist = min(halfRes.x, halfRes.y) * 0.4;
  float edgeT = 1.0 - clamp(-sd / insetDist, 0.0, 1.0);
  float edgeMixT = pow(clamp((edgeT - u_edgeStart) / max(1.0 - u_edgeStart, 1e-4), 0.0, 1.0), u_edgePow) * u_edgeMix;
  vec3 coreColorAt = mix(u_coreColor, u_edgeColor, edgeMixT * 0.55);
  vec3 glowColorAt = mix(u_glowColor, u_edgeColor, edgeMixT);
  vec3 outerColorAt = mix(u_outerColor, u_edgeColor, edgeMixT);

  ${SUB_DECL_ES1}

  vec3 col = vec3(0.0);
  float nearestD = 1e9;
  for (int s = 0; s < ${NSUB}; s++) {
    vec2 samplePix = pix + offsets[s] - vec2(0.5);
    float bestD, bestW;
    findNearest(samplePix, bestD, bestW);
    nearestD = min(nearestD, bestD);

    float coreHalfW = max(0.4, bestW * u_coreSigmaMul);
    float core = (1.0 - smoothstep(coreHalfW - 0.5, coreHalfW + 0.5, bestD)) * u_coreAlpha;

    float glowSigma = max(0.5, bestW * u_glowSigmaMul);
    float outerSigma = max(0.8, bestW * u_outerSigmaMul);
    float edgeBoost = 1.0 + edgeMixT * 4.5;
    float glow = exp(-(bestD * bestD) / (2.0 * glowSigma * glowSigma)) * u_glowAlpha * edgeBoost;
    float outer = exp(-(bestD * bestD) / (2.0 * outerSigma * outerSigma)) * u_outerAlpha * edgeBoost;

    // Gentle energy shimmer + hub twinkle — the "sparks", /analyse-style. Both
    // are functions of POSITION / stroke-width only, NEVER of along-path
    // position, so they modulate brightness smoothly and radially and can't
    // paint the perpendicular bands a per-along term would (those read as the
    // "thorns" a travelling-spark attempt produced). Shimmer = a slow
    // travelling brightness wave over the whole web; hub twinkle = thick
    // convergence points flaring, phase varied by local width so it stays
    // smooth along a filament (no banding).
    float shimmer = 0.82 + 0.18 * sin(u_time * 2.0 + samplePix.x * 0.04 + samplePix.y * 0.06);
    float hub = smoothstep(3.5, 8.0, bestW);
    float hubTw = 0.5 + 0.5 * sin(u_time * 2.7 + bestW * 1.5);

    // FINE SPECKLE grain hugging the veins. reference.png carries small (~1-3px)
    // bright dots clustered right next to every filament — Python high-pass of
    // the plasma measured ~76% of specks within 3px of a vein (vs 34% area), so
    // they cling to the paths rather than filling the gaps. A per-cell hash
    // picks a sparse set of points; each twinkles on its own phase; a
    // exp(-bestD^2) gate keeps them near the veins. Position/width based only
    // (never along-path) so it can't band into thorns. This is the "noise
    // particles" that make the field read as live energy, not clean vectors.
    vec2 scell = floor(samplePix / 2.2);          // ~1-2px speck cells (backing px)
    float sh = hash(scell * 1.7 + 11.3);
    float twk = 0.3 + 0.7 * sin(u_time * 5.0 + sh * 61.7); // per-cell twinkle
    float speck = smoothstep(0.9, 1.0, sh) * max(twk, 0.0); // sparse: top ~10% cells
    float speckNear = exp(-(bestD * bestD) / (2.0 * 3.5 * 3.5)); // hug within ~3.5px
    col += (outerColorAt * outer + glowColorAt * glow + coreColorAt * core) * shimmer +
           vec3(0.92, 0.97, 1.0) * core * hub * hubTw * 0.7 +
           vec3(0.88, 0.96, 1.0) * speck * speckNear * 0.6;
  }
  col *= ${SUB_INV};

  // VIOLET GAP PARTICLES — fill the open spaces BETWEEN the veins so the body
  // reads as a full energy FIELD (reference.png is filled edge-to-edge, cyan on
  // the veins drifting to violet in the gaps and at the border), not sparse
  // lines on blue. gapMask is the INVERSE of vein-proximity (~0 on/near a vein,
  // ~1 out in the gaps). Two scales give "noise & particles": sparse bright
  // twinkling particles + a finer, denser violet grain that fills the field.
  // Computed ONCE per fragment (a fill texture needs no supersampling).
  // Colour is violet, leaning toward the magenta edge tint near the border.
  float gapMask = smoothstep(3.0, 12.0, nearestD);
  vec3 violetCol = mix(vec3(0.52, 0.30, 0.95), u_edgeColor, edgeMixT * 0.6);
  // Move the plasma IN SYNC with the traced veins: reuse the EXACT same flow
  // field readPoint() displaces the veins by (same 0.85 time-rate, 0.032
  // spatial frequency, same u_swayAmt from the Movement slider), warping the
  // Worley sample coordinate. So the whole field — traced veins + violet fill —
  // drifts and morphs together as one animation, and both freeze together under
  // reduced motion (swayAmt 0).
  float ft = u_time * 0.85;
  vec2 fp = pix * 0.032;
  vec2 veinFlow = vec2(sin(fp.y + ft), cos(fp.x - ft * 0.9));
  vec2 vp = (pix + veinFlow * u_swayAmt) / 26.0;           // flow-warped cell coords
  float crack = worleyCrack(vp);
  float vein = 1.0 - smoothstep(0.0, 0.07, crack);         // THIN cell-edge veins
  float veinCore = 1.0 - smoothstep(0.0, 0.025, crack);    // brighter hairline centre
  // Small violet TRANSITION sparks through the plasma (like the older near-vein
  // sparks, but violet and in the fill): a sparse per-cell hash that fades fully
  // in and out over time — the twinkle "transition".
  vec2 spc = floor(pix / 3.2);
  float sphv = hash(spc * 2.9 + 7.3);
  float sparkV = smoothstep(0.93, 1.0, sphv) * max(0.0, sin(u_time * 4.0 + sphv * 55.0));
  col += violetCol * gapMask * (vein * 0.5 + veinCore * 0.55 + sparkV * 1.3) * u_plasmaBright;

  vec3 ambientColorAt = mix(u_ambientColor, u_edgeColor, edgeMixT);
  col += ambientColorAt * u_ambientAlpha * (1.0 + edgeMixT * 7.0);

  float a = clamp(max(max(col.r, col.g), col.b), 0.0, 1.0) * inBody;
  gl_FragColor = vec4(col * inBody, a);
}
`;

export const UNIFORM_NAMES = [
  "u_res",
  "u_bodyOffset",
  "u_radius",
  "u_time",
  "u_swayAmt",
  "u_pointTex",
  "u_gridTex",
  "u_segTex",
  "u_gridOrigin",
  "u_cellSize",
  "u_gridDim",
  "u_segTexDim",
  "u_coreSigmaMul",
  "u_glowSigmaMul",
  "u_outerSigmaMul",
  "u_coreAlpha",
  "u_glowAlpha",
  "u_outerAlpha",
  "u_coreColor",
  "u_glowColor",
  "u_outerColor",
  "u_edgeColor",
  "u_edgeStart",
  "u_edgePow",
  "u_edgeMix",
  "u_ambientColor",
  "u_ambientAlpha",
  "u_plasmaBright",
];
