// Automated browser playthrough of the core loop using real keyboard/pointer input.
// Usage: node scripts/qa-play.mjs <baseUrl> <outDir> [width] [height] [--touch]
// The bot reads only the visible DOM meters (cast marker, reel window/fish) — the same
// information a player sees — and presses Space / E / buttons.
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import { installBot as _installBot, fishOnce as _fishOnce, walkTo as _walkTo } from './qa-bot.mjs';

const [base, outDir, W = '1280', H = '720', ...flags] = process.argv.slice(2);
const touch = flags.includes('--touch');
fs.mkdirSync(outDir, { recursive: true });
const log = [];
const note = (m) => { log.push(m); console.log(m); };

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const ctx = await browser.newContext({ viewport: { width: +W, height: +H }, hasTouch: touch, isMobile: touch, deviceScaleFactor: 1 });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

const url = `${base}${base.includes('?') ? '&' : '?'}qa`;
await page.goto(url);
await page.waitForFunction(() => typeof window.__riftQA === 'function', null, { timeout: 30000 });
await page.waitForTimeout(800);
const snap = () => page.evaluate(() => window.__riftQA());
const shot = (name) => page.screenshot({ path: `${outDir}/${name}.png` });

const installBot = () => _installBot(page, touch);
const fishOnce = (i) => _fishOnce(page, i, shot);
const walkTo = (x, z) => _walkTo(page, x, z);

await shot('01-start');
note(`start: ${JSON.stringify(await snap())}`);
if (touch) {
  // Virtual joystick: drag on the left side of the canvas with a touch pointer.
  const before = await snap();
  await page.evaluate(async () => {
    const c = document.querySelector('canvas');
    const r = c.getBoundingClientRect();
    const mk = (type, x, y) => new PointerEvent(type, { pointerId: 11, pointerType: 'touch', clientX: x, clientY: y, bubbles: true, isPrimary: true });
    const x = r.left + r.width * 0.2, y = r.top + r.height * 0.6;
    c.dispatchEvent(mk('pointerdown', x, y));
    window.dispatchEvent(mk('pointermove', x + 50, y));
    await new Promise((res) => setTimeout(res, 700));
    window.dispatchEvent(mk('pointerup', x + 50, y));
  });
  await page.waitForTimeout(300);
  const after = await snap();
  note(`joystick drag right: x ${before.pos.x.toFixed(2)} -> ${after.pos.x.toFixed(2)}`);
  await shot('01b-touch-hud');
  // walk back to the starting spot
  await _walkTo(page, before.pos.x, before.pos.z, 0.3);
}
await installBot();

// Catch three fish
let caught = 0;
for (let i = 0; i < 6 && caught < 3; i++) {
  const r = await fishOnce(i);
  note(`attempt ${i + 1}: ${r}`);
  if (r === 'caught') {
    caught++;
    if (caught === 1) { await page.waitForTimeout(700); await shot('04-reveal'); }
    await page.waitForTimeout(800);
    await page.click('.catch-card .btn');
    await page.waitForTimeout(400);
  } else await page.waitForTimeout(900);
}
let s = await snap();
note(`after fishing: inventory=${s.inventory} reserved=${s.reserved} state=${s.state}`);

// Sell at the stand
s = await walkTo(-6.2, 10.6);
note(`at stand: pos=${s.pos.x.toFixed(1)},${s.pos.z.toFixed(1)}`);
await page.keyboard.press('KeyE');
await page.waitForTimeout(500);
await shot('05-stand');
const sellBtn = page.locator('.panel footer .btn.primary');
const sellText = await sellBtn.textContent().catch(() => '');
await sellBtn.click().catch((e) => note(`sell click failed ${e.message}`));
await page.waitForTimeout(400);
s = await snap();
note(`sold: button="${sellText}" coins=${s.coins} inventory=${s.inventory}`);
await page.click('.panel .close');
await page.waitForTimeout(300);

// Buy something at the workshop if affordable
s = await walkTo(6.8, 11.2);
await page.keyboard.press('KeyE');
await page.waitForTimeout(500);
await page.locator('.tab', { hasText: 'Upgrades' }).click();
await page.waitForTimeout(200);
await shot('06-workshop');
const buyable = page.locator('.upg .btn.primary').first();
const before = (await snap()).coins;
if (await buyable.count()) {
  await buyable.dblclick();
  await page.waitForTimeout(300);
}
const after = (await snap()).coins;
note(`workshop: coins ${before} -> ${after}`);
await page.click('.panel .close');

// Reload and verify persistence
await page.waitForTimeout(500);
const pre = await snap();
await page.reload();
await page.waitForFunction(() => typeof window.__riftQA === 'function', null, { timeout: 30000 });
await page.waitForTimeout(800);
const post = await snap();
note(`persist: coins ${pre.coins} -> ${post.coins}, inventory ${pre.inventory} -> ${post.inventory}`);
await shot('07-after-reload');

note(`draw calls ${post.calls}, triangles ${post.triangles}, fps(swiftshader) ${post.fps.toFixed(0)}`);
note(`errors: ${errors.length ? errors.join(' | ') : 'none'}`);
fs.writeFileSync(`${outDir}/log.txt`, log.join('\n'));
await browser.close();
