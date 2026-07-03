import AnalyseBetspot from "../analyse/AnalyseBetspot.jsx";
import "./AnalysePage.css";

export default function AnalysePage() {
  return (
    <div className="analyse-page">
      <header className="analyse-page__header">
        <a className="analyse-page__link" href="/">
          ← Home
        </a>
        <h1 className="analyse-page__title">Analyse — inner energy</h1>
        <p className="analyse-page__subtitle">
          Blue body and outer glow are pure CSS. The inner energy is a procedurally
          generated lightning network — filaments branch out from three hubs and their
          paths continuously reform in code (grow, retract, regrow on new routes). Painted
          with additive neon glow, screen-blended over the body and edge-faded. Click to
          toggle.
        </p>
      </header>

      <AnalyseBetspot />

      <section className="analyse-page__notes">
        <h2>Layers (bottom → top)</h2>
        <ol>
          <li>
            <strong>Body</strong> — CSS blue gradient + outer glow (no PNG)
          </li>
          <li>
            <strong>Inner energy</strong> — canvas; filament web detected from the plasma
            texture (<code>isThunderFilament</code>), recoloured + radially masked with
            halo/mid/core glow, screen-blended over the body
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
