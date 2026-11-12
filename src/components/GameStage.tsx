"use client";

/**
 * Full-screen play view: same-origin RMMZ game iframe + CRT layer + debug
 * overlay + FPS HUD + the floating settings (gear) and exit buttons.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { LogOut, Settings } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { CrtLayer } from "@/components/CrtLayer";
import { DebugOverlay } from "@/components/DebugOverlay";
import { SettingsPanel } from "@/components/SettingsPanel";
import { useSettings } from "@/lib/settings";
import {
  applyKeybinds,
  applyVolumes,
  installAudioUnlock,
  installFpsMeter,
  isEngineBooted,
  isGameActive,
  readFps,
  setFpsLock,
  snapshotKeyMapper,
  whenEngineReady,
} from "@/lib/gameBridge";
import * as cheats from "@/lib/cheats";

type Props = {
  onExit: () => void;
  onExitClearCache: () => void;
};

export function GameStage({ onExit, onExitClearCache }: Props) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const [booted, setBooted] = useState(false);
  const [active, setActive] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const [fps, setFps] = useState(0);
  const [showPortBy, setShowPortBy] = useState(true);
  const game = useSettings((s) => s.game);
  const debug = useSettings((s) => s.debug);
  const { toast } = useToast();

  // "(port by b29s)" — shows on every game launch, then fades away
  useEffect(() => {
    const t = window.setTimeout(() => setShowPortBy(false), 5000);
    return () => window.clearTimeout(t);
  }, []);

  // live engine state poll (drives availability of cheats and HUD data)
  useEffect(() => {
    const t = window.setInterval(() => {
      setBooted(isEngineBooted(iframeRef.current));
      setActive(isGameActive(iframeRef.current));
    }, 500);
    return () => window.clearInterval(t);
  }, []);

  const handleLoad = useCallback(() => {
    whenEngineReady(iframeRef.current, () => {
      installFpsMeter(iframeRef.current);
      installAudioUnlock(iframeRef.current);
      snapshotKeyMapper(iframeRef.current);

      const s = useSettings.getState();
      applyKeybinds(iframeRef.current, s.game.keybinds);
      setFpsLock(iframeRef.current, s.game.fpsLock);
      applyVolumes(iframeRef.current, s.game.volumes);

      // re-apply persisted debug toggles
      const d = s.debug;
      if (d.noclip) cheats.setNoclip(iframeRef.current, true);
      if (d.speedMult !== 1) cheats.setSpeedMult(iframeRef.current, d.speedMult);
      if (d.encounterOff) cheats.setEncounters(iframeRef.current, false);

      iframeRef.current?.contentWindow?.focus();
    });
  }, []);

  useEffect(() => {
    if (booted) applyKeybinds(iframeRef.current, game.keybinds);
  }, [booted, game.keybinds]);

  useEffect(() => {
    if (booted) setFpsLock(iframeRef.current, game.fpsLock);
  }, [booted, game.fpsLock]);

  useEffect(() => {
    if (booted) applyVolumes(iframeRef.current, game.volumes);
  }, [booted, game.volumes]);

  useEffect(() => {
    if (!game.showFps) return;
    setFps(readFps(iframeRef.current));
    const t = window.setInterval(() => setFps(readFps(iframeRef.current)), 500);
    return () => window.clearInterval(t);
  }, [game.showFps]);

  useEffect(() => {
    if (!debug.godMode) return;
    cheats.godModeTick(iframeRef.current);
    const t = window.setInterval(() => cheats.godModeTick(iframeRef.current), 250);
    return () => window.clearInterval(t);
  }, [debug.godMode]);

  useEffect(() => {
    if (active && debug.moveSpeed > 0) {
      cheats.setMoveSpeed(iframeRef.current, debug.moveSpeed);
    }
  }, [active, debug.moveSpeed]);

  useEffect(() => {
    if (!panelOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        setPanelOpen(false);
      }
    };
    window.addEventListener("keydown", handler, true);
    return () => window.removeEventListener("keydown", handler, true);
  }, [panelOpen]);

  useEffect(() => {
    if (!panelOpen) iframeRef.current?.contentWindow?.focus();
  }, [panelOpen]);

  return (
    <div
      className="fixed inset-0 bg-black overflow-hidden"
      onClick={() => {
        if (!panelOpen) iframeRef.current?.contentWindow?.focus();
      }}
    >
      <iframe
        ref={iframeRef}
        src="/game/index.html"
        title="ShitStickAdventure"
        className="absolute inset-0 w-full h-full border-0 bg-black"
        onLoad={handleLoad}
        allow="autoplay; fullscreen; gamepad"
      />

      <CrtLayer
        iframeRef={iframeRef}
        onFallback={(reason) =>
          toast({ title: "CRT filter unavailable", description: reason, duration: 5000 })
        }
      />
      <DebugOverlay iframeRef={iframeRef} />

      {game.showFps && (
        <div className="absolute top-2 left-2 z-30 px-2 py-1 rounded-md bg-black/70 border border-white/10 text-xs font-mono text-white tabular-nums pointer-events-none">
          {fps} FPS
        </div>
      )}

      <AnimatePresence>
        {showPortBy && (
          <motion.div
            key="port-by"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.8 }}
            className="absolute inset-x-0 bottom-12 z-30 flex justify-center pointer-events-none"
          >
            <span className="font-comic text-2xl text-white drop-shadow-[0_2px_6px_rgba(0,0,0,0.9)]">
              (port by b29s)
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="absolute top-2 right-2 z-40 flex items-center gap-2">
        <button
          type="button"
          aria-label="Settings"
          title="Settings"
          onClick={(e) => {
            e.stopPropagation();
            setPanelOpen((v) => !v);
          }}
          className="w-11 h-11 rounded-full bg-black/60 backdrop-blur border border-white/15 hover:border-white hover:bg-black/80 text-white/80 hover:text-white flex items-center justify-center transition-colors"
        >
          <Settings className="w-5 h-5" />
        </button>
        <button
          type="button"
          aria-label="Exit game"
          title="Exit"
          onClick={(e) => {
            e.stopPropagation();
            onExit();
          }}
          className="w-11 h-11 rounded-full bg-black/60 backdrop-blur border border-white/15 hover:border-white/60 hover:bg-black/80 text-white/80 hover:text-white flex items-center justify-center transition-colors"
        >
          <LogOut className="w-5 h-5" />
        </button>
      </div>

      <AnimatePresence>
        {panelOpen && (
          <SettingsPanel
            iframeRef={iframeRef}
            open
            onClose={() => setPanelOpen(false)}
            onExitGame={onExitClearCache}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
