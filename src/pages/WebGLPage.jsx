import { useCallback, useState } from "react";
import ThunderWebGL, { DEFAULT_THUNDER_PARAMS } from "../components/ThunderWebGL.jsx";
import {
  DEFAULT_BETSPOT_APPEARANCE,
  DEFAULT_STRIKE_TIMING,
  MAX_TRUNK_COUNT,
} from "../webgl/thunderConfig.js";
import "./WebGLPage.css";

export default function WebGLPage() {
  const [boltSource, setBoltSource] = useState(DEFAULT_THUNDER_PARAMS.boltSource);
  const [thickness, setThickness] = useState(DEFAULT_THUNDER_PARAMS.thickness);
  const [branchDensity, setBranchDensity] = useState(DEFAULT_THUNDER_PARAMS.branchDensity);
  const [branches, setBranches] = useState(DEFAULT_THUNDER_PARAMS.branches);
  const [trunkCount, setTrunkCount] = useState(DEFAULT_THUNDER_PARAMS.trunkCount);
  const [seed, setSeed] = useState(42);
  const [strikeNonce, setStrikeNonce] = useState(0);
  const [showPatternNonce, setShowPatternNonce] = useState(0);
  const [clearNonce, setClearNonce] = useState(0);

  const [bgTop, setBgTop] = useState(DEFAULT_BETSPOT_APPEARANCE.bgTop);
  const [bgBottom, setBgBottom] = useState(DEFAULT_BETSPOT_APPEARANCE.bgBottom);
  const [showOverlay, setShowOverlay] = useState(DEFAULT_BETSPOT_APPEARANCE.showOverlay);
  const [showFrame, setShowFrame] = useState(DEFAULT_BETSPOT_APPEARANCE.showFrame);

  const [durationMs, setDurationMs] = useState(DEFAULT_STRIKE_TIMING.durationMs);
  const [trunkFinish, setTrunkFinish] = useState(DEFAULT_STRIKE_TIMING.trunkFinish);
  const [trunkStagger, setTrunkStagger] = useState(DEFAULT_STRIKE_TIMING.trunkStagger);
  const [branchGrowthMin, setBranchGrowthMin] = useState(DEFAULT_STRIKE_TIMING.branchGrowthMin);
  const [branchGrowthMax, setBranchGrowthMax] = useState(DEFAULT_STRIKE_TIMING.branchGrowthMax);

  const reshuffle = useCallback(() => {
    setSeed((s) => (s + 1) >>> 0);
  }, []);

  const playStrike = useCallback(() => {
    setStrikeNonce((n) => n + 1);
  }, []);

  const showPattern = useCallback(() => {
    setShowPatternNonce((n) => n + 1);
  }, []);

  const clearPattern = useCallback(() => {
    setClearNonce((n) => n + 1);
  }, []);

  const isArt = boltSource === "art";

  const params = {
    boltSource,
    thickness,
    branchDensity,
    branches,
    trunkCount: isArt ? 3 : trunkCount,
    seed,
    appearance: { bgTop, bgBottom, showOverlay, showFrame },
    strikeTiming: {
      durationMs,
      trunkFinish,
      trunkStagger,
      branchGrowthMin,
      branchGrowthMax,
    },
  };

  return (
    <div className="webgl-page">
      <header className="webgl-page__header">
        <h1 className="webgl-page__title">WebGL thunder</h1>
        <p className="webgl-page__subtitle">
          Plasma is revealed along bolt paths during the strike (same mask logic as the canvas
          route). Chip and balls sit above the animation.
        </p>
        <a className="webgl-page__link" href="/">
          ← Canvas route
        </a>
      </header>

      <ThunderWebGL
        params={params}
        strikeNonce={strikeNonce}
        showPatternNonce={showPatternNonce}
        clearNonce={clearNonce}
      />

      <div className="webgl-controls">
        <button
          type="button"
          className="webgl-controls__btn webgl-controls__btn_primary"
          onClick={playStrike}
        >
          Play strike
        </button>

        <button type="button" className="webgl-controls__btn" onClick={showPattern}>
          Show pattern
        </button>

        <button type="button" className="webgl-controls__btn" onClick={clearPattern}>
          Clear
        </button>

        <label className="webgl-controls__row">
          <span className="webgl-controls__label">Bolt source</span>
          <select
            className="webgl-controls__select"
            value={boltSource}
            onChange={(e) => setBoltSource(e.target.value)}
          >
            <option value="art">plasma.svg (3 clusters)</option>
            <option value="procedural">Procedural</option>
          </select>
        </label>

        <label className="webgl-controls__row">
          <span className="webgl-controls__label">
            BG top
            <input type="color" value={bgTop} onChange={(e) => setBgTop(e.target.value)} />
          </span>
        </label>

        <label className="webgl-controls__row">
          <span className="webgl-controls__label">
            BG bottom
            <input type="color" value={bgBottom} onChange={(e) => setBgBottom(e.target.value)} />
          </span>
        </label>

        <label className="webgl-controls__toggle">
          <input
            type="checkbox"
            checked={showOverlay}
            onChange={(e) => setShowOverlay(e.target.checked)}
          />
          Chip &amp; balls overlay
        </label>

        <label className="webgl-controls__toggle">
          <input
            type="checkbox"
            checked={showFrame}
            onChange={(e) => setShowFrame(e.target.checked)}
          />
          Frame border
        </label>

        <label className="webgl-controls__row">
          <span className="webgl-controls__label">
            Bolt count
            <output className="webgl-controls__value">{isArt ? 3 : trunkCount}</output>
          </span>
          <input
            type="range"
            min="1"
            max={MAX_TRUNK_COUNT}
            step="1"
            value={trunkCount}
            disabled={isArt}
            onChange={(e) => setTrunkCount(Number(e.target.value))}
          />
        </label>

        <label className="webgl-controls__row">
          <span className="webgl-controls__label">
            Thickness
            <output className="webgl-controls__value">{thickness.toFixed(2)}×</output>
          </span>
          <input
            type="range"
            min="0.25"
            max="3"
            step="0.05"
            value={thickness}
            onChange={(e) => setThickness(Number(e.target.value))}
          />
        </label>

        <label className="webgl-controls__row">
          <span className="webgl-controls__label">
            Branch density
            <output className="webgl-controls__value">{Math.round(branchDensity * 100)}%</output>
          </span>
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={branchDensity}
            disabled={!branches || isArt}
            onChange={(e) => setBranchDensity(Number(e.target.value))}
          />
        </label>

        <label className="webgl-controls__toggle">
          <input
            type="checkbox"
            checked={branches}
            disabled={isArt}
            onChange={(e) => setBranches(e.target.checked)}
          />
          Branches
        </label>

        <button
          type="button"
          className="webgl-controls__btn"
          onClick={reshuffle}
          disabled={isArt}
        >
          Reshuffle branches
        </button>

        <details className="webgl-controls__timing">
          <summary className="webgl-controls__timing-summary">Strike timing</summary>

          <label className="webgl-controls__row">
            <span className="webgl-controls__label">
              Duration
              <output className="webgl-controls__value">{durationMs} ms</output>
            </span>
            <input
              type="range"
              min="400"
              max="6000"
              step="100"
              value={durationMs}
              onChange={(e) => setDurationMs(Number(e.target.value))}
            />
          </label>

          <label className="webgl-controls__row">
            <span className="webgl-controls__label">
              Trunk travel
              <output className="webgl-controls__value">{Math.round(trunkFinish * 100)}%</output>
            </span>
            <input
              type="range"
              min="0.2"
              max="0.9"
              step="0.01"
              value={trunkFinish}
              onChange={(e) => setTrunkFinish(Number(e.target.value))}
            />
          </label>

          <label className="webgl-controls__row">
            <span className="webgl-controls__label">
              Trunk stagger
              <output className="webgl-controls__value">{trunkStagger.toFixed(3)}</output>
            </span>
            <input
              type="range"
              min="0"
              max="0.12"
              step="0.001"
              value={trunkStagger}
              onChange={(e) => setTrunkStagger(Number(e.target.value))}
            />
          </label>

          <p className="webgl-controls__hint">
            Art mode: bolts expand from 3 center clusters with a thin electric halo;
            coverage follows bolt reach to the edges (no end pop).
          </p>
        </details>
      </div>
    </div>
  );
}
