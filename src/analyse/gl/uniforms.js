import { elapsedSeconds } from "../utils/time.js";

export function applyInnerUniforms(gl, u, cfg, frame) {
  const { body, reveal, tMs, radius } = frame;
  gl.uniform2f(u.u_res, body.size[0], body.size[1]);
  gl.uniform2f(u.u_bodyOffset, body.offset[0], body.offset[1]);
  gl.uniform1f(u.u_radius, radius ?? 0);
  gl.uniform1f(u.u_time, elapsedSeconds(tMs) * cfg.timeScale);

  // Procedural Voronoi cellular-crack vein field (see shaders.js) — tuned
  // from Python pixel analysis of reference.png / inner-energy.png.
  gl.uniform2fv(u.u_crackScale, cfg.crackScale);
  gl.uniform1f(u.u_crackWidth, cfg.crackWidth);
  gl.uniform1f(u.u_junctionMul, cfg.junctionWidthMul);
  gl.uniform1f(u.u_boltLo, cfg.boltLo);
  gl.uniform1f(u.u_boltHi, cfg.boltHi);
  gl.uniform1f(u.u_nodeLo, cfg.nodeLo);
  gl.uniform1f(u.u_nodeSharp, cfg.nodeSharp);
  gl.uniform1f(u.u_crispLo, cfg.crispLo);
  gl.uniform1f(u.u_crispInt, cfg.crispIntensity);
  gl.uniform1f(u.u_flow, cfg.flow);
  gl.uniform1f(u.u_flowFreq, cfg.flowFreq);
  gl.uniform1f(u.u_flowAmt, cfg.flowAmt);
  gl.uniform1f(u.u_warpSpeed, cfg.warpSpeed);
  gl.uniform1f(u.u_warpAmount, cfg.warpAmount);
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
}

export function applyOuterUniforms(gl, u, cfg, frame) {
  const { timeSec, reveal, w, h, rect } = frame;
  gl.uniform2f(u.u_res, w, h);
  gl.uniform1f(u.u_time, timeSec);
  gl.uniform1f(u.u_reveal, reveal);
  gl.uniform2f(u.u_center, rect.center[0], rect.center[1]);
  gl.uniform2f(u.u_half, rect.half[0], rect.half[1]);
  gl.uniform1f(u.u_radius, rect.radius);
  gl.uniform1f(u.u_coreW, cfg.coreWidth);
  gl.uniform1f(u.u_midW, cfg.midWidth);
  gl.uniform1f(u.u_haloW, cfg.haloWidth);
  gl.uniform1f(u.u_flameOut, cfg.flameOutreach);
  gl.uniform1f(u.u_freqAlong, cfg.freqAlong);
  gl.uniform1f(u.u_freqAcross, cfg.freqAcross);
  gl.uniform1f(u.u_flameScroll, cfg.flameScroll);
  gl.uniform1f(u.u_flicker, cfg.flicker);
  gl.uniform1f(u.u_innerFreq, cfg.innerRaggedFreq);
  gl.uniform1f(u.u_topBias, cfg.topBias);
  gl.uniform3fv(u.u_coreColor, cfg.coreColor);
  gl.uniform3fv(u.u_midColor, cfg.midColor);
  gl.uniform3fv(u.u_haloColor, cfg.haloColor);
  gl.uniform1f(u.u_coreInt, cfg.coreIntensity);
  gl.uniform1f(u.u_midInt, cfg.midIntensity);
  gl.uniform1f(u.u_haloInt, cfg.haloIntensity);
  gl.uniform1f(u.u_tail, cfg.tailLength);
  gl.uniform1f(u.u_headBoost, cfg.headBoost);
  gl.uniform1f(u.u_heartbeat, cfg.heartbeat);
  gl.uniform1f(u.u_lumpAmt, cfg.lumpAmount);
  gl.uniform1f(u.u_lumpWidth, cfg.lumpWidth);
  gl.uniform1f(u.u_lumpSoft, cfg.lumpSoft);
  gl.uniform1f(u.u_lumpDrift, cfg.lumpDrift);
  gl.uniform1f(u.u_lumpBreath, cfg.lumpBreath);
  gl.uniform1f(u.u_lumpJitter, cfg.lumpJitter);
  gl.uniform1f(u.u_lumpGlow, cfg.lumpGlow);
  gl.uniform1f(u.u_lumpCount, cfg.lumpCount);
  gl.uniform1f(u.u_wobbleAmt, cfg.wobbleAmount ?? 0);
  gl.uniform1f(u.u_wobbleFreq, cfg.wobbleFreq ?? 6);
  gl.uniform1f(u.u_wobbleSpeed, cfg.wobbleSpeed ?? 0.15);
}
