import {
  bindFullscreenTriangle,
  bindUniformLocations,
  compileShader,
  createGLContext,
  linkProgram,
} from "../analyse/gl/context.js";
import {
  OUTER_FRAG,
  OUTER_FRAG_GL1,
  OUTER_UNIFORM_NAMES,
} from "../analyse/gl/shaders.js";
import { applyOuterUniforms } from "../analyse/gl/uniforms.js";
import { MAX_PATHS, MAX_POINTS_PER_PATH } from "./lichtenbergTree.js";
import { FRAG, FRAG_GL1, UNIFORM_NAMES, VERT, VERT_GL1 } from "./lichtenbergShader.js";
import { buildSegmentGrid } from "./spatialGrid.js";

function createDataTexture(gl) {
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return tex;
}

// WebGL1 has no `layout(location = 0) in` — the attribute location has to be
// bound explicitly before linking so bindFullscreenTriangle's hardcoded
// location-0 enableVertexAttribArray/vertexAttribPointer calls still line up.
function linkProgramGL1(gl, vertSrc, fragSrc) {
  const program = gl.createProgram();
  gl.attachShader(program, compileShader(gl, gl.VERTEX_SHADER, vertSrc));
  gl.attachShader(program, compileShader(gl, gl.FRAGMENT_SHADER, fragSrc));
  gl.bindAttribLocation(program, 0, "a_pos");
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(`program link: ${gl.getProgramInfoLog(program)}`);
  }
  return program;
}

export function createLichtenbergRenderer(canvas, layout) {
  const { gl, isWebGL2 } = createGLContext(canvas);

  const program = isWebGL2
    ? linkProgram(gl, VERT, FRAG)
    : linkProgramGL1(gl, VERT_GL1, FRAG_GL1);
  const outerProgram = isWebGL2
    ? linkProgram(gl, VERT, OUTER_FRAG)
    : linkProgramGL1(gl, VERT_GL1, OUTER_FRAG_GL1);
  bindFullscreenTriangle(gl);

  gl.enable(gl.BLEND);
  gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

  const u = bindUniformLocations(gl, program, UNIFORM_NAMES);
  const outerU = bindUniformLocations(gl, outerProgram, OUTER_UNIFORM_NAMES);
  const pointTex = createDataTexture(gl);
  // Spatial-grid textures (see spatialGrid.js): gridTex holds (offset,count)
  // per cell, segTex the flat (pathIdx,ptIdx) list. Filled in setNetwork.
  const gridTex = createDataTexture(gl);
  const segTex = createDataTexture(gl);

  return {
    gl,
    program,
    u,
    outerProgram,
    outerU,
    pointTex,
    gridTex,
    segTex,
    grid: null,
    layout,
    numPaths: 0,
    isWebGL2,
  };
}

/**
 * Release GPU resources (textures/program) on unmount. Deliberately does NOT
 * call the WEBGL_lose_context extension's loseContext(): React 18
 * StrictMode's dev-mode double-invoke (mount -> cleanup -> mount again)
 * replays this cleanup on the SAME canvas element, and a canvas's context is
 * permanently dead once lost — it can never be recreated on that element, so
 * the second mount would find createGLContext() unable to get a working
 * context back. Deleting resources still frees GPU memory; the context
 * itself is reclaimed normally when the canvas element itself is discarded
 * (real unmount, not StrictMode's simulated one).
 */
export function destroyLichtenbergRenderer(renderer) {
  if (!renderer) return;
  const { gl, program, outerProgram, pointTex, gridTex, segTex } = renderer;
  gl.deleteTexture(pointTex);
  gl.deleteTexture(gridTex);
  gl.deleteTexture(segTex);
  gl.deleteProgram(program);
  gl.deleteProgram(outerProgram);
}

/** Upload a generated { paths: {x,y,w}[][] } network — call once per regenerate. */
export function setNetwork(renderer, network) {
  const { gl, pointTex, gridTex, segTex, isWebGL2 } = renderer;
  const { paths } = network;
  // WebGL1 (OES_texture_float) requires internalformat === format (RGBA);
  // WebGL2 uses the sized RGBA32F internalformat instead.
  const internalFormat = isWebGL2 ? gl.RGBA32F : gl.RGBA;

  const pointData = new Float32Array(MAX_POINTS_PER_PATH * MAX_PATHS * 4);

  for (let p = 0; p < Math.min(paths.length, MAX_PATHS); p += 1) {
    const pts = paths[p];
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
    internalFormat,
    MAX_POINTS_PER_PATH,
    MAX_PATHS,
    0,
    gl.RGBA,
    gl.FLOAT,
    pointData
  );

  // Rebuild + upload the spatial grid the shader searches (see spatialGrid.js).
  // Built from the SAME (already width-scaled/centre-boosted) points, so the
  // registration radius per segment matches the widths the shader renders.
  const grid = buildSegmentGrid(paths);

  gl.bindTexture(gl.TEXTURE_2D, gridTex);
  gl.texImage2D(
    gl.TEXTURE_2D,
    0,
    internalFormat,
    grid.gw,
    grid.gh,
    0,
    gl.RGBA,
    gl.FLOAT,
    grid.cellData
  );

  gl.bindTexture(gl.TEXTURE_2D, segTex);
  gl.texImage2D(
    gl.TEXTURE_2D,
    0,
    internalFormat,
    grid.segTexW,
    grid.segTexH,
    0,
    gl.RGBA,
    gl.FLOAT,
    grid.segData
  );

  renderer.grid = grid;
  renderer.numPaths = Math.min(paths.length, MAX_PATHS);
}

/**
 * Draws the lichtenberg network straight to the visible canvas, re-run every
 * animation frame: u_time/u_swayAmt displace each path's own points (see
 * readPoint() in lichtenbergShader.js) so the paths genuinely move, not just a
 * resampled static image. An earlier version baked this once and faked motion
 * with a cheap post-pass warp — that read as "hovering," not real path
 * movement, so it was dropped.
 *
 * Per-frame affordability comes from the spatial grid (see spatialGrid.js):
 * each fragment tests only the segments in its own grid cell, NOT all ~4700
 * paths. Without it, the brute-force per-fragment loop at 60fps overran the
 * Windows GPU watchdog (TDR) and lost the WebGL context.
 */
export function paintLichtenberg(renderer, style = {}) {
  const { gl, program, u, pointTex, gridTex, segTex, grid, layout } = renderer;
  const { w, h, body, rect } = layout;
  const {
    time = 0,
    swayAmt = 2.5,
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

  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.viewport(0, 0, w, h);
  gl.clearColor(0, 0, 0, 0);
  gl.clear(gl.COLOR_BUFFER_BIT);

  if (!grid) return; // setNetwork hasn't run yet — nothing to draw

  gl.useProgram(program);
  gl.uniform2f(u.u_res, body.size[0], body.size[1]);
  gl.uniform2f(u.u_bodyOffset, body.offset[0], body.offset[1]);
  gl.uniform1f(u.u_radius, rect.radius);
  gl.uniform1f(u.u_time, time);
  gl.uniform1f(u.u_swayAmt, swayAmt);

  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, pointTex);
  gl.uniform1i(u.u_pointTex, 0);
  gl.activeTexture(gl.TEXTURE1);
  gl.bindTexture(gl.TEXTURE_2D, gridTex);
  gl.uniform1i(u.u_gridTex, 1);
  gl.activeTexture(gl.TEXTURE2);
  gl.bindTexture(gl.TEXTURE_2D, segTex);
  gl.uniform1i(u.u_segTex, 2);

  gl.uniform2f(u.u_gridOrigin, grid.originX, grid.originY);
  gl.uniform1f(u.u_cellSize, grid.cell);
  gl.uniform2f(u.u_gridDim, grid.gw, grid.gh);
  gl.uniform2f(u.u_segTexDim, grid.segTexW, grid.segTexH);

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

/**
 * Neon outer-border pass, reusing /analyse's OUTER_FRAG shader/technique
 * (see src/analyse/gl/shaders.js) so the violet/magenta ring matches
 * reference.png exactly. Draws on top of whatever paintLichtenberg already
 * put on the canvas — call this after paintLichtenberg, every frame.
 */
export function paintOuterBorder(renderer, cfg, frame) {
  const { gl, outerProgram, outerU } = renderer;
  gl.useProgram(outerProgram);
  applyOuterUniforms(gl, outerU, cfg, frame);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
}
