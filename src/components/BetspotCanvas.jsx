import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  RENDER_SCALE,
  SVG_FRAME,
  loadCanvasAssets,
  paintThunders,
  setupCanvas,
} from "../canvas/svgRenderer.js";

const STRIKE_DURATION_MS = 2000;

export default function BetspotCanvas({ mode = "static", playNonce = 0, debugPaths = false }) {
  const canvasRef = useRef(null);
  const ctxRef = useRef(null);
  const rafRef = useRef(0);
  const startTimeRef = useRef(0);
  const [assets, setAssets] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    loadCanvasAssets()
      .then((loaded) => {
        if (cancelled) return;
        setAssets(loaded);
        setLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err?.message ?? "Failed to load plasma assets");
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const ensureContext = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return null;

    const dpr = window.devicePixelRatio || 1;
    ctxRef.current = setupCanvas(canvas, SVG_FRAME, RENDER_SCALE, dpr);
    return ctxRef.current;
  }, []);

  const paintFrame = useCallback(
    (progress = 1) => {
      const ctx = ctxRef.current ?? ensureContext();
      if (!ctx || !assets) return;
      paintThunders(ctx, assets, mode, progress, { debugPaths });
    },
    [assets, mode, debugPaths, ensureContext]
  );

  useLayoutEffect(() => {
    ensureContext();
  }, [ensureContext]);

  useLayoutEffect(() => {
    if (!assets) return undefined;

    cancelAnimationFrame(rafRef.current);

    if (mode === "idle") {
      paintFrame(0);
      return undefined;
    }

    if (mode === "static") {
      paintFrame(1);
      return undefined;
    }

    startTimeRef.current = performance.now();

    const tick = (now) => {
      const elapsed = now - startTimeRef.current;
      const progress = Math.min(elapsed / STRIKE_DURATION_MS, 1);
      paintFrame(progress);

      if (progress < 1) {
        rafRef.current = requestAnimationFrame(tick);
      }
    };

    rafRef.current = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(rafRef.current);
    };
  }, [assets, mode, playNonce, debugPaths, paintFrame]);

  if (error) {
    return <p className="canvas-error">{error}</p>;
  }

  return (
    <>
      {loading && <p className="canvas-loading">Loading plasma…</p>}
      <canvas ref={canvasRef} className="betspot-stage__canvas" aria-hidden={loading} />
    </>
  );
}
