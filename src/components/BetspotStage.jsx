import BetspotCanvas from "./BetspotCanvas.jsx";
import { RENDER_SCALE, SVG_FRAME, SVG_PATHS } from "../canvas/svgRenderer.js";

const stageWidth = SVG_FRAME.width * RENDER_SCALE;
const stageHeight = SVG_FRAME.height * RENDER_SCALE;

export default function BetspotStage({
  showPlasma,
  canvasMode = "idle",
  playNonce = 0,
  debugPaths = false,
  variant = "canvas",
}) {
  const stageClass = `betspot-stage betspot-stage_${variant}`;

  if (variant === "reference") {
    return (
      <div
        className={stageClass}
        style={{ width: stageWidth, height: stageHeight }}
        aria-label={
          showPlasma ? "Betspot with plasma (SVG reference)" : "Betspot (SVG reference)"
        }
      >
        <div
          className="betspot-stage__bg"
          style={{ backgroundImage: `url(${SVG_PATHS.frame})` }}
          aria-hidden
        />
        {showPlasma && (
          <img
            src={SVG_PATHS.plasma}
            alt=""
            className="betspot-stage__layer betspot-stage__plasma-ref"
            width={stageWidth}
            height={stageHeight}
            draggable={false}
          />
        )}
        <img
          src={SVG_PATHS.overlay}
          alt=""
          className="betspot-stage__layer betspot-stage__overlay"
          width={stageWidth}
          height={stageHeight}
          draggable={false}
        />
      </div>
    );
  }

  return (
    <div
      className={stageClass}
      style={{ width: stageWidth, height: stageHeight }}
      aria-label="Betspot canvas layer"
    >
      <div
        className="betspot-stage__bg"
        style={{ backgroundImage: `url(${SVG_PATHS.frame})` }}
        aria-hidden
      />
      <BetspotCanvas mode={canvasMode} playNonce={playNonce} debugPaths={debugPaths} />
      <img
        src={SVG_PATHS.overlay}
        alt=""
        className="betspot-stage__layer betspot-stage__overlay"
        width={stageWidth}
        height={stageHeight}
        draggable={false}
      />
    </div>
  );
}
