import { elapsedSeconds, formationProgress } from "../utils/time.js";
import {
  bindFullscreenTriangle,
  bindUniformLocations,
  createWebGL2Context,
  linkProgram,
} from "./context.js";
import {
  FULLSCREEN_VERT,
  INNER_FRAG,
  INNER_UNIFORM_NAMES,
  OUTER_FRAG,
  OUTER_UNIFORM_NAMES,
} from "./shaders.js";
import { applyInnerUniforms, applyOuterUniforms } from "./uniforms.js";

/**
 * Create a dual-pass WebGL renderer (inner plasma + outer border).
 *
 * Web Workers are not used: fragment shaders run on the GPU via WebGL2.
 * OffscreenCanvas in a worker would add transfer complexity with no gain for
 * two fullscreen passes at this resolution (~534×318).
 */
export function createRenderer(canvas, { innerConfig, outerConfig, layout }) {
  const gl = createWebGL2Context(canvas);

  const innerProgram = linkProgram(gl, FULLSCREEN_VERT, INNER_FRAG);
  const outerProgram = linkProgram(gl, FULLSCREEN_VERT, OUTER_FRAG);
  bindFullscreenTriangle(gl);

  gl.enable(gl.BLEND);
  gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

  const innerU = bindUniformLocations(gl, innerProgram, INNER_UNIFORM_NAMES);
  const outerU = bindUniformLocations(gl, outerProgram, OUTER_UNIFORM_NAMES);

  const { w, h, body, rect } = layout;

  return {
    gl,
    innerProgram,
    outerProgram,
    innerU,
    outerU,
    innerConfig,
    outerConfig,
    body,
    rect,
    w,
    h,
  };
}

export function paintFrame(renderer, tMs) {
  if (!renderer) return;

  const {
    gl,
    innerProgram,
    outerProgram,
    innerU,
    outerU,
    innerConfig,
    outerConfig,
    body,
    rect,
    w,
    h,
  } = renderer;

  // Matches the reference clip: outer border crawl starts at t0 (parallel
  // with the CSS scale-settle in AnalyseBetspot.jsx), inner energy fades in
  // ~90ms later once the scale has settled. No vibration/shake.
  const innerReveal = formationProgress(
    tMs - (innerConfig.delayMs ?? 0),
    innerConfig.formationMs,
    innerConfig.easing
  );
  const outerReveal = formationProgress(
    tMs - (outerConfig.delayMs ?? 0),
    outerConfig.formationMs,
    outerConfig.easing
  );
  const timeSec = elapsedSeconds(tMs);

  gl.viewport(0, 0, w, h);
  gl.clearColor(0, 0, 0, 0);
  gl.clear(gl.COLOR_BUFFER_BIT);

  gl.useProgram(innerProgram);
  applyInnerUniforms(gl, innerU, innerConfig, { body, reveal: innerReveal, tMs });
  gl.drawArrays(gl.TRIANGLES, 0, 3);

  gl.useProgram(outerProgram);
  applyOuterUniforms(gl, outerU, outerConfig, { timeSec, reveal: outerReveal, w, h, rect });
  gl.drawArrays(gl.TRIANGLES, 0, 3);
}

/** @deprecated use createRenderer */
export const initGL = createRenderer;

/** @deprecated use paintFrame */
export const paintGLFrame = paintFrame;
