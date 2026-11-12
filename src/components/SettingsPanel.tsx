"use client";

/**
 * In-game settings panel (opened via the gear icon button).
 *
 * Tabs:
 *  - CRT: master toggle + every shader parameter + presets (port of the
 *    upstream CRTTweakPanel controls)
 *  - GAME: FPS counter, FPS lock, keybind remapping, audio volumes
 *  - DEBUG: cheats discovered in the game (built-in Ctrl noclip, RMMZ debug
 *    globals, the game's own switches/variables/items/maps)
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  Ban,
  Crosshair,
  Download,
  FastForward,
  Gauge,
  Gamepad2,
  HeartPulse,
  KeyRound,
  MapPin,
  Monitor,
  Package,
  RotateCcw,
  Save,
  Search,
  Sliders,
  Sparkles,
  Trash2,
  Volume2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import {
  CRT_DEFAULTS,
  KEYBIND_ACTION_LABELS,
  KeybindAction,
  keyLabel,
  useSettings,
} from "@/lib/settings";
import {
  applyKeybinds,
  gameWindow,
  isEngineBooted,
  isGameActive,
} from "@/lib/gameBridge";
import * as cheats from "@/lib/cheats";

 

type Props = {
  iframeRef: React.RefObject<HTMLIFrameElement | null>;
  open: boolean;
  onClose: () => void;
  onExitGame: () => void;
};

// ---------------------------------------------------------------------------
// small shared bits
// ---------------------------------------------------------------------------

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-5 mb-2 text-[11px] font-bold tracking-[0.18em] text-emerald-300/70">
      {children}
    </div>
  );
}

function ToggleRow({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5">
      <div className="min-w-0">
        <div className="text-sm">{label}</div>
        {hint && <div className="text-[11px] text-white/40">{hint}</div>}
      </div>
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
      <div className="flex items-center justify-between text-sm mb-1">
        <span>{label}</span>
        <span className="text-emerald-300/90 text-xs tabular-nums">
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
        hint="WebGL shader over the game output"
        checked={crt.enabled}
        onChange={(v) => setCrt({ enabled: v })}
      />
      <ToggleRow
        label="Pixel Smoothing"
        hint="Bilinear texture filtering (off = crunchy pixels)"
        checked={crt.smoothing}
        onChange={(v) => setCrt({ smoothing: v })}
      />

      <SectionTitle>Presets</SectionTitle>
      <div className="grid grid-cols-3 gap-2">
        {["Subtle", "Retro", "Strong"].map((name) => (
          <Button
            key={name}
            size="sm"
            variant="outline"
            className="border-white/15 bg-white/5 hover:bg-white/10"
            onClick={() => applyPreset(name)}
          >
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
        <Button size="sm" variant="outline" onClick={resetCrt} className="w-full border-white/15 bg-white/5">
          <RotateCcw className="w-3.5 h-3.5 mr-1.5" /> Reset CRT to defaults
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
      <SectionTitle>
        <span className="inline-flex items-center gap-1.5">
          <Gauge className="w-3.5 h-3.5" /> Performance
        </span>
      </SectionTitle>
      <ToggleRow
        label="Show FPS"
        hint="Counter in the top-left corner"
        checked={game.showFps}
        onChange={(v) => setGame({ showFps: v })}
      />
      <div className="py-2">
        <div className="text-sm mb-2">FPS Limit</div>
        <div className="grid grid-cols-6 gap-1.5">
          {FPS_OPTIONS.map((opt) => (
            <Button
              key={opt.value}
              size="sm"
              variant={game.fpsLock === opt.value ? "default" : "outline"}
              className={
                game.fpsLock === opt.value
                  ? "bg-emerald-500 text-black hover:bg-emerald-400"
                  : "border-white/15 bg-white/5 hover:bg-white/10 px-0"
              }
              onClick={() => setGame({ fpsLock: opt.value })}
            >
              {opt.label}
            </Button>
          ))}
        </div>
        <div className="text-[11px] text-white/40 mt-1.5">
          Locks the game loop by throttling requestAnimationFrame.
        </div>
      </div>

      <SectionTitle>
        <span className="inline-flex items-center gap-1.5">
          <Volume2 className="w-3.5 h-3.5" /> Audio
        </span>
      </SectionTitle>
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

      <SectionTitle>
        <span className="inline-flex items-center gap-1.5">
          <KeyRound className="w-3.5 h-3.5" /> Keybinds
        </span>
      </SectionTitle>
      {capturing && (
        <div className="rounded-md border border-emerald-400/40 bg-emerald-400/10 px-3 py-2 text-xs mb-2">
          Press a key to bind <b>{KEYBIND_ACTION_LABELS[capturing]}</b> · Esc cancels
        </div>
      )}
      <div className="space-y-1">
        {(Object.keys(KEYBIND_ACTION_LABELS) as KeybindAction[]).map((action) => (
          <div key={action} className="flex items-center justify-between gap-2 py-1">
            <div className="text-sm w-28 shrink-0">{KEYBIND_ACTION_LABELS[action]}</div>
            <div className="flex items-center gap-1 min-w-0 flex-wrap justify-end">
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
              className={
                capturing === action
                  ? "bg-emerald-500 text-black hover:bg-emerald-400 h-7 px-2.5"
                  : "border-white/15 bg-white/5 hover:bg-white/10 h-7 px-2.5"
              }
              onClick={() => setCapturing(capturing === action ? null : action)}
            >
              <Gamepad2 className="w-3.5 h-3.5" />
            </Button>
          </div>
        ))}
      </div>
      <div className="mt-3">
        <Button
          size="sm"
          variant="outline"
          className="w-full border-white/15 bg-white/5"
          onClick={() => {
            resetKeybinds();
            applyKeybinds(iframeRef.current, JSON.parse(JSON.stringify(useSettings.getState().game.keybinds)));
            setTimeout(() => {
              const s = useSettings.getState();
              applyKeybinds(iframeRef.current, s.game.keybinds);
            }, 0);
          }}
        >
          <RotateCcw className="w-3.5 h-3.5 mr-1.5" /> Reset keybinds
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
  switches: { id: number; name: string }[];
  variables: { id: number; name: string }[];
  maps: { id: number; name: string }[];
};

type LiveValues = { sw: Record<number, boolean>; vr: Record<number, number>; gold: number };

const EMPTY_LIVE: LiveValues = { sw: {}, vr: {}, gold: 0 };

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
  return {
    items: collectEntries(w.$dataItems),
    weapons: collectEntries(w.$dataWeapons),
    armors: collectEntries(w.$dataArmors),
    switches,
    variables,
    maps,
  };
}

function snapshotLive(w: any, data: GameData | null): LiveValues {
  const out: LiveValues = { sw: {}, vr: {}, gold: 0 };
  if (!w) return out;
  try {
    data?.switches.forEach((s) => {
      out.sw[s.id] = !!w.$gameSwitches?.value(s.id);
    });
    data?.variables.forEach((v) => {
      out.vr[v.id] = Number(w.$gameVariables?.value(v.id) ?? 0);
    });
    out.gold = Number(w.$gameParty?.gold?.() ?? 0);
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

  return (
    <div>
      <div className="rounded-md border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-[11px] leading-relaxed text-amber-200/90">
        Cheats and debug tools found in the game engine. They can break events
        and saves — use for fun or testing.
      </div>

      <SectionTitle>
        <span className="inline-flex items-center gap-1.5">
          <Sparkles className="w-3.5 h-3.5" /> Cheat Toggles
        </span>
      </SectionTitle>
      <ToggleRow
        label="Noclip"
        hint="Walk through walls (game's Ctrl cheat, always on)"
        checked={debug.noclip}
        onChange={(v) => {
          setDebug({ noclip: v });
          act(() => cheats.setNoclip(iframeRef.current, v));
        }}
      />
      <ToggleRow
        label="God Mode"
        hint="Party constantly healed"
        checked={debug.godMode}
        onChange={(v) => setDebug({ godMode: v })}
      />
      <ToggleRow
        label="No Encounters"
        hint="Disables random battles"
        checked={debug.encounterOff}
        onChange={(v) => {
          setDebug({ encounterOff: v });
          act(() => cheats.setEncounters(iframeRef.current, !v));
        }}
      />

      <SectionTitle>
        <span className="inline-flex items-center gap-1.5">
          <FastForward className="w-3.5 h-3.5" /> Speed
        </span>
      </SectionTitle>
      <SliderRow
        label="Movement Speed"
        hint=""
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
        <div className="text-sm mb-2">Turbo Multiplier</div>
        <div className="grid grid-cols-4 gap-1.5">
          {[1, 2, 3, 4].map((m) => (
            <Button
              key={m}
              size="sm"
              variant={debug.speedMult === m ? "default" : "outline"}
              className={
                debug.speedMult === m
                  ? "bg-emerald-500 text-black hover:bg-emerald-400"
                  : "border-white/15 bg-white/5 hover:bg-white/10"
              }
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

      <SectionTitle>
        <span className="inline-flex items-center gap-1.5">
          <Crosshair className="w-3.5 h-3.5" /> Debug Overlays
        </span>
      </SectionTitle>
      <ToggleRow
        label="Event Boxes"
        hint="Named events + player hitboxes"
        checked={debug.showEvents}
        onChange={(v) => setDebug({ showEvents: v })}
      />
      <ToggleRow
        label="Collision Grid"
        hint="Green = walkable tile"
        checked={debug.showCollision}
        onChange={(v) => setDebug({ showCollision: v })}
      />
      <ToggleRow
        label="Player Info HUD"
        hint="Map, coords, region, gold, FPS"
        checked={debug.showPlayerInfo}
        onChange={(v) => setDebug({ showPlayerInfo: v })}
      />

      <SectionTitle>
        <span className="inline-flex items-center gap-1.5">
          <Save className="w-3.5 h-3.5" /> Quick Actions
        </span>
      </SectionTitle>
      <div className="grid grid-cols-3 gap-1.5">
        <Button size="sm" variant="outline" className="border-white/15 bg-white/5 hover:bg-white/10" onClick={() => act(() => cheats.quickNewGame(iframeRef.current))}>
          New Game
        </Button>
        <Button size="sm" variant="outline" className="border-white/15 bg-white/5 hover:bg-white/10" onClick={() => act(() => cheats.quickContinue(iframeRef.current))}>
          Continue
        </Button>
        <Button size="sm" variant="outline" className="border-white/15 bg-white/5 hover:bg-white/10" onClick={() => act(() => cheats.quickSave(iframeRef.current))}>
          Save
        </Button>
        <Button size="sm" variant="outline" className="border-white/15 bg-white/5 hover:bg-white/10" onClick={() => act(() => cheats.healParty(iframeRef.current))}>
          <HeartPulse className="w-3.5 h-3.5 mr-1" /> Heal
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="border-white/15 bg-white/5 hover:bg-white/10"
          onClick={() => act(() => cheats.enemiesHpToOne(iframeRef.current))}
        >
          <Ban className="w-3.5 h-3.5 mr-1" /> Foes 1HP
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="border-white/15 bg-white/5 hover:bg-white/10"
          onClick={() => iframeRef.current?.contentWindow?.location.reload()}
        >
          Reload
        </Button>
      </div>

      <SectionTitle>Gold ({active ? `${live.gold} G` : "in-game only"})</SectionTitle>
      <div className="flex gap-1.5">
        <Input
          value={goldAmount}
          onChange={(e) => setGoldAmount(e.target.value.replace(/[^0-9]/g, ""))}
          inputMode="numeric"
          className="h-8 bg-white/5 border-white/15 flex-1"
        />
        <Button
          size="sm"
          className="bg-emerald-500 text-black hover:bg-emerald-400 h-8"
          onClick={() => act(() => cheats.addGold(iframeRef.current, Number(goldAmount) || 0))}
        >
          Give
        </Button>
      </div>
      <div className="grid grid-cols-4 gap-1.5 mt-1.5">
        {[100, 1000, 10000, 9999999].map((g) => (
          <Button
            key={g}
            size="sm"
            variant="outline"
            className="border-white/15 bg-white/5 hover:bg-white/10 px-0"
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
          <SectionTitle>
            <span className="inline-flex items-center gap-1.5">
              <Package className="w-3.5 h-3.5" /> Inventory
            </span>
          </SectionTitle>
          <div className="grid grid-cols-3 gap-1.5 mb-2">
            {(["item", "weapon", "armor"] as const).map((k) => (
              <Button
                key={k}
                size="sm"
                variant={giveKind === k ? "default" : "outline"}
                className={
                  giveKind === k
                    ? "bg-emerald-500 text-black hover:bg-emerald-400"
                    : "border-white/15 bg-white/5 hover:bg-white/10"
                }
                onClick={() => setGiveKind(k)}
              >
                {k === "item" ? "Items" : k === "weapon" ? "Weapons" : "Armors"}
              </Button>
            ))}
          </div>
          <div className="relative mb-2">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-white/30" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search…"
              className="h-8 pl-8 bg-white/5 border-white/15 text-sm"
            />
          </div>
          <div className="max-h-64 overflow-y-auto thin-scroll rounded-md border border-white/10 divide-y divide-white/5">
            {entries.map((e) => (
              <div key={e.id} className="flex items-center gap-2 px-2 py-1.5 cheat-list-row">
                <IconImg index={e.icon} />
                <div className="min-w-0 flex-1">
                  <div className="text-sm truncate">{e.name}</div>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-6 px-2 text-[11px] border-white/15 bg-white/5 hover:bg-white/10"
                  disabled={!active}
                  onClick={() => act(() => cheats.giveThing(iframeRef.current, giveKind, e.id, 1))}
                >
                  +1
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-6 px-2 text-[11px] border-white/15 bg-white/5 hover:bg-white/10"
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

          <SectionTitle>
            <span className="inline-flex items-center gap-1.5">
              <Sliders className="w-3.5 h-3.5" /> Switches ({gameData.switches.length})
            </span>
          </SectionTitle>
          <div className="max-h-56 overflow-y-auto thin-scroll rounded-md border border-white/10 divide-y divide-white/5">
            {gameData.switches.map((s) => (
              <div key={s.id} className="flex items-center gap-2 px-2 py-1.5 cheat-list-row">
                <span className="text-[10px] text-white/30 tabular-nums w-6">#{s.id}</span>
                <div className="min-w-0 flex-1 truncate text-sm">{s.name}</div>
                <Switch
                  checked={switchValue(s.id)}
                  disabled={!active}
                  onCheckedChange={(v) => act(() => cheats.setSwitch(iframeRef.current, s.id, v))}
                />
              </div>
            ))}
          </div>

          <SectionTitle>
            <span className="inline-flex items-center gap-1.5">
              <Sliders className="w-3.5 h-3.5" /> Variables ({gameData.variables.length})
            </span>
          </SectionTitle>
          <div className="max-h-56 overflow-y-auto thin-scroll rounded-md border border-white/10 divide-y divide-white/5">
            {gameData.variables.map((v) => (
              <div key={v.id} className="flex items-center gap-2 px-2 py-1.5 cheat-list-row">
                <span className="text-[10px] text-white/30 tabular-nums w-6">#{v.id}</span>
                <div className="min-w-0 flex-1 truncate text-sm">{v.name}</div>
                <Input
                  value={varDraft[v.id] ?? String(variableValue(v.id))}
                  onChange={(e) => setVarDraft((d) => ({ ...d, [v.id]: e.target.value.replace(/[^0-9-]/g, "") }))}
                  disabled={!active}
                  inputMode="numeric"
                  className="h-7 w-20 bg-white/5 border-white/15 text-xs"
                />
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 px-2 text-[11px] border-white/15 bg-white/5 hover:bg-white/10"
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

          <SectionTitle>
            <span className="inline-flex items-center gap-1.5">
              <MapPin className="w-3.5 h-3.5" /> Teleport ({gameData.maps.length} maps)
            </span>
          </SectionTitle>
          <div className="max-h-56 overflow-y-auto thin-scroll rounded-md border border-white/10 divide-y divide-white/5">
            {gameData.maps.map((m) => (
              <div key={m.id} className="flex items-center gap-2 px-2 py-1.5 cheat-list-row">
                <span className="text-[10px] text-white/30 tabular-nums w-7">#{m.id}</span>
                <div className="min-w-0 flex-1 truncate text-sm">{m.name}</div>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-6 px-2 text-[11px] border-white/15 bg-white/5 hover:bg-white/10"
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

      <SectionTitle>
        <span className="inline-flex items-center gap-1.5">
          <Trash2 className="w-3.5 h-3.5" /> Offline Cache
        </span>
      </SectionTitle>
      <Button
        size="sm"
        variant="outline"
        className="w-full border-red-400/30 bg-red-400/10 hover:bg-red-400/20 text-red-200"
        onClick={() => {
          onExitGame();
        }}
      >
        <Trash2 className="w-3.5 h-3.5 mr-1.5" /> Exit &amp; clear offline cache
      </Button>
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
      className="fixed right-0 top-0 bottom-0 z-50 w-full sm:w-[400px] bg-black/92 backdrop-blur-md border-l border-white/10 flex flex-col"
      role="dialog"
      aria-label="Game settings"
    >
      <div className="flex items-center justify-between px-4 pt-4 pb-2">
        <div className="flex items-center gap-2">
          <Monitor className="w-4 h-4 text-emerald-300" />
          <span className="font-ssa-bold tracking-widest text-sm">SETTINGS</span>
        </div>
        <Button
          size="sm"
          variant="ghost"
          className="h-8 w-8 p-0 hover:bg-white/10"
          onClick={onClose}
          aria-label="Close settings"
        >
          <X className="w-4 h-4" />
        </Button>
      </div>

      <Tabs defaultValue="crt" className="flex-1 flex flex-col min-h-0 px-4 pb-4">
        <TabsList className="grid grid-cols-3 bg-white/5">
          <TabsTrigger value="crt" className="text-xs">CRT</TabsTrigger>
          <TabsTrigger value="game" className="text-xs">GAME</TabsTrigger>
          <TabsTrigger value="debug" className="text-xs">DEBUG</TabsTrigger>
        </TabsList>
        <TabsContent value="crt" className="flex-1 overflow-y-auto thin-scroll mt-3 pr-1">
          <CrtTab />
        </TabsContent>
        <TabsContent value="game" className="flex-1 overflow-y-auto thin-scroll mt-3 pr-1">
          <GameTab iframeRef={iframeRef} />
        </TabsContent>
        <TabsContent value="debug" className="flex-1 overflow-y-auto thin-scroll mt-3 pr-1">
          <DebugTab iframeRef={iframeRef} onExitGame={onExitGame} />
        </TabsContent>
      </Tabs>

      <div className="px-4 py-3 border-t border-white/10 text-[10px] leading-relaxed text-white/35">
        ShitStickAdventure by TMX2023 · CRT shader by gingerbeardman (MIT) ·
        Web edition
      </div>
    </motion.div>
  );
}
