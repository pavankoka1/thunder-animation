import { MAX_PATHS, MAX_POINTS_PER_PATH } from "./lichtenbergTree.js";

export const VERT = `#version 300 es
layout(location = 0) in vec2 a_pos;
void main() { gl_Position = vec4(a_pos, 0.0, 1.0); }
`;

/**
 * Renders the procedurally-generated Lichtenberg network with a per-fragment
 * nearest-segment SDF (same technique as src/webgl/thunderRenderer.js's
 * boltDistance), generalised to carry a per-point WIDTH so the glow itself
 * tapers hub -> tip instead of a single global stroke width — that taper is
 * what makes a fractal branch structure actually read as "electrical"
 * rather than a uniform wireframe.
 */
export const FRAG = `#version 300 es
precision highp float;
out vec4 o_color;

uniform vec2 u_res;
uniform vec2 u_bodyOffset;
uniform float u_radius;

uniform int u_numPaths;
uniform sampler2D u_pointTex; // (x, y, width_px, 1) per point
uniform sampler2D u_countTex; // point count / MAX_POINTS_PER_PATH, per path

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

float sdRoundBox(vec2 p, vec2 b, float r) {
  vec2 q = abs(p) - (b - vec2(r));
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}

vec3 readPoint(int pathIdx, int ptIdx) {
  float u = (float(ptIdx) + 0.5) / float(${MAX_POINTS_PER_PATH});
  float v = (float(pathIdx) + 0.5) / float(${MAX_PATHS});
  return texture(u_pointTex, vec2(u, v)).xyz; // x,y in body px; z = width px
}

int readPathPointCount(int pathIdx) {
  float u = (float(pathIdx) + 0.5) / float(${MAX_PATHS});
  return int(texture(u_countTex, vec2(u, 0.5)).r * float(${MAX_POINTS_PER_PATH}) + 0.5);
}

void findNearest(vec2 p, out float bestD, out float bestW) {
  bestD = 1e9;
  bestW = 1.0;

  for (int path = 0; path < ${MAX_PATHS}; path++) {
    if (path >= u_numPaths) break;
    int ptCount = readPathPointCount(path);
    int segCount = ptCount - 1;
    if (segCount <= 0) continue;

    for (int i = 0; i < ${MAX_POINTS_PER_PATH - 1}; i++) {
      if (i >= segCount) break;
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
}

void main() {
  vec2 pix = gl_FragCoord.xy - u_bodyOffset;
  vec2 halfRes = u_res * 0.5;

  float sd = sdRoundBox(pix - halfRes, halfRes, u_radius);
  float inBody = 1.0 - smoothstep(-1.0, 1.0, sd);

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
  // itself: evaluate at 4 jittered sub-pixel offsets and average.
  vec2 offsets[4] = vec2[4](
    vec2(0.25, 0.25), vec2(0.75, 0.25),
    vec2(0.25, 0.75), vec2(0.75, 0.75)
  );

  vec3 col = vec3(0.0);
  for (int s = 0; s < 4; s++) {
    vec2 samplePix = pix + offsets[s] - vec2(0.5);
    float bestD, bestW;
    findNearest(samplePix, bestD, bestW);

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
    float core = (1.0 - smoothstep(coreHalfW - 0.75, coreHalfW + 0.75, bestD)) * u_coreAlpha;

    float glowSigma = max(0.5, bestW * u_glowSigmaMul);
    float outerSigma = max(0.8, bestW * u_outerSigmaMul);
    // Screen-blending onto the CSS body has steeply diminishing returns in
    // whichever channel the body is already near-saturated in (its own
    // blue) — boosting glow/outer AMOUNT (not just colour) near the edge is
    // what actually punches the violet shift through that ceiling.
    float edgeBoost = 1.0 + edgeMixT * 4.5;
    float glow = exp(-(bestD * bestD) / (2.0 * glowSigma * glowSigma)) * u_glowAlpha * edgeBoost;
    float outer = exp(-(bestD * bestD) / (2.0 * outerSigma * outerSigma)) * u_outerAlpha * edgeBoost;

    col += outerColorAt * outer + glowColorAt * glow + coreColorAt * core;
  }
  col *= 0.25;

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
 * only) for the sub-pixel offsets. See FRAG for the rendering rationale.
 */
export const FRAG_GL1 = `
precision highp float;

uniform vec2 u_res;
uniform vec2 u_bodyOffset;
uniform float u_radius;

uniform int u_numPaths;
uniform sampler2D u_pointTex;
uniform sampler2D u_countTex;

uniform float u_coreSigmaMul, u_glowSigmaMul, u_outerSigmaMul;
uniform float u_coreAlpha, u_glowAlpha, u_outerAlpha;
uniform vec3 u_coreColor, u_glowColor, u_outerColor;

uniform vec3 u_edgeColor;
uniform float u_edgeStart, u_edgePow, u_edgeMix;
uniform vec3 u_ambientColor;
uniform float u_ambientAlpha;

float sdRoundBox(vec2 p, vec2 b, float r) {
  vec2 q = abs(p) - (b - vec2(r));
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}

vec3 readPoint(int pathIdx, int ptIdx) {
  float u = (float(ptIdx) + 0.5) / float(${MAX_POINTS_PER_PATH});
  float v = (float(pathIdx) + 0.5) / float(${MAX_PATHS});
  return texture2D(u_pointTex, vec2(u, v)).xyz;
}

int readPathPointCount(int pathIdx) {
  float u = (float(pathIdx) + 0.5) / float(${MAX_PATHS});
  return int(texture2D(u_countTex, vec2(u, 0.5)).r * float(${MAX_POINTS_PER_PATH}) + 0.5);
}

void findNearest(vec2 p, out float bestD, out float bestW) {
  bestD = 1e9;
  bestW = 1.0;

  for (int path = 0; path < ${MAX_PATHS}; path++) {
    if (path >= u_numPaths) break;
    int ptCount = readPathPointCount(path);
    int segCount = ptCount - 1;
    if (segCount <= 0) continue;

    for (int i = 0; i < ${MAX_POINTS_PER_PATH - 1}; i++) {
      if (i >= segCount) break;
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
}

void main() {
  vec2 pix = gl_FragCoord.xy - u_bodyOffset;
  vec2 halfRes = u_res * 0.5;

  float sd = sdRoundBox(pix - halfRes, halfRes, u_radius);
  float inBody = 1.0 - smoothstep(-1.0, 1.0, sd);

  float insetDist = min(halfRes.x, halfRes.y) * 0.4;
  float edgeT = 1.0 - clamp(-sd / insetDist, 0.0, 1.0);
  float edgeMixT = pow(clamp((edgeT - u_edgeStart) / max(1.0 - u_edgeStart, 1e-4), 0.0, 1.0), u_edgePow) * u_edgeMix;
  vec3 coreColorAt = mix(u_coreColor, u_edgeColor, edgeMixT * 0.55);
  vec3 glowColorAt = mix(u_glowColor, u_edgeColor, edgeMixT);
  vec3 outerColorAt = mix(u_outerColor, u_edgeColor, edgeMixT);

  vec2 offsets[4];
  offsets[0] = vec2(0.25, 0.25);
  offsets[1] = vec2(0.75, 0.25);
  offsets[2] = vec2(0.25, 0.75);
  offsets[3] = vec2(0.75, 0.75);

  vec3 col = vec3(0.0);
  for (int s = 0; s < 4; s++) {
    vec2 samplePix = pix + offsets[s] - vec2(0.5);
    float bestD, bestW;
    findNearest(samplePix, bestD, bestW);

    float coreHalfW = max(0.4, bestW * u_coreSigmaMul);
    float core = (1.0 - smoothstep(coreHalfW - 0.75, coreHalfW + 0.75, bestD)) * u_coreAlpha;

    float glowSigma = max(0.5, bestW * u_glowSigmaMul);
    float outerSigma = max(0.8, bestW * u_outerSigmaMul);
    float edgeBoost = 1.0 + edgeMixT * 4.5;
    float glow = exp(-(bestD * bestD) / (2.0 * glowSigma * glowSigma)) * u_glowAlpha * edgeBoost;
    float outer = exp(-(bestD * bestD) / (2.0 * outerSigma * outerSigma)) * u_outerAlpha * edgeBoost;

    col += outerColorAt * outer + glowColorAt * glow + coreColorAt * core;
  }
  col *= 0.25;

  vec3 ambientColorAt = mix(u_ambientColor, u_edgeColor, edgeMixT);
  col += ambientColorAt * u_ambientAlpha * (1.0 + edgeMixT * 7.0);

  float a = clamp(max(max(col.r, col.g), col.b), 0.0, 1.0) * inBody;
  gl_FragColor = vec4(col * inBody, a);
}
`;

/**
 * Cheap per-frame compositing pass: samples the lichtenberg network baked by
 * FRAG/FRAG_GL1 (an expensive O(MAX_PATHS * MAX_POINTS_PER_PATH) per-fragment
 * search, only re-run when the network/style actually changes — see
 * lichtenbergRenderer.js) and modulates its brightness with cheap time-based
 * terms. This is what gives the extracted (real, traced) network the same
 * "breathing energy" feel as /analyse's procedural plasma without re-running
 * that expensive search every animation frame — and without ever moving the
 * traced stroke positions themselves, so the real path shapes stay exact.
 */
export const COMPOSITE_UNIFORM_NAMES = [
  "u_bakeTex",
  "u_res",
  "u_time",
  "u_shimmerAmt",
  "u_shimmerFreq",
  "u_pulseAmt",
  "u_pulseFreq",
  "u_pulseSpeed",
  "u_bodyCenterUv",
  "u_aspect",
];

export const COMPOSITE_FRAG = `#version 300 es
precision highp float;
out vec4 o_color;

uniform sampler2D u_bakeTex;
uniform vec2 u_res;
uniform float u_time;
uniform float u_shimmerAmt, u_shimmerFreq;
uniform float u_pulseAmt, u_pulseFreq, u_pulseSpeed;
uniform vec2 u_bodyCenterUv;
uniform float u_aspect;

float hash(vec2 p){ p = fract(p*vec2(123.34, 456.21)); p += dot(p, p+45.32); return fract(p.x*p.y); }
float vnoise(vec2 p){
  vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
  float a = hash(i), b = hash(i+vec2(1,0)), c = hash(i+vec2(0,1)), d = hash(i+vec2(1,1));
  return mix(mix(a,b,f.x), mix(c,d,f.x), f.y);
}

void main() {
  vec2 uv = gl_FragCoord.xy / u_res;
  vec4 tex = texture(u_bakeTex, uv);

  // Radial pulse: energy breathing outward from the body's dominant hub —
  // brightness-only, so the traced stroke positions underneath never move.
  vec2 d = (uv - u_bodyCenterUv) * vec2(u_aspect, 1.0);
  float rad = length(d);
  float wave = 0.5 + 0.5 * sin(rad * u_pulseFreq - u_time * u_pulseSpeed);
  float pulse = 1.0 + u_pulseAmt * (wave * 2.0 - 1.0);

  // Low-frequency noise (not per-frame random) so the shimmer reads as a
  // slow living flicker rather than a strobe.
  float n = vnoise(uv * 7.0 + u_time * u_shimmerFreq);
  float shimmer = 1.0 + u_shimmerAmt * (n * 2.0 - 1.0);

  float m = max(pulse * shimmer, 0.0);
  o_color = vec4(tex.rgb * m, clamp(tex.a * m, 0.0, 1.0));
}
`;

/** GLSL ES 1.00 mirror of COMPOSITE_FRAG — texture2D/gl_FragColor only. */
export const COMPOSITE_FRAG_GL1 = `
precision highp float;

uniform sampler2D u_bakeTex;
uniform vec2 u_res;
uniform float u_time;
uniform float u_shimmerAmt, u_shimmerFreq;
uniform float u_pulseAmt, u_pulseFreq, u_pulseSpeed;
uniform vec2 u_bodyCenterUv;
uniform float u_aspect;

float hash(vec2 p){ p = fract(p*vec2(123.34, 456.21)); p += dot(p, p+45.32); return fract(p.x*p.y); }
float vnoise(vec2 p){
  vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
  float a = hash(i), b = hash(i+vec2(1,0)), c = hash(i+vec2(0,1)), d = hash(i+vec2(1,1));
  return mix(mix(a,b,f.x), mix(c,d,f.x), f.y);
}

void main() {
  vec2 uv = gl_FragCoord.xy / u_res;
  vec4 tex = texture2D(u_bakeTex, uv);

  vec2 d = (uv - u_bodyCenterUv) * vec2(u_aspect, 1.0);
  float rad = length(d);
  float wave = 0.5 + 0.5 * sin(rad * u_pulseFreq - u_time * u_pulseSpeed);
  float pulse = 1.0 + u_pulseAmt * (wave * 2.0 - 1.0);

  float n = vnoise(uv * 7.0 + u_time * u_shimmerFreq);
  float shimmer = 1.0 + u_shimmerAmt * (n * 2.0 - 1.0);

  float m = max(pulse * shimmer, 0.0);
  gl_FragColor = vec4(tex.rgb * m, clamp(tex.a * m, 0.0, 1.0));
}
`;

export const UNIFORM_NAMES = [
  "u_res",
  "u_bodyOffset",
  "u_radius",
  "u_numPaths",
  "u_pointTex",
  "u_countTex",
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
];
