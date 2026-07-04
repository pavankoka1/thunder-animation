import {
  applyOuterUniforms,
  EASINGS,
  OUTER_CONFIG,
  OUTER_FRAG,
  OUTER_UNIFORM_NAMES,
} from "./outerBorderGL.js";

export const PLASMA_CONFIG = {
  timeScale: 1.0,
  seedSpeed: 0.45,
  seedDrift: 0.45,
  warpSpeed: 0.03,
  warpAmount: 1.5,

  cellScaleX: 9.5,
  cellScaleY: 4.6,
  boltWidth: 0.19,
  boltSharp: 2.1,
  boltVary: 0.5,

  branchStrength: 0.7,
  branchScale: 7.0,
  branchSharp: 3.6,

  filStrength: 0.85,
  filScale: 3.4,
  filLo: 0.46,
  filHi: 0.95,

  crispWidth: 0.035,
  crispIntensity: 1.05,

  nodeSize: 0.33,
  nodeSharp: 2.0,
  nodeIntensity: 1.9,
  cloudScale: 1.6,
  cloudAmount: 0.9,

  baseColor: [0.42, 0.14, 0.72],
  haloColor: [0.66, 0.32, 1.0],
  coreColor: [0.98, 0.94, 1.0],
  baseIntensity: 0.5,
  haloIntensity: 1.3,
  coreIntensity: 1.05,
  coreThreshold: 0.5,

  edgeRadius: 0.72,
  edgeSoftness: 1.06,
};

export function elapsedSeconds(tMs) {
  return (tMs > 0 ? tMs : 0) * 0.001;
}

const VERT = `#version 300 es
layout(location = 0) in vec2 a_pos;
void main() { gl_Position = vec4(a_pos, 0.0, 1.0); }
`;

const FRAG = `#version 300 es
precision highp float;
out vec4 o_color;
uniform vec2 u_res;
uniform vec2 u_bodyOffset;
uniform float u_time;

uniform float u_seedSpeed, u_seedDrift, u_warpSpeed, u_warpAmount;
uniform vec2 u_cellScale;
uniform float u_boltWidth, u_boltSharp, u_boltVary;
uniform float u_branchStr, u_branchScale, u_branchSharp;
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

export function initGL(canvas, config = {}, layout, outerConfig) {
  const gl = canvas.getContext("webgl2", {
    alpha: true,
    premultipliedAlpha: true,
    antialias: true,
  });
  if (!gl) throw new Error("webgl2 unavailable");

  const link = (fragSrc) => {
    const program = gl.createProgram();
    gl.attachShader(program, compile(gl, gl.VERTEX_SHADER, VERT));
    gl.attachShader(program, compile(gl, gl.FRAGMENT_SHADER, fragSrc));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error(`program link: ${gl.getProgramInfoLog(program)}`);
    }
    return program;
  };

  const program = link(FRAG);
  const outerProgram = link(OUTER_FRAG);

  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, 3, -1, -1, 3]),
    gl.STATIC_DRAW
  );
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

  const u = {};
  for (const name of UNIFORM_NAMES) u[name] = gl.getUniformLocation(program, name);
  const ou = {};
  for (const name of OUTER_UNIFORM_NAMES) ou[name] = gl.getUniformLocation(outerProgram, name);

  const cfg = config.timeScale !== undefined ? config : { ...PLASMA_CONFIG, ...config };
  const outerCfg = outerConfig ?? { ...OUTER_CONFIG };
  if (typeof window !== "undefined") {
    window.__analysePlasmaConfig = cfg;
    window.__analyseOuterConfig = outerCfg;
  }

  const w = canvas.width;
  const h = canvas.height;
  const body = {
    offset: layout?.bodyOffset ?? [0, 0],
    size: layout?.bodySize ?? [w, h],
  };
  const rect =
    layout?.rect ?? {
      center: [w / 2, h / 2],
      half: [w / 2, h / 2],
      radius: Math.min(w, h) * 0.1,
    };

  return { gl, program, u, cfg, outerProgram, ou, outerCfg, body, rect, w, h };
}

export function paintGLFrame(assets, tMs) {
  if (!assets) return;
  const { gl, program, u, cfg, outerProgram, ou, outerCfg, body, rect, w, h } = assets;
  gl.viewport(0, 0, w, h);
  gl.clearColor(0, 0, 0, 0);
  gl.clear(gl.COLOR_BUFFER_BIT);

  gl.enable(gl.BLEND);
  gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

  const timeSec = elapsedSeconds(tMs);
  const raw = Math.max(0, Math.min(1, tMs / outerCfg.formationMs));
  const ease = EASINGS[outerCfg.easing] || EASINGS.linear;
  const reveal = ease(raw);

  gl.useProgram(program);
  gl.uniform2f(u.u_res, body.size[0], body.size[1]);
  gl.uniform2f(u.u_bodyOffset, body.offset[0], body.offset[1]);
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
  gl.uniform1f(u.u_nodeSize, cfg.nodeSize);
  gl.uniform1f(u.u_nodeSharp, cfg.nodeSharp);
  gl.uniform1f(u.u_nodeInt, cfg.nodeIntensity);
  gl.uniform1f(u.u_cloudScale, cfg.cloudScale);
  gl.uniform1f(u.u_cloudAmount, cfg.cloudAmount);
  gl.uniform3fv(u.u_baseColor, cfg.baseColor);
  gl.uniform3fv(u.u_haloColor, cfg.haloColor);
  gl.uniform3fv(u.u_coreColor, cfg.coreColor);
  gl.uniform1f(u.u_baseInt, cfg.baseIntensity);
  gl.uniform1f(u.u_haloInt, cfg.haloIntensity);
  gl.uniform1f(u.u_coreInt, cfg.coreIntensity);
  gl.uniform1f(u.u_coreThresh, cfg.coreThreshold);
  gl.uniform1f(u.u_edgeR, cfg.edgeRadius);
  gl.uniform1f(u.u_edgeSoft, cfg.edgeSoftness);
  gl.uniform1f(u.u_opacity, reveal);
  gl.drawArrays(gl.TRIANGLES, 0, 3);

  gl.useProgram(outerProgram);
  applyOuterUniforms(gl, ou, outerCfg, { timeSec, reveal, w, h, rect });
  gl.drawArrays(gl.TRIANGLES, 0, 3);
}
