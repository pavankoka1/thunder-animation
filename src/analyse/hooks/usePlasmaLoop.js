import { useEffect } from "react";
import { paintFrame } from "../gl/renderer.js";
import { applyShakeTransform, clearShakeTransform } from "../utils/shake.js";

/**
 * Drive shader time + betspot shake while `active`. Pauses when tab is hidden.
 */
export function usePlasmaLoop({
  rendererRef,
  active,
  reducedMotion,
  outerConfig,
  shakeTargetRef,
  scale,
}) {
  useEffect(() => {
    const renderer = rendererRef.current;
    if (!renderer || !active || reducedMotion) {
      if (renderer) paintFrame(renderer, 0);
      clearShakeTransform(shakeTargetRef.current);
      return undefined;
    }

    const start = performance.now();
    let raf = 0;

    const tick = (now) => {
      const tMs = now - start;
      paintFrame(renderer, tMs);
      applyShakeTransform(shakeTargetRef.current, tMs, {
        formationMs: outerConfig.formationMs,
        scale,
      });
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
      clearShakeTransform(shakeTargetRef.current);
    };
  }, [rendererRef, active, reducedMotion, outerConfig, shakeTargetRef, scale]);
}
