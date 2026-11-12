"use client";

/**
 * ShitStickAdventure — Web Edition portal.
 *
 * Flow: minimal landing screen -> download button (also prompts the PWA
 * install) -> capsule progress with the asset names being cached -> Play.
 * The game runs in a same-origin iframe with a WebGL CRT shader on top and a
 * gear-icon settings panel (CRT / Game / Debug & Cheats).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { DownloadScreen } from "@/components/DownloadScreen";
import { GameStage } from "@/components/GameStage";
import {
  canInstall,
  captureInstallPrompt,
  clearGameCache,
  downloadGameAssets,
  isGameCached,
  promptInstall,
  registerServiceWorker,
  type DownloadProgress,
} from "@/lib/pwa";

type Phase = "idle" | "downloading" | "ready" | "playing";

export default function Home() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [progress, setProgress] = useState<DownloadProgress | null>(null);
  const [totalBytes, setTotalBytes] = useState(0);
  const [cachedFiles, setCachedFiles] = useState<{ done: number; total: number } | null>(null);
  const [playNonce, setPlayNonce] = useState(0);
  const downloadLock = useRef(false);

  useEffect(() => {
    registerServiceWorker();
    captureInstallPrompt();

    // how big is the game + is it already cached?
    (async () => {
      try {
        const res = await fetch("/game/game-files.json", { cache: "no-store" });
        if (res.ok) {
          const manifest = await res.json();
          setTotalBytes(manifest.totalBytes ?? 0);
        }
      } catch {
        /* online-only fallback is fine */
      }
      const status = await isGameCached();
      setCachedFiles({ done: status.filesDone, total: status.filesTotal });
      if (status.cached) setPhase("ready");
    })();
  }, []);

  const startDownload = useCallback(async () => {
    if (downloadLock.current) return;
    downloadLock.current = true;
    setPhase("downloading");

    // the download click doubles as the PWA install prompt gesture
    if (canInstall()) void promptInstall();

    await downloadGameAssets((p) => {
      setProgress(p);
      if (p.totalBytes > 0) setTotalBytes(p.totalBytes);
    });

    downloadLock.current = false;
    const status = await isGameCached();
    setCachedFiles({ done: status.filesDone, total: status.filesTotal });
    if (status.cached) {
      setPhase("ready");
    }
  }, []);

  const play = useCallback(() => {
    setPlayNonce((n) => n + 1);
    setPhase("playing");
  }, []);

  const exitGame = useCallback(() => {
    setPhase("ready");
  }, []);

  const exitAndClearCache = useCallback(async () => {
    await clearGameCache();
    setCachedFiles(null);
    setProgress(null);
    setPhase("idle");
  }, []);

  if (phase === "playing") {
    return <GameStage key={playNonce} onExit={exitGame} onExitClearCache={exitAndClearCache} />;
  }

  return (
    <main className="min-h-screen">
      <DownloadScreen
        phase={phase === "downloading" ? "downloading" : phase === "ready" ? "ready" : "idle"}
        progress={progress}
        totalBytes={totalBytes}
        cachedFiles={cachedFiles}
        onDownload={startDownload}
        onPlay={play}
      />
    </main>
  );
}
