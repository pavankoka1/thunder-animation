import { useReducer } from "react";
import { PLASMA_CONFIG } from "./plasmaGL.js";

/** Slider groups over the shared, mutable `config` object the renderer reads. */
const SLIDERS = [
  [
    "Density / structure",
    [
      ["cellScaleX", "Bolt density X", 3, 18, 0.5],
      ["cellScaleY", "Bolt density Y", 2, 10, 0.5],
      ["boltWidth", "Bolt thickness", 0.05, 0.4, 0.005],
      ["boltSharp", "Bolt crispness", 0.5, 5, 0.1],
      ["boltVary", "Bolt variety", 0, 1, 0.02],
    ],
  ],
  [
    "Branches / filaments",
    [
      ["branchStrength", "Branch amount", 0, 1, 0.02],
      ["branchScale", "Branch density", 2, 16, 0.5],
      ["branchSharp", "Branch thinness", 1, 8, 0.1],
      ["filStrength", "Fine fill", 0, 1, 0.02],
      ["crispWidth", "Crisp line width", 0.005, 0.12, 0.002],
      ["crispIntensity", "Crisp finish", 0, 1.2, 0.02],
    ],
  ],
  [
    "Glow",
    [
      ["haloIntensity", "Halo intensity", 0, 2, 0.02],
      ["coreIntensity", "Core intensity", 0, 2, 0.02],
      ["coreThreshold", "Core threshold", 0.2, 0.95, 0.01],
      ["baseIntensity", "Base fill", 0, 1, 0.02],
    ],
  ],
  [
    "Motion",
    [
      ["timeScale", "Overall speed", 0, 3, 0.05],
      ["seedSpeed", "Bolt re-route", 0, 1.5, 0.02],
      ["seedDrift", "Re-route amount", 0, 0.5, 0.01],
      ["warpAmount", "Jaggedness", 0, 3, 0.05],
    ],
  ],
];

const COLORS = [
  ["baseColor", "Base"],
  ["haloColor", "Halo"],
  ["coreColor", "Core"],
];

// Shader colours are 0..1 floats; the <input type="color"> uses 0..255 hex.
const toHex = (rgb) =>
  "#" +
  rgb
    .map((c) => Math.round(c * 255).toString(16).padStart(2, "0"))
    .join("");
const fromHex = (hex) => [
  parseInt(hex.slice(1, 3), 16) / 255,
  parseInt(hex.slice(3, 5), 16) / 255,
  parseInt(hex.slice(5, 7), 16) / 255,
];

/**
 * Live control panel over the plasma `config`. Mutates the same object the
 * renderer reads each frame, so slider/colour edits apply immediately.
 */
export default function PlasmaControls({ config }) {
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
    Object.assign(config, structuredClone(PLASMA_CONFIG));
    force();
  };

  return (
    <details className="plasma-controls" open>
      <summary>Plasma controls</summary>
      <div className="plasma-controls__actions">
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
