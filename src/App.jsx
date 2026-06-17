import { useState } from "react";
import "./App.css";
import BetspotStage from "./components/BetspotStage.jsx";

export default function App() {
  const [canvasMode, setCanvasMode] = useState("static");
  const [playNonce, setPlayNonce] = useState(0);
  const [refPlasma, setRefPlasma] = useState(false);
  const [debugPaths, setDebugPaths] = useState(false);

  const bumpPaint = () => setPlayNonce((n) => n + 1);

  const playStrike = () => {
    setCanvasMode("strike");
    bumpPaint();
  };

  const showPattern = () => {
    setCanvasMode("static");
    bumpPaint();
  };

  const clearCanvas = () => {
    setCanvasMode("idle");
    bumpPaint();
  };

  return (
    <div className="app">
      <header className="app__header">
        <a className="app__route-link" href="/webgl">
          WebGL experiment →
        </a>
        <h1 className="app__title">SVG → Canvas (animated)</h1>
        <p className="app__subtitle">
          Paths are extracted from plasma.svg: 3 center thunder clusters are detected,
          traced along the art, extended toward the edges, with sub-branches on bright
          pixels.
        </p>
      </header>

      <div className="compare">
        <section className="compare__col">
          <h2 className="compare__label">SVG (reference)</h2>
          <div className="compare__frame">
            <BetspotStage showPlasma={refPlasma} variant="reference" />
          </div>
        </section>

        <section className="compare__col">
          <h2 className="compare__label">Canvas</h2>
          <div className="compare__frame">
            <BetspotStage
              canvasMode={canvasMode}
              playNonce={playNonce}
              debugPaths={debugPaths}
              variant="canvas"
            />
          </div>
        </section>
      </div>

      <div className="controls">
        <button type="button" className="btn" onClick={() => setRefPlasma((v) => !v)}>
          {refPlasma ? "Hide reference plasma" : "Show reference plasma"}
        </button>
        <button type="button" className="btn btn_primary" onClick={showPattern}>
          Show pattern
        </button>
        <button type="button" className="btn btn_primary" onClick={playStrike}>
          Play strike
        </button>
        <button type="button" className="btn" onClick={clearCanvas}>
          Clear
        </button>
        <label className="toggle">
          <input
            type="checkbox"
            checked={debugPaths}
            onChange={(e) => setDebugPaths(e.target.checked)}
          />
          Debug paths
        </label>
      </div>

      <details className="analysis">
        <summary>Layer structure</summary>
        <dl>
          <dt>Show pattern</dt>
          <dd>
            Full plasma layer rasterized from plasma.svg — same as the reference img.
          </dd>
          <dt>Play strike</dt>
          <dd>
            Energy expands from 3 center clusters along thin filaments; a soft wave
            connects them during the strike. End state matches Show pattern.
          </dd>
        </dl>
      </details>
    </div>
  );
}
