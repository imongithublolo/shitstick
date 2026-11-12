"use client";

/**
 * The main page (after the invite gate): Comic Sans, black & white. The game's
 * header banner runs edge-to-edge across the very top; below it, centered,
 * sits the icon on the left with the title / black DOWNLOAD button / size in
 * a column next to it. While downloading the banner fades away, the icon
 * becomes a DVD screensaver bouncing around the screen (gliding back into its
 * slot when done), and the title + capsule progress + file names remain.
 */
import { useEffect, useRef, useState } from "react";
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
 * The game icon. Rests in an invisible slot to the left of the title column;
 * while downloading it becomes a DVD screensaver that bounces around the
 * viewport. Position is animated continuously via rAF so the slot <-> bounce
 * switch is perfectly smooth.
 */
function DvdIcon({
  bouncing,
  slotRef,
}: {
  bouncing: boolean;
  slotRef: React.RefObject<HTMLDivElement | null>;
}) {
  const elRef = useRef<HTMLDivElement>(null);
  const pos = useRef({ x: -1, y: -1 });
  const vel = useRef({ x: 0.17, y: 0.13 }); // px per ms
  const mounted = useRef(false);

  useEffect(() => {
    const el = elRef.current;
    if (!el) return;

    const size = () => el.getBoundingClientRect().width || 96;
    // where the icon belongs: inside its slot left of the title
    const rest = () => {
      const slot = slotRef.current;
      if (slot) {
        const r = slot.getBoundingClientRect();
        return { x: r.left, y: r.top };
      }
      return {
        x: (window.innerWidth - size()) / 2,
        y: window.innerHeight * 0.3 - size() / 2,
      };
    };

    if (!mounted.current) {
      const r = rest();
      pos.current = { x: r.x, y: r.y };
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
        // glide back to the resting slot left of the title
        const t = rest();
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
  }, [bouncing, slotRef]);

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
        className="pixelated block w-16 h-16 sm:w-24 sm:h-24 md:w-28 md:h-28 select-none"
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

  // the banner only belongs to the main page — it fades out for the download
  const bannerVisible = phase !== "downloading";

  // fade the banner in once the bitmap is actually there (no empty-box flash)
  const bannerRef = useRef<HTMLImageElement>(null);
  const [bannerLoaded, setBannerLoaded] = useState(false);
  useEffect(() => {
    if (bannerRef.current?.complete) setBannerLoaded(true);
  }, []);

  // the icon's resting slot (left of the title column)
  const iconSlotRef = useRef<HTMLDivElement>(null);

  const show = (active: boolean) =>
    `absolute inset-0 flex flex-col items-center justify-center px-4 transition-[opacity,visibility] duration-500 ${
      active ? "opacity-100" : "opacity-0 invisible pointer-events-none"
    }`;

  return (
    <div className="crt-bg fixed inset-0 select-none bg-black text-white font-comic overflow-hidden flex flex-col">
      <DvdIcon bouncing={phase === "downloading"} slotRef={iconSlotRef} />

      {/* banner — edge to edge across the top, only on the main page */}
      <img
        ref={bannerRef}
        src="/game-banner.webp"
        alt="ShitStickAdventure"
        draggable={false}
        onLoad={() => setBannerLoaded(true)}
        className={`w-full shrink-0 select-none object-cover aspect-[4/1] max-h-[38vh] transition-opacity duration-700 ${
          bannerLoaded && bannerVisible ? "opacity-100" : "opacity-0"
        }`}
      />

      {/* everything below the banner: cross-fading centered layers */}
      <div className="relative flex-1 min-h-0">
        {/* idle / ready: the icon on the left, title + button + size beside it */}
        <div className={show(phase !== "downloading")}>
          <div className="flex items-center gap-4 sm:gap-6">
            <div ref={iconSlotRef} className="w-16 h-16 sm:w-24 sm:h-24 md:w-28 md:h-28 shrink-0" aria-hidden />
            <div className="flex flex-col items-start gap-3 sm:gap-4">
              <h1 className="whitespace-nowrap text-2xl sm:text-3xl md:text-4xl text-white">
                ShitStickAdventure
              </h1>

              {phase === "idle" && (
                <>
                  <button
                    type="button"
                    onClick={onDownload}
                    className="rounded-full border-2 border-white bg-black px-10 sm:px-14 py-3 text-lg sm:text-xl font-bold tracking-widest text-white transition-colors duration-200 hover:bg-white hover:text-black"
                  >
                    DOWNLOAD
                  </button>
                  <div className="text-sm sm:text-base text-white/50">{formatBytes(totalBytes)}</div>
                </>
              )}

              {phase === "ready" && (
                <button
                  type="button"
                  onClick={onPlay}
                  className="rounded-full border-2 border-white bg-black px-12 sm:px-16 py-3 text-lg sm:text-xl font-bold tracking-widest text-white transition-colors duration-200 hover:bg-white hover:text-black"
                >
                  PLAY
                </button>
              )}
            </div>
          </div>
        </div>

        {/* downloading: just the title + progress + what it's caching */}
        <div className={show(phase === "downloading")}>
          <div className="w-full max-w-xs sm:max-w-sm">
            <h1 className="mb-6 text-center text-2xl sm:text-3xl md:text-4xl text-white whitespace-nowrap">
              ShitStickAdventure
            </h1>
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
      </div>
    </div>
  );
}
