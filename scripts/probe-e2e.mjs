import { chromium } from 'playwright';

const log = (...a) => console.log('[probe]', ...a);

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });

page.on('console', (msg) => {
  const t = msg.type();
  if (t === 'error' || t === 'warning') log('console:', t, msg.text().slice(0, 300));
});
page.on('pageerror', (err) => log('PAGEERROR:', String(err).slice(0, 500)));
page.on('requestfailed', (req) => log('REQFAIL:', req.url().slice(0, 120), req.failure()?.errorText));

await page.goto('http://localhost:3000', { waitUntil: 'networkidle' });
log('title:', await page.title());

// landing state
log('buttons:', await page.locator('button').allTextContents());

// check play button style & clickability
const playBtn = page.getByRole('button', { name: 'PLAY' });
log('PLAY count:', await playBtn.count());

// click DOWNLOAD if present
const dl = page.getByRole('button', { name: 'DOWNLOAD' });
if (await dl.count()) {
  log('clicking DOWNLOAD...');
  await dl.click();
  // wait for completion (PLAY appears)
  try {
    await page.getByRole('button', { name: 'PLAY', exact: true }).waitFor({ timeout: 180000 });
    log('download done, PLAY visible');
  } catch {
    log('DOWNLOAD DID NOT FINISH');
    const body = await page.locator('body').innerText();
    log('body text:', body.slice(0, 500));
    await browser.close();
    process.exit(1);
  }
}

// inspect the PLAY button's computed style + box
const info = await page.getByRole('button', { name: 'PLAY', exact: true }).evaluate((el) => {
  const cs = getComputedStyle(el);
  const r = el.getBoundingClientRect();
  return {
    bg: cs.backgroundColor,
    color: cs.color,
    display: cs.display,
    visibility: cs.visibility,
    rect: { x: r.x, y: r.y, w: r.width, h: r.height },
    classes: el.className.slice(0, 120),
    disabled: el.disabled,
  };
});
log('PLAY button info:', JSON.stringify(info, null, 1));

// click PLAY via JS and watch what happens
await page.getByRole('button', { name: 'PLAY', exact: true }).click();
await page.waitForTimeout(2500);

const stageInfo = await page.evaluate(() => {
  const iframe = document.querySelector('iframe');
  return {
    hasIframe: !!iframe,
    iframeSrc: iframe?.src ?? null,
    bodyChildren: [...document.body.children].map((c) => c.tagName + '.' + String(c.className).slice(0, 40)),
    gearBtn: !!document.querySelector('button[aria-label="Settings"]'),
  };
});
log('after PLAY click:', JSON.stringify(stageInfo, null, 1));

// if the game iframe exists, wait for the RMMZ canvas and check boot
const frame = page.frames().find((f) => f.url().includes('/game/index.html'));
log('game frame:', frame ? frame.url() : 'NOT FOUND');
if (frame) {
  try {
    await frame.waitForSelector('canvas', { timeout: 30000 });
    log('game canvas found');
    const boot = await frame.evaluate(() => ({
      sceneManager: typeof window.SceneManager,
      dataSystem: !!window.$dataSystem,
      input: !!window.Input,
      error: (window.__ssaError) || null,
    }));
    log('game boot state:', JSON.stringify(boot));
  } catch (e) {
    log('canvas wait failed:', String(e).slice(0, 200));
    const txt = await frame.evaluate(() => document.body.innerText.slice(0, 400));
    log('game frame text:', txt);
  }
}

await page.screenshot({ path: '/tmp/shots/10-probe.png' });
log('screenshot saved');
await browser.close();
