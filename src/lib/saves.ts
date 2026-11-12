"use client";

/**
 * Portal save manager for the RMMZ game running in the same-origin iframe.
 *
 * The engine stores saves as deflated JSON in IndexedDB via localforage
 * ("rmmzsave.<gameId>.fileN" + "...global" for the slot index). Slot 0 is
 * never shown by the game's own save/load menus (they list 1..20), so the
 * portal uses it for autosaves.
 *
 * On top of the engine's slots this adds:
 *  - a cheat stamp on every save (portal cheats active at save time?)
 *  - portal backups: full copies of every save key in a separate IndexedDB
 *  - autosave (with a "safe context" guard: only on the map, not in battle
 *    or while a dialog is open, exactly like the engine's own autosave)
 */
import { gameWindow } from "./gameBridge";

export type SaveSlotInfo = {
  id: number; // 0 = portal autosave slot
  title: string;
  playtime: string;
  timestamp: number;
  cheats: boolean | null; // null = saved before this feature existed
  auto: boolean;
};

export type BackupMeta = {
  id: string;
  label: string;
  time: number;
  files: number;
  cheats: boolean;
};

export type SaveResult = { ok: boolean; message: string };

const LAST_AUTOSAVE_KEY = "ssa-last-autosave";

function dm(w: any): any {
  return w?.DataManager;
}

function foragePrefix(w: any): string | null {
  const gameId = w?.$dataSystem?.advanced?.gameId;
  return gameId ? `rmmzsave.${gameId}.` : null;
}

/** DataManager.loadGlobalInfo() is fire-and-forget in this core; poll for it. */
async function waitForGlobalInfo(w: any, timeoutMs = 4000): Promise<any[]> {
  const d = dm(w);
  if (!d) return [];
  if (d._globalInfo) return d._globalInfo;
  try {
    d.loadGlobalInfo();
  } catch {
    /* ignore */
  }
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    await new Promise((r) => setTimeout(r, 120));
    if (d._globalInfo) return d._globalInfo;
  }
  return [];
}

// ---------------------------------------------------------------------------
// Cheat stamping hook
// ---------------------------------------------------------------------------

/**
 * Wraps DataManager.makeSavefileInfo so every save — portal or the game's own
 * menu — is stamped with ssaCheats (whether portal cheats were active at the
 * time). GameStage keeps window.__ssaCheatSnapshot up to date.
 */
export function installSaveHooks(iframe: HTMLIFrameElement | null): boolean {
  const w = gameWindow(iframe);
  const d = dm(w);
  if (!w || !d || typeof d.makeSavefileInfo !== "function") return false;
  if (d.__ssaSaveHookInstalled) return true;
  d.__ssaSaveHookInstalled = true;
  const orig = d.makeSavefileInfo.bind(d);
  d.makeSavefileInfo = function () {
    const info = orig();
    try {
      info.ssaCheats = !!w.__ssaCheatSnapshot;
    } catch {
      /* ignore */
    }
    return info;
  };
  return true;
}

// ---------------------------------------------------------------------------
// Slot listing / saving / loading / deleting
// ---------------------------------------------------------------------------

export async function listSaves(iframe: HTMLIFrameElement | null): Promise<SaveSlotInfo[]> {
  const w = gameWindow(iframe);
  const d = dm(w);
  if (!w || !d) return [];
  const globalInfo = await waitForGlobalInfo(w);
  const max = typeof d.maxSavefiles === "function" ? d.maxSavefiles() : 20;
  const out: SaveSlotInfo[] = [];
  for (let id = 0; id <= max; id++) {
    const info = globalInfo?.[id];
    let exists = false;
    try {
      exists = typeof d.savefileExists === "function" ? d.savefileExists(id) : !!info;
    } catch {
      exists = !!info;
    }
    if (!info && !exists) continue;
    out.push({
      id,
      title: info?.title ?? "",
      playtime: info?.playtime ?? "",
      timestamp: info?.timestamp ?? 0,
      cheats: typeof info?.ssaCheats === "boolean" ? info.ssaCheats : null,
      auto: id === 0,
    });
  }
  out.sort((a, b) => b.timestamp - a.timestamp);
  return out;
}

export async function saveToSlot(
  iframe: HTMLIFrameElement | null,
  id: number
): Promise<SaveResult> {
  const w = gameWindow(iframe);
  const d = dm(w);
  if (!w || !d) return { ok: false, message: "Game engine not loaded yet" };
  if (!w.$gameSystem || !w.$gameMap || !w.$gamePlayer) {
    return { ok: false, message: "Start or load a game first" };
  }
  try {
    w.$gameSystem.onBeforeSave();
    await d.saveGame(id);
    return { ok: true, message: id === 0 ? "Autosaved" : `Saved to slot ${id}` };
  } catch (e) {
    return { ok: false, message: `Save failed: ${String(e)}` };
  }
}

/** Only autosave in a safe context (on the map, no dialog, no battle). */
function saveSafeContext(w: any): boolean {
  try {
    const sceneOk = !!(w.SceneManager && w.Scene_Map && w.SceneManager._scene instanceof w.Scene_Map);
    const msgBusy = !!(w.$gameMessage && typeof w.$gameMessage.isBusy === "function" && w.$gameMessage.isBusy());
    return sceneOk && !msgBusy;
  } catch {
    return false;
  }
}

export async function autosave(iframe: HTMLIFrameElement | null): Promise<SaveResult> {
  const w = gameWindow(iframe);
  if (!w) return { ok: false, message: "Game engine not loaded yet" };
  if (!w.$gameSystem || !w.$gameMap) return { ok: false, message: "Start or load a game first" };
  if (!saveSafeContext(w)) return { ok: false, message: "Skipped (busy — try again on the map)" };
  const r = await saveToSlot(iframe, 0);
  if (r.ok) {
    try {
      localStorage.setItem(LAST_AUTOSAVE_KEY, String(Date.now()));
    } catch {
      /* ignore */
    }
  }
  return r;
}

export function lastAutosaveTime(): number | null {
  try {
    const v = Number(localStorage.getItem(LAST_AUTOSAVE_KEY) || 0);
    return v > 0 ? v : null;
  } catch {
    return null;
  }
}

export async function loadSlot(iframe: HTMLIFrameElement | null, id: number): Promise<SaveResult> {
  const w = gameWindow(iframe);
  const d = dm(w);
  if (!w || !d || !w.SceneManager) return { ok: false, message: "Game engine not loaded yet" };
  if (w.Scene_Battle && w.SceneManager._scene instanceof w.Scene_Battle) {
    return { ok: false, message: "Finish the battle first" };
  }
  try {
    await d.loadGame(id);
    w.$gameSystem.onAfterLoad();
    w.SceneManager.goto(w.Scene_Map);
    return { ok: true, message: `Loaded ${id === 0 ? "autosave" : `slot ${id}`}` };
  } catch (e) {
    return { ok: false, message: `Load failed: ${String(e)}` };
  }
}

export async function deleteSlot(iframe: HTMLIFrameElement | null, id: number): Promise<SaveResult> {
  const w = gameWindow(iframe);
  const d = dm(w);
  if (!w || !d || !w.StorageManager) return { ok: false, message: "Game engine not loaded yet" };
  try {
    await w.StorageManager.remove(`file${id}`);
    if (d._globalInfo) {
      d._globalInfo[id] = null;
      d.saveGlobalInfo();
    }
    return { ok: true, message: `Deleted ${id === 0 ? "autosave" : `slot ${id}`}` };
  } catch (e) {
    return { ok: false, message: `Delete failed: ${String(e)}` };
  }
}

/** Next free engine slot (1..20), or -1 when all are full. */
export function nextFreeSlot(iframe: HTMLIFrameElement | null): number {
  const d = dm(gameWindow(iframe));
  if (!d || typeof d.emptySavefileId !== "function") return -1;
  try {
    return d.emptySavefileId();
  } catch {
    return -1;
  }
}

// ---------------------------------------------------------------------------
// Backups (full copies of every save key, in their own IndexedDB database)
// ---------------------------------------------------------------------------

function backupStore(w: any): any | null {
  if (!w?.localforage?.createInstance) return null;
  if (!w.__ssaBackupStore) {
    w.__ssaBackupStore = w.localforage.createInstance({ name: "ssa-saves-backup" });
  }
  return w.__ssaBackupStore;
}

export async function createBackup(
  iframe: HTMLIFrameElement | null,
  label?: string
): Promise<SaveResult> {
  const w = gameWindow(iframe);
  const store = backupStore(w);
  const prefix = foragePrefix(w);
  if (!w || !store || !prefix) return { ok: false, message: "Game engine not loaded yet" };
  try {
    const keys: string[] = (await w.localforage.keys()).filter((k: string) => k.startsWith(prefix));
    const files: Record<string, unknown> = {};
    for (const k of keys) {
      files[k] = await w.localforage.getItem(k);
    }
    if (keys.length === 0) return { ok: false, message: "Nothing to back up yet" };
    const time = Date.now();
    const meta: BackupMeta = {
      id: `backup-${time}-${Math.random().toString(36).slice(2, 7)}`,
      label: label?.trim() || new Date(time).toLocaleString(),
      time,
      files: keys.length,
      cheats: !!w.__ssaCheatSnapshot,
    };
    await store.setItem(meta.id, { meta, files });
    return { ok: true, message: `Backup created (${keys.length} files)` };
  } catch (e) {
    return { ok: false, message: `Backup failed: ${String(e)}` };
  }
}

export async function listBackups(iframe: HTMLIFrameElement | null): Promise<BackupMeta[]> {
  const w = gameWindow(iframe);
  const store = backupStore(w);
  if (!store) return [];
  try {
    const keys: string[] = await store.keys();
    const metas: BackupMeta[] = [];
    for (const k of keys) {
      const obj = await store.getItem(k);
      if (obj?.meta) metas.push(obj.meta);
    }
    metas.sort((a, b) => b.time - a.time);
    return metas;
  } catch {
    return [];
  }
}

export async function restoreBackup(
  iframe: HTMLIFrameElement | null,
  id: string
): Promise<SaveResult> {
  const w = gameWindow(iframe);
  const store = backupStore(w);
  if (!w || !store) return { ok: false, message: "Game engine not loaded yet" };
  try {
    const obj = await store.getItem(id);
    if (!obj?.files) return { ok: false, message: "Backup not found" };
    for (const [k, v] of Object.entries(obj.files as Record<string, unknown>)) {
      await w.localforage.setItem(k, v);
    }
    // StorageManager caches forage keys for exists(); refresh it + global info
    try {
      await w.StorageManager?.updateForageKeys?.();
    } catch {
      /* ignore */
    }
    const d = dm(w);
    if (d) {
      try {
        d._globalInfo = (await w.StorageManager.loadObject("global")) ?? [];
      } catch {
        d._globalInfo = [];
      }
    }
    return { ok: true, message: `Restored ${Object.keys(obj.files).length} save files` };
  } catch (e) {
    return { ok: false, message: `Restore failed: ${String(e)}` };
  }
}

export async function deleteBackup(iframe: HTMLIFrameElement | null, id: string): Promise<SaveResult> {
  const w = gameWindow(iframe);
  const store = backupStore(w);
  if (!w || !store) return { ok: false, message: "Game engine not loaded yet" };
  try {
    await store.removeItem(id);
    return { ok: true, message: "Backup deleted" };
  } catch (e) {
    return { ok: false, message: `Delete failed: ${String(e)}` };
  }
}
