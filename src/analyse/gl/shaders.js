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

uniform float u_seedSpeed, u_seedDrift, u_warpSpeed, u_warpAmount;
uniform vec2 u_cellScale;
uniform float u_boltWidth, u_boltSharp, u_boltVary;
uniform float u_branchStr, u_branchScale, u_branchSharp;
uniform float u_branch2Str, u_branch2Scale, u_branch2Sharp;
uniform float u_filStrength, u_filScale, u_filLo, u_filHi;
uniform float u_crispW, u_crispInt;
uniform float u_nodeSize, u_nodeSharp, u_nodeInt, u_cloudScale, u_cloudAmount;
uniform vec3 u_baseColor, u_haloColor, u_coreColor;
uniform float u_baseInt, u_haloInt, u_coreInt, u_coreThresh;
uniform float u_edgeR, u_edgeSoft;
uniform float u_opacity;

float hash(vec2 p){ p = fract(p*vec2(123.34, 456.21)); p += dot(p, p+45.32); return fract(p.x*p.y); }
vec2 hash2(vec2 p){
  return fract(sin(vec2(dot(p, vec2(127.1,311.7)), dot(p, vec2(269.5,183.3)))) * 43758.5453);
}
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

void main(){
  vec2 uv = (gl_FragCoord.xy - u_bodyOffset) / u_res;
  float inBody = step(0.0, uv.x) * step(0.0, uv.y) * step(uv.x, 1.0) * step(uv.y, 1.0);
  float t = u_time;

  vec2 p = uv * u_cellScale;
  vec2 w = vec2(fbm(p*0.9 + t*u_warpSpeed), fbm(p*0.9 + 7.3 - t*u_warpSpeed));
  p += (w - 0.5) * u_warpAmount;

  vec2 g = floor(p), f = p - g;
  float F1 = 9.0, F2 = 9.0, F3 = 9.0;
  vec2 nearCell = g;
  for (int y = -1; y <= 1; y++){
    for (int x = -1; x <= 1; x++){
      vec2 off = vec2(float(x), float(y));
      vec2 seed = hash2(g + off);
      vec2 pos = off + 0.5 + u_seedDrift * sin(t*u_seedSpeed + 6.2831*seed);
      float d = length(pos - f);
      if (d < F1) { F3 = F2; F2 = F1; F1 = d; nearCell = g + off; }
      else if (d < F2) { F3 = F2; F2 = d; }
      else if (d < F3) { F3 = d; }
    }
  }

  float edge = F2 - F1;
  float junction = 1.0 - smoothstep(0.0, u_nodeSize, F3 - F1);
  float node = pow(clamp(junction, 0.0, 1.0), u_nodeSharp);

  float cellVar = 1.0 + u_boltVary * (hash(nearCell + 3.3) - 0.5) * 2.0;
  float bw = max(0.01, u_boltWidth * cellVar);
  float bolt = pow(clamp(1.0 - edge / bw, 0.0, 1.0), u_boltSharp);

  float fil = fbm(p * u_filScale + t * u_warpSpeed * 1.6);
  bolt = max(bolt, smoothstep(u_filLo, u_filHi, fil) * bolt * u_filStrength);

  float rn = fbm(p * u_branchScale + vec2(11.0) + t * u_warpSpeed * 2.0);
  float ridge = 1.0 - abs(rn * 2.0 - 1.0);
  float branches = pow(clamp(ridge, 0.0, 1.0), u_branchSharp) * u_branchStr;
  branches *= smoothstep(0.0, 0.55, bolt + 0.15);
  bolt = max(bolt, branches);

  // Secondary finer branch layer — rotated ~43deg and at a higher frequency
  // than the primary layer so twigs shoot off the main veins at varied
  // angles, matching the denser fractal lightning reference (more branches
  // overall, not just thicker single veins).
  vec2 p2 = vec2(p.x * 0.731 - p.y * 0.682, p.x * 0.682 + p.y * 0.731);
  float rn2 = fbm(p2 * u_branch2Scale + vec2(53.0) - t * u_warpSpeed * 2.4);
  float ridge2 = 1.0 - abs(rn2 * 2.0 - 1.0);
  float branches2 = pow(clamp(ridge2, 0.0, 1.0), u_branch2Sharp) * u_branch2Str;
  branches2 *= smoothstep(0.0, 0.75, bolt + 0.3);
  bolt = max(bolt, branches2);

  // Subtle per-cell electric shimmer keeps the crack veins alive without a
  // busy flicker (reference veins drift/pulse slowly).
  float shimmer = 0.9 + 0.1 * sin(t * 2.6 + dot(nearCell, vec2(1.7, 2.3)));
  bolt *= shimmer;

  float crisp = (1.0 - smoothstep(0.0, u_crispW, edge)) * u_crispInt;

  float cloud = fbm(p * u_cloudScale + t * u_warpSpeed * 0.7);
  cloud = mix(1.0, cloud, u_cloudAmount);

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
uniform float u_spikeFreq, u_spikeAmt, u_spikeSharp, u_spikeSpeed, u_spikeGlow, u_spikeWidth;

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

  // ---- independent spike/bump layer ----
  // A crown of tiny bright flecks poking outward from the border, added on
  // TOP of the finished band above as its own thin glowing shell. This is
  // deliberately kept OUT of the core/mid/halo distance math (d/dEff): once
  // the spike offset was baked into those, every spike peak pushed the main
  // exponential bands to their brightest point, which read as sudden
  // brightness pops breaking the flow of the main energy — this layer never
  // touches d/dEff/core/mid/halo, so that flow is fully untouched.
  //
  // Noise-space RADIUS is fixed (spikeLoopR) and independent of spikeFreq,
  // which instead controls how many times the angle wraps around that
  // circle as s sweeps 0->1. Do NOT use radius = spikeFreq/2pi: at low
  // spikeFreq that shrinks the sampling circle below the noise grid's cell
  // pitch (1.0), so the path barely leaves a single grid cell and the
  // "spikes" collapse onto wherever that one cell's gradient happens to
  // peak (they bunched up near just two corners before this fix).
  float spikeAng = s * 6.28318530718 * max(u_spikeFreq, 1.0);
  vec2 spikeDir = vec2(cos(spikeAng), sin(spikeAng));
  const float spikeLoopR = 9.0;
  vec2 spikeRing = spikeDir * spikeLoopR;
  float spikeBase = vnoise(spikeRing);
  float spikeFine = vnoise(spikeRing * 2.3 + 19.0);
  float spikeRaw = spikeBase * 0.7 + spikeFine * 0.3;
  float spikeRidge = 1.0 - abs(spikeRaw * 2.0 - 1.0);

  // Each spike flickers independently IN PLACE, using a phase derived from
  // its own static noise value (not from position along the ring), so
  // nearby spikes pulse out of sync with each other but none of them drift
  // sideways (the reference loop keeps every spike's position frozen).
  float shimmerPhase = spikeBase * 41.0 + spikeFine * 17.0;
  float shimmer = 0.82 + 0.18 * sin(u_time * u_spikeSpeed * 5.0 + shimmerPhase);
  float spikeOut = pow(clamp(spikeRidge, 0.0, 1.0), u_spikeSharp) * shimmer;

  // Fill continuously from the border (d=0) out to the spike tip — not just
  // a thin ring at the tip — so there's no dark gap between the base glow
  // and where the spike ends. Colour blends from the hot core near the
  // border to the border's own magenta glow colour further out, matching
  // the same palette as the main band. Still NOT blended into d/dEff, and
  // only visible where there's an actual spike (valleys stay clean) and
  // only on the outside of the card.
  float spikeReach = spikeOut * u_spikeAmt;
  float wedgeFill = 1.0 - smoothstep(spikeReach, spikeReach + u_spikeWidth, d);
  float wedgeMask = smoothstep(0.08, 0.4, spikeOut) * outside * vis;
  float hotness = 1.0 - smoothstep(0.0, max(spikeReach, 0.5), d);
  vec3 spikeCol = mix(u_midColor, u_coreColor, hotness);
  col += spikeCol * wedgeFill * wedgeMask * u_spikeGlow;

  float a = clamp(max(max(col.r, col.g), col.b), 0.0, 1.0);
  o_color = vec4(col, a);
}
`;

export const INNER_UNIFORM_NAMES = [
  "u_res",
  "u_bodyOffset",
  "u_time",
  "u_seedSpeed",
  "u_seedDrift",
  "u_warpSpeed",
  "u_warpAmount",
  "u_cellScale",
  "u_boltWidth",
  "u_boltSharp",
  "u_boltVary",
  "u_branchStr",
  "u_branchScale",
  "u_branchSharp",
  "u_branch2Str",
  "u_branch2Scale",
  "u_branch2Sharp",
  "u_filStrength",
  "u_filScale",
  "u_filLo",
  "u_filHi",
  "u_crispW",
  "u_crispInt",
  "u_nodeSize",
  "u_nodeSharp",
  "u_nodeInt",
  "u_cloudScale",
  "u_cloudAmount",
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
  "u_spikeFreq",
  "u_spikeAmt",
  "u_spikeSharp",
  "u_spikeSpeed",
  "u_spikeGlow",
  "u_spikeWidth",
];
