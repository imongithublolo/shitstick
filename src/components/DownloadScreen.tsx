"use client";

/**
 * The "very minimal" first screen: game identity + one download button.
 * While downloading: a capsule progress bar and the asset paths being cached.
 * When cached: a single Play button.
 */
import { CircleAlert, Download, Play, RotateCcw, SquareArrowOutUpRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatBytes, canInstall, promptInstall, type DownloadProgress } from "@/lib/pwa";

type Props = {
  phase: "idle" | "downloading" | "ready";
  progress: DownloadProgress | null;
  totalBytes: number;
  cachedFiles: { done: number; total: number } | null;
  onDownload: () => void;
  onPlay: () => void;
  onRedownload: () => void;
};

export function DownloadScreen({
  phase,
  progress,
  totalBytes,
  cachedFiles,
  onDownload,
  onPlay,
  onRedownload,
}: Props) {
  const pct =
    progress && progress.totalBytes > 0
      ? Math.min(100, (progress.bytes / progress.totalBytes) * 100)
      : 0;

  return (
    <div className="crt-bg crt-vignette fixed inset-0 flex flex-col items-center justify-center gap-7 px-6 select-none">
      <img
        src="/game-icon.png"
        alt="ShitStickAdventure"
        className="pixelated w-20 h-20 sm:w-24 sm:h-24 rounded-2xl shadow-[0_0_40px_rgba(124,255,178,0.12)]"
        draggable={false}
      />

      <div className="text-center">
        <h1 className="font-ssa-bold text-2xl sm:text-3xl tracking-[0.18em] text-white">
          SHITSTICK<span className="text-emerald-300">ADVENTURE</span>
        </h1>
        <p className="mt-2 text-[10px] tracking-[0.34em] text-white/35">
          BY TMX2023 · WEB EDITION · CRT + OFFLINE
        </p>
      </div>

      {phase === "idle" && (
        <div className="flex flex-col items-center gap-3">
          <Button
            size="lg"
            onClick={onDownload}
            className="h-14 px-10 rounded-full bg-emerald-500 hover:bg-emerald-400 text-black font-bold tracking-widest text-base"
          >
            <Download className="w-5 h-5 mr-2.5" />
            DOWNLOAD
          </Button>
          <p className="text-[11px] text-white/35">
            {formatBytes(totalBytes)} · works offline after download · installable as an app
          </p>
        </div>
      )}

      {phase === "downloading" && (
        <div className="w-full max-w-md flex flex-col gap-2.5">
          <div className="flex items-baseline justify-between text-[11px] tracking-widest text-white/50">
            <span>CACHING GAME ASSETS</span>
            <span className="text-emerald-300 tabular-nums">{pct.toFixed(0)}%</span>
          </div>
          <div className="capsule-track h-3 w-full overflow-hidden">
            <div className="capsule-fill h-full" style={{ width: `${pct}%` }} />
          </div>
          <div className="flex items-baseline justify-between text-[11px] text-white/40 tabular-nums">
            <span>
              {formatBytes(progress?.bytes ?? 0)} / {formatBytes(progress?.totalBytes || totalBytes)}
            </span>
            <span>
              {progress?.filesDone ?? 0} / {progress?.filesTotal ?? cachedFiles?.total ?? "?"} files
            </span>
          </div>

          <div className="mt-1 min-h-[86px] font-mono">
            <div className="text-[11px] text-emerald-300/90 truncate" key={progress?.currentFile}>
              {progress?.currentFile ? `caching: ${progress.currentFile}` : "\u00A0"}
            </div>
            <div className="text-[10px] text-white/25 leading-4 truncate">
              {(progress?.recent ?? []).slice(0, 5).map((p) => (
                <div key={p} className="truncate">
                  {p}
                </div>
              ))}
            </div>
          </div>

          {progress?.phase === "error" && (
            <div className="flex items-center gap-2 rounded-md border border-red-400/30 bg-red-400/10 px-3 py-2 text-xs text-red-200">
              <CircleAlert className="w-4 h-4 shrink-0" />
              <span className="min-w-0">{progress.error}</span>
            </div>
          )}
          {progress?.phase === "error" && (
            <Button
              size="sm"
              variant="outline"
              className="border-white/15 bg-white/5"
              onClick={onDownload}
            >
              <RotateCcw className="w-3.5 h-3.5 mr-1.5" /> Retry (resumes)
            </Button>
          )}
        </div>
      )}

      {phase === "ready" && (
        <div className="flex flex-col items-center gap-3">
          <Button
            size="lg"
            onClick={onPlay}
            className="h-14 px-14 rounded-full bg-emerald-500 hover:bg-emerald-400 text-black font-bold tracking-widest text-base shadow-[0_0_30px_rgba(52,211,153,0.35)]"
          >
            <Play className="w-5 h-5 mr-2.5" />
            PLAY
          </Button>
          <div className="flex items-center gap-3 text-[11px] text-white/35">
            <span>
              OFFLINE READY · {cachedFiles ? `${cachedFiles.done}/${cachedFiles.total}` : formatBytes(totalBytes)} cached
            </span>
            {canInstall() && (
              <button
                type="button"
                onClick={() => promptInstall()}
                className="inline-flex items-center gap-1 text-emerald-300/80 hover:text-emerald-300 underline underline-offset-2"
              >
                <SquareArrowOutUpRight className="w-3 h-3" /> Install app
              </button>
            )}
            <button
              type="button"
              onClick={onRedownload}
              className="text-white/30 hover:text-white/60 underline underline-offset-2"
            >
              re-download
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
