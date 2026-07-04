/**
 * Procedural WebGL plasma for the analyse betspot — no images.
 *
 * Electric-voronoi plasma: cell borders are the bolts, seeds drift so the bolts
 * re-route over time. On top of the main border bolts we add finer ridged
 * branch filaments, per-cell width variety (some bolts denser than others), and
 * a thin crisp core line for sharp finishing. Every parameter is a live shader
 * uniform driven from PLASMA_CONFIG (also on window.__analysePlasmaConfig).
 */

export const PLASMA_CONFIG = {
  // ---- motion / time ----
  timeScale: 1.0,
  seedSpeed: 0.45,
  seedDrift: 0.45,
  warpSpeed: 0.03,
  warpAmount: 1.5,

  // ---- density / structure ----
  cellScaleX: 9.5,
  cellScaleY: 4.6,
  boltWidth: 0.15, // thinner main bolts
  boltSharp: 2.3, // crisper falloff
  boltVary: 0.5, // 0..1 per-cell width variety → different dense bolts

  // ---- extra thin branches (ridged filaments hugging the bolts) ----
  branchStrength: 0.6,
  branchScale: 7.0,
  branchSharp: 3.6,

  // ---- fine secondary filaments (fill) ----
  filStrength: 0.7,
  filScale: 3.4,
  filLo: 0.52,
  filHi: 0.95,

  // ---- crisp thin core line right on the border ----
  crispWidth: 0.03,
  crispIntensity: 0.95,

  // ---- colour (violet / purple) ----
  baseColor: [0.42, 0.14, 0.72],
  haloColor: [0.66, 0.32, 1.0],
  coreColor: [0.98, 0.94, 1.0],
  baseIntensity: 0.42,
  haloIntensity: 1.15,
  coreIntensity: 0.9,
  coreThreshold: 0.6,

  // ---- edge fade ----
  edgeRadius: 0.72,
  edgeSoftness: 1.06,
};

/** Shader time in seconds, clamped (first rAF timestamp can be < the start). */
export function elapsedSeconds(tMs) {
  return (tMs > 0 ? tMs : 0) * 0.001;
}

const VERT = `#version 300 es
in vec2 a_pos;
void main() { gl_Position = vec4(a_pos, 0.0, 1.0); }
`;

const FRAG = `#version 300 es
precision highp float;
out vec4 o_color;
uniform vec2 u_res;
uniform float u_time;

uniform float u_seedSpeed, u_seedDrift, u_warpSpeed, u_warpAmount;
uniform vec2 u_cellScale;
uniform float u_boltWidth, u_boltSharp, u_boltVary;
uniform float u_branchStr, u_branchScale, u_branchSharp;
uniform float u_filStrength, u_filScale, u_filLo, u_filHi;
uniform float u_crispW, u_crispInt;
uniform vec3 u_baseColor, u_haloColor, u_coreColor;
uniform float u_baseInt, u_haloInt, u_coreInt, u_coreThresh;
uniform float u_edgeR, u_edgeSoft;

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
  vec2 uv = gl_FragCoord.xy / u_res;
  float t = u_time;

  vec2 p = uv * u_cellScale;
  vec2 w = vec2(fbm(p*0.9 + t*u_warpSpeed), fbm(p*0.9 + 7.3 - t*u_warpSpeed));
  p += (w - 0.5) * u_warpAmount;

  vec2 g = floor(p), f = p - g;
  float F1 = 9.0, F2 = 9.0;
  vec2 nearCell = g;
  for (int y = -1; y <= 1; y++){
    for (int x = -1; x <= 1; x++){
      vec2 off = vec2(float(x), float(y));
      vec2 seed = hash2(g + off);
      vec2 pos = off + 0.5 + u_seedDrift * sin(t*u_seedSpeed + 6.2831*seed);
      float d = length(pos - f);
      if (d < F1) { F2 = F1; F1 = d; nearCell = g + off; } else if (d < F2) { F2 = d; }
    }
  }

  float edge = F2 - F1;                              // 0 on a cell border

  // per-cell width variety → some bolts thicker/denser than others
  float cellVar = 1.0 + u_boltVary * (hash(nearCell + 3.3) - 0.5) * 2.0;
  float bw = max(0.01, u_boltWidth * cellVar);
  float bolt = pow(clamp(1.0 - edge / bw, 0.0, 1.0), u_boltSharp);

  // fine secondary filaments (fill the cells a little)
  float fil = fbm(p * u_filScale + t * u_warpSpeed * 1.6);
  bolt = max(bolt, smoothstep(u_filLo, u_filHi, fil) * bolt * u_filStrength);

  // extra thin ridged branches, gated to hug the bolts
  float rn = fbm(p * u_branchScale + vec2(11.0) + t * u_warpSpeed * 2.0);
  float ridge = 1.0 - abs(rn * 2.0 - 1.0);
  float branches = pow(clamp(ridge, 0.0, 1.0), u_branchSharp) * u_branchStr;
  branches *= smoothstep(0.0, 0.55, bolt + 0.15);
  bolt = max(bolt, branches);

  // thin crisp core line exactly on the border
  float crisp = (1.0 - smoothstep(0.0, u_crispW, edge)) * u_crispInt;

  vec3 base = u_baseColor * u_baseInt;
  vec3 halo = u_haloColor * bolt * u_haloInt;
  vec3 core = u_coreColor * u_coreInt * pow(clamp((bolt - u_coreThresh) / (1.0 - u_coreThresh), 0.0, 1.0), 2.0);
  vec3 crispCol = u_coreColor * crisp;
  vec3 col = base + halo + core + crispCol;

  float dist = distance(uv, vec2(0.5)) / u_edgeR;
  float vig = clamp(u_edgeSoft - dist, 0.0, 1.0);
  vig *= vig;

  float a = clamp(max(max(col.r, col.g), col.b), 0.0, 1.0) * vig;
  o_color = vec4(col * vig, a);
}
`;

function compile(gl, type, src) {
  const sh = gl.createShader(type);
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh);
    gl.deleteShader(sh);
    throw new Error(`shader compile: ${log}`);
  }
  return sh;
}

const UNIFORM_NAMES = [
  "u_res", "u_time",
  "u_seedSpeed", "u_seedDrift", "u_warpSpeed", "u_warpAmount",
  "u_cellScale", "u_boltWidth", "u_boltSharp", "u_boltVary",
  "u_branchStr", "u_branchScale", "u_branchSharp",
  "u_filStrength", "u_filScale", "u_filLo", "u_filHi",
  "u_crispW", "u_crispInt",
  "u_baseColor", "u_haloColor", "u_coreColor",
  "u_baseInt", "u_haloInt", "u_coreInt", "u_coreThresh",
  "u_edgeR", "u_edgeSoft",
];

/**
 * Create the WebGL2 program + fullscreen quad. `config` is merged over
 * PLASMA_CONFIG and kept mutable on the returned assets (edit live). Throws if
 * WebGL2/compile is unavailable (caller leaves the energy empty).
 */
export function initGL(canvas, config = {}) {
  const gl = canvas.getContext("webgl2", { alpha: true, premultipliedAlpha: true, antialias: true });
  if (!gl) throw new Error("webgl2 unavailable");

  const program = gl.createProgram();
  gl.attachShader(program, compile(gl, gl.VERTEX_SHADER, VERT));
  gl.attachShader(program, compile(gl, gl.FRAGMENT_SHADER, FRAG));
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(`program link: ${gl.getProgramInfoLog(program)}`);
  }

  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(program, "a_pos");
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  gl.useProgram(program);

  const u = {};
  for (const name of UNIFORM_NAMES) u[name] = gl.getUniformLocation(program, name);

  const cfg = config.timeScale !== undefined ? config : { ...PLASMA_CONFIG, ...config };
  if (typeof window !== "undefined") window.__analysePlasmaConfig = cfg;
  return { gl, program, u, cfg, w: canvas.width, h: canvas.height };
}

/** Draw one frame at time tMs, applying the (possibly live-edited) config. */
export function paintGLFrame(assets, tMs) {
  if (!assets) return;
  const { gl, u, cfg, w, h } = assets;
  gl.viewport(0, 0, w, h);
  gl.clearColor(0, 0, 0, 0);
  gl.clear(gl.COLOR_BUFFER_BIT);

  gl.uniform2f(u.u_res, w, h);
  gl.uniform1f(u.u_time, elapsedSeconds(tMs) * cfg.timeScale);
  gl.uniform1f(u.u_seedSpeed, cfg.seedSpeed);
  gl.uniform1f(u.u_seedDrift, cfg.seedDrift);
  gl.uniform1f(u.u_warpSpeed, cfg.warpSpeed);
  gl.uniform1f(u.u_warpAmount, cfg.warpAmount);
  gl.uniform2f(u.u_cellScale, cfg.cellScaleX, cfg.cellScaleY);
  gl.uniform1f(u.u_boltWidth, cfg.boltWidth);
  gl.uniform1f(u.u_boltSharp, cfg.boltSharp);
  gl.uniform1f(u.u_boltVary, cfg.boltVary);
  gl.uniform1f(u.u_branchStr, cfg.branchStrength);
  gl.uniform1f(u.u_branchScale, cfg.branchScale);
  gl.uniform1f(u.u_branchSharp, cfg.branchSharp);
  gl.uniform1f(u.u_filStrength, cfg.filStrength);
  gl.uniform1f(u.u_filScale, cfg.filScale);
  gl.uniform1f(u.u_filLo, cfg.filLo);
  gl.uniform1f(u.u_filHi, cfg.filHi);
  gl.uniform1f(u.u_crispW, cfg.crispWidth);
  gl.uniform1f(u.u_crispInt, cfg.crispIntensity);
  gl.uniform3fv(u.u_baseColor, cfg.baseColor);
  gl.uniform3fv(u.u_haloColor, cfg.haloColor);
  gl.uniform3fv(u.u_coreColor, cfg.coreColor);
  gl.uniform1f(u.u_baseInt, cfg.baseIntensity);
  gl.uniform1f(u.u_haloInt, cfg.haloIntensity);
  gl.uniform1f(u.u_coreInt, cfg.coreIntensity);
  gl.uniform1f(u.u_coreThresh, cfg.coreThreshold);
  gl.uniform1f(u.u_edgeR, cfg.edgeRadius);
  gl.uniform1f(u.u_edgeSoft, cfg.edgeSoftness);

  gl.drawArrays(gl.TRIANGLES, 0, 3);
}
