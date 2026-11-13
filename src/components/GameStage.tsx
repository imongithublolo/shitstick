"use client";

/**
 * Full-screen play view: same-origin RMMZ game iframe + CRT layer + debug
 * overlay + the slim liquid-glass HUD pill (settings entry + optional FPS
 * readout with a live graph) at the top. The leave action lives inside the
 * settings drawer.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useToast } from "@/hooks/use-toast";
import { CrtLayer } from "@/components/CrtLayer";
import { DebugOverlay } from "@/components/DebugOverlay";
import { SettingsPanel } from "@/components/SettingsPanel";
import { TopHud } from "@/components/TopHud";
import { getDisplay, useSettings } from "@/lib/settings";
import * as savesLib from "@/lib/saves";
import {
  applyDisplay,
  applyKeybinds,
  applyVolumes,
  installAudioUnlock,
  installFpsMeter,
  isDisplayReady,
  isEngineBooted,
  isGameActive,
  readFps,
  setFpsLock,
  snapshotKeyMapper,
  snapshotNativeResolution,
  whenDisplayReady,
  whenEngineReady,
  type DisplaySpec,
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
  const [sceneReady, setSceneReady] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const [fps, setFps] = useState(0);
  /** rolling FPS samples for the HUD pill's background graph */
  const fpsHistoryRef = useRef<number[]>([]);
  const [showPortBy, setShowPortBy] = useState(true);
  const game = useSettings((s) => s.game);
  const debug = useSettings((s) => s.debug);
  const savesCfg = useSettings((s) => s.saves);
  const display = useSettings((s) => getDisplay(s.debug));
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
      setSceneReady(isDisplayReady(iframeRef.current));
    }, 500);
    return () => window.clearInterval(t);
  }, []);

  // engine display mode (resolution / auto-fit), from persisted settings
  const applyDisplayMode = useCallback((): boolean => {
    const d = getDisplay(useSettings.getState().debug);
    let spec: DisplaySpec;
    if (d.mode === "autofit") spec = { mode: "autofit" };
    else if (d.mode === "custom") spec = { mode: "fixed", w: d.customW, h: d.customH };
    else if (d.mode === "720p") spec = { mode: "fixed", w: 1280, h: 720 };
    else if (d.mode === "1080p") spec = { mode: "fixed", w: 1920, h: 1080 };
    else spec = { mode: "default" };
    return applyDisplay(iframeRef.current, spec);
  }, []);

  const handleLoad = useCallback(() => {
    whenEngineReady(iframeRef.current, () => {
      installFpsMeter(iframeRef.current);
      installAudioUnlock(iframeRef.current);
      snapshotKeyMapper(iframeRef.current);
      savesLib.installSaveHooks(iframeRef.current);

      const s = useSettings.getState();
      applyKeybinds(iframeRef.current, s.game.keybinds);
      setFpsLock(iframeRef.current, s.game.fpsLock);
      applyVolumes(iframeRef.current, s.game.volumes);

      // engine display: wait until the boot sequence is over, so the game's
      // own Scene_Boot.resizeScreen() can't clobber our resolution afterwards
      whenDisplayReady(iframeRef.current, () => {
        snapshotNativeResolution(iframeRef.current);
        applyDisplayMode();
      });

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

  // sample the engine's FPS meter; keeps a short history for the HUD graph
  useEffect(() => {
    if (!game.showFps) {
      fpsHistoryRef.current = [];
      return;
    }
    const sample = () => {
      const v = readFps(iframeRef.current);
      setFps(v);
      const h = fpsHistoryRef.current;
      h.push(v);
      if (h.length > 40) h.shift();
    };
    sample();
    const t = window.setInterval(sample, 500);
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

  // keep the cheat snapshot current — it stamps every save file the engine
  // writes (see saves.ts installSaveHooks)
  useEffect(() => {
    const w = iframeRef.current?.contentWindow;
    if (!w) return;
    w.__ssaCheatSnapshot =
      debug.noclip ||
      debug.speedMult !== 1 ||
      debug.encounterOff ||
      debug.godMode ||
      debug.moveSpeed > 0;
  }, [debug, booted]);

  // portal autosave: interval saves to slot 0 while a playthrough is running
  useEffect(() => {
    if (!savesCfg.autosaveOn) return;
    const t = window.setInterval(() => {
      if (isGameActive(iframeRef.current)) {
        void savesLib.autosave(iframeRef.current).catch(() => {});
      }
    }, Math.max(1, savesCfg.autosaveMins) * 60_000);
    return () => window.clearInterval(t);
  }, [savesCfg.autosaveOn, savesCfg.autosaveMins]);

  // apply the display mode when it changes (or once the boot is over)
  useEffect(() => {
    if (!sceneReady) return;
    applyDisplayMode();
  }, [sceneReady, display, applyDisplayMode]);

  // auto-fit keeps following the window shape
  useEffect(() => {
    if (!sceneReady) return;
    let t: number | undefined;
    const onResize = () => {
      window.clearTimeout(t);
      t = window.setTimeout(() => {
        if (getDisplay(useSettings.getState().debug).mode === "autofit") {
          applyDisplayMode();
        }
      }, 300);
    };
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      window.clearTimeout(t);
    };
  }, [sceneReady, applyDisplayMode]);

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

  // final autosave before the iframe unmounts (only in a safe context)
  const exitGame = useCallback(async () => {
    const s = useSettings.getState().saves;
    if (s.autosaveOn && isGameActive(iframeRef.current)) {
      await savesLib.autosave(iframeRef.current).catch(() => {});
    }
    onExit();
  }, [onExit]);

  const exitAndClear = useCallback(async () => {
    const s = useSettings.getState().saves;
    if (s.autosaveOn && isGameActive(iframeRef.current)) {
      await savesLib.autosave(iframeRef.current).catch(() => {});
    }
    onExitClearCache();
  }, [onExitClearCache]);

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

      <TopHud
        fpsOn={game.showFps}
        fps={fps}
        history={fpsHistoryRef.current}
        onOpenSettings={() => setPanelOpen((v) => !v)}
      />

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
            <div className="flex flex-col items-center gap-1">
              <span className="font-comic text-2xl text-white drop-shadow-[0_2px_6px_rgba(0,0,0,0.9)]">
                (Made by tmx_2011)
              </span>
              <span className="font-comic text-2xl text-white drop-shadow-[0_2px_6px_rgba(0,0,0,0.9)]">
                (port by b29s)
              </span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {panelOpen && (
          <SettingsPanel
            iframeRef={iframeRef}
            open
            onClose={() => setPanelOpen(false)}
            onLeaveGame={() => void exitGame()}
            onExitGame={() => void exitAndClear()}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
