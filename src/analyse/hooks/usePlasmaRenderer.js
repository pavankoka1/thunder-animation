import { useEffect, useRef, useState } from "react";
import { STAGE, SUPERSAMPLE } from "../config/layout.js";
import { createRenderer, paintFrame } from "../gl/renderer.js";
import { defaultStageLayout } from "../utils/layout.js";

/**
 * Initialise WebGL once per canvas. Returns { renderer, ready, error }.
 */
export function usePlasmaRenderer(canvasRef, { innerConfig, outerConfig }) {
  const rendererRef = useRef(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;

    try {
      canvas.width = STAGE.width * SUPERSAMPLE;
      canvas.height = STAGE.height * SUPERSAMPLE;

      const layout = defaultStageLayout(canvas);
      rendererRef.current = createRenderer(canvas, {
        innerConfig,
        outerConfig,
        layout,
      });
      paintFrame(rendererRef.current, 0);
      setReady(true);
      setError(null);
    } catch (err) {
      console.error("Failed to init WebGL plasma", err);
      setError(err);
      setReady(false);
    }

    return () => {
      rendererRef.current = null;
      setReady(false);
    };
    // Config is frozen per betspot at mount — edit config files and reload to tune.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { rendererRef, ready, error };
}
