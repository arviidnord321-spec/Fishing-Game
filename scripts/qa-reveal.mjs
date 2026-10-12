import { chromium } from 'playwright-core';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.goto(process.argv[2] + '?qa');
await page.waitForFunction(() => typeof window.__riftQA === 'function');
await page.keyboard.down('Space'); await page.waitForTimeout(500); await page.keyboard.up('Space');
for (let i = 0; i < 200; i++) {
  const s = await page.evaluate(() => window.__riftQA());
  if (s.state === 'BiteWindow') { await page.keyboard.down('Space'); }
  if (s.state === 'Reeling') {
    const held = await page.evaluate(() => { const w = document.querySelector('.reel .window'); const f = document.querySelector('.reel .fish'); return parseFloat(f.style.left) > parseFloat(w.style.left) + parseFloat(w.style.width) / 2; });
    if (held) await page.keyboard.down('Space'); else await page.keyboard.up('Space');
  }
  if (s.state === 'Reveal') { await page.keyboard.up('Space'); for (let k = 0; k < 5; k++) { console.log(JSON.stringify(await page.evaluate(() => window.__riftQA()))); await page.waitForTimeout(250); } await page.screenshot({ path: 'qa-output/reveal.png' }); break; }
  await page.waitForTimeout(40);
}
await browser.close();
