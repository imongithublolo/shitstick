"use client";

/**
 * In-game settings panel (opened via the gear icon button).
 *
 * Tabs:
 *  - CRT: master toggle + every shader parameter + presets (port of the
 *    upstream CRTTweakPanel controls)
 *  - GAME: FPS counter, FPS lock, keybind remapping, audio volumes
 *  - DEBUG: cheats discovered in the game (built-in Ctrl noclip, RMMZ debug
 *    globals, the game's own switches/variables/items/maps/skills/actors)
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import {
  CRT_DEFAULTS,
  getDisplay,
  KEYBIND_ACTION_LABELS,
  KeybindAction,
  keyLabel,
  useSettings,
  type ResolutionMode,
} from "@/lib/settings";
import {
  applyKeybinds,
  autofitResolution,
  gameWindow,
  isEngineBooted,
  isGameActive,
} from "@/lib/gameBridge";
import * as cheats from "@/lib/cheats";
import * as savesLib from "@/lib/saves";
import type { BackupMeta, SaveSlotInfo } from "@/lib/saves";

type Props = {
  iframeRef: React.RefObject<HTMLIFrameElement | null>;
  open: boolean;
  onClose: () => void;
  onExitGame: () => void;
};

// ---------------------------------------------------------------------------
// small shared bits (black & white, no icons, no subtext)
// ---------------------------------------------------------------------------

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-5 mb-2 text-xs font-bold tracking-[0.14em] text-white/60">
      {children}
    </div>
  );
}

function ToggleRow({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5">
      <button
        type="button"
        className="flex-1 text-left text-sm text-white"
        onClick={() => onChange(!checked)}
      >
        {label}
      </button>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

function SliderRow({
  label,
  value,
  min,
  max,
  step,
  onChange,
  format,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  format?: (v: number) => string;
}) {
  return (
    <div className="py-1.5">
      <div className="mb-1 flex items-center justify-between text-sm text-white">
        <span>{label}</span>
        <span className="text-xs tabular-nums text-white/70">
          {format ? format(value) : value}
        </span>
      </div>
      <Slider
        value={[value]}
        min={min}
        max={max}
        step={step}
        onValueChange={(v) => onChange(v[0])}
      />
    </div>
  );
}

/** Selected / unselected button styles (black & white only) */
const selBtn = "bg-white text-black hover:bg-neutral-200";
const outBtn = "border-white/25 bg-white/5 text-white hover:bg-neutral-200";

/** Renders an RMMZ icon from the game's own IconSet.png */
function IconImg({ index, size = 22 }: { index: number; size?: number }) {
  const [cols, setCols] = useState(16);
  useEffect(() => {
    const img = new Image();
    img.onload = () => {
      const c = Math.max(1, Math.round(img.naturalWidth / 32));
      setCols(c);
    };
    img.src = "/game/img/system/IconSet.png";
  }, []);
  if (!index) return <span style={{ width: size, height: size }} className="inline-block" />;
  const sx = (index % cols) * size;
  const sy = Math.floor(index / cols) * size;
  return (
    <span
      aria-hidden
      className="inline-block flex-shrink-0 pixelated"
      style={{
        width: size,
        height: size,
        backgroundImage: "url(/game/img/system/IconSet.png)",
        backgroundSize: `${cols * size}px auto`,
        backgroundPosition: `-${sx}px -${sy}px`,
      }}
    />
  );
}

// ---------------------------------------------------------------------------
// CRT tab
// ---------------------------------------------------------------------------

const CRT_SLIDERS: {
  group: string;
  items: { key: keyof typeof CRT_DEFAULTS; label: string; min: number; max: number; step: number; int?: boolean }[];
}[] = [
  {
    group: "Scanlines",
    items: [
      { key: "scanlineIntensity", label: "Intensity", min: 0, max: 1, step: 0.01 },
      { key: "scanlineCount", label: "Count", min: 50, max: 1200, step: 1, int: true },
      { key: "adaptiveIntensity", label: "Adaptive", min: 0, max: 1, step: 0.01 },
    ],
  },
  {
    group: "Color",
    items: [
      { key: "brightness", label: "Brightness", min: 0.6, max: 1.8, step: 0.01 },
      { key: "contrast", label: "Contrast", min: 0.6, max: 1.8, step: 0.01 },
      { key: "saturation", label: "Saturation", min: 0, max: 2, step: 0.01 },
    ],
  },
  {
    group: "Effects",
    items: [
      { key: "bloomIntensity", label: "Bloom Intensity", min: 0, max: 1.5, step: 0.01 },
      { key: "bloomThreshold", label: "Bloom Threshold", min: 0, max: 1, step: 0.01 },
      { key: "rgbShift", label: "RGB Shift", min: 0, max: 1, step: 0.01 },
      { key: "vignetteStrength", label: "Vignette", min: 0, max: 2, step: 0.01 },
    ],
  },
  {
    group: "Distortion",
    items: [
      { key: "curvature", label: "Curvature", min: 0, max: 0.5, step: 0.005 },
      { key: "flickerStrength", label: "Flicker", min: 0, max: 0.15, step: 0.001 },
    ],
  },
];

function CrtTab() {
  const crt = useSettings((s) => s.crt);
  const setCrt = useSettings((s) => s.setCrt);
  const resetCrt = useSettings((s) => s.resetCrt);
  const applyPreset = useSettings((s) => s.applyCrtPreset);

  return (
    <div>
      <ToggleRow
        label="CRT Filter"
        checked={crt.enabled}
        onChange={(v) => setCrt({ enabled: v })}
      />
      <ToggleRow
        label="Pixel Smoothing"
        checked={crt.smoothing}
        onChange={(v) => setCrt({ smoothing: v })}
      />

      <SectionTitle>Presets</SectionTitle>
      <div className="grid grid-cols-3 gap-2">
        {["Subtle", "Retro", "Strong"].map((name) => (
          <Button key={name} size="sm" variant="outline" className={outBtn} onClick={() => applyPreset(name)}>
            {name}
          </Button>
        ))}
      </div>

      {CRT_SLIDERS.map((group) => (
        <div key={group.group}>
          <SectionTitle>{group.group}</SectionTitle>
          {group.items.map((item) => (
            <SliderRow
              key={item.key}
              label={item.label}
              value={crt[item.key] as number}
              min={item.min}
              max={item.max}
              step={item.step}
              format={(v) => (item.int ? String(Math.round(v)) : v.toFixed(item.step < 0.01 ? 3 : 2))}
              onChange={(v) => setCrt({ [item.key]: v } as any)}
            />
          ))}
        </div>
      ))}

      <div className="mt-4">
        <Button size="sm" variant="outline" onClick={resetCrt} className={`w-full ${outBtn}`}>
          Reset CRT to defaults
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// GAME tab
// ---------------------------------------------------------------------------

const FPS_OPTIONS = [
  { label: "Native", value: 0 },
  { label: "30", value: 30 },
  { label: "45", value: 45 },
  { label: "60", value: 60 },
  { label: "90", value: 90 },
  { label: "120", value: 120 },
];

function GameTab({ iframeRef }: { iframeRef: React.RefObject<HTMLIFrameElement | null> }) {
  const game = useSettings((s) => s.game);
  const setGame = useSettings((s) => s.setGame);
  const setKeybinds = useSettings((s) => s.setKeybinds);
  const resetKeybinds = useSettings((s) => s.resetKeybinds);
  const setVolumes = useSettings((s) => s.setVolumes);
  const [capturing, setCapturing] = useState<KeybindAction | null>(null);

  useEffect(() => {
    if (!capturing) return;
    const handler = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.key === "Escape") {
        setCapturing(null);
        return;
      }
      const code = String(e.keyCode);
      const binds = { ...game.keybinds };
      (Object.keys(binds) as KeybindAction[]).forEach((a) => {
        binds[a] = (binds[a] || []).filter((c) => c !== code);
      });
      binds[capturing] = [...(binds[capturing] || []).filter((c) => c !== code), code].slice(-3);
      setKeybinds(binds);
      applyKeybinds(iframeRef.current, binds);
      setCapturing(null);
    };
    window.addEventListener("keydown", handler, { capture: true });
    return () => window.removeEventListener("keydown", handler, { capture: true });
  }, [capturing, game.keybinds, setKeybinds, iframeRef]);

  return (
    <div>
      <SectionTitle>Performance</SectionTitle>
      <ToggleRow
        label="Show FPS"
        checked={game.showFps}
        onChange={(v) => setGame({ showFps: v })}
      />
      <div className="py-2">
        <div className="mb-2 text-sm text-white">FPS Limit</div>
        <div className="grid grid-cols-6 gap-1.5">
          {FPS_OPTIONS.map((opt) => (
            <Button
              key={opt.value}
              size="sm"
              variant={game.fpsLock === opt.value ? "default" : "outline"}
              className={
                game.fpsLock === opt.value ? selBtn : `${outBtn} px-0`
              }
              onClick={() => setGame({ fpsLock: opt.value })}
            >
              {opt.label}
            </Button>
          ))}
        </div>
      </div>

      <SectionTitle>Audio</SectionTitle>
      {(
        [
          ["bgm", "Music (BGM)"],
          ["bgs", "Ambience (BGS)"],
          ["me", "Fanfares (ME)"],
          ["se", "Sound FX (SE)"],
        ] as const
      ).map(([key, label]) => (
        <SliderRow
          key={key}
          label={label}
          value={game.volumes[key]}
          min={0}
          max={100}
          step={1}
          format={(v) => `${Math.round(v)}%`}
          onChange={(v) => setVolumes({ [key]: Math.round(v) } as any)}
        />
      ))}

      <SectionTitle>Keybinds</SectionTitle>
      {capturing && (
        <div className="mb-2 rounded-md border border-white/30 bg-white/10 px-3 py-2 text-xs text-white">
          Press a key to bind <b>{KEYBIND_ACTION_LABELS[capturing]}</b> · Esc cancels
        </div>
      )}
      <div className="space-y-1">
        {(Object.keys(KEYBIND_ACTION_LABELS) as KeybindAction[]).map((action) => (
          <div key={action} className="flex items-center justify-between gap-2 py-1">
            <div className="w-28 shrink-0 text-sm text-white">{KEYBIND_ACTION_LABELS[action]}</div>
            <div className="flex min-w-0 flex-wrap items-center justify-end gap-1">
              {(game.keybinds[action] || []).length === 0 && (
                <span className="text-[11px] text-white/30">gamepad only</span>
              )}
              {(game.keybinds[action] || []).map((code) => (
                <span key={code} className="keycap">
                  {keyLabel(code)}
                </span>
              ))}
            </div>
            <Button
              size="sm"
              variant={capturing === action ? "default" : "outline"}
              className={capturing === action ? selBtn : `${outBtn} h-7 px-2.5`}
              onClick={() => setCapturing(capturing === action ? null : action)}
            >
              {capturing === action ? "…" : "Bind"}
            </Button>
          </div>
        ))}
      </div>
      <div className="mt-3">
        <Button
          size="sm"
          variant="outline"
          className={`w-full ${outBtn}`}
          onClick={() => {
            resetKeybinds();
            setTimeout(() => {
              const s = useSettings.getState();
              applyKeybinds(iframeRef.current, s.game.keybinds);
            }, 0);
          }}
        >
          Reset keybinds
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// DEBUG tab
// ---------------------------------------------------------------------------

type DataEntry = { id: number; name: string; icon: number; description: string };

type GameData = {
  items: DataEntry[];
  weapons: DataEntry[];
  armors: DataEntry[];
  actors: { id: number; name: string }[];
  switches: { id: number; name: string }[];
  variables: { id: number; name: string }[];
  maps: { id: number; name: string }[];
};

type LiveValues = {
  sw: Record<number, boolean>;
  vr: Record<number, number>;
  gold: number;
  party: number[];
};

const EMPTY_LIVE: LiveValues = { sw: {}, vr: {}, gold: 0, party: [] };

function collectGameData(w: any): GameData {
  const switches: { id: number; name: string }[] = [];
  (w.$dataSystem.switches || []).forEach((s: string, i: number) => {
    if (i > 0 && s && s.trim()) switches.push({ id: i, name: s });
  });
  const variables: { id: number; name: string }[] = [];
  (w.$dataSystem.variables || []).forEach((v: string, i: number) => {
    if (i > 0 && v && v.trim()) variables.push({ id: i, name: v });
  });
  const maps: { id: number; name: string }[] = [];
  (w.$dataMapInfos || []).forEach((m: any, i: number) => {
    if (i > 0 && m && m.name && m.name.trim()) maps.push({ id: i, name: m.name });
  });
  const actors: { id: number; name: string }[] = [];
  (w.$dataActors || []).forEach((a: any, i: number) => {
    if (i > 0 && a && typeof a.name === "string" && a.name.trim() && !a.name.startsWith("-----")) {
      actors.push({ id: i, name: a.name });
    }
  });
  return {
    items: collectEntries(w.$dataItems),
    weapons: collectEntries(w.$dataWeapons),
    armors: collectEntries(w.$dataArmors),
    actors,
    switches,
    variables,
    maps,
  };
}

function snapshotLive(w: any, data: GameData | null): LiveValues {
  const out: LiveValues = { sw: {}, vr: {}, gold: 0, party: [] };
  if (!w) return out;
  try {
    data?.switches.forEach((s) => {
      out.sw[s.id] = !!w.$gameSwitches?.value(s.id);
    });
    data?.variables.forEach((v) => {
      out.vr[v.id] = Number(w.$gameVariables?.value(v.id) ?? 0);
    });
    out.gold = Number(w.$gameParty?.gold?.() ?? 0);
    out.party = Array.isArray(w.$gameParty?._actors) ? [...w.$gameParty._actors] : [];
  } catch {
    /* not in game */
  }
  return out;
}

function collectEntries(arr: any): DataEntry[] {
  const out: DataEntry[] = [];
  if (!Array.isArray(arr)) return out;
  arr.forEach((x: any, i: number) => {
    if (x && typeof x.name === "string" && x.name.trim() && !x.name.startsWith("-----")) {
      out.push({ id: i, name: x.name, icon: x.iconIndex ?? 0, description: (x.description || "").trim() });
    }
  });
  return out;
}

const RES_MODES: { value: ResolutionMode; label: string }[] = [
  { value: "default", label: "Default" },
  { value: "720p", label: "720p" },
  { value: "1080p", label: "1080p" },
  { value: "custom", label: "Custom" },
  { value: "autofit", label: "Auto-fit" },
];

/** even, clamped — for the custom resolution inputs */
const clampEven = (n: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, Math.round(n / 2) * 2));

function DebugTab({
  iframeRef,
  onExitGame,
}: {
  iframeRef: React.RefObject<HTMLIFrameElement | null>;
  onExitGame: () => void;
}) {
  const debug = useSettings((s) => s.debug);
  const setDebug = useSettings((s) => s.setDebug);
  const { toast } = useToast();
  const [engineReady, setEngineReady] = useState(false);
  const [active, setActive] = useState(false);
  const [gameData, setGameData] = useState<GameData | null>(null);
  const [live, setLive] = useState<LiveValues>(EMPTY_LIVE);
  const [search, setSearch] = useState("");
  const [giveKind, setGiveKind] = useState<"item" | "weapon" | "armor">("item");
  const [goldAmount, setGoldAmount] = useState("1000");
  const [varDraft, setVarDraft] = useState<Record<number, string>>({});
  const [liveRes, setLiveRes] = useState("");
  const display = getDisplay(debug);
  const [customW, setCustomW] = useState(String(display.customW));
  const [customH, setCustomH] = useState(String(display.customH));
  const gameDataRef = useRef<GameData | null>(null);

  const report = (r: cheats.CheatResult) => {
    toast({
      title: r.ok ? "Done" : "Not available",
      description: r.message,
      duration: r.ok ? 2200 : 3200,
    });
  };

  // live engine state poll (also snapshots switch/variable/gold values so
  // nothing reads the iframe ref during render)
  useEffect(() => {
    const t = window.setInterval(() => {
      const w = gameWindow(iframeRef.current);
      const booted = isEngineBooted(iframeRef.current);
      const act = isGameActive(iframeRef.current);
      setEngineReady(booted);
      setActive(act);
      if (booted && !gameDataRef.current && w && w.$dataSystem) {
        const data = collectGameData(w);
        gameDataRef.current = data;
        setGameData(data);
      }
      if (act) {
        setLive(snapshotLive(w, gameDataRef.current));
      }
      setLiveRes(
        booted && w?.Graphics ? `${w.Graphics.width}×${w.Graphics.height}` : ""
      );
    }, 500);
    return () => window.clearInterval(t);
  }, [iframeRef]);

  const snapshotNow = useCallback(() => {
    const w = gameWindow(iframeRef.current);
    setLive(snapshotLive(w, gameDataRef.current));
  }, [iframeRef]);

  const entries = useMemo(() => {
    if (!gameData) return [];
    const src = giveKind === "item" ? gameData.items : giveKind === "weapon" ? gameData.weapons : gameData.armors;
    const q = search.trim().toLowerCase();
    return q ? src.filter((e) => e.name.toLowerCase().includes(q)) : src;
  }, [gameData, giveKind, search]);

  const act = (fn: () => cheats.CheatResult | Promise<cheats.CheatResult>) => {
    Promise.resolve(fn()).then((r) => {
      report(r);
      snapshotNow();
    });
  };

  const switchValue = (id: number): boolean => !!live.sw[id];
  const variableValue = (id: number): number => live.vr[id] ?? 0;
  const actorName = (id: number): string =>
    gameData?.actors.find((a) => a.id === id)?.name ?? `#${id}`;

  return (
    <div>
      <SectionTitle>Display</SectionTitle>
      <div className="mb-2 text-sm text-white">Game Resolution</div>
      <div className="grid grid-cols-5 gap-1.5">
        {RES_MODES.map((m) => (
          <Button
            key={m.value}
            size="sm"
            variant={display.mode === m.value ? "default" : "outline"}
            className={`${display.mode === m.value ? selBtn : outBtn} px-1 text-xs`}
            onClick={() => setDebug({ display: { ...display, mode: m.value } })}
          >
            {m.label}
          </Button>
        ))}
      </div>
      {display.mode === "custom" && (
        <div className="mt-2 flex items-center gap-1.5">
          <Input
            value={customW}
            onChange={(e) => setCustomW(e.target.value.replace(/[^0-9]/g, ""))}
            inputMode="numeric"
            aria-label="Custom resolution width"
            className="h-8 w-20 border-white/20 bg-white/5 text-white"
          />
          <span className="text-white/50">×</span>
          <Input
            value={customH}
            onChange={(e) => setCustomH(e.target.value.replace(/[^0-9]/g, ""))}
            inputMode="numeric"
            aria-label="Custom resolution height"
            className="h-8 w-20 border-white/20 bg-white/5 text-white"
          />
          <Button
            size="sm"
            className={`h-8 shrink-0 ${selBtn}`}
            onClick={() => {
              const wv = clampEven(Number(customW) || display.customW, 640, 2560);
              const hv = clampEven(Number(customH) || display.customH, 480, 1440);
              setCustomW(String(wv));
              setCustomH(String(hv));
              setDebug({ display: { mode: "custom", customW: wv, customH: hv } });
            }}
          >
            Apply
          </Button>
        </div>
      )}
      <div className="mt-1.5 text-xs text-white/50">
        {display.mode === "autofit"
          ? `Edge-to-edge wide · ${autofitResolution(iframeRef.current).w}×${autofitResolution(iframeRef.current).h}`
          : engineReady && liveRes
            ? `Now ${liveRes}`
            : "Start the game to apply"}
      </div>

      <SectionTitle>Cheat Toggles</SectionTitle>
      <ToggleRow
        label="Noclip"
        checked={debug.noclip}
        onChange={(v) => {
          setDebug({ noclip: v });
          act(() => cheats.setNoclip(iframeRef.current, v));
        }}
      />
      <ToggleRow
        label="God Mode"
        checked={debug.godMode}
        onChange={(v) => setDebug({ godMode: v })}
      />
      <ToggleRow
        label="No Random Encounters"
        checked={debug.encounterOff}
        onChange={(v) => {
          setDebug({ encounterOff: v });
          act(() => cheats.setEncounters(iframeRef.current, !v));
        }}
      />

      <SectionTitle>Speed</SectionTitle>
      <SliderRow
        label="Movement Speed"
        value={debug.moveSpeed === 0 ? 4 : debug.moveSpeed}
        min={1}
        max={6}
        step={1}
        format={(v) => (debug.moveSpeed === 0 ? `Default (${v})` : `Level ${v}`)}
        onChange={(v) => {
          setDebug({ moveSpeed: v });
          act(() => cheats.setMoveSpeed(iframeRef.current, v));
        }}
      />
      <div className="py-1.5">
        <div className="mb-2 text-sm text-white">Turbo Multiplier</div>
        <div className="grid grid-cols-4 gap-1.5">
          {[1, 2, 3, 4].map((m) => (
            <Button
              key={m}
              size="sm"
              variant={debug.speedMult === m ? "default" : "outline"}
              className={debug.speedMult === m ? selBtn : outBtn}
              onClick={() => {
                setDebug({ speedMult: m });
                act(() => cheats.setSpeedMult(iframeRef.current, m));
              }}
            >
              x{m}
            </Button>
          ))}
        </div>
      </div>

      <SectionTitle>Debug Overlays</SectionTitle>
      <ToggleRow
        label="Event Boxes"
        checked={debug.showEvents}
        onChange={(v) => setDebug({ showEvents: v })}
      />
      <ToggleRow
        label="Collision Grid"
        checked={debug.showCollision}
        onChange={(v) => setDebug({ showCollision: v })}
      />
      <ToggleRow
        label="Player Info HUD"
        checked={debug.showPlayerInfo}
        onChange={(v) => setDebug({ showPlayerInfo: v })}
      />

      <SectionTitle>Quick Actions</SectionTitle>
      <div className="grid grid-cols-3 gap-1.5">
        <Button size="sm" variant="outline" className={outBtn} onClick={() => act(() => cheats.quickNewGame(iframeRef.current))}>
          New Game
        </Button>
        <Button size="sm" variant="outline" className={outBtn} onClick={() => act(() => cheats.quickContinue(iframeRef.current))}>
          Continue
        </Button>
        <Button size="sm" variant="outline" className={outBtn} onClick={() => act(() => cheats.quickSave(iframeRef.current))}>
          Save
        </Button>
        <Button size="sm" variant="outline" className={outBtn} onClick={() => act(() => cheats.healParty(iframeRef.current))}>
          Heal
        </Button>
        <Button size="sm" variant="outline" className={outBtn} onClick={() => act(() => cheats.enemiesHpToOne(iframeRef.current))}>
          Foes 1 HP
        </Button>
        <Button size="sm" variant="outline" className={outBtn} onClick={() => act(() => cheats.killAllEnemies(iframeRef.current))}>
          Win Battle
        </Button>
        <Button size="sm" variant="outline" className={outBtn} onClick={() => act(() => cheats.learnAllSkills(iframeRef.current))}>
          All Skills
        </Button>
        <Button size="sm" variant="outline" className={outBtn} onClick={() => act(() => cheats.maxLevelAll(iframeRef.current))}>
          Max Level
        </Button>
        <Button
          size="sm"
          variant="outline"
          className={outBtn}
          onClick={() => iframeRef.current?.contentWindow?.location.reload()}
        >
          Reload
        </Button>
      </div>

      <SectionTitle>Give Everything</SectionTitle>
      <div className="grid grid-cols-3 gap-1.5">
        <Button size="sm" variant="outline" className={outBtn} onClick={() => act(() => cheats.giveAll(iframeRef.current, "item"))}>
          All Items
        </Button>
        <Button size="sm" variant="outline" className={outBtn} onClick={() => act(() => cheats.giveAll(iframeRef.current, "weapon"))}>
          All Weapons
        </Button>
        <Button size="sm" variant="outline" className={outBtn} onClick={() => act(() => cheats.giveAll(iframeRef.current, "armor"))}>
          All Armors
        </Button>
      </div>

      <SectionTitle>Gold {active ? `· ${live.gold.toLocaleString()} G` : ""}</SectionTitle>
      <div className="flex gap-1.5">
        <Input
          value={goldAmount}
          onChange={(e) => setGoldAmount(e.target.value.replace(/[^0-9]/g, ""))}
          inputMode="numeric"
          className="h-8 flex-1 border-white/20 bg-white/5 text-white"
        />
        <Button
          size="sm"
          className={`h-8 ${selBtn}`}
          onClick={() => act(() => cheats.addGold(iframeRef.current, Number(goldAmount) || 0))}
        >
          Give
        </Button>
      </div>
      <div className="mt-1.5 grid grid-cols-4 gap-1.5">
        {[100, 1000, 10000, 9999999].map((g) => (
          <Button
            key={g}
            size="sm"
            variant="outline"
            className={`${outBtn} px-0`}
            onClick={() => act(() => cheats.addGold(iframeRef.current, g))}
          >
            +{g >= 1000000 ? "9.9M" : g.toLocaleString()}
          </Button>
        ))}
      </div>

      {!engineReady || !gameData ? (
        <div className="mt-4 text-xs text-white/40">Loading game data… (start the game once)</div>
      ) : (
        <>
          <SectionTitle>Party</SectionTitle>
          {active ? (
            <div className="mb-2 space-y-1">
              {live.party.length === 0 && (
                <div className="text-xs text-white/40">No party yet</div>
              )}
              {live.party.map((id) => (
                <div key={id} className="flex items-center gap-2 px-2 py-1.5 cheat-list-row">
                  <div className="min-w-0 flex-1 truncate text-sm text-white">{actorName(id)}</div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-6 px-2 text-[11px] border-white/25 bg-white/5 hover:bg-neutral-200 text-white"
                    onClick={() => act(() => cheats.removeActorFromParty(iframeRef.current, id))}
                  >
                    Remove
                  </Button>
                </div>
              ))}
            </div>
          ) : (
            <div className="mb-2 text-xs text-white/40">In-game only</div>
          )}
          <div className="max-h-48 overflow-y-auto thin-scroll rounded-md border border-white/10 divide-y divide-white/5">
            {gameData.actors.map((a) => (
              <div key={a.id} className="flex items-center gap-2 px-2 py-1.5 cheat-list-row">
                <span className="w-7 text-[10px] tabular-nums text-white/30">#{a.id}</span>
                <div className="min-w-0 flex-1 truncate text-sm text-white">{a.name}</div>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-6 px-2 text-[11px] border-white/25 bg-white/5 hover:bg-neutral-200 text-white"
                  disabled={!active}
                  onClick={() => act(() => cheats.addActorToParty(iframeRef.current, a.id))}
                >
                  Add
                </Button>
              </div>
            ))}
          </div>

          <SectionTitle>Inventory</SectionTitle>
          <div className="mb-2 grid grid-cols-3 gap-1.5">
            {(["item", "weapon", "armor"] as const).map((k) => (
              <Button
                key={k}
                size="sm"
                variant={giveKind === k ? "default" : "outline"}
                className={giveKind === k ? selBtn : outBtn}
                onClick={() => setGiveKind(k)}
              >
                {k === "item" ? "Items" : k === "weapon" ? "Weapons" : "Armors"}
              </Button>
            ))}
          </div>
          <div className="relative mb-2">
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search…"
              className="h-8 border-white/20 bg-white/5 text-sm text-white"
            />
          </div>
          <div className="max-h-64 overflow-y-auto thin-scroll rounded-md border border-white/10 divide-y divide-white/5">
            {entries.map((e) => (
              <div key={e.id} className="flex items-center gap-2 px-2 py-1.5 cheat-list-row">
                <IconImg index={e.icon} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm text-white">{e.name}</div>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-6 px-2 text-[11px] border-white/25 bg-white/5 text-white hover:bg-neutral-200"
                  disabled={!active}
                  onClick={() => act(() => cheats.giveThing(iframeRef.current, giveKind, e.id, 1))}
                >
                  +1
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-6 px-2 text-[11px] border-white/25 bg-white/5 text-white hover:bg-neutral-200"
                  disabled={!active}
                  onClick={() => act(() => cheats.giveThing(iframeRef.current, giveKind, e.id, 10))}
                >
                  +10
                </Button>
              </div>
            ))}
            {entries.length === 0 && (
              <div className="px-3 py-2 text-xs text-white/40">Nothing matches.</div>
            )}
          </div>

          <SectionTitle>Switches ({gameData.switches.length})</SectionTitle>
          <div className="max-h-56 overflow-y-auto thin-scroll rounded-md border border-white/10 divide-y divide-white/5">
            {gameData.switches.map((s) => (
              <div key={s.id} className="flex items-center gap-2 px-2 py-1.5 cheat-list-row">
                <span className="w-6 text-[10px] tabular-nums text-white/30">#{s.id}</span>
                <div className="min-w-0 flex-1 truncate text-sm text-white">{s.name}</div>
                <Switch
                  checked={switchValue(s.id)}
                  disabled={!active}
                  onCheckedChange={(v) => act(() => cheats.setSwitch(iframeRef.current, s.id, v))}
                />
              </div>
            ))}
          </div>

          <SectionTitle>Variables ({gameData.variables.length})</SectionTitle>
          <div className="max-h-56 overflow-y-auto thin-scroll rounded-md border border-white/10 divide-y divide-white/5">
            {gameData.variables.map((v) => (
              <div key={v.id} className="flex items-center gap-2 px-2 py-1.5 cheat-list-row">
                <span className="w-6 text-[10px] tabular-nums text-white/30">#{v.id}</span>
                <div className="min-w-0 flex-1 truncate text-sm text-white">{v.name}</div>
                <Input
                  value={varDraft[v.id] ?? String(variableValue(v.id))}
                  onChange={(e) => setVarDraft((d) => ({ ...d, [v.id]: e.target.value.replace(/[^0-9-]/g, "") }))}
                  disabled={!active}
                  inputMode="numeric"
                  className="h-7 w-20 border-white/20 bg-white/5 text-xs text-white"
                />
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 px-2 text-[11px] border-white/25 bg-white/5 text-white hover:bg-neutral-200"
                  disabled={!active}
                  onClick={() => {
                    const val = Number(varDraft[v.id] ?? variableValue(v.id));
                    act(() => cheats.setVariable(iframeRef.current, v.id, val));
                    setVarDraft((d) => {
                      const n = { ...d };
                      delete n[v.id];
                      return n;
                    });
                  }}
                >
                  Set
                </Button>
              </div>
            ))}
          </div>

          <SectionTitle>Teleport ({gameData.maps.length} maps)</SectionTitle>
          <div className="max-h-56 overflow-y-auto thin-scroll rounded-md border border-white/10 divide-y divide-white/5">
            {gameData.maps.map((m) => (
              <div key={m.id} className="flex items-center gap-2 px-2 py-1.5 cheat-list-row">
                <span className="w-7 text-[10px] tabular-nums text-white/30">#{m.id}</span>
                <div className="min-w-0 flex-1 truncate text-sm text-white">{m.name}</div>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-6 px-2 text-[11px] border-white/25 bg-white/5 text-white hover:bg-neutral-200"
                  disabled={!active}
                  onClick={() => act(() => cheats.teleportToMap(iframeRef.current, m.id))}
                >
                  Go
                </Button>
              </div>
            ))}
          </div>
        </>
      )}

      <SectionTitle>Offline Cache</SectionTitle>
      <Button
        size="sm"
        variant="outline"
        className={`w-full ${outBtn}`}
        onClick={() => {
          onExitGame();
        }}
      >
        Exit &amp; clear offline cache
      </Button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Saves tab
// ---------------------------------------------------------------------------

const AUTOSAVE_CHOICES = [1, 2, 5, 10];

function fmtSaveTime(ts: number): string {
  try {
    return new Date(ts).toLocaleString([], {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return String(ts);
  }
}

function CheatBadge({ cheats }: { cheats: boolean | null }) {
  if (cheats === null) return null;
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-[10px] font-bold tracking-wide whitespace-nowrap ${
        cheats ? "bg-white text-black" : "border border-white/40 text-white/70"
      }`}
    >
      {cheats ? "CHEATS" : "CLEAN"}
    </span>
  );
}

function SavesTab({ iframeRef }: { iframeRef: React.RefObject<HTMLIFrameElement | null> }) {
  const saves = useSettings((s) => s.saves);
  const setSaves = useSettings((s) => s.setSaves);
  const debug = useSettings((s) => s.debug);
  const { toast } = useToast();
  const [slots, setSlots] = useState<SaveSlotInfo[]>([]);
  const [backups, setBackups] = useState<BackupMeta[]>([]);
  const [lastAuto, setLastAuto] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    const [s, b] = await Promise.all([
      savesLib.listSaves(iframeRef.current),
      savesLib.listBackups(iframeRef.current),
    ]);
    setSlots(s);
    setBackups(b);
    setLastAuto(savesLib.lastAutosaveTime());
  }, [iframeRef]);

  useEffect(() => {
    void refresh();
    const t = window.setInterval(() => void refresh(), 4000);
    return () => window.clearInterval(t);
  }, [refresh]);

  const run = useCallback(
    async (fn: () => Promise<savesLib.SaveResult>) => {
      if (busy) return;
      setBusy(true);
      try {
        const r = await fn();
        toast({
          title: r.ok ? r.message : "Failed",
          description: r.ok ? undefined : r.message,
          duration: 2600,
        });
        if (r.ok) await refresh();
      } finally {
        setBusy(false);
      }
    },
    [busy, refresh, toast]
  );

  // clean save: every portal cheat off for the save itself, then back on
  const cheatsOff = useCallback(() => {
    const iframe = iframeRef.current;
    cheats.setNoclip(iframe, false);
    cheats.setSpeedMult(iframe, 1);
    cheats.setEncounters(iframe, true);
    const w = gameWindow(iframe);
    try {
      if (w?.$gamePlayer) w.$gamePlayer._moveSpeed = 4;
    } catch {
      /* ignore */
    }
    if (w) w.__ssaCheatSnapshot = false;
  }, [iframeRef]);

  const cheatsRestore = useCallback(() => {
    const iframe = iframeRef.current;
    if (debug.noclip) cheats.setNoclip(iframe, true);
    if (debug.speedMult !== 1) cheats.setSpeedMult(iframe, debug.speedMult);
    if (debug.encounterOff) cheats.setEncounters(iframe, false);
    if (debug.moveSpeed > 0) cheats.setMoveSpeed(iframe, debug.moveSpeed);
    const w = gameWindow(iframe);
    if (w) {
      w.__ssaCheatSnapshot =
        debug.noclip || debug.speedMult !== 1 || debug.encounterOff || debug.moveSpeed > 0;
    }
  }, [iframeRef, debug]);

  const smallBtn = `h-7 px-2 text-xs ${outBtn}`;

  return (
    <div className="pb-2">
      <SectionTitle>Autosave</SectionTitle>
      <ToggleRow
        label="Autosave"
        checked={saves.autosaveOn}
        onChange={(v) => setSaves({ autosaveOn: v })}
      />
      <div className="flex items-center gap-2 py-1.5">
        <span className="flex-1 text-sm text-white">Every</span>
        {AUTOSAVE_CHOICES.map((m) => (
          <Button
            key={m}
            size="sm"
            variant="outline"
            className={`h-7 px-3 text-xs ${saves.autosaveMins === m ? selBtn : outBtn}`}
            onClick={() => setSaves({ autosaveMins: m })}
          >
            {m}m
          </Button>
        ))}
      </div>
      <div className="py-1 text-xs text-white/50">
        {lastAuto ? `Last autosave: ${fmtSaveTime(lastAuto)}` : "No autosave yet"}
      </div>
      <Button
        size="sm"
        variant="outline"
        className={`mt-1 w-full ${outBtn}`}
        disabled={busy}
        onClick={() => run(() => savesLib.autosave(iframeRef.current))}
      >
        Save now
      </Button>

      <SectionTitle>Save Slots</SectionTitle>
      {slots.length === 0 && (
        <div className="rounded-lg border border-dashed border-white/15 px-3 py-4 text-center text-xs text-white/40">
          No saves yet — start a game
        </div>
      )}
      {slots.map((slot) => (
        <div key={slot.id} className="mb-2 rounded-lg border border-white/10 bg-white/5 p-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-bold text-white">
              {slot.auto ? "Auto" : `Slot ${slot.id}`}
            </span>
            <CheatBadge cheats={slot.cheats} />
          </div>
          <div className="mt-1 truncate text-xs text-white/70">
            {slot.playtime || "—"}
            {slot.timestamp ? ` · ${fmtSaveTime(slot.timestamp)}` : ""}
          </div>
          <div className="mt-2 flex gap-2">
            <Button
              size="sm"
              variant="outline"
              className={`flex-1 ${smallBtn}`}
              disabled={busy}
              onClick={() => run(() => savesLib.loadSlot(iframeRef.current, slot.id))}
            >
              Load
            </Button>
            <Button
              size="sm"
              variant="outline"
              className={`flex-1 ${smallBtn}`}
              disabled={busy}
              onClick={() => run(() => savesLib.saveToSlot(iframeRef.current, slot.id))}
            >
              {slot.auto ? "Update" : "Overwrite"}
            </Button>
            <Button
              size="sm"
              variant="outline"
              className={`flex-1 ${smallBtn}`}
              disabled={busy}
              onClick={() => run(() => savesLib.deleteSlot(iframeRef.current, slot.id))}
            >
              Delete
            </Button>
          </div>
        </div>
      ))}
      <div className="mt-1 flex gap-2">
        <Button
          size="sm"
          variant="outline"
          className={`h-8 flex-1 text-xs ${outBtn}`}
          disabled={busy}
          onClick={() =>
            run(async () => {
              const id = savesLib.nextFreeSlot(iframeRef.current);
              if (id < 1) return { ok: false, message: "All 20 slots are full" };
              return savesLib.saveToSlot(iframeRef.current, id);
            })
          }
        >
          Save to new slot
        </Button>
        <Button
          size="sm"
          variant="outline"
          className={`h-8 flex-1 text-xs ${outBtn}`}
          disabled={busy}
          onClick={() =>
            run(async () => {
              const id = savesLib.nextFreeSlot(iframeRef.current);
              if (id < 1) return { ok: false, message: "All 20 slots are full" };
              cheatsOff();
              try {
                const r = await savesLib.saveToSlot(iframeRef.current, id);
                return r.ok ? { ok: true, message: `Clean save written to slot ${id}` } : r;
              } finally {
                cheatsRestore();
              }
            })
          }
        >
          Clean save
        </Button>
      </div>

      <SectionTitle>Backups</SectionTitle>
      <Button
        size="sm"
        variant="outline"
        className={`mb-2 w-full ${outBtn}`}
        disabled={busy}
        onClick={() => run(() => savesLib.createBackup(iframeRef.current))}
      >
        Create backup
      </Button>
      {backups.length === 0 && (
        <div className="rounded-lg border border-dashed border-white/15 px-3 py-4 text-center text-xs text-white/40">
          No backups yet
        </div>
      )}
      {backups.map((b) => (
        <div key={b.id} className="mb-2 rounded-lg border border-white/10 bg-white/5 p-3">
          <div className="flex items-center justify-between gap-2">
            <span className="truncate text-sm font-bold text-white">{b.label}</span>
            <CheatBadge cheats={b.cheats} />
          </div>
          <div className="mt-1 text-xs text-white/70">
            {b.files} files · {fmtSaveTime(b.time)}
          </div>
          <div className="mt-2 flex gap-2">
            <Button
              size="sm"
              variant="outline"
              className={`flex-1 ${smallBtn}`}
              disabled={busy}
              onClick={() => run(() => savesLib.restoreBackup(iframeRef.current, b.id))}
            >
              Restore
            </Button>
            <Button
              size="sm"
              variant="outline"
              className={`flex-1 ${smallBtn}`}
              disabled={busy}
              onClick={() => run(() => savesLib.deleteBackup(iframeRef.current, b.id))}
            >
              Delete
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Panel shell
// ---------------------------------------------------------------------------

export function SettingsPanel({ iframeRef, open, onClose, onExitGame }: Props) {
  if (!open) return null;
  return (
    <motion.div
      initial={{ x: "100%" }}
      animate={{ x: 0 }}
      exit={{ x: "100%" }}
      transition={{ type: "tween", duration: 0.18, ease: "easeOut" }}
      className="fixed right-0 top-0 bottom-0 z-50 w-full sm:w-[400px] bg-black/50 backdrop-blur-md border-l border-white/15 flex flex-col"
      role="dialog"
      aria-label="Game settings"
    >
      <div className="flex items-center justify-between px-4 pb-2 pt-4">
        <span className="text-lg font-bold text-white">Settings</span>
        <Button
          size="sm"
          variant="ghost"
          className="h-8 w-8 p-0 text-white hover:bg-neutral-200"
          onClick={onClose}
          aria-label="Close settings"
        >
          <X className="w-4 h-4" />
        </Button>
      </div>

      <Tabs defaultValue="crt" className="flex-1 flex flex-col min-h-0 px-4 pb-4">
        <TabsList className="grid h-10 w-full grid-cols-4 rounded-lg border border-white/10 bg-white/5 p-1">
          <TabsTrigger
            value="crt"
            className="rounded-md text-sm font-bold text-white/60 transition-colors data-[state=active]:bg-white data-[state=active]:text-black"
          >
            CRT
          </TabsTrigger>
          <TabsTrigger
            value="game"
            className="rounded-md text-sm font-bold text-white/60 transition-colors data-[state=active]:bg-white data-[state=active]:text-black"
          >
            GAME
          </TabsTrigger>
          <TabsTrigger
            value="saves"
            className="rounded-md text-sm font-bold text-white/60 transition-colors data-[state=active]:bg-white data-[state=active]:text-black"
          >
            SAVES
          </TabsTrigger>
          <TabsTrigger
            value="debug"
            className="rounded-md text-sm font-bold text-white/60 transition-colors data-[state=active]:bg-white data-[state=active]:text-black"
          >
            DEBUG
          </TabsTrigger>
        </TabsList>
        <TabsContent value="crt" className="mt-3 flex-1 overflow-y-auto thin-scroll pr-1">
          <CrtTab />
        </TabsContent>
        <TabsContent value="game" className="mt-3 flex-1 overflow-y-auto thin-scroll pr-1">
          <GameTab iframeRef={iframeRef} />
        </TabsContent>
        <TabsContent value="saves" className="mt-3 flex-1 overflow-y-auto thin-scroll pr-1">
          <SavesTab iframeRef={iframeRef} />
        </TabsContent>
        <TabsContent value="debug" className="mt-3 flex-1 overflow-y-auto thin-scroll pr-1">
          <DebugTab iframeRef={iframeRef} onExitGame={onExitGame} />
        </TabsContent>
      </Tabs>
    </motion.div>
  );
}
