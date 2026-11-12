"use client";

/**
 * The first screen: as minimal as it gets — Comic Sans, black & white, just
 * the icon (no frame), the title, one black DOWNLOAD button with the size
 * under it. While downloading: the title, a capsule progress bar and the file
 * names being cached — and the icon turns into a DVD-screensaver, bouncing
 * around the screen (it eases back to the center when done).
 */
import { useEffect, useRef } from "react";
import { formatBytes, type DownloadProgress } from "@/lib/pwa";

type Props = {
  phase: "idle" | "downloading" | "ready";
  progress: DownloadProgress | null;
  totalBytes: number;
  cachedFiles: { done: number; total: number } | null;
  onDownload: () => void;
  onPlay: () => void;
};

/**
 * The game icon. Sits above the title normally; while downloading it becomes
 * a DVD screensaver that bounces around the viewport. Position is animated
 * continuously via rAF so the center <-> bounce switch is perfectly smooth.
 */
function DvdIcon({ bouncing }: { bouncing: boolean }) {
  const elRef = useRef<HTMLDivElement>(null);
  const pos = useRef({ x: -1, y: -1 });
  const vel = useRef({ x: 0.17, y: 0.13 }); // px per ms
  const mounted = useRef(false);

  useEffect(() => {
    const el = elRef.current;
    if (!el) return;

    const size = () => el.getBoundingClientRect().width || 96;
    const center = () => ({
      x: (window.innerWidth - size()) / 2,
      y: window.innerHeight * 0.26 - size() / 2,
    });

    if (!mounted.current) {
      pos.current = center();
      mounted.current = true;
    }

    let raf = 0;
    let last = performance.now();

    const apply = () => {
      el.style.transform = `translate(${pos.current.x}px, ${pos.current.y}px)`;
    };

    const step = (now: number) => {
      const dt = Math.min(64, now - last);
      last = now;

      if (bouncing) {
        let { x, y } = pos.current;
        let { x: vx, y: vy } = vel.current;
        x += vx * dt;
        y += vy * dt;
        const maxX = Math.max(0, window.innerWidth - size());
        const maxY = Math.max(0, window.innerHeight - size());
        if (x <= 0) {
          x = 0;
          vx = Math.abs(vx);
        }
        if (x >= maxX) {
          x = maxX;
          vx = -Math.abs(vx);
        }
        if (y <= 0) {
          y = 0;
          vy = Math.abs(vy);
        }
        if (y >= maxY) {
          y = maxY;
          vy = -Math.abs(vy);
        }
        pos.current = { x, y };
        vel.current = { x: vx, y: vy };
      } else {
        // glide back to the resting spot above the title
        const t = center();
        const p = pos.current;
        const k = Math.min(1, dt / 260);
        pos.current = { x: p.x + (t.x - p.x) * k, y: p.y + (t.y - p.y) * k };
      }
      apply();
      raf = requestAnimationFrame(step);
    };

    apply();
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [bouncing]);

  return (
    <div
      ref={elRef}
      className="fixed left-0 top-0 z-[5] will-change-transform pointer-events-none"
      aria-hidden
    >
      <img
        src="/game-icon.png"
        alt=""
        draggable={false}
        className="pixelated block w-24 h-24 sm:w-28 sm:h-28 select-none"
      />
    </div>
  );
}

export function DownloadScreen({ phase, progress, totalBytes, onDownload, onPlay }: Props) {
  const pct =
    progress && progress.totalBytes > 0
      ? Math.min(100, (progress.bytes / progress.totalBytes) * 100)
      : 0;
  const failed = progress?.phase === "error";

  const show = (active: boolean) =>
    `absolute inset-x-0 flex flex-col items-center transition-[opacity,visibility] duration-500 ${
      active ? "opacity-100" : "opacity-0 invisible pointer-events-none"
    }`;

  return (
    <div className="crt-bg fixed inset-0 select-none bg-black text-white font-comic overflow-hidden">
      <DvdIcon bouncing={phase === "downloading"} />

      {/* the title — never moves, so switching phases is seamless */}
      <h1 className="absolute left-1/2 -translate-x-1/2 top-[40%] -translate-y-1/2 z-10 whitespace-nowrap text-3xl sm:text-4xl text-white">
        ShitStickAdventure
      </h1>

      {/* idle: the black download button with the size under it */}
      <div className={`${show(phase === "idle")} top-[52%] z-10 gap-4`}>
        <button
          type="button"
          onClick={onDownload}
          className="rounded-full border-2 border-white bg-black px-14 py-3.5 text-xl font-bold tracking-widest text-white transition-colors duration-200 hover:bg-white hover:text-black"
        >
          DOWNLOAD
        </button>
        <div className="text-base text-white/50">{formatBytes(totalBytes)}</div>
      </div>

      {/* downloading: just the progress + what it's caching */}
      <div className={`${show(phase === "downloading")} top-[50%] z-10 px-8`}>
        <div className="w-full max-w-xs sm:max-w-sm">
          <div className="capsule-track h-3.5 w-full overflow-hidden">
            <div className="capsule-fill h-full" style={{ width: `${pct}%` }} />
          </div>
          <div className="mt-2.5 text-center text-base text-white/70 tabular-nums">
            {pct.toFixed(0)}%
          </div>

          <div className="mt-4 flex flex-col items-center gap-0.5">
            <div key={progress?.currentFile} className="max-w-full truncate text-sm text-white/80">
              {progress?.currentFile || "\u00A0"}
            </div>
            <div className="h-14 overflow-hidden text-center">
              {(progress?.recent ?? [])
                .slice(-3)
                .reverse()
                .map((p) => (
                  <div key={p} className="max-w-full truncate text-[11px] leading-4 text-white/30">
                    {p}
                  </div>
                ))}
            </div>
          </div>

          {failed && (
            <div className="mt-2 flex flex-col items-center gap-2">
              <div className="max-w-full text-center text-xs text-white/60 break-words">
                {progress?.error}
              </div>
              <button
                type="button"
                onClick={onDownload}
                className="rounded-full border border-white/50 px-6 py-1.5 text-sm text-white/80 transition-colors hover:bg-white hover:text-black"
              >
                Retry
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ready: play */}
      <div className={`${show(phase === "ready")} top-[52%] z-10`}>
        <button
          type="button"
          onClick={onPlay}
          className="rounded-full border-2 border-white bg-black px-16 py-3.5 text-xl font-bold tracking-widest text-white transition-colors duration-200 hover:bg-white hover:text-black"
        >
          PLAY
        </button>
      </div>
    </div>
  );
}
