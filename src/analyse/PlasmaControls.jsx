import { useReducer } from "react";
import { DEFAULT_CONFIG } from "./boltField.js";

/** Slider groups over the shared, mutable `config` object the renderer reads. */
const SLIDERS = [
  [
    "Structure",
    [
      ["clusterCount", "Clusters", 1, 6, 1],
      ["clusterSpread", "Cluster spread", 0, 0.7, 0.01],
      ["branchChance", "Branch density", 0, 1, 0.02],
      ["maxDepth", "Max depth", 1, 5, 1],
      ["trunkJitter", "Jaggedness", 4, 60, 1],
      ["branchLenMax", "Branch length", 20, 120, 1],
    ],
  ],
  [
    "Thickness / glow",
    [
      ["haloWidth", "Halo width", 1, 24, 0.5],
      ["midWidth", "Mid width", 0.5, 12, 0.5],
      ["coreWidth", "Core width", 0.3, 6, 0.1],
      ["haloAlpha", "Halo intensity", 0, 0.6, 0.01],
      ["midAlpha", "Mid intensity", 0, 0.8, 0.01],
      ["coreAlpha", "Core intensity", 0, 1, 0.01],
    ],
  ],
  [
    "Motion (ms)",
    [
      ["strikeMs", "Strike duration", 200, 3000, 50],
      ["holdMs", "Hold", 0, 4000, 50],
    ],
  ],
];

const COLORS = [
  ["haloColor", "Halo"],
  ["midColor", "Mid"],
  ["coreColor", "Core"],
];

const toHex = (rgb) =>
  "#" + rgb.map((c) => Math.round(c).toString(16).padStart(2, "0")).join("");
const fromHex = (hex) => [
  parseInt(hex.slice(1, 3), 16),
  parseInt(hex.slice(3, 5), 16),
  parseInt(hex.slice(5, 7), 16),
];

/**
 * Live control panel over the bolt-plasma `config`. Mutates the same object the
 * renderer reads each frame, so edits apply immediately. `onRestrike` bumps the
 * seed to force a fresh bolt-field.
 */
export default function PlasmaControls({ config, onRestrike }) {
  const [, force] = useReducer((n) => n + 1, 0);

  const setNum = (key) => (e) => {
    config[key] = Number(e.target.value);
    force();
  };
  const setColor = (key) => (e) => {
    config[key] = fromHex(e.target.value);
    force();
  };
  const reset = () => {
    Object.assign(config, structuredClone(DEFAULT_CONFIG));
    onRestrike?.();
    force();
  };
  const randomize = () => {
    config.seed = (Math.random() * 0xffffffff) >>> 0;
    onRestrike?.();
    force();
  };

  return (
    <details className="plasma-controls" open>
      <summary>Plasma controls</summary>
      <div className="plasma-controls__actions">
        <button type="button" className="analyse-btn" onClick={randomize}>
          Randomize
        </button>
        <button
          type="button"
          className="analyse-btn"
          onClick={() => (onRestrike?.(), force())}
        >
          Re-strike
        </button>
        <button type="button" className="analyse-btn" onClick={reset}>
          Reset
        </button>
      </div>

      {SLIDERS.map(([group, rows]) => (
        <fieldset className="plasma-controls__group" key={group}>
          <legend>{group}</legend>
          {rows.map(([key, label, min, max, step]) => (
            <label className="plasma-controls__row" key={key}>
              <span>{label}</span>
              <input
                type="range"
                min={min}
                max={max}
                step={step}
                value={config[key]}
                onInput={setNum(key)}
                onChange={setNum(key)}
              />
              <output>{config[key]}</output>
            </label>
          ))}
        </fieldset>
      ))}

      <fieldset className="plasma-controls__group">
        <legend>Colour</legend>
        {COLORS.map(([key, label]) => (
          <label className="plasma-controls__row" key={key}>
            <span>{label}</span>
            <input
              type="color"
              value={toHex(config[key])}
              onInput={setColor(key)}
              onChange={setColor(key)}
            />
            <output>{toHex(config[key])}</output>
          </label>
        ))}
      </fieldset>
    </details>
  );
}
