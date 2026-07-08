import { useEffect, useRef, useState } from "react";
import {
  createLichtenbergRenderer,
  destroyLichtenbergRenderer,
  setNetwork,
} from "../../extractPath/lichtenbergRenderer.js";
import {
  LICHTENBERG_DEFAULTS,
  buildLichtenbergNetwork,
} from "../../extractPath/lichtenbergPreset.js";
import { BODY, STAGE, SUPERSAMPLE } from "../config/layout.js";
import { computeRendererLayout } from "../utils/layout.js";

/**
 * Initialise the extracted-Lichtenberg inner-plasma renderer once per canvas
 * and upload its network (traced web + corner bursts, built with the shared
 * defaults — see lichtenbergPreset.js). Returns { rendererRef, ready }.
 *
 * Mirrors usePlasmaRenderer's contract so AnalyseBetspot can swap it in.
 */
export function useLichtenbergRenderer(canvasRef) {
  const rendererRef = useRef(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;

    canvas.width = STAGE.width * SUPERSAMPLE;
    canvas.height = STAGE.height * SUPERSAMPLE;
    const layout = computeRendererLayout(canvas, {
      stage: STAGE,
      body: BODY,
      supersample: SUPERSAMPLE,
    });

    try {
      const renderer = createLichtenbergRenderer(canvas, layout);
      const network = buildLichtenbergNetwork(layout.body.size[0], layout.body.size[1], {
        widthScale: LICHTENBERG_DEFAULTS.widthScale,
        centerBoost: LICHTENBERG_DEFAULTS.centerBoost,
        cornerDensity: LICHTENBERG_DEFAULTS.cornerDensity,
        cornerRadius: layout.rect.radius,
      });
      setNetwork(renderer, network);
      rendererRef.current = renderer;
      setReady(true);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("Failed to init WebGL Lichtenberg energy", err);
      rendererRef.current = null;
      setReady(false);
    }

    return () => {
      destroyLichtenbergRenderer(rendererRef.current);
      rendererRef.current = null;
      setReady(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { rendererRef, ready };
}
