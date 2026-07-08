import { useEffect, useRef, useState } from "react";
import {
  BODY,
  CHIP,
  LAYER_URLS,
  STAGE,
  SUPERSAMPLE,
  TOP_BAR,
} from "../analyse/config/layout.js";
import { OUTER_CONFIG } from "../analyse/config/outer.js";
import { useReducedMotion } from "../analyse/hooks/useReducedMotion.js";
import { computeRendererLayout, layerStyle } from "../analyse/utils/layout.js";
import { elapsedSeconds } from "../analyse/utils/time.js";
import {
  createLichtenbergRenderer,
  destroyLichtenbergRenderer,
  paintLichtenberg,
  paintOuterBorder,
  setNetwork,
} from "../extractPath/lichtenbergRenderer.js";
import { loadExtractedNetwork } from "../extractPath/loadExtractedNetwork.js";
import "./ExtractPathPage.css";

const SCALE = 1;

// The outer border shader (see src/analyse/gl/shaders.js OUTER_FRAG) is
// built around a one-time "reveal" crawl gesture that AnalyseBetspot
// triggers on a button click. This page has no such gesture — the border
// should just read as fully formed from the first frame — so reveal is
// pinned to 1 and only the ambient (breathing/drift/flicker) motion runs.
const OUTER_FRAME_STYLE = { reveal: 1 };

export default function ExtractPathPage() {
  const canvasRef = useRef(null);
  const rendererRef = useRef(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState(null);
  const [widthScale, setWidthScale] = useState(3);
  const [thickness, setThickness] = useState(1);
  const [centerBoost, setCenterBoost] = useState(1.15);
  const [edgeMix, setEdgeMix] = useState(1.0);
  const [intensity, setIntensity] = useState(0.5);
  const [cornerDensity, setCornerDensity] = useState(1);
  // Flow-field sway amplitude (body px). Peak per-axis displacement is
  // movement * taper max 1.6, which must stay under spatialGrid.js SWAY_PAD
  // (18) or moved segments drift out of their registered cells and flicker —
  // hence the slider max of 11 (11 * 1.6 = 17.6 < 18).
  const [movement, setMovement] = useState(20);
  const [plasmaBright, setPlasmaBright] = useState(1.0);
  const reducedMotion = useReducedMotion();

  // Read every animation frame by the paint loop below — a ref (not state)
  // so slider changes don't need to restart the requestAnimationFrame loop.
  const styleRef = useRef(null);

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

    try {
      rendererRef.current = createLichtenbergRenderer(canvas, layout);
      setReady(true);
      setError(null);
    } catch (err) {
      console.error("Failed to init WebGL Lichtenberg renderer", err);
      rendererRef.current = null;
      setReady(false);
      setError(err instanceof Error ? err.message : "WebGL init failed");
    }

    return () => {
      destroyLichtenbergRenderer(rendererRef.current);
      rendererRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Uploads the network to the GPU when its own inputs change. Does NOT
  // paint — painting happens every animation frame in the loop below, since
  // the paths themselves now move (see lichtenbergShader.js u_swayAmt).
  useEffect(() => {
    const renderer = rendererRef.current;
    if (!ready || !renderer) return;
    const network = loadExtractedNetwork(
      renderer.layout.body.size[0],
      renderer.layout.body.size[1],
      {
        widthScale,
        cornerDensity,
        cornerRadius: renderer.layout.rect.radius,
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
  }, [ready, widthScale, centerBoost, cornerDensity]);

  // Style params the paint loop reads each frame — kept in a ref (see above)
  // rather than passed as effect deps, so changing a slider doesn't restart
  // requestAnimationFrame.
  useEffect(() => {
    styleRef.current = {
      // SHARP filaments, not blunt tubes. The reference (neural-reference.jpg)
      // is hair-thin razor-crisp lines on a DARK ground — so the core stays
      // narrow (coreSigmaMul is a half-WIDTH fraction of the traced width) and
      // the glow/outer halos are kept TIGHT. Wide halos over a dense network
      // overlap into a milky wash that buries the individual veins (the old
      // 1.6/3.0 sigmas did exactly that); pulling them in lets each filament
      // read as a distinct sharp stroke with just a thin bloom.
      coreSigmaMul: 0.52 * thickness,
      glowSigmaMul: 0.8 * thickness,
      outerSigmaMul: 1.6 * thickness,
      // Bright white-hot core (reference vein PEAKS measure pure #ffffff — not
      // just pale cyan — so the core is pushed to near-white), with the
      // surrounding halos dialled DOWN so they accent the line instead of
      // flooding the gaps between lines. The `intensity` slider scales all
      // three alphas together, so the veins can be brightened/dimmed against
      // the (fixed) plasma body without touching their colour balance.
      coreAlpha: 1.0 * intensity,
      glowAlpha: 0.24 * intensity,
      outerAlpha: 0.05 * intensity,
      // Colours sampled directly from reference.png: vein peaks are pure white,
      // cooling to pale cyan just off the core; the body background itself is
      // already blue, so glow/outer stay in that same cyan-blue family instead
      // of a generic saturated blue that fights the body.
      coreColor: [0.97, 0.99, 1.0],
      glowColor: [0.62, 0.86, 1.0],
      outerColor: [0.45, 0.68, 0.95],
      // Ambient field kept very low: the reference's ground between filaments
      // is near-black, not a lit haze. A faint fill still lets the violet edge
      // tint read in the open corners (see u_ambientAlpha edge boost), but not
      // so much that it washes out the sharp lines.
      ambientColor: [0.4, 0.7, 0.95],
      ambientAlpha: 0.035,
      // Radial edge tint: Python analysis of reference.png (hue vs. distance
      // from the body's centre) showed cyan/blue holds for ~72% of the
      // radius then rotates hard to violet/magenta (hue 205 -> 295 deg) in
      // the outer ~20-25%, blending into the betspot's own magenta outer
      // border — not a uniform gradient from the centre.
      edgeColor: [1.0, 0.1, 0.7],
      edgeStart: 0.05,
      edgePow: 1.0,
      edgeMix,
      // Motion amplitude (body px) for the flow-field sway — see readPoint in
      // lichtenbergShader.js. Driven by the Movement slider; peak per-axis
      // displacement (movement * taper max 1.6) stays under the grid's
      // SWAY_PAD (18) because the slider is capped at 11. The flow field also
      // sweeps at u_time * 0.85. 0 under reduced motion (set by the paint loop).
      swayAmt: movement,
      // Brightness of the violet Worley-crack gap-fill plasma + its sparks
      // (see the gap block in lichtenbergShader.js). Its own slider.
      plasmaBright,
    };
  }, [thickness, edgeMix, intensity, movement, plasmaBright]);

  // Ambient motion loop: paintLichtenberg now re-runs every frame (not just
  // on param change) because u_time/u_swayAmt displace each path's actual
  // traced points — that's what makes the paths move, vs. a resampled
  // static image. The real extracted network (~4700 paths, ~4.6 points
  // each) keeps this affordable; see lichtenbergRenderer.js.
  useEffect(() => {
    const renderer = rendererRef.current;
    if (!ready || !renderer) return undefined;

    const { w, h, rect } = renderer.layout;
    const paintFrame = (timeSec) => {
      const style = styleRef.current ?? {};
      paintLichtenberg(renderer, { ...style, time: timeSec });
      paintOuterBorder(renderer, OUTER_CONFIG, {
        timeSec,
        w,
        h,
        rect,
        ...OUTER_FRAME_STYLE,
      });
    };

    if (reducedMotion) {
      // swayAmt: 0 — render paths at their exact traced position (not a
      // frozen mid-sway offset) so reduced-motion users still see the real
      // extracted shape, just static.
      const style = { ...(styleRef.current ?? {}), swayAmt: 0 };
      paintLichtenberg(renderer, { ...style, time: 0 });
      paintOuterBorder(renderer, OUTER_CONFIG, {
        timeSec: 0,
        w,
        h,
        rect,
        ...OUTER_FRAME_STYLE,
      });
      return undefined;
    }

    const start = performance.now();
    let raf = 0;
    const tick = (now) => {
      paintFrame(elapsedSeconds(now - start));
      raf = requestAnimationFrame(tick);
    };

    const onVisibility = () => {
      cancelAnimationFrame(raf);
      if (!document.hidden) raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [ready, reducedMotion]);

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
          {error && (
            <span className="extract-path-betspot__status">
              {error} — try reloading the page.
            </span>
          )}
          {!ready && !error && (
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
        <label className="extract-path-page__control">
          Path colour intensity {intensity.toFixed(2)}
          <input
            type="range"
            min="0.2"
            max="3"
            step="0.05"
            value={intensity}
            onChange={(e) => setIntensity(Number(e.target.value))}
          />
        </label>
        <label className="extract-path-page__control">
          Corner density {cornerDensity.toFixed(2)}
          <input
            type="range"
            min="0"
            max="3"
            step="0.05"
            value={cornerDensity}
            onChange={(e) => setCornerDensity(Number(e.target.value))}
          />
        </label>
        <label className="extract-path-page__control">
          Movement {movement.toFixed(1)}
          <input
            type="range"
            min="0"
            max="11"
            step="0.5"
            value={movement}
            onChange={(e) => setMovement(Number(e.target.value))}
          />
        </label>
        <label className="extract-path-page__control">
          Plasma brightness {plasmaBright.toFixed(2)}
          <input
            type="range"
            min="0"
            max="3"
            step="0.05"
            value={plasmaBright}
            onChange={(e) => setPlasmaBright(Number(e.target.value))}
          />
        </label>
      </div>
    </div>
  );
}
