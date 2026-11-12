import { chromium } from 'playwright';

const log = (...a) => console.log('[e2e]', ...a);
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (e) => { errors.push(String(e)); log('PAGEERROR:', String(e).slice(0, 300)); });

await page.goto('http://localhost:3000', { waitUntil: 'networkidle' });

// download if needed
const dl = page.getByRole('button', { name: 'DOWNLOAD' });
if (await dl.count()) {
  await dl.click();
  await page.getByRole('button', { name: 'PLAY', exact: true }).waitFor({ timeout: 240000 });
}
await page.getByRole('button', { name: 'PLAY', exact: true }).click();
await page.waitForTimeout(9000);

const frame = page.frames().find((f) => f.url().includes('/game/index.html'));
if (!frame) throw new Error('game frame not found');
await frame.waitForFunction(() => window.$dataSystem && window.SceneManager, null, { timeout: 60000 });
log('game booted');

// helper: run code in the game frame
const g = async (code) => frame.evaluate(code);

log('title screen scene:', await g('SceneManager._scene && SceneManager._scene.constructor.name'));

// --- 1) open the settings panel via the gear icon -------------------------
await page.click('button[aria-label="Settings"]');
await page.waitForTimeout(600);
const panelVisible = await page.locator('[role="dialog"]').isVisible();
log('settings panel open:', panelVisible);
await page.screenshot({ path: '/tmp/shots/20-panel-crt.png' });

// CRT tab controls present?
const crtSwitches = await page.locator('[role="dialog"] [role="switch"]').count();
const crtSliders = await page.locator('[role="dialog"] [role="slider"]').count();
log('CRT tab: switches:', crtSwitches, 'sliders:', crtSliders);

// --- 2) toggle CRT off/on --------------------------------------------------
const crtToggle = page.locator('[role="dialog"] [role="switch"]').first();
await crtToggle.click();
await page.waitForTimeout(700);
const crtState1 = await page.evaluate(() => {
  const canvas = document.querySelector('canvas:not([aria-hidden])');
  const gameCanvas = document.querySelector('iframe')?.contentDocument?.querySelector('canvas');
  return {
    crtCanvasHidden: canvas ? getComputedStyle(canvas).display === 'none' : 'no-crt-canvas',
    gameCanvasOpacity: gameCanvas ? gameCanvas.style.opacity : null,
  };
});
log('CRT OFF state:', JSON.stringify(crtState1));
await crtToggle.click();
await page.waitForTimeout(700);
const crtState2 = await page.evaluate(() => {
  const canvas = document.querySelector('canvas:not([aria-hidden])');
  const gameCanvas = document.querySelector('iframe')?.contentDocument?.querySelector('canvas');
  return {
    crtCanvasShown: canvas ? getComputedStyle(canvas).display === 'block' : 'no-crt-canvas',
    gameCanvasOpacity: gameCanvas ? gameCanvas.style.opacity : null,
  };
});
log('CRT ON state:', JSON.stringify(crtState2));

// --- 3) GAME tab: fps lock + keybind --------------------------------------
await page.click('[role="dialog"] [role="tab"]:has-text("GAME")');
await page.waitForTimeout(400);
await page.screenshot({ path: '/tmp/shots/21-panel-game.png' });
// enable FPS counter
const fpsSwitch = page.locator('[role="dialog"] [role="switch"]').first();
await fpsSwitch.click();
await page.waitForTimeout(1200);
const fpsHud = await page.locator('text=/\\d+ FPS/').count();
log('FPS HUD visible:', fpsHud > 0, await page.locator('body').innerText().then(t => (t.match(/\d+ FPS/) || ['none'])[0]));
await fpsSwitch.click(); // off again

// set FPS lock 30
await page.click('[role="dialog"] button:has-text("30")');
await page.waitForTimeout(1500);
const fps30 = await g('window.__ssaFps');
log('fps lock 30 -> measured:', fps30);
// back to native
await page.click('[role="dialog"] button:has-text("Native")');
await page.waitForTimeout(1200);
const fpsNative = await g('window.__ssaFps');
log('native -> measured:', fpsNative);

// keybind: rebind Confirm to F
const confirmRow = page.locator('[role="dialog"] div:has-text("Confirm")').filter({ has: page.locator('button') }).last();
const rebindBtn = page.locator('[role="dialog"] button[aria-label] >> nth=0'); // fallback below
// use the gamepad-icon rebind button in the Confirm row
const row = page.locator('div.text-sm.w-28:has-text("Confirm")').locator('..');
await row.locator('button').last().click();
await page.waitForTimeout(300);
await page.keyboard.press('f');
await page.waitForTimeout(500);
const mapperF = await g('Input.keyMapper[70]');
log('keybind F ->', mapperF);
const mapperZ = await g('Input.keyMapper[90]');
log('Z still ->', mapperZ);

// --- 4) DEBUG tab: cheats ---------------------------------------------------
await page.click('[role="dialog"] [role="tab"]:has-text("DEBUG")');
await page.waitForTimeout(500);
await page.screenshot({ path: '/tmp/shots/22-panel-debug.png' });

// start a new game via quick action
await page.click('[role="dialog"] button:has-text("New Game")');
await page.waitForTimeout(3000);
const scene = await g('SceneManager._scene && SceneManager._scene.constructor.name');
const mapId = await g('$gameMap && $gameMap.mapId()');
log('after New Game: scene:', scene, 'mapId:', mapId);
await page.screenshot({ path: '/tmp/shots/23-in-game.png' });

// gold cheat
await page.click('[role="dialog"] button:has-text("+1,000")');
await page.waitForTimeout(800);
const gold = await g('$gameParty.gold()');
log('gold after +1000:', gold);

// noclip toggle (first switch in cheat toggles)
const noclipSwitch = page.locator('[role="dialog"] [role="switch"]').first();
await noclipSwitch.click();
await page.waitForTimeout(400);
const noclipOn = await g('Game_Player.prototype.isDebugThrough()');
log('noclip isDebugThrough():', noclipOn);

// heal + give item
await page.click('[role="dialog"] button:has-text("Heal")');
log('heal clicked');

// switches list rendered?
const switchCount = await page.locator('[role="dialog"] .thin-scroll >> nth=1 >> div').count().catch(() => 0);
const switchesText = await page.locator('[role="dialog"]').innerText();
log('switch names visible:', switchesText.includes('Dev_Playing'), switchesText.includes('DAY'));

// teleport to a map (Pueue Town #6)
await page.click('[role="dialog"] button:has-text("Go") >> nth=5');
await page.waitForTimeout(2500);
const newMapId = await g('$gameMap.mapId()');
log('teleported to map:', newMapId);

// debug overlays
const boxesSwitch = page.locator('[role="dialog"] [role="switch"]').nth(4);
await boxesSwitch.click();
await page.waitForTimeout(800);
await page.screenshot({ path: '/tmp/shots/24-overlays.png' });

// close panel
await page.click('button[aria-label="Close settings"]');
await page.waitForTimeout(500);
await page.screenshot({ path: '/tmp/shots/25-final.png' });

// FPS check with overlays on
const fpsWithOverlay = await g('window.__ssaFps');
log('fps while playing:', fpsWithOverlay);

log('total page errors:', errors.length);
await browser.close();
