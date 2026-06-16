import {
  MAX_PATHS,
  MAX_POINTS_PER_PATH,
  applyStrikeTimingsToTree,
  computePathReveals,
  generateBoltTree,
} from "./generateBoltPath.js";
import { PLASMA_BOLT_STYLE, SVG_REF_SIZE } from "./plasmaBoltStyle.js";
import {
  DEFAULT_STRIKE_TIMING,
  resolveThunderParams,
  strikeTimingChanged,
} from "./thunderConfig.js";

/** Betspot frame gradient (betspot-frame.svg). */
export const THUNDER_COLORS = {
  bgTop: [54 / 255, 235 / 255, 242 / 255],
  bgBottom: [0 / 255, 162 / 255, 255 / 255],
  glowOuter: PLASMA_BOLT_STYLE.outer,
  glowMid: PLASMA_BOLT_STYLE.glow,
  glowCore: PLASMA_BOLT_STYLE.core,
};

const VERT = `#version 300 es
in vec2 a_pos;
void main() {
  gl_Position = vec4(a_pos, 0.0, 1.0);
}
`;

const FRAG = `#version 300 es
precision highp float;

uniform vec2 u_resolution;
uniform int u_numPaths;
uniform sampler2D u_pointTex;
uniform sampler2D u_countTex;
uniform sampler2D u_revealTex;
uniform float u_time;
uniform float u_strikeActive;
uniform float u_coreFalloff;
uniform float u_glowSigma;
uniform float u_outerSigma;
uniform float u_outerAlpha;
uniform float u_glowAlpha;
uniform float u_coreAlpha;
uniform float u_layerOpacity;

out vec4 out_FragColor;

float distToSeg(vec2 p, vec2 a, vec2 b) {
  vec2 ab = b - a;
  float len2 = dot(ab, ab);
  if (len2 < 1e-6) return length(p - a);
  float t = clamp(dot(p - a, ab) / len2, 0.0, 1.0);
  return length(p - a - ab * t);
}

vec3 readPointData(int pathIdx, int ptIdx) {
  float u = (float(ptIdx) + 0.5) / float(${MAX_POINTS_PER_PATH});
  float v = (float(pathIdx) + 0.5) / float(${MAX_PATHS});
  return texture(u_pointTex, vec2(u, v)).rgb;
}

vec2 readPoint(int pathIdx, int ptIdx) {
  vec3 data = readPointData(pathIdx, ptIdx);
  return data.xy * u_resolution;
}

float readCumRatio(int pathIdx, int ptIdx) {
  return readPointData(pathIdx, ptIdx).z;
}

int readPathPointCount(int pathIdx) {
  float u = (float(pathIdx) + 0.5) / float(${MAX_PATHS});
  return int(texture(u_countTex, vec2(u, 0.5)).r * float(${MAX_POINTS_PER_PATH}) + 0.5);
}

float readPathReveal(int pathIdx) {
  float u = (float(pathIdx) + 0.5) / float(${MAX_PATHS});
  return texture(u_revealTex, vec2(u, 0.5)).r;
}

float boltDistance(vec2 p) {
  float d = 1e9;

  for (int path = 0; path < ${MAX_PATHS}; path++) {
    if (path >= u_numPaths) break;

    int ptCount = readPathPointCount(path);
    int segCount = ptCount - 1;
    float pathReveal = u_strikeActive > 0.5 ? readPathReveal(path) : 1.0;
    if (pathReveal <= 0.0) continue;

    for (int i = 0; i < ${MAX_POINTS_PER_PATH - 1}; i++) {
      if (i >= segCount) break;

      vec2 a = readPoint(path, i);
      vec2 b = readPoint(path, i + 1);
      float cr0 = readCumRatio(path, i);
      float cr1 = readCumRatio(path, i + 1);

      if (u_strikeActive > 0.5) {
        if (cr0 >= pathReveal) continue;
        if (cr1 <= pathReveal) {
          d = min(d, distToSeg(p, a, b));
        } else {
          float t = (pathReveal - cr0) / max(cr1 - cr0, 1e-5);
          vec2 tip = mix(a, b, clamp(t, 0.0, 1.0));
          d = min(d, distToSeg(p, a, tip));
        }
      } else {
        d = min(d, distToSeg(p, a, b));
      }
    }
  }

  return d;
}

vec3 betspotBackground(vec2 uv) {
  vec3 top = vec3(${THUNDER_COLORS.bgTop.join(", ")});
  vec3 bottom = vec3(${THUNDER_COLORS.bgBottom.join(", ")});
  float t = clamp(uv.y * 0.85 + 0.08, 0.0, 1.0);
  return mix(top, bottom, t);
}

vec3 screenBlend(vec3 base, vec3 layer) {
  return 1.0 - (1.0 - base) * (1.0 - layer);
}

void main() {
  vec2 frag = gl_FragCoord.xy;
  vec2 uv = frag / u_resolution;

  vec3 bg = betspotBackground(uv);
  float d = boltDistance(frag);

  float flicker = 0.97 + 0.03 * sin(u_time * 14.0 + frag.y * 0.04);

  float core = exp(-d / u_coreFalloff) * u_coreAlpha * flicker;
  float glow = exp(-(d * d) / (2.0 * u_glowSigma * u_glowSigma)) * u_glowAlpha;
  float outer = exp(-(d * d) / (2.0 * u_outerSigma * u_outerSigma)) * u_outerAlpha;

  vec3 bolt = vec3(0.0);
  bolt += vec3(${THUNDER_COLORS.glowOuter.join(", ")}) * outer;
  bolt += vec3(${THUNDER_COLORS.glowMid.join(", ")}) * glow;
  bolt += vec3(${THUNDER_COLORS.glowCore.join(", ")}) * core;
  bolt *= u_layerOpacity;

  vec3 col = screenBlend(bg, bolt);
  out_FragColor = vec4(min(col, vec3(1.0)), 1.0);
}
`;

function compileShader(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(`Shader compile failed: ${log}`);
  }
  return shader;
}

function createProgram(gl, vertSrc, fragSrc) {
  const vert = compileShader(gl, gl.VERTEX_SHADER, vertSrc);
  const frag = compileShader(gl, gl.FRAGMENT_SHADER, fragSrc);
  const program = gl.createProgram();
  gl.attachShader(program, vert);
  gl.attachShader(program, frag);
  gl.linkProgram(program);
  gl.deleteShader(vert);
  gl.deleteShader(frag);

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(program);
    gl.deleteProgram(program);
    throw new Error(`Program link failed: ${log}`);
  }
  return program;
}

function fillPointData(tree, width, height, pointData) {
  for (let path = 0; path < MAX_PATHS; path += 1) {
    const pts = tree.paths[path];
    const count = tree.pointCounts[path] ?? 0;
    const meta = tree.pathMeta[path];
    if (!pts || count === 0) continue;

    for (let i = 0; i < MAX_POINTS_PER_PATH; i += 1) {
      const p = pts[i] ?? pts[pts.length - 1];
      const cumRatio = meta?.cumRatios?.[Math.min(i, meta.cumRatios.length - 1)] ?? 0;
      const idx = (path * MAX_POINTS_PER_PATH + i) * 4;
      pointData[idx] = p.x / width;
      pointData[idx + 1] = p.y / height;
      pointData[idx + 2] = cumRatio;
      pointData[idx + 3] = 1;
    }
  }
}

function uploadPathTextures(gl, tree, width, height) {
  const pointData = new Float32Array(MAX_POINTS_PER_PATH * MAX_PATHS * 4);
  const countData = new Float32Array(MAX_PATHS * 4);

  for (let path = 0; path < MAX_PATHS; path += 1) {
    const count = tree.pointCounts[path] ?? 0;
    countData[path * 4] = count > 0 ? count / MAX_POINTS_PER_PATH : 0;
  }

  fillPointData(tree, width, height, pointData);

  const pointTex = gl.createTexture();
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, pointTex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D(
    gl.TEXTURE_2D,
    0,
    gl.RGBA32F,
    MAX_POINTS_PER_PATH,
    MAX_PATHS,
    0,
    gl.RGBA,
    gl.FLOAT,
    pointData
  );
  if (gl.getError() !== gl.NO_ERROR) {
    const bytes = new Uint8Array(MAX_POINTS_PER_PATH * MAX_PATHS * 4);
    for (let i = 0; i < pointData.length; i += 4) {
      bytes[i] = Math.round(pointData[i] * 255);
      bytes[i + 1] = Math.round(pointData[i + 1] * 255);
      bytes[i + 2] = Math.round(pointData[i + 2] * 255);
      bytes[i + 3] = 255;
    }
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      MAX_POINTS_PER_PATH,
      MAX_PATHS,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      bytes
    );
  }

  const countTex = gl.createTexture();
  gl.activeTexture(gl.TEXTURE1);
  gl.bindTexture(gl.TEXTURE_2D, countTex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D(
    gl.TEXTURE_2D,
    0,
    gl.RGBA32F,
    MAX_PATHS,
    1,
    0,
    gl.RGBA,
    gl.FLOAT,
    countData
  );

  const revealTex = gl.createTexture();
  gl.activeTexture(gl.TEXTURE2);
  gl.bindTexture(gl.TEXTURE_2D, revealTex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  const revealData = new Float32Array(MAX_PATHS * 4);
  for (let i = 0; i < MAX_PATHS; i += 1) revealData[i * 4] = 1;
  gl.texImage2D(
    gl.TEXTURE_2D,
    0,
    gl.RGBA32F,
    MAX_PATHS,
    1,
    0,
    gl.RGBA,
    gl.FLOAT,
    revealData
  );

  return { pointTex, countTex, revealTex, numPaths: tree.paths.length };
}

function applyThicknessUniforms(gl, uniforms, thickness, canvasWidth) {
  const scale = canvasWidth / SVG_REF_SIZE;
  const t = Math.max(0.2, thickness);
  const style = PLASMA_BOLT_STYLE;

  gl.uniform1f(uniforms.uCoreFalloff, style.coreFalloff * scale * t);
  gl.uniform1f(uniforms.uGlowSigma, style.glowSigma * scale * t);
  gl.uniform1f(uniforms.uOuterSigma, style.outerSigma * scale * t);
}

function uploadTree(gl, textures, tree, width, height) {
  const countData = new Float32Array(MAX_PATHS * 4);
  const pointData = new Float32Array(MAX_POINTS_PER_PATH * MAX_PATHS * 4);

  for (let path = 0; path < MAX_PATHS; path += 1) {
    const count = tree.pointCounts[path] ?? 0;
    countData[path * 4] = count > 0 ? count / MAX_POINTS_PER_PATH : 0;
  }

  fillPointData(tree, width, height, pointData);

  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, textures.pointTex);
  gl.texSubImage2D(
    gl.TEXTURE_2D,
    0,
    0,
    0,
    MAX_POINTS_PER_PATH,
    MAX_PATHS,
    gl.RGBA,
    gl.FLOAT,
    pointData
  );

  gl.activeTexture(gl.TEXTURE1);
  gl.bindTexture(gl.TEXTURE_2D, textures.countTex);
  gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, MAX_PATHS, 1, gl.RGBA, gl.FLOAT, countData);

  return tree.paths.length;
}

function uploadRevealTex(gl, revealTex, reveals) {
  const revealData = new Float32Array(MAX_PATHS * 4);
  for (let i = 0; i < MAX_PATHS; i += 1) {
    revealData[i * 4] = reveals[i] ?? 0;
  }
  gl.activeTexture(gl.TEXTURE2);
  gl.bindTexture(gl.TEXTURE_2D, revealTex);
  gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, MAX_PATHS, 1, gl.RGBA, gl.FLOAT, revealData);
}

function easeOutCubic(t) {
  const x = Math.max(0, Math.min(1, t));
  return 1 - (1 - x) ** 3;
}

/**
 * @param {HTMLCanvasElement} canvas
 * @param {{ thickness?: number, branchDensity?: number, branches?: boolean, seed?: number }} params
 */
export function createThunderRenderer(canvas, params = {}) {
  const gl = canvas.getContext("webgl2", {
    alpha: false,
    antialias: true,
    premultipliedAlpha: false,
  });

  if (!gl) {
    throw new Error("WebGL2 is not available in this browser.");
  }

  const width = canvas.width || 500;
  const height = canvas.height || 500;
  canvas.width = width;
  canvas.height = height;

  let currentParams = resolveThunderParams(params);

  let tree = generateBoltTree(width, height, currentParams);
  const { pointTex, countTex, revealTex } = uploadPathTextures(
    gl,
    tree,
    width,
    height
  );

  const program = createProgram(gl, VERT, FRAG);
  gl.useProgram(program);

  const quad = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, quad);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
    gl.STATIC_DRAW
  );

  const aPos = gl.getAttribLocation(program, "a_pos");
  if (aPos < 0) throw new Error("Vertex attribute a_pos not found.");
  gl.enableVertexAttribArray(aPos);
  gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

  const uniforms = {
    uResolution: gl.getUniformLocation(program, "u_resolution"),
    uNumPaths: gl.getUniformLocation(program, "u_numPaths"),
    uPointTex: gl.getUniformLocation(program, "u_pointTex"),
    uCountTex: gl.getUniformLocation(program, "u_countTex"),
    uRevealTex: gl.getUniformLocation(program, "u_revealTex"),
    uTime: gl.getUniformLocation(program, "u_time"),
    uStrikeActive: gl.getUniformLocation(program, "u_strikeActive"),
    uCoreFalloff: gl.getUniformLocation(program, "u_coreFalloff"),
    uGlowSigma: gl.getUniformLocation(program, "u_glowSigma"),
    uOuterSigma: gl.getUniformLocation(program, "u_outerSigma"),
    uOuterAlpha: gl.getUniformLocation(program, "u_outerAlpha"),
    uGlowAlpha: gl.getUniformLocation(program, "u_glowAlpha"),
    uCoreAlpha: gl.getUniformLocation(program, "u_coreAlpha"),
    uLayerOpacity: gl.getUniformLocation(program, "u_layerOpacity"),
  };

  const style = PLASMA_BOLT_STYLE;

  let strikeActive = false;
  let strikeProgress = 1;
  let strikeAnim = null;

  function strikeDurationMs() {
    return currentParams.strikeTiming?.durationMs ?? DEFAULT_STRIKE_TIMING.durationMs;
  }

  function applyStaticUniforms() {
    gl.useProgram(program);
    gl.uniform1i(uniforms.uPointTex, 0);
    gl.uniform1i(uniforms.uCountTex, 1);
    gl.uniform1i(uniforms.uRevealTex, 2);
    gl.uniform2f(uniforms.uResolution, width, height);
    gl.uniform1f(uniforms.uOuterAlpha, style.outerAlpha);
    gl.uniform1f(uniforms.uGlowAlpha, style.glowAlpha);
    gl.uniform1f(uniforms.uCoreAlpha, style.coreAlpha);
    gl.uniform1f(uniforms.uLayerOpacity, style.layerOpacity);
    applyThicknessUniforms(gl, uniforms, currentParams.thickness, width);
    gl.uniform1i(uniforms.uNumPaths, tree.paths.length);
  }

  function syncRevealUniforms() {
    const reveals = computePathReveals(strikeProgress, tree.pathMeta, tree.paths.length);
    uploadRevealTex(gl, revealTex, reveals);
    gl.uniform1f(uniforms.uStrikeActive, strikeActive ? 1 : 0);
  }

  applyStaticUniforms();
  syncRevealUniforms();
  gl.viewport(0, 0, width, height);
  const [bgR, bgG, bgB] = THUNDER_COLORS.bgBottom;
  gl.clearColor(bgR, bgG, bgB, 1);

  let raf = 0;
  let disposed = false;
  const t0 = performance.now();

  const draw = (now) => {
    if (disposed) return;

    if (strikeAnim) {
      const t = (now - strikeAnim.start) / strikeAnim.duration;
      strikeProgress = easeOutCubic(t);
      if (t >= 1) {
        strikeProgress = 1;
        strikeAnim = null;
        strikeActive = false;
      }
      syncRevealUniforms();
    }

    gl.useProgram(program);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, pointTex);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, countTex);
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, revealTex);
    gl.uniform1f(uniforms.uTime, (now - t0) * 0.001);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    raf = requestAnimationFrame(draw);
  };

  raf = requestAnimationFrame(draw);

  return {
    setParams(next) {
      const prev = currentParams;
      currentParams = resolveThunderParams({ ...currentParams, ...next });

      const regenGeometry =
        currentParams.branches !== prev.branches ||
        currentParams.branchDensity !== prev.branchDensity ||
        currentParams.seed !== prev.seed ||
        currentParams.trunkCount !== prev.trunkCount;

      const regenTiming = strikeTimingChanged(
        currentParams.strikeTiming,
        prev.strikeTiming
      );

      if (regenGeometry) {
        tree = generateBoltTree(width, height, currentParams);
        gl.useProgram(program);
        gl.uniform1i(
          uniforms.uNumPaths,
          uploadTree(gl, { pointTex, countTex }, tree, width, height)
        );
        if (!strikeAnim) {
          strikeActive = false;
          strikeProgress = 1;
          syncRevealUniforms();
        }
      } else if (regenTiming) {
        applyStrikeTimingsToTree(tree, currentParams.strikeTiming);
        if (!strikeAnim) syncRevealUniforms();
      }

      if (currentParams.thickness !== prev.thickness || regenGeometry) {
        gl.useProgram(program);
        applyThicknessUniforms(gl, uniforms, currentParams.thickness, width);
      }
    },
    reshuffle() {
      currentParams.seed = (currentParams.seed + 1) >>> 0;
      tree = generateBoltTree(width, height, currentParams);
      gl.useProgram(program);
      gl.uniform1i(
        uniforms.uNumPaths,
        uploadTree(gl, { pointTex, countTex }, tree, width, height)
      );
      if (!strikeAnim) {
        strikeActive = false;
        strikeProgress = 1;
        syncRevealUniforms();
      }
    },
    playStrike(durationMs = strikeDurationMs()) {
      strikeActive = true;
      strikeProgress = 0;
      syncRevealUniforms();
      strikeAnim = {
        start: performance.now(),
        duration: durationMs,
      };
    },
    destroy() {
      disposed = true;
      cancelAnimationFrame(raf);
      gl.deleteTexture(pointTex);
      gl.deleteTexture(countTex);
      gl.deleteTexture(revealTex);
      gl.deleteBuffer(quad);
      gl.deleteProgram(program);
    },
  };
}

/** @deprecated use createThunderRenderer */
export function initThunderRenderer(canvas, params) {
  const renderer = createThunderRenderer(canvas, params);
  return renderer.destroy;
}
