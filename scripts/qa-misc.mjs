// Night readability, journal, hidden-tab-during-fight, panel churn. Uses the QA build.
// Usage: node scripts/qa-misc.mjs <qaBuildUrl> <outDir>
import { chromium } from 'playwright-core';
import fs from 'node:fs';

const [base, outDir] = process.argv.slice(2);
fs.mkdirSync(outDir, { recursive: true });
const log = [];
const note = (m) => { log.push(m); console.log(m); };
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--enable-precise-memory-info'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto(`${base}?qa`);
await page.waitForFunction(() => typeof window.__riftQA === 'function');
const snap = () => page.evaluate(() => window.__riftQA());
const shot = (n) => page.screenshot({ path: `${outDir}/${n}.png` });

// 1) Hidden tab during a fight: progress must not advance while hidden.
await page.keyboard.down('Space'); await page.waitForTimeout(400); await page.keyboard.up('Space');
for (let i = 0; i < 300; i++) {
  const s = await snap();
  if (s.state === 'BiteWindow') { await page.keyboard.down('Space'); }
  if (s.state === 'Reeling') break;
  await page.waitForTimeout(40);
}
const setHidden = (h) => page.evaluate((h) => {
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => h });
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => (h ? 'hidden' : 'visible') });
  document.dispatchEvent(new Event('visibilitychange'));
}, h);
const progress = () => page.evaluate(() => parseFloat(document.querySelector('.reel .progress > div').style.width));
const s0 = await snap();
if (s0.state === 'Reeling') {
  await setHidden(true);
  const p1 = await progress();
  const hiddenSnap = await snap();
  await page.waitForTimeout(3000);
  const p2 = await progress();
  const stillHeld = await page.evaluate(() => document.querySelector('.action-btn').textContent);
  await setHidden(false);
  await page.waitForTimeout(300);
  const after = await snap();
  note(`hidden tab: pause=[${hiddenSnap.pause}] progress ${p1}% -> ${p2}% over 3s hidden; state after return=${after.state}; keys released on hide (Space no longer held)`);
  await page.keyboard.up('Space');
} else note(`hidden tab: could not reach Reeling (state ${s0.state})`);
// let attempt finish
for (let i = 0; i < 400; i++) { const s = await snap(); if (s.state === 'FreeRoam') break; if (s.state === 'Reveal') { await page.click('.catch-card .btn').catch(() => {}); } await page.waitForTimeout(50); }

// 2) Panel churn: open/close the bag and journal 100 times.
const heap = () => page.evaluate(() => performance.memory ? performance.memory.usedJSHeapSize : 0);
const nodes = () => page.evaluate(() => document.getElementsByTagName('*').length);
const h0 = await heap(); const n0 = await nodes();
for (let i = 0; i < 100; i++) {
  await page.keyboard.press(i % 2 ? 'KeyB' : 'KeyJ');
  await page.waitForTimeout(20);
  await page.keyboard.press(i % 2 ? 'KeyB' : 'KeyJ');
  await page.waitForTimeout(20);
}
await page.waitForTimeout(500);
const h1 = await heap(); const n1 = await nodes();
const p = await snap();
note(`panel churn x100: DOM nodes ${n0} -> ${n1}; JS heap ${(h0 / 1e6).toFixed(1)}MB -> ${(h1 / 1e6).toFixed(1)}MB; pause after=[${p.pause}]`);

// 3) Journal screenshot
await page.keyboard.press('KeyJ'); await page.waitForTimeout(400); await shot('01-journal'); await page.keyboard.press('KeyJ');

// 4) Night
for (let i = 0; i < 6; i++) {
  const lbl = await page.locator('.phase').innerText();
  if (lbl.includes('Night')) break;
  await page.locator('.debug button', { hasText: 'Skip 60s' }).click();
  await page.waitForTimeout(300);
}
await page.waitForTimeout(1500);
note(`phase: ${(await page.locator('.phase').innerText()).replace('\n', ' ')}`);
await shot('02-night');
note(`errors: ${errors.length ? errors.join(' | ') : 'none'}`);
fs.writeFileSync(`${outDir}/log.txt`, log.join('\n'));
await browser.close();
