import { useCallback, useEffect, useRef, useState } from "react";
import { generateEnergyCanvas } from "./cellularEnergy.js";
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
  const [ready, setReady] = useState(false);
  const [revealed, setRevealed] = useState(false);

  const stageW = STAGE.width * STAGE.scale;
  const stageH = STAGE.height * STAGE.scale;

  useEffect(() => {
    let cancelled = false;

    // Extract the plasma filament network once, then re-stroke it into the
    // energy canvas. The reveal itself is a pure CSS opacity transition after
    // this bake, so it stays cheap however rich the paths are.
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
        setReady(true);
      } catch (err) {
        console.error("Failed to build inner energy", err);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

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
