import { BODY, STAGE, SUPERSAMPLE } from "../config/layout.js";

/** Absolute CSS position for a layer box at display scale. */
export function layerStyle(box, scale) {
  return {
    left: box.x * scale,
    top: box.y * scale,
    width: box.width * scale,
    height: box.height * scale,
  };
}

/** WebGL layout for the supersampled stage canvas. */
export function computeRendererLayout(canvas, { stage, body, supersample }) {
  const ss = supersample;
  const w = stage.width * ss;
  const h = stage.height * ss;

  return {
    w,
    h,
    body: {
      offset: [body.x * ss, h - (body.y + body.height) * ss],
      size: [body.width * ss, body.height * ss],
    },
    rect: {
      center: [(body.x + body.width / 2) * ss, (body.y + body.height / 2) * ss],
      half: [(body.width / 2) * ss, (body.height / 2) * ss],
      radius: body.cornerRadius * ss,
    },
  };
}

export function defaultStageLayout(canvas) {
  return computeRendererLayout(canvas, {
    stage: STAGE,
    body: BODY,
    supersample: SUPERSAMPLE,
  });
}
