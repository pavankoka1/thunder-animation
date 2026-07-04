/**
 * WebGL2 renderer: draw bolt-field segments as glowing ribbons. Each segment
 * polyline is expanded to a triangle strip (± normal × halfWidth) with a
 * per-vertex "across" coord (-1..1) so the fragment shader can fade to a soft
 * glow. Drawn in 3 additive passes (halo/mid/core widths) and clipped to the
 * grown length. No images.
 */
import { segmentDrawLength } from "./boltField.js";
import { pointAtLength } from "../canvas/lightning/geometry.js";

const VERT = `#version 300 es
in vec2 a_pos; in float a_across; in float a_taper;
uniform vec2 u_res;
out float v_across; out float v_taper;
void main(){
  v_across = a_across; v_taper = a_taper;
  vec2 clip = (a_pos / u_res) * 2.0 - 1.0;
  gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);
}`;

const FRAG = `#version 300 es
precision highp float;
in float v_across; in float v_taper;
out vec4 o;
uniform vec3 u_color; uniform float u_alpha;
void main(){
  float glow = pow(1.0 - clamp(abs(v_across), 0.0, 1.0), 1.8);
  o = vec4(u_color, glow * u_alpha * v_taper);
}`;

function compile(gl, t, src) {
  const s = gl.createShader(t);
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(s);
    gl.deleteShader(s);
    throw new Error(`shader compile: ${log}`);
  }
  return s;
}

/**
 * Expand grown polylines into ribbon triangles. Returns interleaved
 * [x,y,across,taper] floats and the vertex count. `widthFn(depth)` → half-width.
 * Pure (no GL) → unit-testable.
 */
export function ribbonVertices(field, progress, widthFn) {
  const out = [];
  for (const seg of field.segments) {
    const drawLen = segmentDrawLength(seg, progress);
    if (drawLen <= 0.5) continue;
    const pts = [];
    for (let i = 0; i < seg.points.length; i += 1) {
      if (seg.cumLengths[i] <= drawLen) pts.push(seg.points[i]);
      else {
        pts.push(pointAtLength(seg.points, seg.cumLengths, drawLen));
        break;
      }
    }
    if (pts.length < 2) continue;
    const hw = widthFn(seg.depth);
    for (let i = 0; i < pts.length - 1; i += 1) {
      const a = pts[i];
      const b = pts[i + 1];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const len = Math.hypot(dx, dy) || 1;
      const nx = -dy / len;
      const ny = dx / len;
      const tA = 1 - (i / pts.length) * 0.6;
      const tB = 1 - ((i + 1) / pts.length) * 0.6;
      const push = (x, y, ac, tp) => out.push(x, y, ac, tp);
      push(a.x + nx * hw, a.y + ny * hw, 1, tA);
      push(a.x - nx * hw, a.y - ny * hw, -1, tA);
      push(b.x + nx * hw, b.y + ny * hw, 1, tB);
      push(b.x + nx * hw, b.y + ny * hw, 1, tB);
      push(a.x - nx * hw, a.y - ny * hw, -1, tA);
      push(b.x - nx * hw, b.y - ny * hw, -1, tB);
    }
  }
  return { data: new Float32Array(out), count: out.length / 4 };
}

export function initBoltGL(canvas, config) {
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
  const aPos = gl.getAttribLocation(program, "a_pos");
  const aAcross = gl.getAttribLocation(program, "a_across");
  const aTaper = gl.getAttribLocation(program, "a_taper");
  const u = {
    res: gl.getUniformLocation(program, "u_res"),
    color: gl.getUniformLocation(program, "u_color"),
    alpha: gl.getUniformLocation(program, "u_alpha"),
  };
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE); // additive glow
  return { gl, program, buf, aPos, aAcross, aTaper, u, config, w: canvas.width, h: canvas.height };
}

/** Draw the field grown to `progress` in 3 glow passes. */
export function drawBolts(assets, field, progress) {
  const { gl, program, buf, aPos, aAcross, aTaper, u, config, w, h } = assets;
  gl.viewport(0, 0, w, h);
  gl.clearColor(0, 0, 0, 0);
  gl.clear(gl.COLOR_BUFFER_BIT);
  if (!field) return;
  gl.useProgram(program);
  gl.uniform2f(u.res, w, h);
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  const stride = 16;
  gl.enableVertexAttribArray(aPos);
  gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, stride, 0);
  gl.enableVertexAttribArray(aAcross);
  gl.vertexAttribPointer(aAcross, 1, gl.FLOAT, false, stride, 8);
  gl.enableVertexAttribArray(aTaper);
  gl.vertexAttribPointer(aTaper, 1, gl.FLOAT, false, stride, 12);

  const passes = [
    [config.haloWidth, config.haloColor, config.haloAlpha],
    [config.midWidth, config.midColor, config.midAlpha],
    [config.coreWidth, config.coreColor, config.coreAlpha],
  ];
  for (const [width, color, alpha] of passes) {
    const { data, count } = ribbonVertices(field, progress, () => width * 0.5);
    if (!count) continue;
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW);
    gl.uniform3f(u.color, color[0] / 255, color[1] / 255, color[2] / 255);
    gl.uniform1f(u.alpha, alpha);
    gl.drawArrays(gl.TRIANGLES, 0, count);
  }
}
