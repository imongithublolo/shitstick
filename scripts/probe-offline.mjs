import { chromium } from 'playwright';

const log = (...a) => console.log('[e2e2]', ...a);
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
const page = await ctx.newPage();
page.on('pageerror', (e) => log('PAGEERROR:', String(e).slice(0, 300)));

await page.goto('http://localhost:3000', { waitUntil: 'networkidle' });
const dl = page.getByRole('button', { name: 'DOWNLOAD' });
if (await dl.count()) {
  await dl.click();
  await page.getByRole('button', { name: 'PLAY', exact: true }).waitFor({ timeout: 240000 });
}
await page.getByRole('button', { name: 'PLAY', exact: true }).click();
const frame = page.frames().find((f) => f.url().includes('/game/index.html'));
await frame.waitForFunction(() => window.$dataSystem && window.SceneManager, null, { timeout: 60000 });

// start a game directly for a known map with events (wait for the title
// screen first — Scene_Boot must finish loading save metadata)
await frame.waitForFunction(
  () => window.SceneManager && window.SceneManager._scene instanceof window.Scene_Title,
  null,
  { timeout: 60000 }
);
await frame.evaluate(() => {
  DataManager.setupNewGame();
  SceneManager.goto(Scene_Map);
});
await page.waitForTimeout(3500);

// open panel, DEBUG tab, enable Event Boxes + Player Info HUD
await page.click('button[aria-label="Settings"]');
await page.waitForTimeout(500);
await page.click('[role="dialog"] [role="tab"]:has-text("DEBUG")');
await page.waitForTimeout(500);
const switches = page.locator('[role="dialog"] [role="switch"]');
log('debug switches:', await switches.count());
await switches.nth(3).click(); // Event Boxes
await page.waitForTimeout(300);
await switches.nth(5).click(); // Player Info HUD
await page.waitForTimeout(1200);
await page.screenshot({ path: '/tmp/shots/30-overlays-full.png' });

// also enable collision grid
await switches.nth(4).click();
await page.waitForTimeout(800);
await page.screenshot({ path: '/tmp/shots/31-overlays-all.png' });

// verify overlay canvas is display:block and sized
const overlayState = await page.evaluate(() => {
  const canvases = [...document.querySelectorAll('canvas')];
  return canvases.map((c) => ({
    aria: c.getAttribute('aria-hidden'),
    display: getComputedStyle(c).display,
    w: c.width,
    h: c.height,
    z: getComputedStyle(c).zIndex,
  }));
});
log('canvases:', JSON.stringify(overlayState));

// --- exit button test (close panel first, the panel overlays the corner) ----
await page.click('button[aria-label="Close settings"]');
await page.waitForTimeout(400);
await page.click('button[aria-label="Exit game"]');
await page.waitForTimeout(800);
const backAtLanding = await page.getByRole('button', { name: 'PLAY', exact: true }).count();
log('exit -> back at ready screen:', backAtLanding > 0);

// --- OFFLINE test -----------------------------------------------------------
await page.evaluate(() => navigator.serviceWorker.ready);
await page.waitForTimeout(1000);
await ctx.setOffline(true);
log('offline: navigating to / ...');
await page.goto('http://localhost:3000', { waitUntil: 'domcontentloaded' }).catch((e) => log('goto err:', String(e).slice(0, 100)));
await page.waitForTimeout(2500);
const offlinePlay = await page.getByRole('button', { name: 'PLAY', exact: true }).count();
log('offline: PLAY visible:', offlinePlay > 0);
if (offlinePlay) {
  await page.getByRole('button', { name: 'PLAY', exact: true }).click();
  await page.waitForTimeout(6000);
  const oframe = page.frames().find((f) => f.url().includes('/game/index.html'));
  if (oframe) {
    try {
      await oframe.waitForFunction(() => window.$dataSystem, null, { timeout: 45000 });
      log('OFFLINE: game booted with no network');
      await oframe.evaluate(() => { DataManager.setupNewGame(); SceneManager.goto(Scene_Map); });
      await page.waitForTimeout(2500);
      const scene = await oframe.evaluate(() => SceneManager._scene.constructor.name);
      log('OFFLINE: new game scene:', scene);
      await page.screenshot({ path: '/tmp/shots/32-offline-game.png' });
    } catch (e) {
      log('OFFLINE boot failed:', String(e).slice(0, 200));
    }
  } else {
    log('OFFLINE: game iframe missing');
  }
}
await ctx.setOffline(false);
await browser.close();
log('done');
