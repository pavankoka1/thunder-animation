import { useCallback, useEffect, useRef, useState } from "react";
import { initGL, paintGLFrame, PLASMA_CONFIG } from "./plasmaGL.js";
import { OUTER_CONFIG } from "./outerBorderGL.js";
import { betspotShakeOffset } from "../canvas/plasma/betspotShake.js";
import {
  BODY,
  CHIP,
  DEFAULT_SIZE_SCALE,
  ENERGY_OPACITY,
  LAYER_URLS,
  STAGE,
  SUPERSAMPLE,
  THEMES,
  TOP_BAR,
} from "./spec.js";

const SHAKE_STRENGTH = 3.4;

function layerStyle(box, scale) {
  return {
    left: box.x * scale,
    top: box.y * scale,
    width: box.width * scale,
    height: box.height * scale,
  };
}

export default function AnalyseBetspot({
  config: configProp,
  outerConfig: outerConfigProp,
  theme = THEMES[0],
  scale = DEFAULT_SIZE_SCALE,
  playSignal = 0,
}) {
  const canvasRef = useRef(null);
  const buttonRef = useRef(null);
  const glRef = useRef(null);
  const fallbackCfg = useRef(null);
  if (!fallbackCfg.current) fallbackCfg.current = { ...PLASMA_CONFIG };
  const config = configProp ?? fallbackCfg.current;
  const fallbackOuter = useRef(null);
  if (!fallbackOuter.current) fallbackOuter.current = { ...OUTER_CONFIG };
  const outerConfig = outerConfigProp ?? fallbackOuter.current;

  const [ready, setReady] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onChange = (e) => setReducedMotion(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  const stageW = STAGE.width * scale;
  const stageH = STAGE.height * scale;

  useEffect(() => {
    if (playSignal > 0) setRevealed(true);
  }, [playSignal]);

  useEffect(() => {
    try {
      const canvas = canvasRef.current;
      if (canvas) {
        const ss = SUPERSAMPLE;
        canvas.width = STAGE.width * ss;
        canvas.height = STAGE.height * ss;

        const bodyOffset = [
          BODY.x * ss,
          canvas.height - (BODY.y + BODY.height) * ss,
        ];
        const bodySize = [BODY.width * ss, BODY.height * ss];

        const rect = {
          center: [(BODY.x + BODY.width / 2) * ss, (BODY.y + BODY.height / 2) * ss],
          half: [(BODY.width / 2) * ss, (BODY.height / 2) * ss],
          radius: BODY.cornerRadius * ss,
        };

        glRef.current = initGL(canvas, config, { bodyOffset, bodySize, rect }, outerConfig);
        paintGLFrame(glRef.current, 0);
        setReady(true);
      }
    } catch (err) {
      console.error("Failed to init WebGL plasma", err);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const assets = glRef.current;
    if (!assets || !ready) return undefined;
    if (!revealed || reducedMotion) {
      paintGLFrame(assets, 0);
      return undefined;
    }

    const start = performance.now();
    let raf = 0;
    const frame = (now) => {
      const tMs = now - start;
      paintGLFrame(assets, tMs);

      const btn = buttonRef.current;
      if (btn) {
        const p = Math.min(1, tMs / outerConfig.formationMs);
        let env;
        if (p >= 1) env = 0;
        else if (p < 0.08) env = p / 0.08;
        else {
          const q = (p - 0.08) / 0.92;
          env = 1 - q * q;
        }
        if (env > 0) {
          const { x, y, rot } = betspotShakeOffset(tMs, {
            intensity: env * SHAKE_STRENGTH * scale,
          });
          btn.style.transform = `translate(${x}px, ${y}px) rotate(${rot}deg)`;
        } else {
          btn.style.transform = "";
        }
      }

      raf = requestAnimationFrame(frame);
    };
    const onVisibility = () => {
      cancelAnimationFrame(raf);
      if (!document.hidden) raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener("visibilitychange", onVisibility);
      paintGLFrame(assets, 0);
      if (buttonRef.current) buttonRef.current.style.transform = "";
    };
  }, [revealed, ready, reducedMotion, config, outerConfig, scale, playSignal]);

  const toggleEnergy = useCallback(() => {
    if (!ready) return;
    setRevealed((v) => !v);
  }, [ready]);

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
            opacity: revealed ? ENERGY_OPACITY : 0,
            transition: revealed ? "none" : "opacity 0.6s ease",
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
