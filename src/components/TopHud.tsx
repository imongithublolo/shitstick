"use client";

/**
 * Slim liquid-glass HUD pill over the gameplay view.
 *
 * The layout is symmetric: even padding on both sides with the sliders icon
 * and the optional FPS readout forming one centered group. The icon opens the
 * settings panel; while Show FPS is on, a live readout sits next to it with
 * the rolling FPS graph painted edge-to-edge behind everything on the glass
 * (the graph bleeds to the pill's very edges, so the graph's own edges are
 * never visible).
 *
 * The pill anchors at the top-right, is draggable anywhere (the position is
 * clamped to the viewport and remembered in localStorage) and GameStage
 * hides/reveals it via right-click.
 */
import { useEffect, useRef, useState } from "react";
import { SlidersHorizontal } from "lucide-react";

type Props = {
  fpsOn: boolean;
  fps: number;
  /** recent FPS samples, oldest first (the graph behind the readout) */
  history: number[];
  /** right-click toggle from GameStage: pill not rendered visually */
  hidden: boolean;
  onOpenSettings: () => void;
};

/** how many samples the background graph keeps (≈20s at a 500ms poll) */
const GRAPH_POINTS_MAX = 40;
/** pointer travel before a press counts as a drag (not a tap) */
const DRAG_SLOP = 6;
const POS_KEY = "ssa-hud-pos";

type Pos = { x: number; y: number };

function loadPos(): Pos | null {
  try {
    const p = JSON.parse(localStorage.getItem(POS_KEY) || "null");
    if (p && typeof p.x === "number" && typeof p.y === "number") {
      return { x: p.x, y: p.y };
    }
  } catch {
    /* ignore */
  }
  return null;
}

function savePos(p: Pos): void {
  try {
    localStorage.setItem(POS_KEY, JSON.stringify(p));
  } catch {
    /* ignore */
  }
}

function clampPos(
  p: Pos,
  hostW: number,
  hostH: number,
  pillW: number,
  pillH: number
): Pos {
  return {
    x: Math.max(0, Math.min(p.x, Math.max(0, hostW - pillW))),
    y: Math.max(0, Math.min(p.y, Math.max(0, hostH - pillH))),
  };
}

/**
 * Full-bleed graph: the line runs from the very left edge to the very right
 * edge and the fill reaches the bottom edge — no insets, so the graph's own
 * edges can never be seen.
 */
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

  // headroom above the highest sample so the line never clips at the top
  const max = Math.max(60, ...values) * 1.12;
  const pts = values.map((v, i) => [
    (i / (values.length - 1)) * w,
    h - (Math.max(0, v) / max) * h,
  ]);

  // soft fill under the curve, down to the very bottom edge
  ctx.beginPath();
  ctx.moveTo(0, h);
  for (const [x, y] of pts) ctx.lineTo(x, y);
  ctx.lineTo(w, h);
  ctx.closePath();
  ctx.fillStyle = "rgba(255, 255, 255, 0.12)";
  ctx.fill();

  // the line itself
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.strokeStyle = "rgba(255, 255, 255, 0.65)";
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

export function TopHud({ fpsOn, fps, history, hidden, onOpenSettings }: Props) {
  const pillRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [pos, setPos] = useState<Pos | null>(() => loadPos());
  const posRef = useRef<Pos | null>(pos);
  const [dragging, setDragging] = useState(false);
  /** set while a real drag happened, to swallow the click after release */
  const suppressClick = useRef(false);
  const dragCleanupRef = useRef<null | (() => void)>(null);
  const dragRef = useRef<null | {
    id: number;
    sx: number;
    sy: number;
    offX: number;
    offY: number;
    hostLeft: number;
    hostTop: number;
    hostW: number;
    hostH: number;
    pillW: number;
    pillH: number;
    started: boolean;
  }>(null);

  // repaint the background graph
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (!fpsOn) {
      clearGraph(canvas);
      return;
    }
    drawGraph(canvas, history.slice(-GRAPH_POINTS_MAX));
  }, [fpsOn, fps, history]);

  // keep the mirror ref + localStorage in sync
  useEffect(() => {
    posRef.current = pos;
    if (pos) savePos(pos);
  }, [pos]);

  // clamp a restored position into the current viewport (mount only —
  // the [pos] effect above keeps posRef current for later reads)
  useEffect(() => {
    const p = posRef.current;
    const pill = pillRef.current;
    const host = pill?.parentElement;
    if (!p || !pill || !host) return;
    const hr = host.getBoundingClientRect();
    setPos(clampPos(p, hr.width, hr.height, pill.offsetWidth, pill.offsetHeight));
  }, []);

  // keep the pill inside the viewport when the window is resized
  useEffect(() => {
    const onResize = () => {
      const p = posRef.current;
      const pill = pillRef.current;
      const host = pill?.parentElement;
      if (!p || !pill || !host) return;
      const hr = host.getBoundingClientRect();
      setPos(clampPos(p, hr.width, hr.height, pill.offsetWidth, pill.offsetHeight));
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // drop any live drag listeners if the pill unmounts mid-drag
  useEffect(() => () => dragCleanupRef.current?.(), []);

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || hidden) return;
    const pill = pillRef.current;
    const host = pill?.parentElement;
    if (!pill || !host) return;
    const pr = pill.getBoundingClientRect();
    const hr = host.getBoundingClientRect();
    dragRef.current = {
      id: e.pointerId,
      sx: e.clientX,
      sy: e.clientY,
      offX: e.clientX - pr.left,
      offY: e.clientY - pr.top,
      hostLeft: hr.left,
      hostTop: hr.top,
      hostW: hr.width,
      hostH: hr.height,
      pillW: pr.width,
      pillH: pr.height,
      started: false,
    };
    // anchor exactly where the pill currently sits (switches from the default
    // top-right anchor to explicit coordinates — zero visual jump)
    if (!posRef.current) {
      const p = { x: pr.left - hr.left, y: pr.top - hr.top };
      posRef.current = p;
      setPos(p);
    }

    const onMove = (ev: PointerEvent) => {
      const s = dragRef.current;
      if (!s || ev.pointerId !== s.id) return;
      if (!s.started) {
        if (Math.hypot(ev.clientX - s.sx, ev.clientY - s.sy) < DRAG_SLOP) return;
        s.started = true;
        setDragging(true);
        suppressClick.current = true;
      }
      const p = clampPos(
        { x: ev.clientX - s.hostLeft - s.offX, y: ev.clientY - s.hostTop - s.offY },
        s.hostW,
        s.hostH,
        s.pillW,
        s.pillH
      );
      posRef.current = p;
      setPos(p);
    };
    const finish = () => {
      const s = dragRef.current;
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", finish);
      dragCleanupRef.current = null;
      dragRef.current = null;
      setDragging(false);
      if (s?.started) {
        // a real drag happened: swallow the click that follows the release
        window.setTimeout(() => {
          suppressClick.current = false;
        }, 350);
      }
    };
    dragCleanupRef.current = finish;
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", finish);
    window.addEventListener("pointercancel", finish);
  };

  return (
    <div
      ref={pillRef}
      onPointerDown={onPointerDown}
      className={`hud-pill absolute z-40 flex h-[30px] select-none touch-none items-center gap-2 overflow-hidden rounded-full px-2.5 ${
        hidden ? "hidden" : ""
      } ${dragging ? "cursor-grabbing" : "cursor-grab"}`}
      style={pos ? { left: pos.x, top: pos.y } : { right: 12, top: 8 }}
    >
      <canvas ref={canvasRef} className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden />
      <button
        type="button"
        aria-label="Settings"
        title="Settings"
        onClick={(e) => {
          e.stopPropagation();
          if (suppressClick.current) return; // that was a drag, not a tap
          onOpenSettings();
        }}
        className="hud-ico-btn relative z-10 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-white transition-colors"
      >
        <SlidersHorizontal className="h-[15px] w-[15px]" strokeWidth={2.4} />
      </button>
      {fpsOn && (
        <span className="relative z-10 flex items-baseline gap-1 leading-none text-white">
          <b className="text-[13px] font-bold tabular-nums">{fps > 0 ? fps : "—"}</b>
          <span className="text-[8px] font-bold tracking-[0.14em] text-white/75">FPS</span>
        </span>
      )}
    </div>
  );
}
