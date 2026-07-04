import { useRef } from "react";
import AnalyseBetspot from "../analyse/AnalyseBetspot.jsx";
import PlasmaControls from "../analyse/PlasmaControls.jsx";
import { PLASMA_CONFIG } from "../analyse/plasmaGL.js";
import "./AnalysePage.css";

export default function AnalysePage() {
  // One mutable config shared by the renderer and the control panel.
  const configRef = useRef(null);
  if (!configRef.current) configRef.current = structuredClone(PLASMA_CONFIG);
  const config = configRef.current;

  return (
    <div className="analyse-page">
      <header className="analyse-page__header">
        <a className="analyse-page__link" href="/">
          ← Home
        </a>
        <h1 className="analyse-page__title">Analyse — inner energy</h1>
        <p className="analyse-page__subtitle">
          Blue body and outer glow are pure CSS. The inner energy is drawn procedurally in
          WebGL — an electric-voronoi plasma whose cell borders form branching bolts that
          re-route over time, with finer ridged filaments and a crisp core line. No images.
          Tune it live with the controls below. Click the spot to toggle.
        </p>
      </header>

      <AnalyseBetspot config={config} />

      <PlasmaControls config={config} />

      <section className="analyse-page__notes">
        <h2>Layers (bottom → top)</h2>
        <ol>
          <li>
            <strong>Body</strong> — CSS blue gradient + outer glow (no PNG)
          </li>
          <li>
            <strong>Inner energy</strong> — WebGL electric-voronoi plasma (
            <code>plasmaGL.js</code>): drifting cell borders form the bolts, ridged
            filaments add branches, a thin core line crisps them up — edge-faded and
            screen-blended over the body
          </li>
          <li>
            <strong>Neon border</strong> — CSS glow, same colours as{" "}
            <code>paintNeonBorder.js</code>
          </li>
          <li>
            <strong>Top bar</strong> — status pill (<code>top-bar.png</code>)
          </li>
          <li>
            <strong>Chip</strong> — denomination chip (<code>chip.png</code>)
          </li>
        </ol>
      </section>
    </div>
  );
}
