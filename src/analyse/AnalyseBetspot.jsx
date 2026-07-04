import { useCallback, useEffect, useRef, useState } from "react";
import { DEFAULT_CONFIG, generateField } from "./boltField.js";
import { drawBolts, initBoltGL } from "./boltGL.js";
import { BODY, CHIP, ENERGY_OPACITY, LAYER_URLS, STAGE, TOP_BAR } from "./spec.js";

function layerStyle(box, scale = STAGE.scale) {
  return {
    left: box.x * scale,
    top: box.y * scale,
    width: box.width * scale,
    height: box.height * scale,
  };
}

function nextSeed(s) {
  return (Math.imul(s | 0, 1664525) + 1013904223) >>> 0;
}

export default function AnalyseBetspot({ config: configProp }) {
  const canvasRef = useRef(null);
  const glRef = useRef(null);
  const fieldRef = useRef(null);
  const fallbackCfg = useRef(null);
  if (!fallbackCfg.current) fallbackCfg.current = { ...DEFAULT_CONFIG };
  const config = configProp ?? fallbackCfg.current;

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
    // Build the WebGL bolt renderer once, generate the first bolt-field, and
    // draw a full static strike. The reveal loop then animates grow→hold→
    // re-strike. All drawn in-shader — no images.
    try {
      const canvas = canvasRef.current;
      if (canvas) {
        const w = BODY.width * STAGE.scale;
        const h = BODY.height * STAGE.scale;
        canvas.width = w;
        canvas.height = h;
        glRef.current = initBoltGL(canvas, config);
        fieldRef.current = generateField(config, w, h);
        drawBolts(glRef.current, fieldRef.current, 1);
        setReady(true);
      }
    } catch (err) {
      console.error("Failed to init WebGL bolts", err);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Strike lifecycle — grow → hold → re-strike (new seed) on a loop while
  // revealed. Regenerates immediately if the config seed changes (panel buttons).
  // Pauses on tab-hidden; reduced-motion → one static full strike.
  useEffect(() => {
    const assets = glRef.current;
    const w = BODY.width * STAGE.scale;
    const h = BODY.height * STAGE.scale;
    if (!assets || !ready) return undefined;

    if (!revealed || reducedMotion) {
      // static full strike (respects any config edits)
      fieldRef.current = generateField(config, w, h);
      drawBolts(assets, fieldRef.current, 1);
      return undefined;
    }

    let raf = 0;
    let phaseStart = performance.now();
    let lastSeed = config.seed;

    const frame = (now) => {
      if (config.seed !== lastSeed) {
        lastSeed = config.seed;
        fieldRef.current = generateField(config, w, h);
        phaseStart = now;
      }
      const elapsed = now - phaseStart;
      const cycle = config.strikeMs + config.holdMs;
      if (elapsed >= cycle) {
        lastSeed = nextSeed(config.seed);
        config.seed = lastSeed;
        fieldRef.current = generateField(config, w, h);
        phaseStart = now;
        drawBolts(assets, fieldRef.current, 0);
      } else {
        const progress = Math.min(1, elapsed / config.strikeMs);
        drawBolts(assets, fieldRef.current, progress);
      }
      raf = requestAnimationFrame(frame);
    };

    const onVisibility = () => {
      cancelAnimationFrame(raf);
      if (!document.hidden) {
        phaseStart = performance.now();
        raf = requestAnimationFrame(frame);
      }
    };

    raf = requestAnimationFrame(frame);
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener("visibilitychange", onVisibility);
      if (fieldRef.current) drawBolts(assets, fieldRef.current, 1);
    };
  }, [revealed, ready, reducedMotion, config]);

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
