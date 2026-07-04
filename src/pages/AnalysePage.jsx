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
          Blue body and outer glow are pure CSS. The inner energy is a few dense plasma
          frames: each is held, then briefly crossfaded to the next, so the bright bolts
          re-strike along new paths in place while the cell structure stays put. Edge-faded
          and screen-blended over the body. Click to toggle.
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
            <strong>Inner energy</strong> — canvas; a few dense plasma frames
            (<code>plasmaFrames.js</code>) held and briefly crossfaded so the bolts re-strike
            in place, edge-faded and screen-blended over the body
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
