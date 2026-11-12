import { chromium } from 'playwright';

const log = (...a) => console.log('[probe]', ...a);
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
await page.goto('http://localhost:3000/game/index.html', { waitUntil: 'load' });
await page.waitForTimeout(6000);

const result = await page.evaluate(() => {
  const out = {};
  const tryIt = (name, fn) => {
    try {
      out[name] = 'OK: ' + fn();
    } catch (e) {
      out[name] = 'FAIL: ' + (e && e.message ? e.message : String(e));
    }
  };

  // raw context with preserveDrawingBuffer, on a fresh canvas
  tryIt('raw webgl preserve', () => {
    const c = document.createElement('canvas');
    return !!c.getContext('webgl', { preserveDrawingBuffer: true });
  });

  // PIXI Application default
  tryIt('pixi default', () => {
    const c = document.createElement('canvas');
    const app = new PIXI.Application({ view: c, autoStart: false });
    return app.renderer.type + ' ' + app.renderer.width;
  });

  // PIXI Application with the patch options
  tryIt('pixi + preserve', () => {
    const c = document.createElement('canvas');
    const app = new PIXI.Application({ view: c, autoStart: false, preserveDrawingBuffer: true });
    return app.renderer.type + ' ' + app.renderer.width;
  });

  // PIXI Application on the actual game canvas (id=gameCanvas)
  tryIt('pixi on gameCanvas', () => {
    const c = document.getElementById('gameCanvas') || document.querySelector('canvas');
    const app = new PIXI.Application({ view: c, autoStart: false, preserveDrawingBuffer: true });
    return 'made app on ' + c.id + ' type ' + app.renderer.type;
  });

  return out;
});
log(JSON.stringify(result, null, 1));
await browser.close();
