// Pets, eggs, shop, daily and quests walkthrough on the QA build.
// Usage: node scripts/qa-pets.mjs <qaBuildUrl> <outDir>
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import { dismissDaily, fishOnce, installBot } from './qa-bot.mjs';

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
const shot = (n) => page.screenshot({ path: `${outDir}/${n}.png` });
const snap = () => page.evaluate(() => window.__riftQA());
await page.waitForTimeout(600);

// First catch (tutorial), then the daily reward should pop up between casts.
await installBot(page);
note(`first catch: ${await fishOnce(page)}`);
await page.waitForTimeout(600);
await page.click('.catch-card .btn').catch(() => {});
await page.waitForTimeout(1800);
const dailyOpen = await page.locator('.panel[aria-label="Daily reward"]').count();
note(`daily panel auto-opened after first catch: ${dailyOpen > 0}`);
await shot('01-daily');
await dismissDaily(page);
await page.waitForTimeout(400);
await shot('02-hud-quests');

// Money for testing, then the shop from the HUD button.
await page.locator('.debug button', { hasText: '+20000¢' }).click();
await page.locator('.icon-btn.shop').click();
await page.waitForTimeout(400);
await shot('03-shop-eggs');
// Open the Meadow egg a few times
const before = (await snap()).coins;
await page.locator('.hatch-btn').first().click();
await page.waitForTimeout(500);
await shot('04-hatch-shake');
await page.waitForTimeout(1200);
await shot('05-hatch-reveal');
note(`reveal: ${(await page.locator('.hatch-card').innerText().catch(() => '')).replace(/\n+/g, ' | ')}`);
for (let i = 0; i < 4; i++) {
  const again = page.locator('.hatch-overlay .btn.primary');
  if (!(await again.count())) break;
  await again.click();
  await page.waitForTimeout(1500);
  note(`hatch ${i + 2}: ${(await page.locator('.hatch-card').innerText().catch(() => '')).replace(/\n+/g, ' | ')}`);
}
await page.locator('.hatch-overlay .btn', { hasText: 'Close' }).click();
note(`coins ${before} -> ${(await snap()).coins} after 5 Meadow eggs (300 each)`);
// Boosts tab
await page.locator('.tab', { hasText: 'Boosts' }).click();
await page.waitForTimeout(300);
await page.locator('.boost-card .btn.primary').first().click();
await page.waitForTimeout(300);
await shot('06-shop-boosts');
await page.click('.panel .close');
// Pets panel: buy a slot, equip best
await page.locator('.icon-btn', { hasText: '🐾' }).click();
await page.waitForTimeout(400);
await page.locator('.pet-summary .btn.primary').click().catch(() => {});
await page.waitForTimeout(200);
await page.locator('.pet-summary .btn.cyan').click();
await page.waitForTimeout(400);
await shot('07-pets');
note(`equipped: ${await page.locator('.pet-slot.filled').count()} · bonuses: ${(await page.locator('.bonus-row').innerText()).replace(/\n+/g, ' | ')}`);
await page.click('.panel .close');
await page.waitForTimeout(1500);
await shot('08-pets-following');
// Fish with pets + boost: check bonus tag and XP popup
const r = await fishOnce(page);
note(`catch with pets: ${r}`);
await page.waitForTimeout(500);
await shot('09-catch-bonus');
note(`card: ${(await page.locator('.catch-card').innerText().catch(() => '')).replace(/\n+/g, ' | ')}`);
const s = await snap();
note(`state: level ${s.level ?? '?'} errors: ${errors.length ? errors.join(' | ') : 'none'}`);
fs.writeFileSync(`${outDir}/log.txt`, log.join('\n'));
await browser.close();
