import {
  bindFullscreenTriangle,
  bindUniformLocations,
  createWebGL2Context,
  linkProgram,
} from "../analyse/gl/context.js";
import { MAX_PATHS, MAX_POINTS_PER_PATH } from "./lichtenbergTree.js";
import { FRAG, UNIFORM_NAMES, VERT } from "./lichtenbergShader.js";

function createDataTexture(gl) {
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return tex;
}

export function createLichtenbergRenderer(canvas, layout) {
  const gl = createWebGL2Context(canvas);
  const program = linkProgram(gl, VERT, FRAG);
  bindFullscreenTriangle(gl);

  gl.enable(gl.BLEND);
  gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

  const u = bindUniformLocations(gl, program, UNIFORM_NAMES);
  const pointTex = createDataTexture(gl);
  const countTex = createDataTexture(gl);

  return { gl, program, u, pointTex, countTex, layout, numPaths: 0 };
}

/** Upload a generated { paths: {x,y,w}[][] } network — call once per regenerate. */
export function setNetwork(renderer, network) {
  const { gl, pointTex, countTex } = renderer;
  const { paths } = network;

  const pointData = new Float32Array(MAX_POINTS_PER_PATH * MAX_PATHS * 4);
  const countData = new Float32Array(MAX_PATHS * 4);

  for (let p = 0; p < Math.min(paths.length, MAX_PATHS); p += 1) {
    const pts = paths[p];
    countData[p * 4] = pts.length / MAX_POINTS_PER_PATH;
    for (let i = 0; i < MAX_POINTS_PER_PATH; i += 1) {
      const pt = pts[Math.min(i, pts.length - 1)];
      const idx = (p * MAX_POINTS_PER_PATH + i) * 4;
      pointData[idx] = pt.x;
      pointData[idx + 1] = pt.y;
      pointData[idx + 2] = pt.w;
      pointData[idx + 3] = 1;
    }
  }

  gl.bindTexture(gl.TEXTURE_2D, pointTex);
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

  gl.bindTexture(gl.TEXTURE_2D, countTex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, MAX_PATHS, 1, 0, gl.RGBA, gl.FLOAT, countData);

  renderer.numPaths = Math.min(paths.length, MAX_PATHS);
}

export function paintLichtenberg(renderer, style = {}) {
  const { gl, program, u, pointTex, countTex, layout, numPaths } = renderer;
  const { w, h, body, rect } = layout;
  const {
    coreSigmaMul = 0.55,
    glowSigmaMul = 2.2,
    outerSigmaMul = 5.5,
    coreAlpha = 1.1,
    glowAlpha = 0.9,
    outerAlpha = 0.4,
    coreColor = [1, 1, 1],
    glowColor = [0.75, 0.92, 1.0],
    outerColor = [0.35, 0.65, 1.0],
    edgeColor = [1.0, 0.1, 0.7],
    edgeStart = 0.05,
    edgePow = 1.0,
    edgeMix = 1.0,
    ambientColor = [0.45, 0.75, 0.95],
    ambientAlpha = 0.12,
  } = style;

  gl.viewport(0, 0, w, h);
  gl.clearColor(0, 0, 0, 0);
  gl.clear(gl.COLOR_BUFFER_BIT);

  gl.useProgram(program);
  gl.uniform2f(u.u_res, body.size[0], body.size[1]);
  gl.uniform2f(u.u_bodyOffset, body.offset[0], body.offset[1]);
  gl.uniform1f(u.u_radius, rect.radius);
  gl.uniform1i(u.u_numPaths, numPaths);

  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, pointTex);
  gl.uniform1i(u.u_pointTex, 0);
  gl.activeTexture(gl.TEXTURE1);
  gl.bindTexture(gl.TEXTURE_2D, countTex);
  gl.uniform1i(u.u_countTex, 1);

  gl.uniform1f(u.u_coreSigmaMul, coreSigmaMul);
  gl.uniform1f(u.u_glowSigmaMul, glowSigmaMul);
  gl.uniform1f(u.u_outerSigmaMul, outerSigmaMul);
  gl.uniform1f(u.u_coreAlpha, coreAlpha);
  gl.uniform1f(u.u_glowAlpha, glowAlpha);
  gl.uniform1f(u.u_outerAlpha, outerAlpha);
  gl.uniform3fv(u.u_coreColor, coreColor);
  gl.uniform3fv(u.u_glowColor, glowColor);
  gl.uniform3fv(u.u_outerColor, outerColor);
  gl.uniform3fv(u.u_edgeColor, edgeColor);
  gl.uniform1f(u.u_edgeStart, edgeStart);
  gl.uniform1f(u.u_edgePow, edgePow);
  gl.uniform1f(u.u_edgeMix, edgeMix);
  gl.uniform3fv(u.u_ambientColor, ambientColor);
  gl.uniform1f(u.u_ambientAlpha, ambientAlpha);

  gl.drawArrays(gl.TRIANGLES, 0, 3);
}
