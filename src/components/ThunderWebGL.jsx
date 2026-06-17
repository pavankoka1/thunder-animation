import { useEffect, useRef, useState } from "react";
import { createThunderRenderer } from "../webgl/thunderRenderer.js";
import { DEFAULT_THUNDER_CONFIG } from "../webgl/thunderConfig.js";
import { loadArtBoltTree } from "../webgl/loadArtBoltTree.js";

const SIZE = 500;

export const DEFAULT_THUNDER_PARAMS = DEFAULT_THUNDER_CONFIG;

export default function ThunderWebGL({ params = DEFAULT_THUNDER_PARAMS, strikeNonce = 0 }) {
  const canvasRef = useRef(null);
  const rendererRef = useRef(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(params.boltSource === "art");

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;

    let cancelled = false;

    async function init() {
      setLoading(params.boltSource === "art");
      setError(null);

      try {
        let boltTree;
        let plasmaCanvas;

        if (params.boltSource === "art") {
          ({ boltTree, plasmaCanvas } = await loadArtBoltTree(SIZE, SIZE));
          if (cancelled) return;
        }

        rendererRef.current?.destroy();
        rendererRef.current = createThunderRenderer(canvas, {
          ...params,
          tree: boltTree,
        });
        rendererRef.current.setParams(params);

        if (plasmaCanvas) {
          rendererRef.current.setPlasmaTexture(plasmaCanvas);
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

  return (
    <div className="thunder-webgl">
      <canvas
        ref={canvasRef}
        className="thunder-webgl__canvas"
        width={SIZE}
        height={SIZE}
        aria-label="WebGL thunder bolt"
      />
      {loading && <p className="thunder-webgl__loading">Loading plasma paths…</p>}
      {error && <p className="thunder-webgl__error">{error}</p>}
    </div>
  );
}
