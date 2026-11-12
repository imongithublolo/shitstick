import { chromium } from 'playwright';

const log = (...a) => console.log('[probe]', ...a);
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', (e) => log('PAGEERROR:', String(e).slice(0, 300)));
page.on('console', (m) => { if (m.type() === 'error') log('console err:', m.text().slice(0, 200)); });

// 1) WebGL capability check on a blank page
await page.goto('http://localhost:3000/game/game-files.json');
const gl = await page.evaluate(() => {
  const c = document.createElement('canvas');
  const c2 = document.createElement('canvas');
  return {
    webgl1: !!c.getContext('webgl'),
    webgl2: !!c2.getContext('webgl2'),
    ua: navigator.userAgent,
  };
});
log('webgl caps:', JSON.stringify(gl));

// 2) game standalone
await page.goto('http://localhost:3000/game/index.html', { waitUntil: 'load' });
await page.waitForTimeout(9000);
const state = await page.evaluate(() => {
  const canvas = document.querySelector('canvas');
  return {
    canvasSize: canvas ? `${canvas.width}x${canvas.height}` : null,
    bodyText: document.body.innerText.slice(0, 200),
    pixiApp: !!(window.Graphics && window.Graphics._app),
    sceneManager: typeof window.SceneManager !== 'undefined',
    dataSystem: !!window.$dataSystem,
    errorPrinter: document.getElementById('errorPrinter') ? document.getElementById('errorPrinter').innerText.slice(0, 200) : null,
  };
});
log('standalone game state:', JSON.stringify(state, null, 1));
await page.screenshot({ path: '/tmp/shots/11-standalone.png' });
await browser.close();
