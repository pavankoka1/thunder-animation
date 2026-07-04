import { useReducer, useState } from "react";
import { PLASMA_CONFIG } from "./plasmaGL.js";
import { EASINGS, OUTER_CONFIG } from "./outerBorderGL.js";

const INNER_SLIDERS = [
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

const OUTER_SLIDERS = [
  [
    "Travel & timing",
    [
      ["formationMs", "Loop time (ms)", 400, 6000, 50],
      ["heartbeat", "Heartbeat amount", 0, 0.6, 0.02],
      ["headBoost", "Spark brightness", 0, 4, 0.05],
      ["tailLength", "Tail length", 0.02, 0.6, 0.01],
      ["flameScroll", "Flame speed", 0, 2, 0.02],
      ["flicker", "Flicker rate", 0, 10, 0.1],
    ],
  ],
  [
    "Texture / amplitude",
    [
      ["flameOutreach", "Flame amplitude", 0, 40, 0.5],
      ["freqAlong", "Tongues around", 4, 60, 1],
      ["freqAcross", "Detail across", 4, 60, 1],
      ["innerRaggedFreq", "Inner crackle", 4, 80, 1],
      ["topBias", "Top-edge bias", 0, 1, 0.02],
    ],
  ],
  [
    "Widths / glow",
    [
      ["coreWidth", "Core width", 0.5, 10, 0.25],
      ["midWidth", "Mid width", 1, 20, 0.5],
      ["haloWidth", "Halo width", 4, 60, 1],
      ["coreIntensity", "Core intensity", 0, 2, 0.05],
      ["midIntensity", "Mid intensity", 0, 2, 0.05],
      ["haloIntensity", "Halo intensity", 0, 2, 0.05],
    ],
  ],
];

function ControlSection({ title, target, sliders, defaults, extras, onChange }) {
  const setNum = (key) => (e) => {
    target[key] = Number(e.target.value);
    onChange();
  };
  const reset = () => {
    Object.assign(target, structuredClone(defaults));
    onChange();
  };

  return (
    <section className="controls-modal__section">
      <div className="controls-modal__section-head">
        <h3>{title}</h3>
        <button type="button" className="analyse-btn" onClick={reset}>
          Reset
        </button>
      </div>

      {sliders.map(([group, rows]) => (
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
                value={target[key]}
                onInput={setNum(key)}
                onChange={setNum(key)}
              />
              <output>{target[key]}</output>
            </label>
          ))}
        </fieldset>
      ))}

      {extras}
    </section>
  );
}

export default function PlasmaControls({ config, outerConfig }) {
  const [open, setOpen] = useState(false);
  const [, force] = useReducer((n) => n + 1, 0);

  const setEasing = (e) => {
    outerConfig.easing = e.target.value;
    force();
  };

  const easingRow = (
    <fieldset className="plasma-controls__group">
      <legend>Easing</legend>
      <label className="plasma-controls__row">
        <span>Reveal easing</span>
        <select value={outerConfig.easing} onChange={setEasing}>
          {Object.keys(EASINGS).map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
        <output>{outerConfig.easing}</output>
      </label>
    </fieldset>
  );

  return (
    <>
      <button
        type="button"
        className="analyse-btn analyse-btn_primary controls-modal__toggle"
        onClick={() => setOpen(true)}
      >
        Open controls
      </button>

      {open && (
        <div
          className="controls-modal__backdrop"
          role="presentation"
          onClick={() => setOpen(false)}
        >
          <div
            className="controls-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Animation controls"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="controls-modal__header">
              <h2>Animation controls</h2>
              <button
                type="button"
                className="controls-modal__close"
                aria-label="Close controls"
                onClick={() => setOpen(false)}
              >
                ×
              </button>
            </header>

            <div className="controls-modal__body">
              <ControlSection
                title="Outer border"
                target={outerConfig}
                sliders={OUTER_SLIDERS}
                defaults={OUTER_CONFIG}
                extras={easingRow}
                onChange={force}
              />
              <ControlSection
                title="Inner energy"
                target={config}
                sliders={INNER_SLIDERS}
                defaults={PLASMA_CONFIG}
                onChange={force}
              />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
