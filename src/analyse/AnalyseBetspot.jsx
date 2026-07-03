import { useCallback, useEffect, useRef, useState } from "react";
import { generateEnergyCanvas } from "./cellularEnergy.js";
import { initWarpAssets, paintEnergyFrame } from "./energyMotion.js";
import { canvasToField, detectHubs } from "./energyHubs.js";
import { loadPlasmaFilaments } from "./plasmaFilaments.js";
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
  const bakedRef = useRef(null);
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
    let cancelled = false;

    // Bake the plasma filament web once, then warp those baked pixels each
    // frame. The reveal itself is a pure CSS opacity transition after this
    // bake; the motion resamples the same canvas, adding no new content.
    (async () => {
      try {
        const data = await loadPlasmaFilaments(BODY.width, BODY.height, 3);
        if (cancelled) return;
        const canvas = canvasRef.current;
        if (!canvas) return;

        const baked = generateEnergyCanvas(BODY.width, BODY.height, 3, data);
        canvas.width = baked.width;
        canvas.height = baked.height;
        canvas.getContext("2d").drawImage(baked, 0, 0);
        bakedRef.current = baked;
        try {
          const { field, w, h } = canvasToField(baked);
          const hubs = detectHubs(field, w, h);
          motionRef.current = initWarpAssets(baked, hubs);
        } catch (err) {
          console.warn("Warp assets unavailable — energy stays static", err);
        }
        setReady(true);
      } catch (err) {
        console.error("Failed to build inner energy", err);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  // Ambient motion — repaints only the energy canvas while revealed.
  // Falls back to the static bake when hidden, unmounted, extraction
  // failed, or the user prefers reduced motion.
  useEffect(() => {
    const canvas = canvasRef.current;
    const assets = motionRef.current;
    if (!revealed || !ready || !canvas || !assets || reducedMotion) return undefined;

    const ctx = canvas.getContext("2d");
    const start = performance.now();
    let raf = 0;

    const frame = (now) => {
      paintEnergyFrame(ctx, assets, now - start);
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
      const baked = bakedRef.current;
      if (baked) {
        ctx.globalCompositeOperation = "source-over";
        ctx.globalAlpha = 1;
        ctx.filter = "none";
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(baked, 0, 0);
      }
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
