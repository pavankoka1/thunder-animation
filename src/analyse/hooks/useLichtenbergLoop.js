import { useEffect } from "react";
import { paintLichtenberg, paintOuterBorder } from "../../extractPath/lichtenbergRenderer.js";
import {
  LICHTENBERG_DEFAULTS,
  buildLichtenbergStyle,
} from "../../extractPath/lichtenbergPreset.js";
import { elapsedSeconds, formationProgress } from "../utils/time.js";

// Built once from the shared defaults — the inner plasma is identical on every
// betspot (the reveal + outer-border colour is what varies per theme).
const STYLE = buildLichtenbergStyle(LICHTENBERG_DEFAULTS);

/**
 * Drive the Lichtenberg inner plasma + outer neon border while `active`. The
 * inner plasma runs continuously (its sway is time-based); the outer border
 * still crawls in via the theme's reveal timing (formationProgress) so the
 * betspot's reveal gesture is preserved. Pauses when the tab is hidden.
 */
export function useLichtenbergLoop({ rendererRef, outerConfig, active, reducedMotion }) {
  useEffect(() => {
    const renderer = rendererRef.current;
    if (!renderer) return undefined;

    const { w, h, rect } = renderer.layout;

    const paint = (tMs, reveal, swayAmt) => {
      const timeSec = elapsedSeconds(tMs);
      paintLichtenberg(renderer, { ...STYLE, swayAmt, time: timeSec });
      paintOuterBorder(renderer, outerConfig, { timeSec, reveal, w, h, rect });
    };

    if (!active) return undefined;

    if (reducedMotion) {
      // Static but fully-formed: exact traced shape + closed border, no motion.
      paint(0, 1, 0);
      return undefined;
    }

    const start = performance.now();
    let raf = 0;

    const tick = (now) => {
      const tMs = now - start;
      const reveal = formationProgress(
        tMs - (outerConfig.delayMs ?? 0),
        outerConfig.formationMs,
        outerConfig.easing
      );
      paint(tMs, reveal, STYLE.swayAmt);
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
    };
  }, [rendererRef, outerConfig, active, reducedMotion]);
}
