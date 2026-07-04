/**
 * Procedural WebGL plasma for the analyse betspot — no images.
 *
 * A fullscreen fragment shader generates an electric-voronoi plasma: cell
 * interiors are dark violet, the borders between cells are the bright bolts, and
 * the voronoi seeds drift over time so the bolts continuously re-strike along
 * new paths (each border = one thunder bolt). Domain-warped + fine filaments for
 * organic detail, radially edge-faded, screen-blended over the blue body by CSS.
 */

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

  // cell space + slow organic domain warp
  vec2 p = uv * vec2(6.2, 3.1);
  vec2 w = vec2(fbm(p*0.9 + t*0.03), fbm(p*0.9 + 7.3 - t*0.02));
  p += (w - 0.5) * 1.5;

  // voronoi F1/F2 with drifting seeds → borders (bolts) re-route over time
  vec2 g = floor(p), f = p - g;
  float F1 = 9.0, F2 = 9.0;
  for (int y = -1; y <= 1; y++){
    for (int x = -1; x <= 1; x++){
      vec2 off = vec2(float(x), float(y));
      vec2 seed = hash2(g + off);
      vec2 pos = off + 0.5 + 0.45 * sin(t*0.45 + 6.2831*seed);
      float d = length(pos - f);
      if (d < F1) { F2 = F1; F1 = d; } else if (d < F2) { F2 = d; }
    }
  }

  float edge = F2 - F1;                                  // small near borders
  float bolt = pow(clamp(1.0 - edge/0.18, 0.0, 1.0), 1.5);
  // fine secondary filaments so cells aren't empty
  float fil = fbm(p*3.1 + t*0.05);
  bolt = max(bolt, smoothstep(0.62, 0.96, fil) * bolt * 0.9);

  vec3 base = vec3(0.30, 0.10, 0.55) * 0.32;
  vec3 halo = vec3(0.62, 0.32, 0.98) * bolt * 0.95;
  vec3 core = vec3(1.0, 0.96, 1.0) * pow(clamp((bolt - 0.5)/0.5, 0.0, 1.0), 2.0);
  vec3 col = base + halo + core;

  // radial edge fade
  float dist = distance(uv, vec2(0.5)) / 0.72;
  float vig = clamp(1.06 - dist, 0.0, 1.0);
  vig *= vig;

  float a = clamp(max(max(col.r, col.g), col.b), 0.0, 1.0) * vig;
  o_color = vec4(col * vig, a);                          // premultiplied
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

/**
 * Create the WebGL2 program + fullscreen quad on `canvas`. Throws if WebGL2 or
 * compilation is unavailable (caller falls back to leaving the energy empty).
 */
export function initGL(canvas) {
  const gl = canvas.getContext("webgl2", {
    alpha: true,
    premultipliedAlpha: true,
    antialias: true,
  });
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
  // one big triangle covering the viewport
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(program, "a_pos");
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

  gl.useProgram(program);
  return {
    gl,
    program,
    uRes: gl.getUniformLocation(program, "u_res"),
    uTime: gl.getUniformLocation(program, "u_time"),
    w: canvas.width,
    h: canvas.height,
  };
}

/** Draw one frame at time tMs. */
export function paintGLFrame(assets, tMs) {
  if (!assets) return;
  const { gl, uRes, uTime, w, h } = assets;
  gl.viewport(0, 0, w, h);
  gl.clearColor(0, 0, 0, 0);
  gl.clear(gl.COLOR_BUFFER_BIT);
  gl.uniform2f(uRes, w, h);
  gl.uniform1f(uTime, elapsedSeconds(tMs));
  gl.drawArrays(gl.TRIANGLES, 0, 3);
}
