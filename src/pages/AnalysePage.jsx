import { useRef, useState } from "react";
import AnalyseBetspot from "../analyse/AnalyseBetspot.jsx";
import PlasmaControls from "../analyse/PlasmaControls.jsx";
import { PLASMA_CONFIG } from "../analyse/plasmaGL.js";
import { OUTER_CONFIG } from "../analyse/outerBorderGL.js";
import { THEMES } from "../analyse/spec.js";
import "./AnalysePage.css";

function themedView(base, overrides) {
  return new Proxy(base, {
    get: (target, key) => (key in overrides ? overrides[key] : target[key]),
    set: (target, key, value) => {
      (key in overrides ? overrides : target)[key] = value;
      return true;
    },
    has: (target, key) => key in overrides || key in target,
  });
}

export default function AnalysePage() {
  const configRef = useRef(null);
  if (!configRef.current) configRef.current = structuredClone(PLASMA_CONFIG);
  const config = configRef.current;

  const outerConfigRef = useRef(null);
  if (!outerConfigRef.current) outerConfigRef.current = structuredClone(OUTER_CONFIG);
  const outerConfig = outerConfigRef.current;

  const viewsRef = useRef(null);
  if (!viewsRef.current) {
    viewsRef.current = THEMES.map((theme) => ({
      theme,
      config: themedView(config, structuredClone(theme.inner)),
      outerConfig: themedView(outerConfig, structuredClone(theme.outer)),
    }));
  }
  const views = viewsRef.current;

  const [playSignal, setPlaySignal] = useState(0);

  return (
    <div className="analyse-page">
      <header className="analyse-page__header">
        <a className="analyse-page__link" href="/">
          ← Home
        </a>
        <h1 className="analyse-page__title">Analyse — inner energy</h1>
        <p className="analyse-page__subtitle">
          Four coloured betspots (blue, green, yellow, pink) sharing one shape/motion
          config. The body, glow and top-bar are pure CSS; the inner energy and outer
          border are two WebGL shaders. Only the colours differ per betspot. Open the
          controls to tune shape and motion live across all four.
        </p>
      </header>

      <div className="analyse-page__toolbar">
        <button
          type="button"
          className="analyse-btn analyse-btn_primary"
          onClick={() => setPlaySignal((n) => n + 1)}
        >
          Trigger all animations
        </button>
      </div>

      <div className="analyse-page__row">
        {views.map((view) => (
          <AnalyseBetspot
            key={view.theme.key}
            theme={view.theme}
            config={view.config}
            outerConfig={view.outerConfig}
            playSignal={playSignal}
          />
        ))}
      </div>

      <PlasmaControls config={config} outerConfig={outerConfig} />
    </div>
  );
}
