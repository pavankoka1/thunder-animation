const FULLSCREEN_TRI = new Float32Array([-1, -1, 3, -1, -1, 3]);

export function compileShader(gl, type, src) {
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

export function linkProgram(gl, vertSrc, fragSrc) {
  const program = gl.createProgram();
  gl.attachShader(program, compileShader(gl, gl.VERTEX_SHADER, vertSrc));
  gl.attachShader(program, compileShader(gl, gl.FRAGMENT_SHADER, fragSrc));
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(`program link: ${gl.getProgramInfoLog(program)}`);
  }
  return program;
}

export function bindUniformLocations(gl, program, names) {
  const u = {};
  for (const name of names) u[name] = gl.getUniformLocation(program, name);
  return u;
}

/**
 * Create a 2D texture for a single non-mipmapped RGBA image (LINEAR, clamp to
 * edge). Upload pixels later with uploadImageToTexture once the image loads.
 */
export function createImageTexture(gl) {
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE,
    new Uint8Array([0, 0, 0, 255]));
  return tex;
}

/** Upload an <img>/ImageBitmap/canvas into an existing texture. */
export function uploadImageToTexture(gl, tex, image) {
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
  // Mipmaps → smooth minification of the (larger) traced image into the small
  // body region, killing the rough/aliased sampling. WebGL2 supports NPOT
  // mipmaps, so no power-of-two resize is needed.
  gl.generateMipmap(gl.TEXTURE_2D);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
}

/** Shared fullscreen triangle at attribute location 0. */
export function bindFullscreenTriangle(gl) {
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, FULLSCREEN_TRI, gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
}

export function createWebGL2Context(canvas) {
  const gl = canvas.getContext("webgl2", {
    alpha: true,
    premultipliedAlpha: true,
    antialias: false,
  });
  if (!gl) throw new Error("webgl2 unavailable");
  return gl;
}

/**
 * Try WebGL2 first, fall back to WebGL1 for browsers/devices that don't
 * expose it (older GPU drivers, some software renderers). Callers that use
 * this must ship a GLSL ES 1.00 shader variant for the `isWebGL2: false`
 * case — WebGL1 has no `#version 300 es`, `texture()`, `out vec4`, or
 * array-constructor syntax. Also requires OES_texture_float for any float
 * data texture the caller uploads (checked here, not deferred to a later
 * texImage2D failure).
 */
export function createGLContext(canvas) {
  const contextOptions = { alpha: true, premultipliedAlpha: true, antialias: false };

  const gl2 = canvas.getContext("webgl2", contextOptions);
  if (gl2) return { gl: gl2, isWebGL2: true };

  const gl1 = canvas.getContext("webgl", contextOptions);
  if (!gl1) throw new Error("WebGL unavailable (tried webgl2 and webgl)");
  if (!gl1.getExtension("OES_texture_float")) {
    throw new Error("WebGL1 fallback unavailable: OES_texture_float unsupported");
  }
  return { gl: gl1, isWebGL2: false };
}
