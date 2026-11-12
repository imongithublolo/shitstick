# ShitStickAdventure — Web Edition (Vercel)

A web portal for **ShitStickAdventure** by **TMX2023**
(GameJolt: <https://gamejolt.com/games/hollyshit_Im_insanely_shit_adventuring_it/1005951>),
packaged as an offline-capable PWA with a WebGL CRT shader, in-game settings
panel (CRT / Game / Debug+Cheats), FPS meter & lock, keybind remapping, and a
cheat/debug suite built from the game's own data.

## What's inside

| Path | Purpose |
| --- | --- |
| `public/game/` | The game's browser payload (RPG Maker MZ) extracted from the official GameJolt build, with the Windows/nw.js runtime stripped (~54 MB, 588 files) |
| `public/game/game-files.json` | Generated manifest (file list + sizes) used by the downloader for progress |
| `public/sw.js` | Service worker: app-shell precache, cache-first serving for `/game/*`, offline navigation |
| `public/manifest.webmanifest`, `public/icons/` | PWA manifest + icons generated from the game's icon |
| `src/app/page.tsx` | Portal: minimal landing → download (also prompts PWA install) → capsule progress bar with the assets being cached → Play |
| `src/components/GameStage.tsx` | Full-screen same-origin game iframe + overlays + floating gear button |
| `src/components/CrtLayer.tsx` | WebGL2 port of the [gingerbeardman/webgl-crt-shader](https://github.com/gingerbeardman/webgl-crt-shader) (MIT, © 2025 Matt Sephton) sampling the game canvas every frame |
| `src/components/SettingsPanel.tsx` | Gear panel: CRT settings, game settings (FPS, FPS lock, keybinds, volumes), debug options & cheats |
| `src/components/DebugOverlay.tsx` | Event hitboxes, collision grid, player info HUD |
| `src/lib/*` | Settings store, RMMZ bridge, cheat actions, PWA/downloader, shader sources |
| `scripts/prepare_game.py` | (dev tool) re-copies + patches the game payload from an extracted build |

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

Nothing else in the game was modified. `scripts/prepare_game.py` reapplies
all of this deterministically from a fresh build extract.

### Features

- **Download screen**: very minimal — icon, title, one button. Clicking it
  starts caching all ~54 MB of game assets (byte-accurate capsule progress
  bar, current + recent asset names shown underneath) and fires the browser's
  "install app" prompt at the same time.
- **Offline PWA**: after the one-time download the whole game runs offline;
  game saves live in the browser's storage (RMMZ web mode).
- **CRT shader**: full gingerbeardman parameter set — enable toggle, pixel
  smoothing, scanline intensity/count/adaptive, brightness/contrast/saturation,
  bloom intensity/threshold, RGB shift, vignette, curvature, flicker — plus
  Subtle/Retro/Strong presets and reset.
- **Game settings**: FPS counter, FPS lock (30/45/60/90/120/native via rAF
  throttle), live keybind remapping (Up/Down/Left/Right/Confirm/Cancel-Menu/
  Sprint/Noclip/Menu — written into the game's `Input.keyMapper`), and
  BGM/BGS/ME/SE volume sliders.
- **Debug & cheats** (from the game's own systems): the game's built-in Ctrl
  noclip (exposed as a toggle that doesn't need playtest mode), god mode,
  encounter toggle, movement speed + turbo multiplier, heal party, enemies→1 HP
  (battle), gold giver, full inventory giver (items/weapons/armors with the
  game's own icons), every named switch and variable (35 switches, 13
  variables — e.g. `Dev_Playing`, `DAY`/`NIGHT`, `POTATO COLLECTION`,
  `HOURS/MINUTES/SECONDS`), map teleporter (all 30+ maps), quick New
  Game/Continue/Save, and the debug overlays (event boxes, collision grid,
  player info HUD).

## Deploy to Vercel

1. Push this folder to a GitHub repository **without any tokens in it** (never
   commit credentials — if you ever pasted a token anywhere, revoke it at
   github.com/settings/tokens first).
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
