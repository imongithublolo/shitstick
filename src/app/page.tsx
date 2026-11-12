"use client";

/**
 * ShitStickAdventure — Web Edition portal.
 *
 * Flow: invite gate -> minimal landing screen -> download button -> capsule
 * progress with the asset names being cached -> Play. No PWA install popup
 * is ever shown (the browser's prompt is captured and prevented).
 * The game runs in a same-origin iframe with a WebGL CRT shader on top and a
 * gear-icon settings panel (CRT / Game / Debug & Cheats).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { DownloadScreen } from "@/components/DownloadScreen";
import { GameStage } from "@/components/GameStage";
import { InviteGate, isInvited } from "@/components/InviteGate";
import {
  captureInstallPrompt,
  clearGameCache,
  downloadGameAssets,
  isGameCached,
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
  const [invited, setInvited] = useState(false);
  const downloadLock = useRef(false);

  useEffect(() => {
    // invite-only: returning visitors who already entered the code skip the gate
    if (isInvited()) setInvited(true);

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

  // the invite gate short-circuits everything until the code is entered
  // (kept after all hooks so hook order stays stable)
  if (!invited) {
    return <InviteGate onSuccess={() => setInvited(true)} />;
  }

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
