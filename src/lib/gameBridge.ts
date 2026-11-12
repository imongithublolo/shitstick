"use client";

/**
 * Bridge into the same-origin RMMZ game iframe.
 *
 * The game is vanilla RPG Maker MZ (packaged for Windows with nw.js by the
 * original author, stripped to its web payload for this portal). Because the
 * iframe is same-origin, we can reach its window/document directly and drive
 * engine globals ($gameParty, Input, SceneManager, ...) from the portal.
 */
import { KeybindAction } from "./settings";

 

export type RmmzWindow = any;

export function gameWindow(iframe: HTMLIFrameElement | null): RmmzWindow | null {
  try {
    const w = iframe?.contentWindow;
    return w && w.SceneManager ? w : null;
  } catch {
    return null;
  }
}

export function gameDocument(iframe: HTMLIFrameElement | null): Document | null {
  try {
    return iframe?.contentDocument ?? null;
  } catch {
    return null;
  }
}

export function gameCanvas(iframe: HTMLIFrameElement | null): HTMLCanvasElement | null {
  const doc = gameDocument(iframe);
  return doc ? (doc.querySelector("canvas") as HTMLCanvasElement | null) : null;
}

/** True once the engine booted (SceneManager exists and data is loaded). */
export function isEngineBooted(iframe: HTMLIFrameElement | null): boolean {
  const w = gameWindow(iframe);
  return !!(w && w.Input && w.Input.keyMapper && w.$dataSystem);
}

/** True once a playthrough is active (title screen passed). */
export function isGameActive(iframe: HTMLIFrameElement | null): boolean {
  const w = gameWindow(iframe);
  return !!(w && w.$gameMap && w.$gamePlayer && w.$gameSystem);
}

// ---------------------------------------------------------------------------
// Key mapper snapshot / remap
// ---------------------------------------------------------------------------

/**
 * Snapshots the game's Input.keyMapper the first time we see it, so user
 * overrides can be applied deterministically on top and reverted cleanly.
 */
export function snapshotKeyMapper(iframe: HTMLIFrameElement | null): Record<string, string> | null {
  const w = gameWindow(iframe);
  if (!w || !w.Input || !w.Input.keyMapper) return null;
  if (!w.__ssaKeyMapperSnapshot) {
    w.__ssaKeyMapperSnapshot = { ...w.Input.keyMapper };
  }
  return w.__ssaKeyMapperSnapshot;
}

export function applyKeybinds(
  iframe: HTMLIFrameElement | null,
  binds: Record<KeybindAction, string[]>,
  extraActions: KeybindAction[] = []
): boolean {
  const w = gameWindow(iframe);
  const snapshot = snapshotKeyMapper(iframe);
  if (!w || !snapshot || !w.Input?.keyMapper) return false;

  const mapper = w.Input.keyMapper;
  // restore pristine state first
  for (const k of Object.keys(mapper)) delete mapper[k];
  Object.assign(mapper, snapshot);

  // then apply overrides: remove the bound codes from every action, and
  // assign them to their new action
  const allCodes = new Set<string>();
  for (const action of Object.keys(binds) as KeybindAction[]) {
    for (const code of binds[action] ?? []) allCodes.add(String(code));
  }
  for (const code of allCodes) delete mapper[code];
  for (const action of Object.keys(binds) as KeybindAction[]) {
    for (const code of binds[action] ?? []) {
      mapper[String(code)] = action;
    }
  }
  for (const action of extraActions) {
    for (const code of binds[action] ?? []) mapper[String(code)] = action;
  }
  return true;
}

// ---------------------------------------------------------------------------
// FPS meter + FPS lock (requestAnimationFrame throttle inside the iframe)
// ---------------------------------------------------------------------------

export function installFpsMeter(iframe: HTMLIFrameElement | null): boolean {
  const w = gameWindow(iframe);
  if (!w || w.__ssaRafInstalled) return !!w;

  const orig = w.requestAnimationFrame.bind(w);
  let lockMs = 0;
  let last = 0;
  let frames = 0;
  let statT = w.performance.now();

  w.__ssaSetFpsLock = (fps: number) => {
    lockMs = fps > 0 ? 1000 / fps : 0;
    last = 0;
  };
  w.__ssaFps = 0;

  w.requestAnimationFrame = ((cb: (t: number) => void) => {
    const wrapped = (t: number) => {
      if (lockMs > 0) {
        if (t - last < lockMs - 1.5) {
          orig(wrapped);
          return;
        }
        last = t;
      }
      frames += 1;
      if (t - statT >= 500) {
        w.__ssaFps = Math.round((frames * 1000) / (t - statT));
        frames = 0;
        statT = t;
      }
      cb(t);
    };
    return orig(wrapped);
  }) as typeof requestAnimationFrame;

  w.__ssaRafInstalled = true;
  return true;
}

export function setFpsLock(iframe: HTMLIFrameElement | null, fps: number): void {
  const w = gameWindow(iframe);
  if (w && typeof w.__ssaSetFpsLock === "function") {
    w.__ssaSetFpsLock(fps);
  }
}

export function readFps(iframe: HTMLIFrameElement | null): number {
  const w = gameWindow(iframe);
  return w ? (w.__ssaFps as number) || 0 : 0;
}

// ---------------------------------------------------------------------------
// Audio unlock (browsers suspend AudioContext created without a gesture)
// ---------------------------------------------------------------------------

export function installAudioUnlock(iframe: HTMLIFrameElement | null): void {
  const doc = gameDocument(iframe);
  const w = iframe?.contentWindow;
  if (!doc || !w || w.__ssaAudioUnlock) return;
  w.__ssaAudioUnlock = true;

  const unlock = () => {
    try {
      const ctx = w.WebAudio?._ctx;
      if (ctx && ctx.state === "suspended") ctx.resume();
    } catch {
      /* ignore */
    }
  };
  doc.addEventListener("pointerdown", unlock, { capture: true });
  doc.addEventListener("keydown", unlock, { capture: true });
  // also unlock when the parent window had the gesture (clicking Play etc.)
  unlock();
}

// ---------------------------------------------------------------------------
// Volumes
// ---------------------------------------------------------------------------

export function applyVolumes(
  iframe: HTMLIFrameElement | null,
  v: { bgm: number; bgs: number; me: number; se: number }
): void {
  const w = iframe?.contentWindow;
  if (!w) return;
  try {
    if (w.AudioManager) {
      w.AudioManager.bgmVolume = v.bgm;
      w.AudioManager.bgsVolume = v.bgs;
      w.AudioManager.meVolume = v.me;
      w.AudioManager.seVolume = v.se;
    }
    if (w.ConfigManager) {
      w.ConfigManager.bgmVolume = v.bgm;
      w.ConfigManager.bgsVolume = v.bgs;
      w.ConfigManager.meVolume = v.me;
      w.ConfigManager.seVolume = v.se;
      if (typeof w.ConfigManager.save === "function") w.ConfigManager.save();
    }
  } catch {
    /* ignore */
  }
}

/** Poll until the engine is booted (max ~30s), then callback. */
export function whenEngineReady(
  iframe: HTMLIFrameElement | null,
  cb: () => void,
  timeoutMs = 30000
): () => void {
  const start = Date.now();
  const timer = window.setInterval(() => {
    if (isEngineBooted(iframe)) {
      window.clearInterval(timer);
      cb();
    } else if (Date.now() - start > timeoutMs) {
      window.clearInterval(timer);
    }
  }, 250);
  return () => window.clearInterval(timer);
}
