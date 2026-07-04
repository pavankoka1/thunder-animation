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
          Blue body and outer glow are pure CSS. The inner energy is drawn procedurally in
          a WebGL shader — an electric-voronoi plasma whose cell borders are the bolts;
          the seeds drift over time so the bolts re-strike along new paths. No images.
          Edge-faded and screen-blended over the body. Click to toggle.
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
            <strong>Inner energy</strong> — WebGL; a procedural electric-voronoi plasma
            (<code>plasmaGL.js</code>) whose drifting cell borders are the re-striking bolts,
            edge-faded and screen-blended over the body
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
