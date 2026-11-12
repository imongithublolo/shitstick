import { chromium } from 'playwright';
const combos = [
  [],
  ['--ignore-gpu-blocklist'],
  ['--enable-unsafe-swiftshader'],
  ['--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'],
];
for (const args of combos) {
  const browser = await chromium.launch({ headless: true, args });
  const page = await browser.newPage();
  const r = await page.evaluate(() => {
    const c = document.createElement('canvas');
    const strict = c.getContext('webgl', { stencil: true, failIfMajorPerformanceCaveat: true });
    const normal = c.getContext('webgl');
    return { strict: !!strict, normal: !!normal };
  });
  console.log('args:', JSON.stringify(args), '->', JSON.stringify(r));
  await browser.close();
}
