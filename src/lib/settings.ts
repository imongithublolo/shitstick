"use client";

/**
 * Portal settings, persisted to localStorage via zustand.
 *
 * CRT defaults follow the upstream CRTTweakPanel.js defaults (with
 * scanlineCount tuned to the game's 624px internal resolution), except where
 * a preset overrides them.
 */
import { create } from "zustand";
import { persist } from "zustand/middleware";

export type CrtSettings = {
  enabled: boolean;
  smoothing: boolean;
  scanlineIntensity: number;
  scanlineCount: number;
  adaptiveIntensity: number;
  brightness: number;
  contrast: number;
  saturation: number;
  bloomIntensity: number;
  bloomThreshold: number;
  rgbShift: number;
  vignetteStrength: number;
  curvature: number;
  flickerStrength: number;
};

export type KeybindAction =
  | "up"
  | "down"
  | "left"
  | "right"
  | "ok"
  | "escape"
  | "shift"
  | "control"
  | "openMenu";

export const KEYBIND_ACTION_LABELS: Record<KeybindAction, string> = {
  up: "Move Up",
  down: "Move Down",
  left: "Move Left",
  right: "Move Right",
  ok: "Confirm",
  escape: "Cancel / Menu",
  shift: "Sprint",
  control: "Noclip (hold)",
  openMenu: "Open Menu",
};

/** keyCode -> friendly label */
export const KEY_LABELS: Record<string, string> = {
  "8": "Backspace",
  "9": "Tab",
  "13": "Enter",
  "16": "Shift",
  "17": "Ctrl",
  "18": "Alt",
  "19": "Pause",
  "20": "Caps",
  "27": "Esc",
  "32": "Space",
  "33": "PgUp",
  "34": "PgDn",
  "35": "End",
  "36": "Home",
  "37": "\u2190",
  "38": "\u2191",
  "39": "\u2192",
  "40": "\u2193",
  "45": "Insert",
  "46": "Delete",
  "48": "0",
  "49": "1",
  "50": "2",
  "51": "3",
  "52": "4",
  "53": "5",
  "54": "6",
  "55": "7",
  "56": "8",
  "57": "9",
  "65": "A",
  "66": "B",
  "67": "C",
  "68": "D",
  "69": "E",
  "70": "F",
  "71": "G",
  "72": "H",
  "73": "I",
  "74": "J",
  "75": "K",
  "76": "L",
  "77": "M",
  "78": "N",
  "79": "O",
  "80": "P",
  "81": "Q",
  "82": "R",
  "83": "S",
  "84": "T",
  "85": "U",
  "86": "V",
  "87": "W",
  "88": "X",
  "89": "Y",
  "90": "Z",
  "96": "Num0",
  "97": "Num1",
  "98": "Num2",
  "99": "Num3",
  "100": "Num4",
  "101": "Num5",
  "102": "Num6",
  "103": "Num7",
  "104": "Num8",
  "105": "Num9",
  "106": "Num*",
  "107": "Num+",
  "109": "Num-",
  "110": "Num.",
  "111": "Num/",
  "112": "F1",
  "113": "F2",
  "114": "F3",
  "115": "F4",
  "116": "F5",
  "117": "F6",
  "118": "F7",
  "119": "F8",
  "120": "F9",
  "186": ";",
  "187": "=",
  "188": ",",
  "189": "-",
  "190": ".",
  "191": "/",
  "192": "`",
  "219": "[",
  "220": "\\",
  "221": "]",
  "222": "'",
};

export function keyLabel(code: string): string {
  return KEY_LABELS[code] || `#${code}`;
}

/** The game's own defaults (as configured by r88_CustomControls + RMMZ core). */
export const DEFAULT_KEYBINDS: Record<KeybindAction, string[]> = {
  up: ["38"],
  down: ["40"],
  left: ["37"],
  right: ["39"],
  ok: ["90", "13", "32"],
  escape: ["88", "27"],
  shift: ["16"],
  control: ["17"],
  openMenu: [],
};

export type GameSettings = {
  showFps: boolean;
  /** 0 = native (vsync) */
  fpsLock: number;
  keybinds: Record<KeybindAction, string[]>;
  volumes: { bgm: number; bgs: number; me: number; se: number };
};

export type ResolutionMode = "default" | "720p" | "1080p" | "custom" | "autofit";

export type DisplaySettings = {
  mode: ResolutionMode;
  /** even numbers, used when mode === "custom" */
  customW: number;
  customH: number;
};

export const DEFAULT_DISPLAY: DisplaySettings = {
  mode: "default",
  customW: 1280,
  customH: 720,
};

/** Settings persisted before the display option existed may lack `display`. */
export function getDisplay(d: { display?: DisplaySettings }): DisplaySettings {
  return d.display ?? DEFAULT_DISPLAY;
}

export type DebugSettings = {
  display: DisplaySettings;
  noclip: boolean;
  /** RMMZ move speed level 1..6 (4 = normal). 0 = untouched. */
  moveSpeed: number;
  /** distancePerFrame multiplier, 1 = off */
  speedMult: number;
  godMode: boolean;
  encounterOff: boolean;
  showEvents: boolean;
  showCollision: boolean;
  showPlayerInfo: boolean;
};

export type SaveSettings = {
  autosaveOn: boolean;
  /** autosave interval in minutes */
  autosaveMins: number;
};

export type PortalSettings = {
  crt: CrtSettings;
  game: GameSettings;
  debug: DebugSettings;
  saves: SaveSettings;
};

export const CRT_DEFAULTS: CrtSettings = {
  enabled: true,
  smoothing: true,
  scanlineIntensity: 0.15,
  scanlineCount: 312,
  adaptiveIntensity: 0.5,
  brightness: 1.1,
  contrast: 1.05,
  saturation: 1.1,
  bloomIntensity: 0.2,
  bloomThreshold: 0.5,
  rgbShift: 0,
  vignetteStrength: 0.3,
  curvature: 0.15,
  flickerStrength: 0.01,
};

export const CRT_PRESETS: Record<string, Partial<CrtSettings>> = {
  Subtle: {},
  Retro: {
    scanlineIntensity: 0.3,
    scanlineCount: 208,
    adaptiveIntensity: 0.5,
    brightness: 1.2,
    contrast: 1.1,
    saturation: 1.15,
    bloomIntensity: 0.35,
    bloomThreshold: 0.55,
    rgbShift: 0.25,
    vignetteStrength: 0.45,
    curvature: 0.2,
    flickerStrength: 0.02,
  },
  Strong: {
    scanlineIntensity: 0.5,
    scanlineCount: 312,
    adaptiveIntensity: 0.6,
    brightness: 1.45,
    contrast: 1.05,
    saturation: 1.1,
    bloomIntensity: 0.5,
    bloomThreshold: 0.5,
    rgbShift: 0.7,
    vignetteStrength: 0.6,
    curvature: 0.3,
    flickerStrength: 0.03,
  },
};

export const GAME_DEFAULTS: GameSettings = {
  showFps: false,
  fpsLock: 0,
  keybinds: DEFAULT_KEYBINDS,
  volumes: { bgm: 100, bgs: 100, me: 100, se: 100 },
};

export const DEBUG_DEFAULTS: DebugSettings = {
  display: { ...DEFAULT_DISPLAY },
  noclip: false,
  moveSpeed: 0,
  speedMult: 1,
  godMode: false,
  encounterOff: false,
  showEvents: false,
  showCollision: false,
  showPlayerInfo: false,
};

export const SAVE_DEFAULTS: SaveSettings = {
  autosaveOn: true,
  autosaveMins: 2,
};

type SettingsStore = PortalSettings & {
  setCrt: (patch: Partial<CrtSettings>) => void;
  resetCrt: () => void;
  applyCrtPreset: (name: string) => void;
  setGame: (patch: Partial<GameSettings>) => void;
  setKeybinds: (binds: Record<KeybindAction, string[]>) => void;
  resetKeybinds: () => void;
  setVolumes: (patch: Partial<GameSettings["volumes"]>) => void;
  setDebug: (patch: Partial<DebugSettings>) => void;
  resetDebug: () => void;
  setSaves: (patch: Partial<SaveSettings>) => void;
};

export const useSettings = create<SettingsStore>()(
  persist(
    (set) => ({
      crt: { ...CRT_DEFAULTS },
      game: {
        ...GAME_DEFAULTS,
        keybinds: { ...DEFAULT_KEYBINDS },
        volumes: { ...GAME_DEFAULTS.volumes },
      },
      debug: { ...DEBUG_DEFAULTS },
      saves: { ...SAVE_DEFAULTS },
      setCrt: (patch) => set((s) => ({ crt: { ...s.crt, ...patch } })),
      resetCrt: () => set({ crt: { ...CRT_DEFAULTS } }),
      applyCrtPreset: (name) =>
        set((s) => ({
          crt: { ...s.crt, ...CRT_DEFAULTS, ...CRT_PRESETS[name] },
        })),
      setGame: (patch) => set((s) => ({ game: { ...s.game, ...patch } })),
      setKeybinds: (binds) => set((s) => ({ game: { ...s.game, keybinds: binds } })),
      resetKeybinds: () =>
        set((s) => ({
          game: { ...s.game, keybinds: { ...DEFAULT_KEYBINDS } },
        })),
      setVolumes: (patch) =>
        set((s) => ({
          game: { ...s.game, volumes: { ...s.game.volumes, ...patch } },
        })),
      setDebug: (patch) => set((s) => ({ debug: { ...s.debug, ...patch } })),
      resetDebug: () => set({ debug: { ...DEBUG_DEFAULTS } }),
      setSaves: (patch) => set((s) => ({ saves: { ...s.saves, ...patch } })),
    }),
    {
      name: "ssa-portal-settings",
      version: 1,
    }
  )
);
