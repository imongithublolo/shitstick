"use client";

/**
 * Slim liquid-glass HUD pill pinned to the top-center of the gameplay view.
 *
 * Modeled on the classic Afterburner-style FPS overlay: a sliders icon on the
 * left (opens the settings panel), a live FPS readout next to it that only
 * appears while "Show FPS" is on — and, behind both, a thin live FPS graph
 * painted onto the pill's glass. Deliberately no right-hand button.
 */
import { useEffect, useRef } from "react";
import { SlidersHorizontal } from "lucide-react";

type Props = {
  fpsOn: boolean;
  fps: number;
  /** recent FPS samples, oldest first (the graph behind the readout) */
  history: number[];
  onOpenSettings: () => void;
};

/** how many samples the background graph keeps (≈20s at a 500ms poll) */
const GRAPH_POINTS_MAX = 40;

function drawGraph(canvas: HTMLCanvasElement, values: number[]) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  if (!w || !h) return;
  const cw = Math.round(w * dpr);
  const ch = Math.round(h * dpr);
  if (canvas.width !== cw) canvas.width = cw;
  if (canvas.height !== ch) canvas.height = ch;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  if (values.length < 2) return;

  // headroom above the highest sample so the line never touches the edge
  const max = Math.max(60, ...values) * 1.12;
  const padX = 5;
  const padY = 4;
  const innerW = w - padX * 2;
  const innerH = h - padY * 2;
  const pts = values.map((v, i) => [
    padX + (i / (values.length - 1)) * innerW,
    padY + innerH - (Math.max(0, v) / max) * innerH,
  ]);

  // soft fill under the curve
  ctx.beginPath();
  ctx.moveTo(pts[0][0], h - padY);
  for (const [x, y] of pts) ctx.lineTo(x, y);
  ctx.lineTo(pts[pts.length - 1][0], h - padY);
  ctx.closePath();
  ctx.fillStyle = "rgba(255, 255, 255, 0.10)";
  ctx.fill();

  // the line itself
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.strokeStyle = "rgba(255, 255, 255, 0.55)";
  ctx.lineWidth = 1.25;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.stroke();
}

function clearGraph(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
}

export function TopHud({ fpsOn, fps, history, onOpenSettings }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (!fpsOn) {
      clearGraph(canvas);
      return;
    }
    drawGraph(canvas, history.slice(-GRAPH_POINTS_MAX));
  }, [fpsOn, fps, history]);

  return (
    <div className="hud-pill absolute left-1/2 top-2 z-40 flex h-[30px] -translate-x-1/2 items-center gap-1 overflow-hidden rounded-full pl-0.5 pr-2.5">
      <canvas ref={canvasRef} className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden />
      <button
        type="button"
        aria-label="Settings"
        title="Settings"
        onClick={(e) => {
          e.stopPropagation();
          onOpenSettings();
        }}
        className="hud-ico-btn relative z-10 flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full text-white transition-colors"
      >
        <SlidersHorizontal className="h-[15px] w-[15px]" strokeWidth={2.4} />
      </button>
      {fpsOn && (
        <span className="relative z-10 flex select-none items-baseline gap-1 pr-0.5 leading-none text-white">
          <b className="text-[13px] font-bold tabular-nums">{fps > 0 ? fps : "—"}</b>
          <span className="text-[8px] font-bold tracking-[0.14em] text-white/75">FPS</span>
        </span>
      )}
    </div>
  );
}
