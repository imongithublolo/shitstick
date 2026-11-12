"use client";

/**
 * Cheat / debug actions executed against the live RPG Maker MZ engine inside
 * the game iframe. Everything here is best-effort: each action is guarded and
 * returns a human-readable result for the settings panel to toast.
 */
import { gameWindow } from "./gameBridge";

 

export type CheatResult = { ok: boolean; message: string };

const ok = (message: string): CheatResult => ({ ok: true, message });
const fail = (message: string): CheatResult => ({ ok: false, message });

function requireActive(w: any): CheatResult | null {
  if (!w) return fail("Game engine not loaded yet");
  if (!w.$gameSystem || !w.$gameMap || !w.$gamePlayer) {
    return fail("Start or load a game first (cheats work in-game)");
  }
  return null;
}

// ---------------------------------------------------------------------------
// Toggles
// ---------------------------------------------------------------------------

/** Walk through walls. The game's built-in noclip (Ctrl) requires playtest
 *  mode; we override Game_Player.isDebugThrough instead. */
export function setNoclip(iframe: HTMLIFrameElement | null, on: boolean): CheatResult {
  const w = gameWindow(iframe);
  if (!w || !w.Game_Player) return fail("Game engine not loaded yet");
  const P = w.Game_Player.prototype;
  if (on) {
    if (!P.__ssaOrigDebugThrough) P.__ssaOrigDebugThrough = P.isDebugThrough;
    P.isDebugThrough = function () {
      return true;
    };
    return ok("Noclip on");
  }
  if (P.__ssaOrigDebugThrough) {
    P.isDebugThrough = P.__ssaOrigDebugThrough;
    delete P.__ssaOrigDebugThrough;
  }
  return ok("Noclip off");
}

/** Multiplies per-frame travel distance (works on top of pixel movement). */
export function setSpeedMult(iframe: HTMLIFrameElement | null, mult: number): CheatResult {
  const w = gameWindow(iframe);
  if (!w || !w.Game_Player) return fail("Game engine not loaded yet");
  const P = w.Game_Player.prototype;
  if (!P.__ssaOrigDpf) P.__ssaOrigDpf = P.distancePerFrame;
  if (mult === 1) {
    P.distancePerFrame = P.__ssaOrigDpf;
    delete P.__ssaOrigDpf;
    return ok("Speed x1");
  }
  const orig = P.__ssaOrigDpf;
  P.distancePerFrame = function () {
    return orig.call(this) * mult;
  };
  return ok(`Speed x${mult}`);
}

/** RMMZ move speed level (1..6, 4 = default). */
export function setMoveSpeed(iframe: HTMLIFrameElement | null, level: number): CheatResult {
  const w = gameWindow(iframe);
  const guard = requireActive(w);
  if (guard) return guard;
  try {
    w.$gamePlayer._moveSpeed = level;
    return ok(`Move speed level ${level}`);
  } catch (e) {
    return fail(String(e));
  }
}

/** Disables random encounters bulletproof-ly: besides the engine's own
 *  $gameSystem flag, Game_Player.canEncounter is patched out so step-
 *  encounters can never trigger (survives save/load, works with pixel
 *  movement plugins). */
export function setEncounters(iframe: HTMLIFrameElement | null, enabled: boolean): CheatResult {
  const w = gameWindow(iframe);
  if (!w || !w.Game_Player) return fail("Game engine not loaded yet");
  const P = w.Game_Player.prototype;
  if (!enabled) {
    if (!P.__ssaOrigCanEncounter) P.__ssaOrigCanEncounter = P.canEncounter;
    P.canEncounter = function () {
      return false;
    };
    try {
      w.$gameSystem?.disableEncounter?.();
    } catch {
      /* not in a game yet */
    }
    return ok("Random encounters off");
  }
  if (P.__ssaOrigCanEncounter) {
    P.canEncounter = P.__ssaOrigCanEncounter;
    delete P.__ssaOrigCanEncounter;
  }
  try {
    w.$gameSystem?.enableEncounter?.();
  } catch {
    /* not in a game yet */
  }
  return ok("Random encounters on");
}

// ---------------------------------------------------------------------------
// Party / battle
// ---------------------------------------------------------------------------

export function healParty(iframe: HTMLIFrameElement | null): CheatResult {
  const w = gameWindow(iframe);
  const guard = requireActive(w);
  if (guard) return guard;
  try {
    w.$gameParty.members().forEach((m: any) => m.recoverAll());
    return ok("Party fully healed");
  } catch (e) {
    return fail(String(e));
  }
}

export function enemiesHpToOne(iframe: HTMLIFrameElement | null): CheatResult {
  const w = gameWindow(iframe);
  if (!w) return fail("Game engine not loaded yet");
  if (!w.$gameTroop) return fail("Not in battle");
  try {
    w.$gameTroop.members().forEach((e: any) => e.setHp(1));
    return ok("Enemies set to 1 HP");
  } catch (e) {
    return fail(String(e));
  }
}

/** Instantly wins the current battle. */
export function killAllEnemies(iframe: HTMLIFrameElement | null): CheatResult {
  const w = gameWindow(iframe);
  if (!w) return fail("Game engine not loaded yet");
  if (!w.$gameTroop) return fail("Not in battle");
  try {
    w.$gameTroop.members().forEach((e: any) => e.die());
    return ok("All enemies defeated");
  } catch (e) {
    return fail(String(e));
  }
}

export function addGold(iframe: HTMLIFrameElement | null, amount: number): CheatResult {
  const w = gameWindow(iframe);
  const guard = requireActive(w);
  if (guard) return guard;
  try {
    const MAX = 99_999_999;
    const gold = Math.max(0, Math.min(MAX, Math.floor(amount)));
    w.$gameParty.gainGold(gold);
    return ok(`+${gold.toLocaleString()} G (now ${w.$gameParty.gold().toLocaleString()} G)`);
  } catch (e) {
    return fail(String(e));
  }
}

export type GiveKind = "item" | "weapon" | "armor";

export function giveThing(iframe: HTMLIFrameElement | null, kind: GiveKind, id: number, n: number): CheatResult {
  const w = gameWindow(iframe);
  const guard = requireActive(w);
  if (guard) return guard;
  try {
    const db = kind === "item" ? w.$dataItems : kind === "weapon" ? w.$dataWeapons : w.$dataArmors;
    const entry = db && db[id];
    if (!entry) return fail(`Unknown ${kind} #${id}`);
    w.$gameParty.gainItem(entry, Math.max(1, Math.min(99, n)), true);
    return ok(`Gained ${entry.name} x${n}`);
  } catch (e) {
    return fail(String(e));
  }
}

/** Gives the party every item / weapon / armor in the game. */
export function giveAll(iframe: HTMLIFrameElement | null, kind: GiveKind): CheatResult {
  const w = gameWindow(iframe);
  const guard = requireActive(w);
  if (guard) return guard;
  try {
    const db = kind === "item" ? w.$dataItems : kind === "weapon" ? w.$dataWeapons : w.$dataArmors;
    if (!db) return fail("Game data not loaded yet");
    let n = 0;
    db.forEach((entry: any, i: number) => {
      if (i > 0 && entry && typeof entry.name === "string" && entry.name.trim() && !entry.name.startsWith("-----")) {
        w.$gameParty.gainItem(entry, 99, true);
        n += 1;
      }
    });
    return ok(`Gained every ${kind} (${n})`);
  } catch (e) {
    return fail(String(e));
  }
}

/** Every party member learns every skill in the game, and the Magic +
 *  Special command tabs are force-unlocked (adds skill-type traits to the
 *  actor data so the menu really shows the magic). */
export function learnAllSkills(iframe: HTMLIFrameElement | null): CheatResult {
  const w = gameWindow(iframe);
  const guard = requireActive(w);
  if (guard) return guard;
  try {
    const TRAIT_STYPE_ADD = 41; // Game_BattlerBase.TRAIT_STYPE_ADD
    const members = w.$gameParty.members();
    let learned = 0;
    members.forEach((m: any) => {
      // make sure the Magic (1) and Special (2) tabs exist for this actor
      const data = w.$dataActors?.[m.actorId()];
      if (data) {
        if (!Array.isArray(data.traits)) data.traits = [];
        [1, 2].forEach((st) => {
          if (!data.traits.some((t: any) => t.code === TRAIT_STYPE_ADD && t.dataId === st)) {
            data.traits.push({ code: TRAIT_STYPE_ADD, dataId: st });
          }
        });
      }
      w.$dataSkills?.forEach((s: any, i: number) => {
        if (
          i > 0 &&
          s &&
          typeof s.name === "string" &&
          s.name.trim() &&
          !s.name.startsWith("-----") &&
          !m.isLearnedSkill(i)
        ) {
          m.learnSkill(i);
          learned += 1;
        }
      });
      m.refresh?.();
    });
    return ok(`Party learned ${learned} new skill${learned === 1 ? "" : "s"} (Magic + Special unlocked)`);
  } catch (e) {
    return fail(String(e));
  }
}

/** Levels the whole party to max level. */
export function maxLevelAll(iframe: HTMLIFrameElement | null): CheatResult {
  const w = gameWindow(iframe);
  const guard = requireActive(w);
  if (guard) return guard;
  try {
    w.$gameParty.members().forEach((m: any) => {
      const max = typeof m.maxLevel === "function" ? m.maxLevel() : 99;
      m.changeExp(m.expForLevel(max), true);
    });
    return ok("Party is now max level");
  } catch (e) {
    return fail(String(e));
  }
}

/** Adds any actor (playable or NPC) to the party. */
export function addActorToParty(iframe: HTMLIFrameElement | null, actorId: number): CheatResult {
  const w = gameWindow(iframe);
  const guard = requireActive(w);
  if (guard) return guard;
  try {
    const data = w.$dataActors?.[actorId];
    if (!data) return fail(`Unknown actor #${actorId}`);
    if (w.$gameParty._actors.includes(actorId)) return ok(`${data.name} is already in the party`);
    w.$gameParty.addActor(actorId);
    return ok(`${data.name} joined the party`);
  } catch (e) {
    return fail(String(e));
  }
}

/** Removes an actor from the party (never the last one). */
export function removeActorFromParty(iframe: HTMLIFrameElement | null, actorId: number): CheatResult {
  const w = gameWindow(iframe);
  const guard = requireActive(w);
  if (guard) return guard;
  try {
    const data = w.$dataActors?.[actorId];
    if (!w.$gameParty._actors.includes(actorId)) return fail("Not in the party");
    if (w.$gameParty.size() <= 1) return fail("Can't remove the last member");
    w.$gameParty.removeActor(actorId);
    return ok(`${data?.name ?? `Actor #${actorId}`} left the party`);
  } catch (e) {
    return fail(String(e));
  }
}

// ---------------------------------------------------------------------------
// Switches & variables
// ---------------------------------------------------------------------------

export function setSwitch(iframe: HTMLIFrameElement | null, id: number, value: boolean): CheatResult {
  const w = gameWindow(iframe);
  const guard = requireActive(w);
  if (guard) return guard;
  try {
    w.$gameSwitches.setValue(id, value);
    return ok(`Switch ${id} = ${value ? "ON" : "OFF"}`);
  } catch (e) {
    return fail(String(e));
  }
}

export function setVariable(iframe: HTMLIFrameElement | null, id: number, value: number): CheatResult {
  const w = gameWindow(iframe);
  const guard = requireActive(w);
  if (guard) return guard;
  try {
    w.$gameVariables.setValue(id, Math.floor(value));
    return ok(`Variable ${id} = ${Math.floor(value)}`);
  } catch (e) {
    return fail(String(e));
  }
}

// ---------------------------------------------------------------------------
// Scenes / saves
// ---------------------------------------------------------------------------

export function quickNewGame(iframe: HTMLIFrameElement | null): CheatResult {
  const w = gameWindow(iframe);
  if (!w || !w.DataManager || !w.SceneManager) return fail("Game engine not loaded yet");
  // Scene_Boot loads save metadata asynchronously; setupNewGame crashes if it
  // is still pending (happens only during the first seconds after boot).
  if (w.DataManager._globalInfo === null) {
    try {
      w.DataManager.loadGlobalInfo?.();
    } catch {
      /* ignore */
    }
    return fail("Save data still loading — try again in a moment");
  }
  try {
    w.DataManager.setupNewGame();
    w.SceneManager.goto(w.Scene_Map);
    return ok("New game started");
  } catch (e) {
    return fail(String(e));
  }
}

export function quickContinue(iframe: HTMLIFrameElement | null): CheatResult {
  const w = gameWindow(iframe);
  if (!w || !w.DataManager || !w.SceneManager) return fail("Game engine not loaded yet");
  if (w.DataManager._globalInfo === null) {
    return fail("Save data still loading — try again in a moment");
  }
  try {
    const id = w.DataManager.latestSavefileId();
    if (!id) return fail("No save files found");
    const success = w.DataManager.loadGame(id);
    if (!success) return fail(`Could not read save #${id}`);
    w.$gameSystem.onAfterLoad();
    w.SceneManager.goto(w.Scene_Map);
    return ok(`Loaded save #${id}`);
  } catch (e) {
    return fail(String(e));
  }
}

export function quickSave(iframe: HTMLIFrameElement | null): CheatResult {
  const w = gameWindow(iframe);
  const guard = requireActive(w);
  if (guard) return guard;
  try {
    w.SceneManager.push(w.Scene_Save);
    return ok("Save screen opened");
  } catch (e) {
    return fail(String(e));
  }
}

export async function teleportToMap(iframe: HTMLIFrameElement | null, mapId: number): Promise<CheatResult> {
  const w = gameWindow(iframe);
  const guard = requireActive(w);
  if (guard) return guard;
  try {
    const res = await fetch(`/game/data/Map${String(mapId).padStart(3, "0")}.json`);
    if (!res.ok) return fail(`Map data #${mapId} not found`);
    const map = await res.json();
    const x = Math.max(0, Math.floor((map.width || 17) / 2));
    const y = Math.max(0, Math.floor((map.height || 13) / 2));
    w.$gamePlayer.reserveTransfer(mapId, x, y, 0, 0);
    if (!(w.SceneManager._scene instanceof w.Scene_Map)) {
      w.SceneManager.goto(w.Scene_Map);
    }
    return ok(`Teleporting to map #${mapId}`);
  } catch (e) {
    return fail(String(e));
  }
}

// ---------------------------------------------------------------------------
// God mode (kept alive from the panel; call every ~250ms while enabled)
// ---------------------------------------------------------------------------

export function godModeTick(iframe: HTMLIFrameElement | null): void {
  const w = gameWindow(iframe);
  if (!w || !w.$gameSystem || !w.$gameParty) return;
  try {
    w.$gameParty.members().forEach((m: any) => {
      if (m.isDead && m.isDead()) m.revive?.();
      if (m.hp < m.mhp || m.mp < m.mmp) {
        m.setHp(m.mhp);
        m.setMp(m.mmp);
      }
    });
  } catch {
    /* ignore */
  }
}
