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
import { useLichtenbergLoop } from "./hooks/useLichtenbergLoop.js";
import { useLichtenbergRenderer } from "./hooks/useLichtenbergRenderer.js";
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
  const [revealed, setRevealed] = useState(false);
  const reducedMotion = useReducedMotion();

  // Inner plasma is now the extracted-Lichtenberg energy (shared with
  // /extract-path via lichtenbergPreset.js). innerConfig is intentionally
  // unused — every betspot shows the same plasma at the current defaults; the
  // per-theme identity comes from the CSS body + the outer border colour.
  const { rendererRef, ready } = useLichtenbergRenderer(canvasRef);

  useLichtenbergLoop({
    rendererRef,
    outerConfig,
    active: revealed && ready,
    reducedMotion,
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
  const glowDurationMs =
    ANIMATION.glow.riseMs + ANIMATION.glow.holdMs + ANIMATION.glow.decayMs;

  return (
    <div className="analyse-page__demo">
      <button
        type="button"
        className={`analyse-betspot analyse-betspot--${theme.key} ${
          revealed ? "is-active" : ""
        }`}
        style={{
          width: stageW,
          height: stageH,
          "--analyse-scale-duration": `${ANIMATION.scale.durationMs}ms`,
          "--analyse-scale-easing": ANIMATION.scale.easing,
          "--analyse-glow-duration": `${glowDurationMs}ms`,
          "--analyse-glow-rise-easing": ANIMATION.glow.riseEasing,
          "--analyse-glow-decay-easing": ANIMATION.glow.decayEasing,
        }}
        onClick={toggleEnergy}
        disabled={!ready}
        aria-label={`Toggle ${theme.label} inner energy`}
      >
        <div
          className={`analyse-betspot__layer analyse-betspot__glow ${
            revealed ? "is-active" : ""
          }`}
          style={{
            ...layerStyle(BODY, scale),
            borderRadius: BODY.cornerRadius * scale,
          }}
          aria-hidden
        />
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
          className={`analyse-betspot__layer analyse-betspot__energy ${
            revealed ? "is-active" : ""
          }`}
          style={{
            left: 0,
            top: 0,
            width: stageW,
            height: stageH,
            "--energy-opacity": ANIMATION.energyOpacity,
            pointerEvents: "none",
          }}
          aria-hidden
        />
        <div
          className={`analyse-betspot__layer analyse-betspot__topbar analyse-betspot__topbar--${theme.key} ${
            revealed ? "is-lit" : ""
          }`}
          style={{
            ...layerStyle(TOP_BAR, scale),
            borderRadius: (TOP_BAR.height / 2) * scale,
            borderWidth: Math.max(1, 2 * scale),
          }}
          aria-hidden
        />
        {/* <img
          src={LAYER_URLS.chip}
          alt=""
          className="analyse-betspot__layer analyse-betspot__chip"
          style={layerStyle(CHIP, scale)}
          draggable={false}
        /> */}
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
