import { useCallback, useEffect, useRef, useState } from "react";
import { initGL, paintGLFrame } from "./plasmaGL.js";
import { BODY, CHIP, ENERGY_OPACITY, LAYER_URLS, STAGE, TOP_BAR } from "./spec.js";

function layerStyle(box, scale = STAGE.scale) {
  return {
    left: box.x * scale,
    top: box.y * scale,
    width: box.width * scale,
    height: box.height * scale,
  };
}

export default function AnalyseBetspot() {
  const canvasRef = useRef(null);
  const motionRef = useRef(null);
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

  const stageW = STAGE.width * STAGE.scale;
  const stageH = STAGE.height * STAGE.scale;

  useEffect(() => {
    // Build the procedural WebGL plasma once, size the canvas to the body, and
    // paint the t=0 frame. The reveal loop then drives the shader time so the
    // voronoi bolts re-strike along new paths — no images, all drawn in-shader.
    try {
      const canvas = canvasRef.current;
      if (canvas) {
        canvas.width = BODY.width * STAGE.scale;
        canvas.height = BODY.height * STAGE.scale;
        motionRef.current = initGL(canvas);
        paintGLFrame(motionRef.current, 0);
        setReady(true);
      }
    } catch (err) {
      console.error("Failed to init WebGL plasma", err);
    }
  }, []);

  // Ambient motion — advances the shader time while revealed. Pauses when the
  // tab is hidden or the user prefers reduced motion; repaints t=0 on cleanup.
  useEffect(() => {
    const assets = motionRef.current;
    if (!revealed || !ready || !assets || reducedMotion) return undefined;

    const start = performance.now();
    let raf = 0;

    const frame = (now) => {
      paintGLFrame(assets, now - start);
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
    };
  }, [revealed, ready, reducedMotion]);

  const toggleEnergy = useCallback(() => {
    if (!ready) return;
    setRevealed((v) => !v);
  }, [ready]);

  return (
    <div className="analyse-page__demo">
      <button
        type="button"
        className="analyse-betspot"
        style={{ width: stageW, height: stageH }}
        onClick={toggleEnergy}
        disabled={!ready}
        aria-label="Toggle inner energy"
      >
        <div
          className="analyse-betspot__layer analyse-betspot__body"
          style={{
            ...layerStyle(BODY),
            borderRadius: BODY.cornerRadius * STAGE.scale,
          }}
          aria-hidden
        />
        <canvas
          ref={canvasRef}
          className="analyse-betspot__layer analyse-betspot__energy"
          style={{
            ...layerStyle(BODY),
            borderRadius: BODY.cornerRadius * STAGE.scale,
            opacity: revealed ? ENERGY_OPACITY : 0,
          }}
          aria-hidden
        />
        <div
          className={`analyse-betspot__border ${revealed ? "is-active" : ""}`}
          style={{
            ...layerStyle(BODY),
            borderRadius: BODY.cornerRadius * STAGE.scale,
          }}
          aria-hidden
        />
        <img
          src={LAYER_URLS.topBar}
          alt=""
          className="analyse-betspot__layer analyse-betspot__topbar"
          style={layerStyle(TOP_BAR)}
          draggable={false}
        />
        <img
          src={LAYER_URLS.chip}
          alt=""
          className="analyse-betspot__layer analyse-betspot__chip"
          style={layerStyle(CHIP)}
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
