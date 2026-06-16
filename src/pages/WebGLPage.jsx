import { useCallback, useState } from "react";
import ThunderWebGL, { DEFAULT_THUNDER_PARAMS } from "../components/ThunderWebGL.jsx";
import { DEFAULT_STRIKE_TIMING, MAX_TRUNK_COUNT } from "../webgl/thunderConfig.js";
import "./WebGLPage.css";

export default function WebGLPage() {
  const [thickness, setThickness] = useState(DEFAULT_THUNDER_PARAMS.thickness);
  const [branchDensity, setBranchDensity] = useState(DEFAULT_THUNDER_PARAMS.branchDensity);
  const [branches, setBranches] = useState(DEFAULT_THUNDER_PARAMS.branches);
  const [trunkCount, setTrunkCount] = useState(DEFAULT_THUNDER_PARAMS.trunkCount);
  const [seed, setSeed] = useState(42);
  const [strikeNonce, setStrikeNonce] = useState(0);

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

  const params = {
    thickness,
    branchDensity,
    branches,
    trunkCount,
    seed,
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
          Bolts grow from the center toward the edges. Adjust bolt count (up to {MAX_TRUNK_COUNT})
          and timing — defaults live in <code>src/webgl/thunderConfig.js</code>.
        </p>
        <a className="webgl-page__link" href="/">
          ← Canvas route
        </a>
      </header>

      <ThunderWebGL params={params} strikeNonce={strikeNonce} />

      <div className="webgl-controls">
        <button
          type="button"
          className="webgl-controls__btn webgl-controls__btn_primary"
          onClick={playStrike}
        >
          Play strike
        </button>

        <label className="webgl-controls__row">
          <span className="webgl-controls__label">
            Bolt count
            <output className="webgl-controls__value">{trunkCount}</output>
          </span>
          <input
            type="range"
            min="1"
            max={MAX_TRUNK_COUNT}
            step="1"
            value={trunkCount}
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
            disabled={!branches}
            onChange={(e) => setBranchDensity(Number(e.target.value))}
          />
        </label>

        <label className="webgl-controls__toggle">
          <input
            type="checkbox"
            checked={branches}
            onChange={(e) => setBranches(e.target.checked)}
          />
          Branches
        </label>

        <button type="button" className="webgl-controls__btn" onClick={reshuffle}>
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

          <label className="webgl-controls__row">
            <span className="webgl-controls__label">
              Branch growth min
              <output className="webgl-controls__value">{branchGrowthMin.toFixed(3)}</output>
            </span>
            <input
              type="range"
              min="0.01"
              max="0.2"
              step="0.005"
              value={branchGrowthMin}
              onChange={(e) => setBranchGrowthMin(Number(e.target.value))}
            />
          </label>

          <label className="webgl-controls__row">
            <span className="webgl-controls__label">
              Branch growth max
              <output className="webgl-controls__value">{branchGrowthMax.toFixed(3)}</output>
            </span>
            <input
              type="range"
              min="0.02"
              max="0.25"
              step="0.005"
              value={branchGrowthMax}
              onChange={(e) => setBranchGrowthMax(Number(e.target.value))}
            />
          </label>

          <p className="webgl-controls__hint">
            Stagger auto-clamps when bolt count is high so every trunk finishes within the 0–1
            timeline.
          </p>
        </details>
      </div>
    </div>
  );
}
