import { useEffect } from "react";
import { paintFrame } from "../gl/renderer.js";

/**
 * Drive shader time while `active`: outer border progresses, inner energy
 * reveals and then loops continuously. No shake. Pauses when the tab is hidden.
 */
export function usePlasmaLoop({ rendererRef, active, reducedMotion }) {
  useEffect(() => {
    const renderer = rendererRef.current;
    if (!renderer || !active || reducedMotion) {
      if (renderer) paintFrame(renderer, 0);
      return undefined;
    }

    const start = performance.now();
    let raf = 0;

    const tick = (now) => {
      paintFrame(renderer, now - start);
      raf = requestAnimationFrame(tick);
    };

    const onVisibility = () => {
      cancelAnimationFrame(raf);
      if (!document.hidden) raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener("visibilitychange", onVisibility);
      paintFrame(renderer, 0);
    };
  }, [rendererRef, active, reducedMotion]);
}
