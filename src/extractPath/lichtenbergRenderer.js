import {
  bindFullscreenTriangle,
  bindUniformLocations,
  compileShader,
  createGLContext,
  linkProgram,
} from "../analyse/gl/context.js";
import { OUTER_FRAG, OUTER_FRAG_GL1, OUTER_UNIFORM_NAMES } from "../analyse/gl/shaders.js";
import { applyOuterUniforms } from "../analyse/gl/uniforms.js";
import { MAX_PATHS, MAX_POINTS_PER_PATH } from "./lichtenbergTree.js";
import {
  COMPOSITE_FRAG,
  COMPOSITE_FRAG_GL1,
  COMPOSITE_UNIFORM_NAMES,
  FRAG,
  FRAG_GL1,
  UNIFORM_NAMES,
  VERT,
  VERT_GL1,
} from "./lichtenbergShader.js";

function createDataTexture(gl) {
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return tex;
}

// The bake target is sampled (not read pixel-for-pixel), so LINEAR filtering
// keeps the composite pass's radial-pulse/shimmer resample smooth.
function createBakeTarget(gl, w, h) {
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);

  const fbo = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  return { fbo, tex };
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
  const compositeProgram = isWebGL2
    ? linkProgram(gl, VERT, COMPOSITE_FRAG)
    : linkProgramGL1(gl, VERT_GL1, COMPOSITE_FRAG_GL1);
  const outerProgram = isWebGL2
    ? linkProgram(gl, VERT, OUTER_FRAG)
    : linkProgramGL1(gl, VERT_GL1, OUTER_FRAG_GL1);
  bindFullscreenTriangle(gl);

  gl.enable(gl.BLEND);
  gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

  const u = bindUniformLocations(gl, program, UNIFORM_NAMES);
  const compositeU = bindUniformLocations(gl, compositeProgram, COMPOSITE_UNIFORM_NAMES);
  const outerU = bindUniformLocations(gl, outerProgram, OUTER_UNIFORM_NAMES);
  const pointTex = createDataTexture(gl);
  const countTex = createDataTexture(gl);
  const bake = createBakeTarget(gl, layout.w, layout.h);

  return {
    gl,
    program,
    u,
    compositeProgram,
    compositeU,
    outerProgram,
    outerU,
    pointTex,
    countTex,
    bake,
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
  const { gl, program, compositeProgram, outerProgram, pointTex, countTex, bake } = renderer;
  gl.deleteTexture(pointTex);
  gl.deleteTexture(countTex);
  gl.deleteTexture(bake.tex);
  gl.deleteFramebuffer(bake.fbo);
  gl.deleteProgram(program);
  gl.deleteProgram(compositeProgram);
  gl.deleteProgram(outerProgram);
}

/** Upload a generated { paths: {x,y,w}[][] } network — call once per regenerate. */
export function setNetwork(renderer, network) {
  const { gl, pointTex, countTex, isWebGL2 } = renderer;
  const { paths } = network;
  // WebGL1 (OES_texture_float) requires internalformat === format (RGBA);
  // WebGL2 uses the sized RGBA32F internalformat instead.
  const internalFormat = isWebGL2 ? gl.RGBA32F : gl.RGBA;

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
    internalFormat,
    MAX_POINTS_PER_PATH,
    MAX_PATHS,
    0,
    gl.RGBA,
    gl.FLOAT,
    pointData
  );

  gl.bindTexture(gl.TEXTURE_2D, countTex);
  gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, MAX_PATHS, 1, 0, gl.RGBA, gl.FLOAT, countData);

  renderer.numPaths = Math.min(paths.length, MAX_PATHS);
}

/**
 * Bake the lichtenberg network into an offscreen texture. This is the
 * expensive O(MAX_PATHS * MAX_POINTS_PER_PATH) per-fragment pass — call it
 * once whenever the network or style params change, NOT once per animation
 * frame (see paintComposite for the cheap per-frame pass that reuses this
 * bake with time-based brightness modulation).
 */
export function paintLichtenberg(renderer, style = {}) {
  const { gl, program, u, pointTex, countTex, layout, numPaths, bake } = renderer;
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

  gl.bindFramebuffer(gl.FRAMEBUFFER, bake.fbo);
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

  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
}

/**
 * Cheap per-frame pass: draws the baked network to the visible canvas with
 * time-based brightness modulation (shimmer + radial pulse from the body's
 * centre). Safe to call every animation frame.
 */
export function paintComposite(renderer, motion = {}) {
  const { gl, compositeProgram, compositeU, bake, layout } = renderer;
  const { w, h, body } = layout;
  const {
    time = 0,
    shimmerAmt = 0.06,
    shimmerFreq = 0.12,
    pulseAmt = 0.1,
    pulseFreq = 8.0,
    pulseSpeed = 0.9,
  } = motion;

  const bodyCenterUv = [
    (body.offset[0] + body.size[0] * 0.5) / w,
    (body.offset[1] + body.size[1] * 0.5) / h,
  ];

  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.viewport(0, 0, w, h);
  gl.clearColor(0, 0, 0, 0);
  gl.clear(gl.COLOR_BUFFER_BIT);

  gl.useProgram(compositeProgram);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, bake.tex);
  gl.uniform1i(compositeU.u_bakeTex, 0);
  gl.uniform2f(compositeU.u_res, w, h);
  gl.uniform1f(compositeU.u_time, time);
  gl.uniform1f(compositeU.u_shimmerAmt, shimmerAmt);
  gl.uniform1f(compositeU.u_shimmerFreq, shimmerFreq);
  gl.uniform1f(compositeU.u_pulseAmt, pulseAmt);
  gl.uniform1f(compositeU.u_pulseFreq, pulseFreq);
  gl.uniform1f(compositeU.u_pulseSpeed, pulseSpeed);
  gl.uniform2f(compositeU.u_bodyCenterUv, bodyCenterUv[0], bodyCenterUv[1]);
  gl.uniform1f(compositeU.u_aspect, w / h);

  gl.drawArrays(gl.TRIANGLES, 0, 3);
}

/**
 * Neon outer-border pass, reusing /analyse's OUTER_FRAG shader/technique
 * (see src/analyse/gl/shaders.js) so the violet/magenta ring matches
 * reference.png exactly. Draws on top of whatever paintComposite already put
 * on the canvas — call this after paintComposite, every animation frame.
 */
export function paintOuterBorder(renderer, cfg, frame) {
  const { gl, outerProgram, outerU } = renderer;
  gl.useProgram(outerProgram);
  applyOuterUniforms(gl, outerU, cfg, frame);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
}
