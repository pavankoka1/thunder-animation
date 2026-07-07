export const FULLSCREEN_VERT = `#version 300 es
layout(location = 0) in vec2 a_pos;
void main() { gl_Position = vec4(a_pos, 0.0, 1.0); }
`;

export const INNER_FRAG = `#version 300 es
precision highp float;
out vec4 o_color;
uniform vec2 u_res;
uniform vec2 u_bodyOffset;
uniform float u_time;

// The path NETWORK now comes from the traced neural reference (u_tex): the
// bolt/node/crisp fields are read from the real image so the paths are the
// hub-and-spoke web we built. Everything DOWNSTREAM — the colour pipeline
// (base+halo+core+crisp+node+cloud), the palette, the slow flowing warp and
// the shimmer — is the ORIGINAL plasma treatment, unchanged, so the textures,
// colours and movement match the old animation exactly.
uniform sampler2D u_tex;
uniform vec2 u_texOffset;   // cover-crop origin into the image (0..1)
uniform vec2 u_texScale;    // cover-crop size into the image (0..1)
// The path NETWORK is read the CLEAN way from two mipmap LODs — a sharp one
// for the veins and a heavily-blurred one whose broad glow is subtracted to
// de-lump the hub. Mipmap sampling is smooth (no grain, no procedural noise),
// so the paths stay clean & connected.
uniform float u_lodSharp;   // mipmap LOD for the vein signal (smooth veins)
uniform float u_lodBlur;    // mipmap LOD for the broad glow (de-lump reference)
uniform float u_deLump;     // subtract this * broad glow → de-lumps the hub
uniform float u_boltLo, u_boltHi;   // vein glow curve (smooth)
uniform float u_nodeLo, u_nodeSharp; // bright hub → star-burst node
uniform float u_crispLo, u_crispInt; // white-hot vein cores
uniform float u_flow, u_flowFreq, u_flowAmt; // gentle outward pulse (emergence)
uniform float u_warpSpeed, u_warpAmount; // flowing domain warp (movement)
uniform float u_cloudScale, u_cloudAmount;
uniform float u_nodeInt;
uniform vec3 u_baseColor, u_haloColor, u_coreColor;
uniform float u_baseInt, u_haloInt, u_coreInt, u_coreThresh;
uniform float u_edgeR, u_edgeSoft;
uniform float u_opacity;

float hash(vec2 p){ p = fract(p*vec2(123.34, 456.21)); p += dot(p, p+45.32); return fract(p.x*p.y); }
float vnoise(vec2 p){
  vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
  float a = hash(i), b = hash(i+vec2(1,0)), c = hash(i+vec2(0,1)), d = hash(i+vec2(1,1));
  return mix(mix(a,b,f.x), mix(c,d,f.x), f.y);
}
float fbm(vec2 p){
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++){ s += vnoise(p)*a; p *= 2.03; a *= 0.5; }
  return s;
}
float luma(vec3 c){ return max(max(c.r, c.g), c.b); }

void main(){
  vec2 uv = (gl_FragCoord.xy - u_bodyOffset) / u_res;
  float inBody = step(0.0, uv.x) * step(0.0, uv.y) * step(uv.x, 1.0) * step(uv.y, 1.0);
  float t = u_time;

  // Domain warp — the ORIGINAL Voronoi movement numbers (cellScale 10x5),
  // now warping the SAMPLE coordinate of the baked path field. The two fbm
  // octaves scroll with opposite time signs → a swirling flow with ~zero net
  // drift, so the whole web breathes/morphs (never hovers, never strobes).
  vec2 pcell = uv * vec2(10.0, 5.0);
  vec2 wv = vec2(
    fbm(pcell * 0.9 + t * u_warpSpeed),
    fbm(pcell * 0.9 + 7.3 - t * u_warpSpeed)
  ) - 0.5;
  vec2 suv = clamp(uv + (wv * u_warpAmount) / vec2(10.0, 5.0), 0.0, 1.0);
  vec2 tuv = u_texOffset + suv * u_texScale;

  // Clean vein signal from mipmap LODs — smooth, no grain, no procedural
  // noise. A sharp LOD gives the veins; a heavily-blurred LOD gives the broad
  // glow, which we subtract so the bright centre reads as distinct radiating
  // paths (de-lumped) instead of a solid blob. Veins survive because they're
  // finer than the blurred glow → clean, connected paths.
  float sharp = luma(textureLod(u_tex, tuv, u_lodSharp).rgb);
  float glow = luma(textureLod(u_tex, tuv, u_lodBlur).rgb);
  float detail = clamp(sharp - u_deLump * glow, 0.0, 1.0);
  float bolt = smoothstep(u_boltLo, u_boltHi, detail);

  // Per-cell shimmer — ±10% only, phase varied per Voronoi cell (NOT keyed off
  // brightness, so it breathes rather than strobes) — exactly the original.
  bolt *= 0.9 + 0.1 * sin(t * 2.6 + hash(floor(pcell)) * 6.2831);

  // Gentle outward pulse: energy flows hub → edge so the web ties to the hub.
  float rad = distance(uv, vec2(0.5));
  float wave = 0.5 + 0.5 * sin(rad * u_flowFreq - t * u_flow);
  bolt *= 1.0 + u_flowAmt * (wave * 2.0 - 1.0);

  // Hub star-burst node from the bright centre.
  float node = pow(smoothstep(u_nodeLo, 1.0, sharp), u_nodeSharp);
  // White-hot cores on the strong veins.
  float crisp = smoothstep(u_crispLo, 1.0, detail) * u_crispInt;

  // Procedural cloud base texture — identical to the original plasma.
  float cloud = fbm(uv * u_cloudScale + t * u_warpSpeed * 0.7);
  cloud = mix(1.0, cloud, u_cloudAmount);

  // ---- ORIGINAL colour pipeline (unchanged) ----
  vec3 base = u_baseColor * u_baseInt * (0.5 + cloud);
  vec3 halo = u_haloColor * bolt * u_haloInt;
  vec3 core = u_coreColor * u_coreInt * pow(clamp((bolt - u_coreThresh) / (1.0 - u_coreThresh), 0.0, 1.0), 2.0);
  vec3 crispCol = u_coreColor * crisp;
  vec3 nodeCol = mix(u_haloColor, u_coreColor, node) * node * u_nodeInt;
  vec3 col = base + halo + core + crispCol + nodeCol;

  float dist = distance(uv, vec2(0.5)) / u_edgeR;
  float vig = clamp(u_edgeSoft - dist, 0.0, 1.0);
  vig *= vig;

  float a = clamp(max(max(col.r, col.g), col.b), 0.0, 1.0) * vig * inBody;
  o_color = vec4(col * vig * inBody, a) * u_opacity;
}
`;

export const OUTER_FRAG = `#version 300 es
precision highp float;
out vec4 o_color;

uniform vec2 u_res;
uniform float u_time;
uniform float u_reveal;

uniform vec2 u_center;
uniform vec2 u_half;
uniform float u_radius;

uniform float u_coreW, u_midW, u_haloW;
uniform float u_flameOut, u_freqAlong, u_freqAcross, u_flameScroll, u_flicker, u_innerFreq, u_topBias;
uniform vec3 u_coreColor, u_midColor, u_haloColor;
uniform float u_coreInt, u_midInt, u_haloInt;
uniform float u_tail, u_headBoost, u_heartbeat;
uniform float u_lumpAmt, u_lumpWidth, u_lumpSoft, u_lumpDrift, u_lumpBreath, u_lumpJitter, u_lumpGlow, u_lumpCount;

const float HALF_PI = 1.5707963267948966;

float hash(vec2 p){ p = fract(p*vec2(123.34, 456.21)); p += dot(p, p+45.32); return fract(p.x*p.y); }
float vnoise(vec2 p){
  vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
  float a = hash(i), b = hash(i+vec2(1,0)), c = hash(i+vec2(0,1)), d = hash(i+vec2(1,1));
  return mix(mix(a,b,f.x), mix(c,d,f.x), f.y);
}
float fbm(vec2 p){
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++){ s += vnoise(p)*a; p *= 2.03; a *= 0.5; }
  return s;
}

float sdRoundBox(vec2 p, vec2 b, float r){
  vec2 q = abs(p) - (b - vec2(r));
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}

float perimeterS(vec2 local, vec2 halfv, float r){
  vec2 b = halfv - vec2(r);
  float Wt = 2.0 * b.x;
  float Hs = 2.0 * b.y;
  float A  = HALF_PI * r;
  float Pp = 2.0 * Wt + 2.0 * Hs + 4.0 * A;

  bool right  = local.x > 0.0;
  bool bottom = local.y > 0.0;
  vec2 d = abs(local) - b;
  bool corner = d.x > 0.0 && d.y > 0.0;

  float len;
  if (!corner) {
    if (d.x <= 0.0) {
      if (!bottom) len = (local.x + b.x);
      else         len = Wt + 2.0*A + Hs + (b.x - local.x);
    } else {
      if (right) len = Wt + A + (local.y + b.y);
      else       len = 2.0*Wt + 3.0*A + Hs + (b.y - local.y);
    }
  } else if (right && !bottom) {
    vec2 v = vec2(local.x - b.x, local.y + b.y);
    len = Wt + A * (atan(v.x, -v.y) / HALF_PI);
  } else if (right && bottom) {
    vec2 v = vec2(local.x - b.x, local.y - b.y);
    len = Wt + A + Hs + A * (atan(v.y, v.x) / HALF_PI);
  } else if (!right && bottom) {
    vec2 v = vec2(local.x + b.x, local.y - b.y);
    len = 2.0*Wt + Hs + 2.0*A + A * (atan(-v.x, v.y) / HALF_PI);
  } else {
    vec2 v = vec2(local.x + b.x, local.y + b.y);
    len = 2.0*Wt + 2.0*Hs + 3.0*A + A * (atan(-v.y, -v.x) / HALF_PI);
  }
  return len / Pp;
}

void main(){
  vec2 P = vec2(gl_FragCoord.x, u_res.y - gl_FragCoord.y);
  vec2 local = P - u_center;

  float sd = sdRoundBox(local, u_half, u_radius);
  float d  = abs(sd);
  float outside = step(0.0, sd);

  float s = perimeterS(local, u_half, u_radius);

  vec2 bb = u_half - vec2(u_radius);
  float Wt = 2.0 * bb.x, Hs = 2.0 * bb.y, A = HALF_PI * u_radius;
  float Pp = 2.0 * Wt + 2.0 * Hs + 4.0 * A;
  float sApex = (2.0 * Wt + 2.0 * Hs + 3.5 * A) / Pp;
  float sr = fract(s - sApex + 1.0);

  float ang = s * 6.28318530718;
  vec2 dir = vec2(cos(ang), sin(ang));
  float scroll = u_time * u_flameScroll;
  vec2 ring = dir * (u_freqAlong / 6.28318530718);
  float n = fbm(ring + vec2(scroll, sd / max(u_freqAcross, 1.0)));

  float dEff = d - n * u_flameOut * (0.4 + 0.6 * outside);
  vec2 ringi = dir * (u_innerFreq / 6.28318530718);
  float rn = fbm(ringi + vec2(0.0, sd * 0.5 + 7.0));
  dEff += (1.0 - outside) * (rn - 0.5) * u_flameOut * 0.5;

  float core = exp(-pow(d / max(u_coreW, 0.5), 2.0));
  float mid  = exp(-pow(dEff / max(u_midW, 1.0), 2.0));
  float halo = exp(-pow(dEff / max(u_haloW, 1.0), 2.0)) * (0.5 + 0.5 * n);

  float topw = clamp(-local.y / u_half.y, 0.0, 1.0);
  halo *= 1.0 + u_topBias * topw;
  mid  *= 1.0 + u_topBias * 0.5 * topw;

  // Clockwise perimeter reveal with a bright leading head: the outline draws
  // itself from the top-centre around the card as u_reveal ramps 0->1 (sr is
  // the clockwise perimeter position). Once complete it stays lit and breathes.
  float head = u_reveal;
  float formed = smoothstep(0.985, 1.0, u_reveal);
  float started = smoothstep(0.0, 0.02, head);
  float drawn = (1.0 - smoothstep(head, head + 0.015, sr)) * started;
  float vis = max(drawn, formed);
  float headGlow =
      smoothstep(head - 0.05, head, sr) *
      (1.0 - smoothstep(head, head + 0.015, sr)) *
      (1.0 - formed) * started;

  float fl = 0.85 + 0.15 * sin(u_time * u_flicker + ang * 6.0);
  float t = u_time;
  float pulse = clamp(0.55 + 0.30 * sin(t * 2.1) + 0.18 * sin(t * 4.7 + 0.7), 0.25, 1.0);
  float hb = mix(1.0, 0.82 + u_heartbeat * pulse, formed);

  vec3 col = u_coreColor * core * u_coreInt
           + u_midColor  * mid  * u_midInt
           + u_haloColor * halo * u_haloInt;
  col *= fl * hb * vis;
  float edgeEnv = exp(-pow(dEff / max(u_midW, 1.0), 2.0));
  col += u_coreColor * headGlow * u_headBoost * edgeEnv;

  // ---- outer LUMP layer (summed gaussians) ----
  // Rounded IRREGULAR bumps bulging OUTWARD from the border, replacing the old
  // pointed spikes. Discrete lumps: each has a hash-jittered CENTER
  // (irregular spacing), its own WIDTH and HEIGHT; the whole crown slowly
  // DRIFTS around the perimeter and each lump BREATHES out of sync. Pure
  // additive shell on the OUTSIDE only — never touches d/dEff or the
  // core/mid/halo band math, so the main flow is untouched. Seam-free at
  // s=0/1: per-lump distance uses a wrapped signed distance, centres are
  // fract()'d so drift wraps cleanly.
  // Density (u_lumpCount) is a LIVE uniform, not a compile-time constant:
  // GLSL ES 3.00 loop bounds must still be a constant expression on some
  // backends, so the loop always runs to a fixed LUMP_MAX and bails out
  // early past u_lumpCount via the break below.
  const int LUMP_MAX = 48; // upper bound for the lumpCount density uniform
  float lumpH = 0.0; // summed gaussian bump height at this s
  // Shell guard: the loop only runs in the thin outside band where a lump
  // could actually paint — skips the whole interior and far exterior.
  if (outside > 0.5 && vis > 0.0 && d < u_lumpAmt * 1.6) {
    float lumpDrift = u_time * u_lumpDrift; // whole crown slides around the loop
    for (int i = 0; i < LUMP_MAX; i++){
      if (float(i) >= u_lumpCount) break;
      float fi = float(i);
      float hPos = hash(vec2(fi, 1.7)); // decorrelated per-lump randoms
      float hWid = hash(vec2(fi, 9.3));
      float hHgt = hash(vec2(fi, 4.1));
      // irregular spacing: even slot + jittered offset, drifted, wrapped 0..1
      float center = fract((fi + u_lumpJitter * (hPos - 0.5)) / u_lumpCount + lumpDrift);
      // irregular width (perimeter units), guarded away from zero
      float width = u_lumpWidth * (0.55 + 0.9 * hWid);
      // irregular height, each breathing out of phase (phase from its own hash)
      float breathe = 0.62 + 0.38 * sin(u_time * u_lumpBreath + hPos * 6.28318530718);
      float height = (0.4 + 0.6 * hHgt) * breathe;
      // seam-safe signed distance from this lump centre: [-0.5, 0.5)
      float ds = fract(s - center + 0.5) - 0.5;
      float e = ds / width;
      lumpH += height * exp(-e * e); // rounded gaussian bump
    }
    lumpH = clamp(lumpH, 0.0, 1.5); // tame overlap over-saturation
  }

  // Thin outward fill shell: from the border (d=0) out to the bump top, only
  // where a lump exists (valleys stay clean), only outside, only when revealed.
  // Single glow layer — the inner, hot core colour only (no outer mid-colour
  // halo blended in further out).
  float lumpReach = lumpH * u_lumpAmt;
  float lumpFill = 1.0 - smoothstep(lumpReach, lumpReach + u_lumpSoft, d);
  float lumpMask = smoothstep(0.05, 0.30, lumpH) * outside * vis;
  col += u_coreColor * lumpFill * lumpMask * u_lumpGlow;

  float a = clamp(max(max(col.r, col.g), col.b), 0.0, 1.0);
  o_color = vec4(col, a);
}
`;

export const INNER_UNIFORM_NAMES = [
  "u_res",
  "u_bodyOffset",
  "u_time",
  "u_tex",
  "u_texOffset",
  "u_texScale",
  "u_lodSharp",
  "u_lodBlur",
  "u_deLump",
  "u_boltLo",
  "u_boltHi",
  "u_nodeLo",
  "u_nodeSharp",
  "u_crispLo",
  "u_crispInt",
  "u_flow",
  "u_flowFreq",
  "u_flowAmt",
  "u_warpSpeed",
  "u_warpAmount",
  "u_cloudScale",
  "u_cloudAmount",
  "u_nodeInt",
  "u_baseColor",
  "u_haloColor",
  "u_coreColor",
  "u_baseInt",
  "u_haloInt",
  "u_coreInt",
  "u_coreThresh",
  "u_edgeR",
  "u_edgeSoft",
  "u_opacity",
];

export const OUTER_UNIFORM_NAMES = [
  "u_res",
  "u_time",
  "u_reveal",
  "u_center",
  "u_half",
  "u_radius",
  "u_coreW",
  "u_midW",
  "u_haloW",
  "u_flameOut",
  "u_freqAlong",
  "u_freqAcross",
  "u_flameScroll",
  "u_flicker",
  "u_innerFreq",
  "u_topBias",
  "u_coreColor",
  "u_midColor",
  "u_haloColor",
  "u_coreInt",
  "u_midInt",
  "u_haloInt",
  "u_tail",
  "u_headBoost",
  "u_heartbeat",
  "u_lumpAmt",
  "u_lumpWidth",
  "u_lumpSoft",
  "u_lumpDrift",
  "u_lumpBreath",
  "u_lumpJitter",
  "u_lumpGlow",
  "u_lumpCount",
];
