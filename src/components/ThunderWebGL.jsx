import { useEffect, useRef, useState } from "react";
import { createThunderRenderer } from "../webgl/thunderRenderer.js";
import { DEFAULT_THUNDER_CONFIG } from "../webgl/thunderConfig.js";

const SIZE = 500;

export const DEFAULT_THUNDER_PARAMS = DEFAULT_THUNDER_CONFIG;

export default function ThunderWebGL({ params = DEFAULT_THUNDER_PARAMS, strikeNonce = 0 }) {
  const canvasRef = useRef(null);
  const rendererRef = useRef(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;

    try {
      rendererRef.current = createThunderRenderer(canvas, params);
      rendererRef.current.setParams(params);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "WebGL init failed");
      rendererRef.current = null;
    }

    return () => {
      rendererRef.current?.destroy();
      rendererRef.current = null;
    };
    // init once; param updates handled below
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    rendererRef.current?.setParams(params);
  }, [
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
    if (strikeNonce > 0) {
      rendererRef.current?.playStrike();
    }
  }, [strikeNonce]);

  return (
    <div className="thunder-webgl">
      <canvas
        ref={canvasRef}
        className="thunder-webgl__canvas"
        width={SIZE}
        height={SIZE}
        aria-label="WebGL thunder bolt"
      />
      {error && <p className="thunder-webgl__error">{error}</p>}
    </div>
  );
}
