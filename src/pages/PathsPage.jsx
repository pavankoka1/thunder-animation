/**
 * PathsPage — betspot activation preview (vibration → inner energy → neon border).
 *
 * Choreography (reference videos):
 *   1. ~1.5s vibration — betspot shakes
 *   2. Same window — inner plasma ramps 0→1 + neon border forms
 *   3. After formation — inner filaments drift/shimmer in a loop
 *   (Outer electric fringe disabled for now.)
 *
 * Optional: ▶ Play sequence runs the network strike on top.
 */
import { useEffect, useRef, useState } from "react";
import { SVG_FRAME, SVG_PATHS, RENDER_SCALE } from "../canvas/frame.js";
import {
  buildNetworkGraph,
  NETWORK_TIMELINE,
} from "../canvas/plasma/networkGraph.js";
import { paintNetworkStrikeFrame } from "../canvas/plasma/paintNetworkStrike.js";
import { paintEdgeRim, RIM_BLEED } from "../canvas/plasma/paintEdgeRim.js";
import { betspotShakeOffset } from "../canvas/plasma/betspotShake.js";
import {
  formationProgress,
  introElapsed,
  innerLoopTimeMs,
  vibrationIntensity,
  VIBRATION_MS,
  FORMATION_MS,
} from "../canvas/plasma/betspotChoreography.js";
import { paintInnerEnergy, paintInnerEnergyStatic } from "../canvas/plasma/paintInnerEnergy.js";
import {
  loadPlasmaTextureCrop,
  loadPlasmaPatternLayer,
} from "../canvas/plasmaPattern.js";
import "./PathsPage.css";

const VB            = SVG_FRAME;
const DISPLAY_SCALE = RENDER_SCALE;
const STAGE_W       = VB.width  * DISPLAY_SCALE;
const STAGE_H       = VB.height * DISPLAY_SCALE;
const RIM_BLEED_CSS = RIM_BLEED * DISPLAY_SCALE;
const RIM_CANVAS_W  = STAGE_W + 2 * RIM_BLEED_CSS;
const RIM_CANVAS_H  = STAGE_H + 2 * RIM_BLEED_CSS;
const BETSPOT_CORNER_RADIUS_CSS = 46;
const DEFAULT_THRESH = 460;

export default function PathsPage() {
  const canvasRef = useRef(null);
  const rimRef    = useRef(null);
  const shakeRef  = useRef(null);
  const assetsRef = useRef(null);
  const graphRef  = useRef(null);
  const rafRef    = useRef(0);
  const animRafRef = useRef(0);
  const startRef  = useRef(0);
  const introStartRef = useRef(0);

  const [phase,      setPhase]      = useState("Loading…");
  const [ready,      setReady]      = useState(false);
  const [loadError,  setLoadError]  = useState(null);
  const [threshold,  setThreshold]  = useState(DEFAULT_THRESH);
  const [playing,    setPlaying]    = useState(false);
  const [stepLabel,  setStepLabel]  = useState("");
  const [stats,      setStats]      = useState(null);

  useEffect(() => {
    let cancelled = false;
    setReady(false);
    setLoadError(null);
    assetsRef.current = null;
    graphRef.current = null;
    setPhase("Fetching plasma.svg…");

    Promise.all([
      loadPlasmaPatternLayer(SVG_PATHS.plasma),
      loadPlasmaTextureCrop(SVG_PATHS.plasma),
    ])
      .then(([plasmaLayer, { canvas: crop }]) => {
        if (cancelled) return;
        const cw = crop.width;
        const ch = crop.height;
        const data = crop
          .getContext("2d", { willReadFrequently: true })
          .getImageData(0, 0, cw, ch).data;
        assetsRef.current = { plasmaLayer, data, cw, ch };
        introStartRef.current = performance.now();
        setReady(true);
        setPhase("");
      })
      .catch((err) => {
        if (cancelled) return;
        setLoadError(err?.message ?? "Failed to load");
        // eslint-disable-next-line no-console
        console.error(err);
      });

    return () => {
      cancelled = true;
      cancelAnimationFrame(rafRef.current);
      cancelAnimationFrame(animRafRef.current);
    };
  }, []);

  /** Intro choreography + looping inner energy while ready. */
  useEffect(() => {
    if (!ready) {
      cancelAnimationFrame(animRafRef.current);
      return undefined;
    }
    const tick = (now) => {
      if (!playing) {
        drawBetspotFrame(now);
        drawRim(now);
      }
      applyBetspotShake(now);
      animRafRef.current = requestAnimationFrame(tick);
    };
    animRafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animRafRef.current);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, playing]);

  useEffect(() => {
    if (!ready || !assetsRef.current) return;
    const { data, cw, ch, plasmaLayer } = assetsRef.current;
    graphRef.current = buildNetworkGraph(data, cw, ch, threshold, plasmaLayer);
    const g = graphRef.current;
    setStats({
      brightPixels: g.brightPixels,
      cw,
      ch,
      maxSW: g.maxByQuadrant[0]?.toFixed(1),
      maxE: Math.max(g.maxByQuadrant[1] ?? 0, g.maxByQuadrant[3] ?? 0).toFixed(1),
      maxN: g.maxByQuadrant[2]?.toFixed(1),
    });
    if (!playing) drawBetspotFrame(performance.now());
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, threshold]);

  useEffect(() => {
    if (ready && !playing) {
      drawBetspotFrame(performance.now());
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  function getCtx() {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const dpr = window.devicePixelRatio || 1;
    if (canvas.width !== Math.round(STAGE_W * dpr)) {
      canvas.style.width  = `${STAGE_W}px`;
      canvas.style.height = `${STAGE_H}px`;
      canvas.width  = Math.round(STAGE_W * dpr);
      canvas.height = Math.round(STAGE_H * dpr);
    }
    const ctx = canvas.getContext("2d");
    ctx.setTransform(DISPLAY_SCALE * dpr, 0, 0, DISPLAY_SCALE * dpr, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    return ctx;
  }

  function getIntroState(timeMs) {
    const elapsed = introElapsed(timeMs, introStartRef.current);
    const formation = formationProgress(elapsed);
    const loopTimeMs = innerLoopTimeMs(elapsed, timeMs, introStartRef.current);
    return { elapsed, formation, loopTimeMs };
  }

  function applyBetspotShake(timeMs) {
    const el = shakeRef.current;
    if (!el) return;
    const { elapsed } = getIntroState(timeMs);
    const intensity = vibrationIntensity(elapsed);
    const { x, y, rot } = betspotShakeOffset(timeMs, { intensity });
    el.style.transform = `translate(${x}px, ${y}px) rotate(${rot}deg)`;
  }

  function resetIntro() {
    introStartRef.current = performance.now();
  }

  function drawRim(now = performance.now()) {
    const canvas = rimRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const deviceW = Math.round(RIM_CANVAS_W * dpr);
    const deviceH = Math.round(RIM_CANVAS_H * dpr);
    if (canvas.width !== deviceW) {
      canvas.style.width  = `${RIM_CANVAS_W}px`;
      canvas.style.height = `${RIM_CANVAS_H}px`;
      canvas.width  = deviceW;
      canvas.height = deviceH;
    }
    const ctx = canvas.getContext("2d");
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const scale = DISPLAY_SCALE * dpr;
    ctx.setTransform(
      scale, 0, 0, scale,
      RIM_BLEED_CSS * dpr,
      RIM_BLEED_CSS * dpr,
    );
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    const { formation } = getIntroState(now);
    paintEdgeRim(ctx, formation, now);
  }

  function clearCanvas(ctx) {
    ctx.clearRect(0, 0, VB.width, VB.height);
  }

  function drawBetspotFrame(timeMs = performance.now()) {
    const ctx = getCtx();
    const assets = assetsRef.current;
    const graph = graphRef.current;
    if (!ctx || !assets) return;

    clearCanvas(ctx);
    const { formation, loopTimeMs } = getIntroState(timeMs);
    paintInnerEnergy(
      ctx,
      assets.plasmaLayer,
      graph,
      timeMs,
      formation,
      loopTimeMs,
    );
  }

  function drawFinal() {
    const ctx = getCtx();
    const { plasmaLayer } = assetsRef.current ?? {};
    if (!ctx || !plasmaLayer) return;
    clearCanvas(ctx);
    paintInnerEnergyStatic(ctx, plasmaLayer);
    drawRim();
  }

  const SETTLE_MS = 500;

  function play() {
    if (!ready || !graphRef.current || !assetsRef.current) return;
    cancelAnimationFrame(rafRef.current);
    resetIntro();
    startRef.current = performance.now();
    setPlaying(true);
    setStepLabel("");

    const frame = (now) => {
      const elapsed = now - startRef.current;
      const ctx = getCtx();
      if (!ctx) return;

      clearCanvas(ctx);
      const { formation, loopTimeMs } = getIntroState(now);
      paintInnerEnergy(
        ctx,
        assetsRef.current.plasmaLayer,
        graphRef.current,
        now,
        formation,
        loopTimeMs,
      );
      paintNetworkStrikeFrame(
        ctx,
        assetsRef.current.plasmaLayer,
        graphRef.current,
        elapsed,
        { skipClear: true },
      );
      drawRim(now);
      applyBetspotShake(now);

      const seg = NETWORK_TIMELINE.segs.find(
        (s) => elapsed >= s.start && elapsed < s.end,
      );
      setStepLabel(seg ? seg.label : "");

      if (elapsed < NETWORK_TIMELINE.total + SETTLE_MS) {
        rafRef.current = requestAnimationFrame(frame);
      } else {
        setPlaying(false);
        setStepLabel("");
        drawFinal();
      }
    };
    rafRef.current = requestAnimationFrame(frame);
  }

  const isLoading = !ready && !loadError;

  return (
    <div className="paths-page">
      <header className="paths-page__header">
        <a className="paths-page__back" href="/">← Main canvas</a>
        <h1>Betspot activation — video reference</h1>
        <p>
          Phase 1 (~{VIBRATION_MS / 1000}s): vibration + inner energy 0→1 + neon border.
          Phase 2: looping plasma drift on filament paths. Outer fringe disabled.
        </p>
      </header>

      <div
        className="paths-stage-wrap"
        style={{ "--rim-bleed": `${RIM_BLEED_CSS}px` }}
      >
        <div className="paths-stage-shake" ref={shakeRef}>
        <div
          className="paths-stage betspot-stage"
          style={{
            width: STAGE_W,
            height: STAGE_H,
            borderRadius: `${BETSPOT_CORNER_RADIUS_CSS}px`,
          }}
          aria-label="Paths strike preview"
        >
        <canvas
          ref={rimRef}
          className="paths-stage__rim"
          aria-hidden
        />
        <div
          className="betspot-stage__bg"
          style={{ backgroundImage: `url(${SVG_PATHS.frame})` }}
          aria-hidden
        />
        <canvas ref={canvasRef} className="betspot-stage__canvas" aria-hidden={isLoading} />
        <img
          src={SVG_PATHS.overlay}
          alt=""
          className="betspot-stage__layer betspot-stage__overlay"
          width={STAGE_W}
          height={STAGE_H}
          draggable={false}
        />
        {isLoading && <div className="paths-stage__loading">{phase}</div>}
        {playing && stepLabel && !isLoading && (
          <div className="paths-stage__phase">{stepLabel}</div>
        )}
        </div>
        </div>
      </div>

      <div className="paths-controls">
        <div className="paths-controls__row">
          <button type="button" className="paths-btn" disabled={!ready || playing} onClick={play}>
            ▶ Play sequence
          </button>
          <button
            type="button"
            className="paths-btn"
            disabled={!ready || playing}
            onClick={() => {
              resetIntro();
              drawBetspotFrame(performance.now());
              drawRim(performance.now());
            }}
          >
            ↻ Replay intro
          </button>
        </div>

        <label className="paths-controls__row paths-controls__slider">
          <span>Brightness floor ({threshold}) — lower = wider network</span>
          <input
            type="range"
            min="200"
            max="720"
            step="10"
            disabled={playing}
            value={threshold}
            onChange={(e) => setThreshold(Number(e.target.value))}
          />
        </label>

        {loadError && <p className="paths-controls__error">{loadError}</p>}
        {stats && (
          <p className="paths-controls__stats">
            <strong>{stats.brightPixels.toLocaleString()}</strong> network pixels ·
            source <strong>{stats.cw}×{stats.ch}</strong> px ·
            graph span SW {stats.maxSW} / E {stats.maxE} / N {stats.maxN} ·
            intro {VIBRATION_MS}ms / formation {FORMATION_MS}ms
          </p>
        )}
      </div>
    </div>
  );
}
