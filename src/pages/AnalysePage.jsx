import { useMemo, useState } from "react";
import AnalyseBetspot from "../analyse/AnalyseBetspot.jsx";
import { THEMES, themeConfig } from "../analyse/config/index.js";
import "./AnalysePage.css";

export default function AnalysePage() {
  const views = useMemo(
    () =>
      THEMES.map((theme) => ({
        theme,
        ...themeConfig(theme),
      })),
    []
  );

  const [playSignal, setPlaySignal] = useState(0);

  return (
    <div className="analyse-page">
      <header className="analyse-page__header">
        <a className="analyse-page__link" href="/">
          ← Home
        </a>
        <h1 className="analyse-page__title">Analyse — inner energy</h1>
        <p className="analyse-page__subtitle">
          Four coloured betspots sharing one shape and motion config. Body, glow, and
          top-bar are CSS; inner plasma and outer border are WebGL shaders. Tune defaults
          in <code>src/analyse/config/</code> and reload.
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
            innerConfig={view.inner}
            outerConfig={view.outer}
            playSignal={playSignal}
          />
        ))}
      </div>
    </div>
  );
}
