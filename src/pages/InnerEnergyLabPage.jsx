/**
 * Inner Energy Lab — tune raster → mask → skeleton → polyline → animation
 * pipeline with live debug views and reference mp4 comparison.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { SVG_FRAME } from "../canvas/frame.js";
import { BETSPOT_FRAME, roundedRectPath } from "../canvas/betspotGeometry.js";
import { INNER_ENERGY_SPEC, loadInnerSpotEnergyBundle } from "../canvas/innerSpotEnergy.js";
import { extractFilamentPathsFromPlasma, buildSkeletonFromMask, traceSkeletonPaths, traceSkeletonPolylines, pathsToSegments, erodeMask4 } from "../canvas/plasma/extractFilamentPaths.js";
import { rasterizeInnerSpotEnergyHd } from "../canvas/plasma/rasterizeInnerEnergyHd.js";
import {
  ANIM_MODES,
  applyAnimation,
  brightnessFor,
  ensureDimmedBase,
  strokePolyline,
} from "../canvas/plasma/innerEnergyLabAnimation.js";
import "./InnerEnergyLabPage.css";

const VB = SVG_FRAME;
const HD_SCALE = 3;
const LAB_SCALE = 6;
const PREVIEW_W = VB.width * LAB_SCALE;
const PREVIEW_H = VB.height * LAB_SCALE;
const DEBUG_W = 240;
const DEBUG_H = 195;
const VIDEO_W = 540;
const VIDEO_H = 438;
const VIDEO_FPS = 24;
const VIDEO_FRAME_COUNT = 145;

const DEFAULTS = {
  thresholdLum: 410,
  preErodePx: 0,
  minSegLenVb: 0.5,
  chainEdges: true,
  mode: ANIM_MODES.BOTH,
  jitterAmpVb: 0.6,
  jitterFreqHz: 1.2,
  brightWaveSpeed: 1.0,
};

function drawCanvasScaled(destCtx, src, dw, dh, nearest = false) {
  destCtx.clearRect(0, 0, dw, dh);
  if (!src) return;
  destCtx.imageSmoothingEnabled = !nearest;
  destCtx.drawImage(src, 0, 0, dw, dh);
}

function paintPolyDebug(ctx, segments, w, h) {
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = "#120818";
  ctx.fillRect(0, 0, w, h);
  if (!segments?.length) return;

  const sx = w / VB.width;
  const sy = h / VB.height;
  ctx.save();
  ctx.scale(sx, sy);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.globalCompositeOperation = "lighter";

  for (const seg of segments) {
    const hue = (seg.id * 47) % 360;
    const pts = seg.points;
    if (pts.length < 2) continue;
    strokePolyline(ctx, pts, 1.8, `hsla(${hue}, 90%, 65%, 0.55)`, 0.35);
    strokePolyline(ctx, pts, 0.6, `hsla(${hue}, 95%, 88%, 0.92)`, 0);
  }
  ctx.restore();
}

function buildVideoBrightMask(data, w, h) {
  const mask = new Uint8Array(w * h);
  for (let py = 0; py < h; py += 1) {
    for (let px = 0; px < w; px += 1) {
      const i = (py * w + px) * 4;
      if (data[i + 3] < 10) continue;
      if (data[i + 1] > 200) mask[py * w + px] = 1;
    }
  }
  return mask;
}

export default function InnerEnergyLabPage() {
  const previewRef = useRef(null);
  const videoRef = useRef(null);
  const debugRasterRef = useRef(null);
  const debugMaskRef = useRef(null);
  const debugSkelRef = useRef(null);
  const debugPolysRef = useRef(null);
  const hdCanvasRef = useRef(null);
  const textureRef = useRef(null);
  const extractRef = useRef(null);
  const rafRef = useRef(0);
  const animClockRef = useRef(0);
  const lastTickRef = useRef(0);
  const stepPendingRef = useRef(false);

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [extracting, setExtracting] = useState(false);
  const [extractMs, setExtractMs] = useState(0);
  const [stats, setStats] = useState(null);
  const [videoFrame, setVideoFrame] = useState(0);
  const [videoExtracting, setVideoExtracting] = useState(false);
  const [videoExtractProgress, setVideoExtractProgress] = useState("");
  const [videoFrames, setVideoFrames] = useState(null);
  const [overlayVideoPaths, setOverlayVideoPaths] = useState(false);
  const [paused, setPaused] = useState(false);

  const [thresholdLum, setThresholdLum] = useState(DEFAULTS.thresholdLum);
  const [preErodePx, setPreErodePx] = useState(DEFAULTS.preErodePx);
  const [minSegLenVb, setMinSegLenVb] = useState(DEFAULTS.minSegLenVb);
  const [chainEdges, setChainEdges] = useState(DEFAULTS.chainEdges);
  const [mode, setMode] = useState(DEFAULTS.mode);
  const [jitterAmpVb, setJitterAmpVb] = useState(DEFAULTS.jitterAmpVb);
  const [jitterFreqHz, setJitterFreqHz] = useState(DEFAULTS.jitterFreqHz);
  const [brightWaveSpeed, setBrightWaveSpeed] = useState(DEFAULTS.brightWaveSpeed);

  const paintPreview = useCallback(
    (timeSec) => {
      const canvas = previewRef.current;
      const texture = textureRef.current;
      const extractResult = extractRef.current;
      if (!canvas || !texture?.naturalWidth) return;

      const dpr = window.devicePixelRatio || 1;
      const deviceW = Math.round(PREVIEW_W * dpr);
      const deviceH = Math.round(PREVIEW_H * dpr);
      if (canvas.width !== deviceW) {
        canvas.width = deviceW;
        canvas.height = deviceH;
        canvas.style.width = `${PREVIEW_W}px`;
        canvas.style.height = `${PREVIEW_H}px`;
      }

      const ctx = canvas.getContext("2d");
      ctx.setTransform(LAB_SCALE * dpr, 0, 0, LAB_SCALE * dpr, 0, 0);
      ctx.clearRect(0, 0, VB.width, VB.height);

      const { rect, patternTransform, imageSize, groupOpacity } = INNER_ENERGY_SPEC;
      const [a, , , d, , f] = patternTransform;
      const tw = imageSize.width;
      const th = imageSize.height;

      ctx.save();
      roundedRectPath(ctx, BETSPOT_FRAME);
      ctx.clip();
      ctx.globalAlpha = groupOpacity;
      ctx.translate(rect.x, rect.y + f * rect.height);
      ctx.scale(a * rect.width, d * rect.height);
      ctx.drawImage(ensureDimmedBase(texture), 0, 0, tw, th);
      ctx.restore();

      const segments = extractResult?.segments;
      if (segments?.length) {
        const tAnim = timeSec * brightWaveSpeed;
        ctx.save();
        roundedRectPath(ctx, BETSPOT_FRAME);
        ctx.clip();
        ctx.globalCompositeOperation = "lighter";
        ctx.lineCap = "round";
        ctx.lineJoin = "round";

        for (const seg of segments) {
          const pts = applyAnimation(seg, tAnim, mode, jitterAmpVb, jitterFreqHz);
          const b = brightnessFor(seg, tAnim, mode);
          strokePolyline(ctx, pts, 1.8, "rgba(255,180,235,0.50)", 0.55);
          strokePolyline(ctx, pts, 0.75, "rgba(255,215,245,0.85)", 0.14);
          strokePolyline(
            ctx,
            pts,
            0.32,
            `rgba(255,252,254,${Math.min(1, b * 0.95).toFixed(3)})`,
            0,
          );
        }
        ctx.restore();
      }

      if (overlayVideoPaths && videoFrames?.length) {
        const vf = videoRef.current;
        const fi = vf
          ? Math.min(VIDEO_FRAME_COUNT - 1, Math.round(vf.currentTime * VIDEO_FPS))
          : 0;
        const vSegs = videoFrames[fi]?.segments;
        if (vSegs?.length) {
          ctx.save();
          roundedRectPath(ctx, BETSPOT_FRAME);
          ctx.clip();
          ctx.globalCompositeOperation = "lighter";
          ctx.lineCap = "round";
          for (const seg of vSegs) {
            const pts = seg.points;
            if (pts.length < 2) continue;
            strokePolyline(ctx, pts, 0.35, "rgba(255,255,80,0.55)", 0.08);
          }
          ctx.restore();
        }
      }
    },
    [
      mode,
      jitterAmpVb,
      jitterFreqHz,
      brightWaveSpeed,
      overlayVideoPaths,
      videoFrames,
    ],
  );

  const paintDebugCanvases = useCallback((hdCanvas, extractResult) => {
    const raster = debugRasterRef.current;
    const mask = debugMaskRef.current;
    const skel = debugSkelRef.current;
    const polys = debugPolysRef.current;
    if (raster) {
      const ctx = raster.getContext("2d");
      drawCanvasScaled(ctx, hdCanvas, DEBUG_W, DEBUG_H, false);
    }
    if (mask) {
      const ctx = mask.getContext("2d");
      drawCanvasScaled(ctx, extractResult?.brightCanvas, DEBUG_W, DEBUG_H, true);
    }
    if (skel) {
      const ctx = skel.getContext("2d");
      drawCanvasScaled(ctx, extractResult?.skeletonCanvas, DEBUG_W, DEBUG_H, true);
    }
    if (polys) {
      const ctx = polys.getContext("2d");
      paintPolyDebug(ctx, extractResult?.segments, DEBUG_W, DEBUG_H);
    }
  }, []);

  const doExtract = useCallback(async (overrides = {}) => {
    const texture = textureRef.current;
    if (!texture) return;

    const lum = overrides.thresholdLum ?? thresholdLum;
    const erode = overrides.preErodePx ?? preErodePx;
    const minLen = overrides.minSegLenVb ?? minSegLenVb;
    const chain = overrides.chainEdges ?? chainEdges;

    setExtracting(true);
    const t0 = performance.now();
    try {
      const hdCanvas = rasterizeInnerSpotEnergyHd(texture, INNER_ENERGY_SPEC, HD_SCALE);
      hdCanvasRef.current = hdCanvas;

      const result = await extractFilamentPathsFromPlasma(hdCanvas, VB, {
        hdScale: HD_SCALE,
        minLum: lum,
        preErodePx: erode,
        minLengthVb: minLen,
        chainEdges: chain,
      });

      extractRef.current = result;
      setStats(result.stats);
      setExtractMs(Math.round(performance.now() - t0));
      paintDebugCanvases(hdCanvas, result);
      paintPreview(animClockRef.current);
    } catch (err) {
      setLoadError(err?.message ?? "Extraction failed");
      // eslint-disable-next-line no-console
      console.error(err);
    } finally {
      setExtracting(false);
    }
  }, [thresholdLum, preErodePx, minSegLenVb, chainEdges, paintDebugCanvases, paintPreview]);

  useEffect(() => {
    let cancelled = false;
    loadInnerSpotEnergyBundle()
      .then(({ texture }) => {
        if (cancelled) return;
        textureRef.current = texture;
        setLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        setLoadError(err?.message ?? "Failed to load texture");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!loading && textureRef.current) doExtract();
  }, [loading]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const tick = (now) => {
      rafRef.current = requestAnimationFrame(tick);
      if (paused && !stepPendingRef.current) return;

      const dt = lastTickRef.current ? (now - lastTickRef.current) / 1000 : 0;
      lastTickRef.current = now;
      if (!paused) animClockRef.current += dt;
      stepPendingRef.current = false;

      paintPreview(animClockRef.current);

      const vf = videoRef.current;
      if (vf && !vf.paused) {
        setVideoFrame(
          Math.min(VIDEO_FRAME_COUNT - 1, Math.round(vf.currentTime * VIDEO_FPS)),
        );
      }
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [paused, paintPreview]);

  const extractVideoSkeletons = async () => {
    const video = videoRef.current;
    if (!video) return;

    setVideoExtracting(true);
    setVideoExtractProgress("Preparing…");
    video.pause();

    const off = document.createElement("canvas");
    off.width = VIDEO_W;
    off.height = VIDEO_H;
    const octx = off.getContext("2d", { willReadFrequently: true });
    const frames = [];
    const vbScale = VIDEO_W / VB.width;

    for (let i = 0; i < VIDEO_FRAME_COUNT; i += 1) {
      setVideoExtractProgress(`Extracting video frame ${i + 1}/${VIDEO_FRAME_COUNT}…`);
      // eslint-disable-next-line no-await-in-loop
      await new Promise((resolve) => {
        const onSeeked = () => {
          video.removeEventListener("seeked", onSeeked);
          resolve();
        };
        video.addEventListener("seeked", onSeeked);
        video.currentTime = i / VIDEO_FPS;
      });

      octx.drawImage(video, 0, 0, VIDEO_W, VIDEO_H);
      const { data } = octx.getImageData(0, 0, VIDEO_W, VIDEO_H);
      let mask = buildVideoBrightMask(data, VIDEO_W, VIDEO_H);
      if (preErodePx > 0) {
        mask = erodeMask4(mask, VIDEO_W, VIDEO_H, preErodePx);
      }

      // eslint-disable-next-line no-await-in-loop
      const { skel, w: skW, h: skH, mapPoint } = await buildSkeletonFromMask(
        mask,
        VIDEO_W,
        VIDEO_H,
      );
      const rawPaths = chainEdges
        ? traceSkeletonPolylines(skel, skW, skH, mapPoint)
        : traceSkeletonPaths(skel, skW, skH, mapPoint);
      const segments = pathsToSegments(rawPaths, vbScale, minSegLenVb);
      frames.push({ segments, stats: { pathCount: segments.length } });
    }

    setVideoFrames(frames);
    setVideoExtracting(false);
    setVideoExtractProgress(`Done — ${frames.length} frames stored.`);
  };

  const capturePng = () => {
    const canvas = previewRef.current;
    if (!canvas) return;
    const a = document.createElement("a");
    a.href = canvas.toDataURL("image/png");
    a.download = "inner-energy-lab-preview.png";
    a.click();
  };

  const handleStep = () => {
    stepPendingRef.current = true;
    animClockRef.current += 1 / VIDEO_FPS;
  };

  return (
    <div className="inner-energy-lab">
      <header className="inner-energy-lab__header">
        <a className="inner-energy-lab__back" href="/">
          ← Main canvas
        </a>
        <h1>Inner energy lab</h1>
        <p>
          Tune raster → mask → skeleton → polylines → animation. Reference mp4
          on the right for direct comparison.
        </p>
      </header>

      {loadError && <p className="inner-energy-lab__error">{loadError}</p>}

      <div className="inner-energy-lab__compare">
        <div className="inner-energy-lab__panel">
          <h2>Pipeline preview</h2>
          <canvas
            ref={previewRef}
            className="inner-energy-lab__preview"
            width={PREVIEW_W}
            height={PREVIEW_H}
            aria-label="Animated pipeline preview"
          />
        </div>
        <div className="inner-energy-lab__panel">
          <h2>Reference mp4</h2>
          <video
            ref={videoRef}
            className="inner-energy-lab__video"
            src="/inner-energy-reference.mp4"
            width={PREVIEW_W}
            height={PREVIEW_H}
            autoPlay
            loop
            muted
            playsInline
            onTimeUpdate={() => {
              const vf = videoRef.current;
              if (vf) {
                setVideoFrame(
                  Math.min(VIDEO_FRAME_COUNT - 1, Math.round(vf.currentTime * VIDEO_FPS)),
                );
              }
            }}
          />
        </div>
      </div>

      <div className="inner-energy-lab__debug">
        <div className="inner-energy-lab__debug-item">
          <span>1 Rasterized svg</span>
          <canvas ref={debugRasterRef} width={DEBUG_W} height={DEBUG_H} />
        </div>
        <div className="inner-energy-lab__debug-item">
          <span>2 Bright mask</span>
          <canvas ref={debugMaskRef} width={DEBUG_W} height={DEBUG_H} />
        </div>
        <div className="inner-energy-lab__debug-item">
          <span>3 Skeleton</span>
          <canvas ref={debugSkelRef} width={DEBUG_W} height={DEBUG_H} />
        </div>
        <div className="inner-energy-lab__debug-item">
          <span>4 Polylines</span>
          <canvas ref={debugPolysRef} width={DEBUG_W} height={DEBUG_H} />
        </div>
      </div>

      <div className="inner-energy-lab__controls">
        <label className="inner-energy-lab__control">
          <span>Threshold lum: {thresholdLum}</span>
          <input
            type="range"
            min={300}
            max={650}
            value={thresholdLum}
            onChange={(e) => setThresholdLum(Number(e.target.value))}
          />
        </label>
        <label className="inner-energy-lab__control">
          <span>Pre-erode: {preErodePx} px</span>
          <input
            type="range"
            min={0}
            max={3}
            step={1}
            value={preErodePx}
            onChange={(e) => setPreErodePx(Number(e.target.value))}
          />
        </label>
        <label className="inner-energy-lab__control">
          <span>Min seg len: {minSegLenVb.toFixed(1)} vb</span>
          <input
            type="range"
            min={0.5}
            max={20}
            step={0.5}
            value={minSegLenVb}
            onChange={(e) => setMinSegLenVb(Number(e.target.value))}
          />
        </label>
        <label className="inner-energy-lab__check inner-energy-lab__control">
          <input
            type="checkbox"
            checked={chainEdges}
            onChange={(e) => {
              const on = e.target.checked;
              setChainEdges(on);
              doExtract({ chainEdges: on });
            }}
          />
          Chain edges (merge through degree-2 junctions)
        </label>
        <fieldset className="inner-energy-lab__modes">
          <legend>Mode</legend>
          {Object.values(ANIM_MODES).map((m) => (
            <label key={m}>
              <input
                type="radio"
                name="anim-mode"
                checked={mode === m}
                onChange={() => setMode(m)}
              />
              {m}
            </label>
          ))}
        </fieldset>
        <label className="inner-energy-lab__control">
          <span>Jitter amp: {jitterAmpVb.toFixed(2)} vb</span>
          <input
            type="range"
            min={0}
            max={2}
            step={0.05}
            value={jitterAmpVb}
            onChange={(e) => setJitterAmpVb(Number(e.target.value))}
          />
        </label>
        <label className="inner-energy-lab__control">
          <span>Jitter freq: {jitterFreqHz.toFixed(2)} Hz</span>
          <input
            type="range"
            min={0.2}
            max={3}
            step={0.05}
            value={jitterFreqHz}
            onChange={(e) => setJitterFreqHz(Number(e.target.value))}
          />
        </label>
        <label className="inner-energy-lab__control">
          <span>Brightness wave: {brightWaveSpeed.toFixed(2)}×</span>
          <input
            type="range"
            min={0}
            max={3}
            step={0.05}
            value={brightWaveSpeed}
            onChange={(e) => setBrightWaveSpeed(Number(e.target.value))}
          />
        </label>
        <div className="inner-energy-lab__buttons">
          <button type="button" disabled={extracting || loading} onClick={doExtract}>
            {extracting ? "Extracting…" : "Re-extract"}
          </button>
          <button type="button" onClick={() => setPaused((p) => !p)}>
            {paused ? "Resume" : "Pause"}
          </button>
          <button type="button" disabled={!paused} onClick={handleStep}>
            Step
          </button>
          <button type="button" onClick={capturePng}>
            Capture PNG
          </button>
          <button
            type="button"
            disabled={videoExtracting}
            onClick={extractVideoSkeletons}
          >
            Extract video skeletons
          </button>
          <label className="inner-energy-lab__check">
            <input
              type="checkbox"
              checked={overlayVideoPaths}
              disabled={!videoFrames?.length}
              onChange={(e) => setOverlayVideoPaths(e.target.checked)}
            />
            Overlay video paths
          </label>
        </div>
        {videoExtractProgress && (
          <p className="inner-energy-lab__progress">{videoExtractProgress}</p>
        )}
      </div>

      <p className="inner-energy-lab__stats">
        {stats
          ? `pathCount: ${stats.pathCount}${stats.rawEdgeCount != null ? ` (from ${stats.rawEdgeCount} edges)` : ""} | avgPoints: ${stats.avgPointsPerPath?.toFixed(1) ?? "—"} | totalLen: ${stats.totalLength?.toFixed(1) ?? "—"} vb | last-extract: ${extractMs} ms`
          : "pathCount: —"}
        {" | "}
        video frame: {videoFrame}/{VIDEO_FRAME_COUNT} ({(videoFrame / VIDEO_FPS).toFixed(2)} s)
      </p>
    </div>
  );
}
