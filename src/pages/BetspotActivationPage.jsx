/**
 * BetspotActivationPage — vibration + inner-spot-energy fade + border + path motion.
 */
import { useEffect, useRef, useState } from "react";
import { SVG_FRAME, SVG_PATHS, RENDER_SCALE } from "../canvas/frame.js";
import { loadActivationAssets } from "../canvas/plasma/loadActivationAssets.js";
import { paintActivationInner } from "../canvas/plasma/paintBetspotActivation.js";
import { paintChipBorder } from "../canvas/plasma/paintChipBorder.js";
import { paintTopBallsBorder } from "../canvas/plasma/paintTopBallsBorder.js";
import {
  paintNeonBorder,
  BORDER_BLEED,
} from "../canvas/plasma/paintNeonBorder.js";
import { betspotShakeOffset } from "../canvas/plasma/betspotShake.js";
import {
  formationProgress,
  introElapsed,
  innerLoopTimeMs,
  vibrationIntensity,
  VIBRATION_MS,
  FORMATION_MS,
} from "../canvas/plasma/betspotChoreography.js";
import "./BetspotActivationPage.css";

const VB            = SVG_FRAME;
const DISPLAY_SCALE = RENDER_SCALE;
const STAGE_W       = VB.width  * DISPLAY_SCALE;
const STAGE_H       = VB.height * DISPLAY_SCALE;
const BORDER_BLEED_CSS = BORDER_BLEED * DISPLAY_SCALE;
const RIM_CANVAS_W  = STAGE_W + 2 * BORDER_BLEED_CSS;
const RIM_CANVAS_H  = STAGE_H + 2 * BORDER_BLEED_CSS;
const BETSPOT_CORNER_RADIUS_CSS = 46;

export default function BetspotActivationPage() {
  const canvasRef = useRef(null);
  const rimRef    = useRef(null);
  const fxRef     = useRef(null);
  const shakeRef  = useRef(null);
  const assetsRef = useRef(null);
  const animRafRef = useRef(0);
  const introStartRef = useRef(0);

  const [phase,     setPhase]     = useState("Loading…");
  const [ready,     setReady]     = useState(false);
  const [loadError, setLoadError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setReady(false);
    setLoadError(null);
    assetsRef.current = null;
    setPhase("Loading inner spot energy…");

    loadActivationAssets((msg) => {
      if (!cancelled) setPhase(msg);
    })
      .then((assets) => {
        if (cancelled) return;
        assetsRef.current = assets;
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
      cancelAnimationFrame(animRafRef.current);
    };
  }, []);

  useEffect(() => {
    if (!ready) {
      cancelAnimationFrame(animRafRef.current);
      return undefined;
    }

    const tick = (now) => {
      drawFrame(now);
      applyShake(now);
      animRafRef.current = requestAnimationFrame(tick);
    };
    animRafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animRafRef.current);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  function getIntroState(timeMs) {
    const elapsed = introElapsed(timeMs, introStartRef.current);
    return {
      elapsed,
      formation: formationProgress(elapsed),
      loopTimeMs: innerLoopTimeMs(elapsed, timeMs, introStartRef.current),
    };
  }

  function getMainCtx() {
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

  function drawRim(now) {
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
      BORDER_BLEED_CSS * dpr,
      BORDER_BLEED_CSS * dpr,
    );
    const { formation } = getIntroState(now);
    paintNeonBorder(ctx, formation, now);
  }

  function drawFx(pulseClock, formation) {
    const canvas = fxRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const deviceW = Math.round(STAGE_W * dpr);
    const deviceH = Math.round(STAGE_H * dpr);
    if (canvas.width !== deviceW) {
      canvas.style.width  = `${STAGE_W}px`;
      canvas.style.height = `${STAGE_H}px`;
      canvas.width  = deviceW;
      canvas.height = deviceH;
    }
    const ctx = canvas.getContext("2d");
    ctx.setTransform(DISPLAY_SCALE * dpr, 0, 0, DISPLAY_SCALE * dpr, 0, 0);
    ctx.clearRect(0, 0, VB.width, VB.height);
    paintTopBallsBorder(ctx, pulseClock, formation);
  }

  function drawFrame(timeMs = performance.now()) {
    const ctx = getMainCtx();
    const assets = assetsRef.current;
    if (!ctx || !assets) return;

    ctx.clearRect(0, 0, VB.width, VB.height);
    const { formation, loopTimeMs } = getIntroState(timeMs);
    paintActivationInner(ctx, assets, formation, loopTimeMs);
    const pulseClock = loopTimeMs > 0 ? loopTimeMs : timeMs - introStartRef.current;
    // Chip corona stays on the strike canvas (under overlay) so it only
    // glows in the plasma area outside the chip's footprint — keeps the
    // chip face crisp.
    paintChipBorder(ctx, pulseClock, formation);
    drawRim(timeMs);
    // Balls border goes on the FX layer ABOVE the overlay — otherwise the
    // dark holder shape covers the glow entirely.
    drawFx(pulseClock, formation);
  }

  function applyShake(timeMs) {
    const el = shakeRef.current;
    if (!el) return;
    const { elapsed } = getIntroState(timeMs);
    const intensity = vibrationIntensity(elapsed);
    const { x, y, rot } = betspotShakeOffset(timeMs, { intensity });
    el.style.transform = `translate(${x}px, ${y}px) rotate(${rot}deg)`;
  }

  function replayIntro() {
    introStartRef.current = performance.now();
    drawFrame(performance.now());
  }

  const isLoading = !ready && !loadError;

  return (
    <div className="paths-page">
      <header className="paths-page__header">
        <a className="paths-page__back" href="/">← Main canvas</a>
        <h1>Betspot activation</h1>
        <p>
          Fades in to inner-spot-energy.svg, then the svg&apos;s own filament
          paths wiggle in place — same curves, jittered vertices, endpoints
          pinned.
        </p>
      </header>

      <div
        className="activation-stage-wrap"
        style={{ "--border-bleed": `${BORDER_BLEED_CSS}px` }}
      >
        <div className="activation-stage-shake" ref={shakeRef}>
          <div
            className="activation-stage betspot-stage"
            style={{
              width: STAGE_W,
              height: STAGE_H,
              borderRadius: `${BETSPOT_CORNER_RADIUS_CSS}px`,
            }}
            aria-label="Betspot activation preview"
          >
            <div
              className="betspot-stage__bg"
              style={{ backgroundImage: `url(${SVG_PATHS.frame})` }}
              aria-hidden
            />
            <canvas
              ref={canvasRef}
              className="betspot-stage__canvas"
              aria-hidden={isLoading}
            />
            <canvas
              ref={rimRef}
              className="betspot-stage__rim"
              aria-hidden
            />
            <img
              src={SVG_PATHS.overlay}
              alt=""
              className="betspot-stage__layer betspot-stage__overlay"
              width={STAGE_W}
              height={STAGE_H}
              draggable={false}
            />
            <canvas
              ref={fxRef}
              className="betspot-stage__fx"
              aria-hidden
            />
            {isLoading && (
              <div className="activation-stage__loading">{phase}</div>
            )}
          </div>
        </div>
      </div>

      <div className="activation-controls">
        <div className="activation-controls__row">
          <button
            type="button"
            className="activation-btn"
            disabled={!ready}
            onClick={replayIntro}
          >
            ↻ Replay intro
          </button>
        </div>

        <ol className="activation-timeline">
          <li>
            <strong>0–{(VIBRATION_MS / 1000).toFixed(1)}s</strong> — vibration + border +
            inner energy fade 0→1 (inner-spot-energy.svg)
          </li>
          <li>
            <strong>After {(FORMATION_MS / 1000).toFixed(1)}s</strong> — static
            white filaments dim out; the same extracted polylines are re-stroked
            with per-vertex jitter (700 ms ramp). Endpoints stay fixed.
          </li>
        </ol>

        {loadError && (
          <p className="activation-controls__error">{loadError}</p>
        )}
        {ready && (
          <p className="activation-controls__stats">
            inner motion: svg filament wiggle · intro {VIBRATION_MS}ms · ramp 700ms
          </p>
        )}
      </div>
    </div>
  );
}
