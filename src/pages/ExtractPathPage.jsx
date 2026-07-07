import { useEffect, useRef, useState } from "react";
import { BODY, CHIP, LAYER_URLS, STAGE, SUPERSAMPLE, TOP_BAR } from "../analyse/config/layout.js";
import { computeRendererLayout, layerStyle } from "../analyse/utils/layout.js";
import {
  createLichtenbergRenderer,
  paintLichtenberg,
  setNetwork,
} from "../extractPath/lichtenbergRenderer.js";
import { loadExtractedNetwork } from "../extractPath/loadExtractedNetwork.js";
import "./ExtractPathPage.css";

const SCALE = 1;

export default function ExtractPathPage() {
  const canvasRef = useRef(null);
  const rendererRef = useRef(null);
  const [ready, setReady] = useState(false);
  const [widthScale, setWidthScale] = useState(1);
  const [thickness, setThickness] = useState(1);
  const [centerBoost, setCenterBoost] = useState(1.6);
  const [edgeMix, setEdgeMix] = useState(1.0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;

    canvas.width = STAGE.width * SUPERSAMPLE;
    canvas.height = STAGE.height * SUPERSAMPLE;
    const layout = computeRendererLayout(canvas, {
      stage: STAGE,
      body: BODY,
      supersample: SUPERSAMPLE,
    });
    const renderer = createLichtenbergRenderer(canvas, layout);
    rendererRef.current = renderer;
    setReady(true);

    return () => {
      rendererRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const renderer = rendererRef.current;
    if (!ready || !renderer) return;
    const network = loadExtractedNetwork(
      renderer.layout.body.size[0],
      renderer.layout.body.size[1],
      {
        widthScale,
      }
    );
    // The photo's dominant hub really is thicker than its edge/corner
    // clusters (confirmed by the distance-transform width stats — the hub
    // blob measures up to ~27px vs ~1-3px for typical tendrils), so this
    // just gives that real contrast an extra editorial boost: points closer
    // to the body's centre get progressively thicker. A floor keeps the
    // corners from reading as relatively starved next to the boosted centre.
    const [bw, bh] = renderer.layout.body.size;
    const cx = bw / 2;
    const cy = bh / 2;
    const maxR = Math.hypot(cx, cy);
    const boostFloor = 1.15;
    for (const path of network.paths) {
      for (const p of path) {
        const r = Math.hypot(p.x - cx, p.y - cy) / maxR; // 0 at centre, 1 at corner
        const boost = boostFloor + (centerBoost - boostFloor) * (1 - r);
        p.w *= boost;
      }
    }
    setNetwork(renderer, network);
    paintLichtenberg(renderer, {
      // coreSigmaMul is now a half-WIDTH fraction (stroke coverage, not a
      // Gaussian sigma) — bestW already represents roughly the real
      // half-width from the distance transform, so ~0.9 draws the stroke
      // close to its true measured thickness.
      coreSigmaMul: 0.9 * thickness,
      glowSigmaMul: 1.6 * thickness,
      outerSigmaMul: 3.0 * thickness,
      // coreAlpha was 1.1 (>1) with a pure-white core colour — that combo
      // pushes huge swaths of the network past the clamp to solid (1,1,1),
      // which is the "too bright" / blown-out look. reference.png's own
      // brightest vein pixels are pale cyan (~#d0f3f8, not pure white) and
      // sit at ~97% of full brightness, not clipped — alpha <=1 with a
      // slightly-off-white colour reproduces that instead of a flat wash.
      coreAlpha: 0.78,
      glowAlpha: 0.32,
      outerAlpha: 0.1,
      // Colours sampled directly from reference.png: vein peaks average
      // ~#d0f3f8 (pale cyan, not white); the body background itself is
      // already blue, so glow/outer stay closer to that same cyan-blue
      // family instead of a generic saturated blue that fights the body.
      coreColor: [0.88, 0.98, 1.0],
      glowColor: [0.6, 0.85, 0.98],
      outerColor: [0.45, 0.68, 0.95],
      // Radial edge tint: Python analysis of reference.png (hue vs. distance
      // from the body's centre) showed cyan/blue holds for ~72% of the
      // radius then rotates hard to violet/magenta (hue 205 -> 295 deg) in
      // the outer ~20-25%, blending into the betspot's own magenta outer
      // border — not a uniform gradient from the centre.
      edgeColor: [1.0, 0.1, 0.7],
      edgeStart: 0.05,
      edgePow: 1.0,
      edgeMix,
    });
  }, [ready, widthScale, thickness, centerBoost, edgeMix]);

  const stageW = STAGE.width * SCALE;
  const stageH = STAGE.height * SCALE;

  return (
    <div className="extract-path-page">
      <header className="extract-path-page__header">
        <a className="extract-path-page__link" href="/">
          ← Home
        </a>
        <h1 className="extract-path-page__title">
          Extract path — real pattern extraction
        </h1>
        <p className="extract-path-page__subtitle">
          Traced directly from <code>public/analyse/neural-reference.jpg</code> with
          external image-processing tools (Python + numpy/scipy/scikit-image): threshold →
          skeletonize → distance-transform for real per-point thickness → trace into
          polylines at junctions/endpoints (see{" "}
          <code>scripts/extract_lichtenberg_pattern.py</code>). No synthetic geometry —
          every path and width below came from the photo, drawn with a per-fragment
          nearest-segment SDF shader.
        </p>
      </header>

      <div className="extract-path-page__stage">
        <div className="extract-path-betspot" style={{ width: stageW, height: stageH }}>
          <div
            className="extract-path-betspot__layer extract-path-betspot__body"
            style={{
              ...layerStyle(BODY, SCALE),
              borderRadius: BODY.cornerRadius * SCALE,
            }}
          />
          <div
            className="extract-path-betspot__layer extract-path-betspot__topbar"
            style={{
              ...layerStyle(TOP_BAR, SCALE),
              borderRadius: (TOP_BAR.height / 2) * SCALE,
            }}
          />
          <canvas
            ref={canvasRef}
            className="extract-path-betspot__layer extract-path-betspot__energy"
            style={{ left: 0, top: 0, width: stageW, height: stageH }}
          />
          <img
            src={LAYER_URLS.chip}
            alt=""
            className="extract-path-betspot__layer extract-path-betspot__chip"
            style={layerStyle(CHIP, SCALE)}
            draggable={false}
          />
          {!ready && (
            <span className="extract-path-betspot__status">
              Loading extracted network…
            </span>
          )}
        </div>
      </div>

      <div className="extract-path-page__controls">
        <label className="extract-path-page__control">
          Width scale {widthScale.toFixed(2)}
          <input
            type="range"
            min="0.4"
            max="2.5"
            step="0.05"
            value={widthScale}
            onChange={(e) => setWidthScale(Number(e.target.value))}
          />
        </label>
        <label className="extract-path-page__control">
          Glow thickness {thickness.toFixed(2)}
          <input
            type="range"
            min="0.4"
            max="2.5"
            step="0.05"
            value={thickness}
            onChange={(e) => setThickness(Number(e.target.value))}
          />
        </label>
        <label className="extract-path-page__control">
          Centre boost {centerBoost.toFixed(2)}
          <input
            type="range"
            min="1"
            max="3"
            step="0.05"
            value={centerBoost}
            onChange={(e) => setCenterBoost(Number(e.target.value))}
          />
        </label>
        <label className="extract-path-page__control">
          Violet edge tint {edgeMix.toFixed(2)}
          <input
            type="range"
            min="0"
            max="1.5"
            step="0.05"
            value={edgeMix}
            onChange={(e) => setEdgeMix(Number(e.target.value))}
          />
        </label>
      </div>
    </div>
  );
}
