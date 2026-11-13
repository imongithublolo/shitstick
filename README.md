# ShitStickAdventure — Web Edition (Vercel)

A web portal for **ShitStickAdventure** by **TMX2023**
(GameJolt: <https://gamejolt.com/games/hollyshit_Im_insanely_shit_adventuring_it/1005951>),
packaged as an offline-capable PWA with a WebGL CRT shader, an in-game
settings panel (CRT / Game / Saves / Debug+Cheats) opened from a slim
liquid-glass HUD pill, FPS meter (readout + live graph) & lock, keybind
remapping, and a cheat/debug suite built from the game's own data.

Port by b29s.

## What's inside

| Path | Purpose |
| --- | --- |
| `public/game/` | The game's browser payload (RPG Maker MZ) extracted from the official GameJolt build, with the Windows/nw.js runtime stripped (~54 MB, 588 files) |
| `public/game/game-files.json` | Generated manifest (file list + sizes) used by the downloader for progress |
| `public/sw.js` | Service worker: app-shell precache, cache-first serving for `/game/*`, offline navigation |
| `public/manifest.webmanifest`, `public/icons/` | PWA manifest + icons generated from the game's icon |
| `src/app/page.tsx` | Portal: invite gate → minimal landing → download → capsule progress with the assets being cached → Play |
| `public/game-banner.webp` | The game's GameJolt header banner shown on the start page (served locally + cached offline) |
| `src/components/InviteGate.tsx` | Invite-only first screen: "Invite Code:" above a capsule text field (Enter submits; the unlock is remembered in localStorage) |
| `src/components/DownloadScreen.tsx` | Comic Sans, black & white, minimal: edge-to-edge header banner on top, the icon left of the title / black DOWNLOAD button / size. While downloading the banner fades out and the icon becomes a DVD screensaver that bounces around the screen |
| `src/components/GameStage.tsx` | Full-screen same-origin game iframe + overlays + "(Made by tmx_2011)" / "(port by b29s)" splash on every launch. The only on-screen control is the HUD pill; leaving the game happens from inside the settings |
| `src/components/TopHud.tsx` | Thin liquid-glass see-through pill pinned to the top-center of gameplay: a sliders icon (opens settings) and, while Show FPS is on, a live FPS readout with a rolling FPS graph painted behind it on the glass |
| `src/components/CrtLayer.tsx` | WebGL2 port of the [gingerbeardman/webgl-crt-shader](https://github.com/gingerbeardman/webgl-crt-shader) (MIT, © 2025 Matt Sephton) sampling the game canvas every frame |
| `src/components/SettingsPanel.tsx` | See-through black & white panel: CRT, GAME (FPS, FPS lock, keybinds, volumes), SAVES (autosave, slots, backups, clean saves), DEBUG options & cheats (incl. game resolution & auto-fit) + a persistent "Leave game" footer (no floating exit button) |
| `src/components/DebugOverlay.tsx` | Event hitboxes, collision grid, player info HUD |
| `src/lib/saves.ts` | Portal save manager: engine slot list/save/load/delete, cheat-stamped saves, clean saves, autosave (safe-context guarded, also fires on exit), full save backups in a separate IndexedDB |
| `src/lib/*` | Settings store, RMMZ bridge, cheat actions, PWA/downloader, shader sources |

### Game-file compatibility patches (3 small ones)

`public/game/js/rmmz_core.js` — the PIXI application is created with
`preserveDrawingBuffer: true`. Without it the WebGL drawing buffer is cleared
after compositing, and the portal could not reliably sample the game canvas
to run the CRT shader.

`public/game/js/libs/pixi.js` — appended
`PIXI.settings.FAIL_IF_MAJOR_PERFORMANCE_CAVEAT = false;` so the game also
boots on software-rendered browsers (headless, VMs, some laptops) instead of
showing "Failed to initialize graphics".

`img/faces/.,FTAnger.png` → renamed to `_,FTAnger.png` (plus the three
references in `data/Troops.json`) because static hosts refuse dotfiles and the
engine would URL-encode the leading dot into an unservable URL.

Nothing else in the game was modified.

## Features

- **Landing screen**: Comic Sans, strictly black & white. The game's header
  banner runs edge-to-edge across the top; below it, centered, the game icon
  (plain, no frame) sits on the left of the title, a black DOWNLOAD button and
  the download size.
- **Download screen**: the banner fades away, leaving the title + capsule
  progress bar + the file names being cached. The game icon turns into a DVD
  screensaver, bouncing around the screen for the whole download, then eases
  back to its slot beside the title.
- **Invite-only**: the very first screen asks for the invite code (a capsule
  text field); once entered it is remembered on that device.
- **No install popup**: the PWA never shows an install prompt; it stays
  installable from the browser menu ("Install app" / "Add to Home Screen").
- **Offline PWA**: after the one-time ~54 MB download the whole game runs
  offline; game saves live in the browser's storage (RMMZ web mode).
- **Launch splash**: "(Made by tmx_2011)" above "(port by b29s)" in Comic Sans appears over the game on
  every launch, then fades away.
- **HUD pill** (in gameplay): a single 30px-tall liquid-glass capsule at the
  top-center — see-through with a blur, styled after classic FPS overlays.
  A sliders icon on the left opens the settings panel; while **Show FPS** is
  on, a live FPS readout (like "59 FPS") appears next to it with a rolling
  FPS graph painted into the pill's glass behind the text. There is no
  right-hand button, and the floating gear/exit buttons are gone — leaving
  the game is a "Leave game" button pinned to the bottom of the settings
  panel (autosaves first if autosave is on).
- **Saves category** (settings panel): autosave (on by default, every 1-10
  minutes, plus one final save when you exit the game — only on the map, never
  mid-battle or mid-dialog), all 20 engine save slots + the portal Auto slot
  with Load / Overwrite / Delete, "Save to new slot", "Clean save" (writes a
  save with every cheat turned off, then turns them back on), CHEATS/CLEAN
  badges stamped on every save, and full one-click backups (create / restore /
  delete) of every save file.
- **CRT shader**: full gingerbeardman parameter set — enable toggle, pixel
  smoothing, scanline intensity/count/adaptive, brightness/contrast/saturation,
  bloom intensity/threshold, RGB shift, vignette, curvature, flicker — plus
  Subtle/Retro/Strong presets and reset.
- **Game settings**: FPS counter (shown in the top HUD pill with the live
  graph), FPS lock (30/45/60/90/120/native via rAF
  throttle), live keybind remapping (Up/Down/Left/Right/Confirm/Cancel-Menu/
  Sprint/Noclip/Menu — written into the game's `Input.keyMapper`), and
  BGM/BGS/ME/SE volume sliders.
- **Debug & cheats** (from the game's own systems):
  - **Display — game resolution**: Default (engine-native 816×624), 720p,
    1080p, Custom (clamped to 640–2560 × 480–1440), and **Auto-fit** for
    edge-to-edge wide gameplay: keeps the native height (same vertical field
    of view) and widens to match the window shape, then keeps following window
    resizes. Every mode scales the canvas to fit the window (like the engine's
    own F3), the current size is shown live, and the boot sequence is waited
    out so the game's own `resizeScreen()` can never clobber the setting.
  - Toggles: noclip (walk through walls), god mode, **no random encounters**
    (patches `Game_Player.canEncounter`, so it survives save/load and works
    with pixel movement)
  - Speed: RMMZ move-speed level + distancePerFrame turbo multiplier (x1–x4)
  - Overlays: event hitboxes, collision grid, player info HUD
  - Quick actions: New Game / Continue / Save, Heal party, Foes → 1 HP,
    Win Battle, **All Skills** (every party member learns all 150 skills and
    the Magic + Special menu tabs are force-unlocked), Max Level, Reload
  - Give Everything: all items / all weapons / all armors in one click
  - Gold: any amount + quick buttons (+100 / +1,000 / +10,000 / +9.9M)
  - Party manager: remove current members, recruit any of the game's actors
  - Inventory giver: every item/weapon/armor with the game's own icons and
    search
  - Every named switch and variable (35 switches, 13 variables — e.g.
    `Dev_Playing`, `DAY`/`NIGHT`, `POTATO COLLECTION`, `HOURS/MINUTES/SECONDS`)
  - Map teleporter (all 30+ maps)

## Deploy to Vercel

1. Push this repository to GitHub (never commit credentials or tokens) —
   it lives at <https://github.com/imongithublolo/shitstick>.
2. In Vercel: **Add New → Project → Import** the repo. Defaults are fine:
   - Framework preset: Next.js (auto-detected)
   - No environment variables needed
   - No build overrides needed (`npm run build` is a plain `next build`)
3. Deploy. The first build takes a minute or two (588 static game files are
   uploaded; total deployment is ~56 MB — within Vercel's 100 MB Hobby limit).
4. Visit the deployment URL. The PWA (install prompt, service worker, offline)
   requires HTTPS, which Vercel provides by default.

Local development: `npm install && npm run dev` (or `bun install && bun run dev`)
and open http://localhost:3000 — service workers work on localhost too.

## Controls (game defaults)

- Arrows: move (8-direction pixel movement)
- Z / Enter: confirm
- X / Esc: cancel / menu
- Shift: sprint
- Ctrl: noclip (normally needs playtest mode — the Debug tab toggle enables it
  anywhere)
- Gamepad: supported by the engine (face buttons confirm/cancel, etc.)

## Credits

- **ShitStickAdventure** by TMX2023 — game, art, music
- **CRT shader**: [gingerbeardman/webgl-crt-shader](https://github.com/gingerbeardman/webgl-crt-shader)
  by Matt Sephton, MIT License
- Engine: RPG Maker MZ (© Gotcha Gotcha Games), running its standard web build
