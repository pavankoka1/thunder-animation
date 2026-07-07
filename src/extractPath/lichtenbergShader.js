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
