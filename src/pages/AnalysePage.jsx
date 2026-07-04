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
          Blue body and outer glow are pure CSS. The inner energy is the dense plasma
          texture warped in real time by a slow turbulent flow — the filaments bend and
          churn in place like plasma, no new paths drawn. Screen-blended over the body and
          edge-faded. Click to toggle.
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
            <strong>Inner energy</strong> — canvas; the dense plasma texture
            (<code>plasmaFlow.js</code>) warped each frame by a slow turbulent flow so its
            filaments churn in place like plasma, edge-faded and screen-blended over the body
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
