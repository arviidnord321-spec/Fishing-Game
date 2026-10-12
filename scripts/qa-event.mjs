// Rift Bloom + night QA against the QA build (debug buttons present).
// Usage: node scripts/qa-event.mjs <qaBuildUrl> <outDir>
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import { fishOnce, installBot, walkTo } from './qa-bot.mjs';

const [base, outDir] = process.argv.slice(2);
fs.mkdirSync(outDir, { recursive: true });
const log = [];
const note = (m) => { log.push(m); console.log(m); };
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto(`${base}?qa`);
await page.waitForFunction(() => typeof window.__riftQA === 'function');
const snap = () => page.evaluate(() => window.__riftQA());
const shot = (n) => page.screenshot({ path: `${outDir}/${n}.png` });
const debugBtn = (label) => page.locator('.debug button', { hasText: label }).click();

await debugBtn('+20000¢');
await page.waitForTimeout(200);

// Buy rods up to Starweaver via the workshop UI.
await walkTo(page, 6.8, 11.2);
await page.keyboard.press('KeyE');
await page.waitForTimeout(400);
for (let i = 0; i < 4; i++) {
  const b = page.locator('.rod .btn.primary').first();
  if (await b.count()) { await b.click(); await page.waitForTimeout(250); }
}
await debugBtn('+20000¢').catch(() => {});
await page.waitForTimeout(150);
const b2 = page.locator('.rod .btn.primary').first();
if (await b2.count()) await b2.click();
await page.waitForTimeout(250);
await shot('01-rods');
await page.click('.panel .close');
await debugBtn('+20000¢');
note(`rod after purchases: ${(await snap()).rod}, coins ${(await snap()).coins}`);

// Stand inside the clearing boundary, then trigger the bloom.
await walkTo(page, 7, 2);
await walkTo(page, 0, -3);
await walkTo(page, 0, -10.6, 0.5);
await debugBtn('Rift soon');
await page.waitForTimeout(1500);
note(`phase after trigger: ${(await snap()).event}`);
await shot('02-notice');
// Wait for opening + open (notice is 15s)
for (let i = 0; i < 200; i++) {
  const s = await snap();
  if (s.event === 'open') break;
  await page.waitForTimeout(500);
}
await page.waitForTimeout(800);
let s = await snap();
const d = Math.hypot(s.pos.x - 0, s.pos.z + 13.5);
note(`event phase=${s.event}; player distance from rift center ${d.toFixed(2)} (rim 7.5 + collider 0.3) => ${d > 7.8 ? 'relocated safely' : 'INSIDE BOUNDARY'}`);
await shot('03-open');

// Select the matching lure, fish at the rift.
await page.waitForTimeout(300);
const match = page.locator('.lure.match');
if (await match.count()) { await match.click(); note('selected matching lure'); }
await installBot(page);
let caught = 0;
for (let i = 0; i < 4 && caught < 2; i++) {
  const r = await fishOnce(page, 1);
  note(`rift attempt ${i + 1}: ${r}`);
  if (r === 'caught') {
    caught++;
    await page.waitForTimeout(700);
    await shot(`04-rift-catch-${caught}`);
    const card = await page.locator('.catch-card').innerText();
    note(`card: ${card.replace(/\n+/g, ' | ')}`);
    await page.click('.catch-card .btn');
  }
  await page.waitForTimeout(700);
}

// Night: skip forward to the night phase.
for (let i = 0; i < 5; i++) await debugBtn('Skip 60s');
await page.waitForTimeout(1500);
await shot('05-night');
note(`phase label: ${await page.locator('.phase').innerText()}`);
note(`errors: ${errors.length ? errors.join(' | ') : 'none'}`);
fs.writeFileSync(`${outDir}/log.txt`, log.join('\n'));
await browser.close();
