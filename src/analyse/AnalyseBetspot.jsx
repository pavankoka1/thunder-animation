import { useCallback, useEffect, useRef, useState } from "react";
import { ANIMATION } from "./config/animation.js";
import {
  BODY,
  CHIP,
  DEFAULT_SIZE_SCALE,
  LAYER_URLS,
  STAGE,
  THEMES,
  TOP_BAR,
} from "./config/index.js";
import { usePlasmaLoop } from "./hooks/usePlasmaLoop.js";
import { usePlasmaRenderer } from "./hooks/usePlasmaRenderer.js";
import { useReducedMotion } from "./hooks/useReducedMotion.js";
import { layerStyle } from "./utils/layout.js";

export default function AnalyseBetspot({
  innerConfig,
  outerConfig,
  theme = THEMES[0],
  scale = DEFAULT_SIZE_SCALE,
  playSignal = 0,
}) {
  const canvasRef = useRef(null);
  const buttonRef = useRef(null);
  const [revealed, setRevealed] = useState(false);
  const reducedMotion = useReducedMotion();

  const { rendererRef, ready } = usePlasmaRenderer(canvasRef, {
    innerConfig,
    outerConfig,
  });

  usePlasmaLoop({
    rendererRef,
    active: revealed && ready,
    reducedMotion,
    outerConfig,
    shakeTargetRef: buttonRef,
    scale,
  });

  useEffect(() => {
    if (playSignal > 0) setRevealed(true);
  }, [playSignal]);

  const toggleEnergy = useCallback(() => {
    if (!ready) return;
    setRevealed((v) => !v);
  }, [ready]);

  const stageW = STAGE.width * scale;
  const stageH = STAGE.height * scale;

  return (
    <div className="analyse-page__demo">
      <button
        type="button"
        ref={buttonRef}
        className={`analyse-betspot analyse-betspot--${theme.key}`}
        style={{ width: stageW, height: stageH }}
        onClick={toggleEnergy}
        disabled={!ready}
        aria-label={`Toggle ${theme.label} inner energy`}
      >
        <div
          className={`analyse-betspot__layer analyse-betspot__body analyse-betspot__body--${theme.key}`}
          style={{
            ...layerStyle(BODY, scale),
            borderRadius: BODY.cornerRadius * scale,
          }}
          aria-hidden
        />
        <canvas
          ref={canvasRef}
          className="analyse-betspot__layer analyse-betspot__energy"
          style={{
            left: 0,
            top: 0,
            width: stageW,
            height: stageH,
            opacity: revealed ? ANIMATION.energyOpacity : 0,
            pointerEvents: "none",
          }}
          aria-hidden
        />
        <div
          className={`analyse-betspot__layer analyse-betspot__topbar analyse-betspot__topbar--${theme.key}`}
          style={{
            ...layerStyle(TOP_BAR, scale),
            borderRadius: (TOP_BAR.height / 2) * scale,
            borderWidth: Math.max(1, 2 * scale),
          }}
          aria-hidden
        />
        <img
          src={LAYER_URLS.chip}
          alt=""
          className="analyse-betspot__layer analyse-betspot__chip"
          style={layerStyle(CHIP, scale)}
          draggable={false}
        />
        {!ready && <span className="analyse-betspot__status">Baking energy field…</span>}
      </button>

      <div className="analyse-page__actions">
        <button
          type="button"
          className="analyse-btn analyse-btn_primary"
          onClick={toggleEnergy}
          disabled={!ready}
        >
          {revealed ? "Hide energy" : "Reveal energy"}
        </button>
      </div>
    </div>
  );
}
