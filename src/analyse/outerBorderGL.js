export const OUTER_CONFIG = {
  coreWidth: 3.0,
  midWidth: 8.0,
  haloWidth: 24.0,

  flameOutreach: 15.0,
  freqAlong: 26.0,
  freqAcross: 26.0,
  flameScroll: 0.35,
  flicker: 3.2,
  innerRaggedFreq: 44.0,
  topBias: 0.25,

  coreColor: [1.0, 0.96, 1.0],
  midColor: [1.0, 0.2, 0.84],
  haloColor: [0.88, 0.11, 0.71],
  coreIntensity: 1.0,
  midIntensity: 1.0,
  haloIntensity: 0.9,

  tailLength: 0.3,
  headBoost: 1.9,
  formationMs: 1500,
  easing: "easeInOut",
  heartbeat: 0.18,
};

export const EASINGS = {
  linear: (t) => t,
  easeIn: (t) => t * t,
  easeOut: (t) => 1 - (1 - t) * (1 - t),
  easeInOut: (t) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2),
  easeOutCubic: (t) => 1 - (1 - t) ** 3,
};

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
];

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
  dEff = max(dEff, 0.0);

  float core = exp(-pow(d / max(u_coreW, 0.5), 2.0));
  float mid  = exp(-pow(dEff / max(u_midW, 1.0), 2.0));
  float halo = exp(-pow(dEff / max(u_haloW, 1.0), 2.0)) * (0.5 + 0.5 * n);

  float topw = clamp(-local.y / u_half.y, 0.0, 1.0);
  halo *= 1.0 + u_topBias * topw;
  mid  *= 1.0 + u_topBias * 0.5 * topw;

  float head = u_reveal;
  float formed = smoothstep(0.94, 1.0, u_reveal);
  float started = smoothstep(0.0, 0.015, head);
  float drawn = (1.0 - smoothstep(head, head + 0.02, sr)) * started;
  float vis = max(drawn, formed);
  float headGlow =
      smoothstep(head - 0.06, head, sr) *
      (1.0 - smoothstep(head, head + 0.02, sr)) *
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

  float a = clamp(max(max(col.r, col.g), col.b), 0.0, 1.0);
  o_color = vec4(col, a);
}
`;

export function applyOuterUniforms(gl, u, cfg, frame) {
  const { timeSec, reveal, w, h, rect } = frame;
  gl.uniform2f(u.u_res, w, h);
  gl.uniform1f(u.u_time, timeSec);
  gl.uniform1f(u.u_reveal, reveal);
  gl.uniform2f(u.u_center, rect.center[0], rect.center[1]);
  gl.uniform2f(u.u_half, rect.half[0], rect.half[1]);
  gl.uniform1f(u.u_radius, rect.radius);
  gl.uniform1f(u.u_coreW, cfg.coreWidth);
  gl.uniform1f(u.u_midW, cfg.midWidth);
  gl.uniform1f(u.u_haloW, cfg.haloWidth);
  gl.uniform1f(u.u_flameOut, cfg.flameOutreach);
  gl.uniform1f(u.u_freqAlong, cfg.freqAlong);
  gl.uniform1f(u.u_freqAcross, cfg.freqAcross);
  gl.uniform1f(u.u_flameScroll, cfg.flameScroll);
  gl.uniform1f(u.u_flicker, cfg.flicker);
  gl.uniform1f(u.u_innerFreq, cfg.innerRaggedFreq);
  gl.uniform1f(u.u_topBias, cfg.topBias);
  gl.uniform3fv(u.u_coreColor, cfg.coreColor);
  gl.uniform3fv(u.u_midColor, cfg.midColor);
  gl.uniform3fv(u.u_haloColor, cfg.haloColor);
  gl.uniform1f(u.u_coreInt, cfg.coreIntensity);
  gl.uniform1f(u.u_midInt, cfg.midIntensity);
  gl.uniform1f(u.u_haloInt, cfg.haloIntensity);
  gl.uniform1f(u.u_tail, cfg.tailLength);
  gl.uniform1f(u.u_headBoost, cfg.headBoost);
  gl.uniform1f(u.u_heartbeat, cfg.heartbeat);
}
