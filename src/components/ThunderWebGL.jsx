import { useEffect, useRef, useState } from "react";
import { createThunderRenderer } from "../webgl/thunderRenderer.js";
import { DEFAULT_THUNDER_CONFIG } from "../webgl/thunderConfig.js";
import { loadArtBoltTree } from "../webgl/loadArtBoltTree.js";
import { RENDER_SCALE, sizeCanvas, SVG_FRAME, SVG_PATHS } from "../canvas/svgRenderer.js";

/** Match plasma.svg viewBox (84×68) at 4× — identical to the canvas route. */
export const BETSPOT_W = SVG_FRAME.width * RENDER_SCALE;
export const BETSPOT_H = SVG_FRAME.height * RENDER_SCALE;

export const DEFAULT_THUNDER_PARAMS = DEFAULT_THUNDER_CONFIG;

export default function ThunderWebGL({
  params = DEFAULT_THUNDER_PARAMS,
  strikeNonce = 0,
  showPatternNonce = 0,
  clearNonce = 0,
}) {
  const canvasRef = useRef(null);
  const rendererRef = useRef(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(params.boltSource === "art");

  const appearance = params.appearance ?? DEFAULT_THUNDER_CONFIG.appearance;
  const showFrame = appearance.showFrame !== false;
  const showOverlay = appearance.showOverlay !== false;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;

    let cancelled = false;

    async function init() {
      setLoading(params.boltSource === "art");
      setError(null);

      try {
        let boltTree;
        let plasmaLayer;
        let pathTree;
        let frameImage;

        // Must not call setupCanvas here — getContext("2d") blocks WebGL2 on the same canvas.
        const { width: backingW, height: backingH } = sizeCanvas(
          canvas,
          SVG_FRAME,
          RENDER_SCALE,
          window.devicePixelRatio || 1
        );

        if (params.boltSource === "art") {
          ({ boltTree, plasmaLayer, pathTree, frameImage } = await loadArtBoltTree(
            backingW,
            backingH
          ));
          if (cancelled) return;
        }

        rendererRef.current?.destroy();
        rendererRef.current = createThunderRenderer(canvas, {
          ...params,
          tree: boltTree,
        });
        rendererRef.current.setParams(params);

        if (plasmaLayer && pathTree) {
          rendererRef.current.setArtAssets({ plasmaLayer, pathTree, frameImage });
          // Art mode starts in idle (blank) — show the static plasma immediately.
          rendererRef.current.showPattern();
        }

        setLoading(false);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "WebGL init failed");
        rendererRef.current = null;
        setLoading(false);
      }
    }

    init();

    return () => {
      cancelled = true;
      rendererRef.current?.destroy();
      rendererRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.boltSource]);

  useEffect(() => {
    if (loading) return;
    rendererRef.current?.setParams(params);
  }, [
    loading,
    params.boltSource,
    params.thickness,
    params.branchDensity,
    params.branches,
    params.seed,
    params.trunkCount,
    params.appearance?.bgTop,
    params.appearance?.bgBottom,
    params.appearance?.showFrame,
    params.appearance?.showOverlay,
    params.strikeTiming?.durationMs,
    params.strikeTiming?.trunkFinish,
    params.strikeTiming?.trunkStagger,
    params.strikeTiming?.branchGrowthMin,
    params.strikeTiming?.branchGrowthMax,
  ]);

  useEffect(() => {
    if (strikeNonce > 0 && !loading) {
      rendererRef.current?.playStrike();
    }
  }, [strikeNonce, loading]);

  useEffect(() => {
    if (showPatternNonce > 0 && !loading) {
      rendererRef.current?.showPattern();
    }
  }, [showPatternNonce, loading]);

  useEffect(() => {
    if (clearNonce > 0 && !loading) {
      rendererRef.current?.clearPattern();
    }
  }, [clearNonce, loading]);

  const isArt = params.boltSource === "art";

  return (
    <div
      className="thunder-webgl thunder-webgl-stage"
      style={{ width: BETSPOT_W, height: BETSPOT_H }}
      aria-label="WebGL betspot"
    >
      {/* Art mode bakes the frame into the WebGL composite — no separate bg layer. */}
      {!isArt && showFrame ? (
        <div
          className="thunder-webgl-stage__bg"
          style={{ backgroundImage: `url(${SVG_PATHS.frame})` }}
          aria-hidden
        />
      ) : !isArt ? (
        <div
          className="thunder-webgl-stage__bg"
          style={{
            background: `linear-gradient(180deg, ${appearance.bgTop} 0%, ${appearance.bgBottom} 100%)`,
          }}
          aria-hidden
        />
      ) : null}

      <div className="thunder-webgl-stage__canvas-wrap">
        <canvas
          key={params.boltSource}
          ref={canvasRef}
          className={`thunder-webgl-stage__canvas${isArt ? " thunder-webgl-stage__canvas_baked" : ""}`}
        />
        {loading && <p className="thunder-webgl__loading">Loading plasma…</p>}
        {error && <p className="thunder-webgl__error">{error}</p>}
      </div>

      {showOverlay && (
        <img
          src={SVG_PATHS.overlay}
          alt=""
          className="thunder-webgl-stage__overlay"
          width={BETSPOT_W}
          height={BETSPOT_H}
          draggable={false}
        />
      )}
    </div>
  );
}
