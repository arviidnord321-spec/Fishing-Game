// Automated browser playthrough of the core loop using real keyboard/pointer input.
// Usage: node scripts/qa-play.mjs <baseUrl> <outDir> [width] [height] [--touch]
// The bot reads only the visible DOM meters (cast marker, reel window/fish) — the same
// information a player sees — and presses Space / E / buttons.
import { chromium } from 'playwright-core';
import fs from 'node:fs';

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

/** Installs an in-page bot driven by requestAnimationFrame so timing is not limited by CDP latency. */
async function installBot() {
  await page.evaluate((useTouch) => {
    const key = (type) => window.dispatchEvent(new KeyboardEvent(type, { code: 'Space', key: ' ', bubbles: true }));
    const btn = () => document.querySelector('.action-btn');
    const press = (down) => {
      if (useTouch) {
        const b = btn();
        const r = b.getBoundingClientRect();
        const ev = new PointerEvent(down ? 'pointerdown' : 'pointerup', { pointerId: 7, pointerType: 'touch', clientX: r.x + 40, clientY: r.y + 40, bubbles: true, isPrimary: true });
        b.dispatchEvent(ev);
      } else key(down ? 'keydown' : 'keyup');
    };
    window.__bot = { held: false, phase: 'idle', result: null, perfect: 0, casts: 0 };
    const bot = window.__bot;
    const set = (h) => { if (h !== bot.held) { bot.held = h; press(h); } };
    window.__botCast = () => {
      bot.phase = 'charging';
      bot.result = null;
      set(true);
    };
    const loop = () => {
      requestAnimationFrame(loop);
      const qa = window.__riftQA();
      if (bot.phase === 'charging') {
        const m = document.querySelector('.cast-meter .marker');
        const meter = document.querySelector('.cast-meter');
        if (meter && meter.style.display !== 'none' && m) {
          const v = parseFloat(m.style.bottom) / 100;
          if (v >= 0.88 && v <= 0.94) {
            set(false);
            bot.casts++;
            bot.phase = 'waiting';
          }
        }
      } else if (bot.phase === 'waiting') {
        if (qa.state === 'BiteWindow') {
          setTimeout(() => { set(true); bot.phase = 'reeling'; }, 180);
          bot.phase = 'hooking';
        }
        if (qa.state === 'FreeRoam' || qa.state === 'Escape') { bot.phase = 'done'; bot.result = 'escaped'; set(false); }
      } else if (bot.phase === 'reeling') {
        if (qa.state === 'Reeling') {
          const win = document.querySelector('.reel .window');
          const fish = document.querySelector('.reel .fish');
          const l = parseFloat(win.style.left) / 100;
          const w = parseFloat(win.style.width) / 100;
          const f = parseFloat(fish.style.left) / 100;
          set(f > l + w / 2);
        } else if (qa.state === 'Reveal') { set(false); bot.phase = 'done'; bot.result = 'caught'; }
        else if (qa.state === 'Escape' || qa.state === 'FreeRoam') { set(false); bot.phase = 'done'; bot.result = 'escaped'; }
      }
    };
    loop();
  }, touch);
}

async function fishOnce(i) {
  await page.evaluate(() => window.__botCast());
  const t0 = Date.now();
  let shotTaken = { cast: false, reel: false };
  while (Date.now() - t0 < 40000) {
    const b = await page.evaluate(() => ({ ...window.__bot }));
    const s = await snap();
    if (i === 0 && !shotTaken.cast && s.state === 'ChargeCast') { await shot('02-charging'); shotTaken.cast = true; }
    if (i === 0 && !shotTaken.reel && s.state === 'Reeling') { await page.waitForTimeout(600); await shot('03-reeling'); shotTaken.reel = true; }
    if (b.phase === 'done') return b.result;
    await page.waitForTimeout(60);
  }
  return 'timeout';
}

async function walkTo(x, z, tol = 0.6) {
  // Camera yaw is 0 at start: W = -z, S = +z, A = -x, D = +x.
  for (let k = 0; k < 120; k++) {
    const s = await snap();
    const dx = x - s.pos.x;
    const dz = z - s.pos.z;
    if (Math.hypot(dx, dz) < tol) break;
    const keys = [];
    if (dx < -0.4) keys.push('KeyA');
    if (dx > 0.4) keys.push('KeyD');
    if (dz < -0.4) keys.push('KeyW');
    if (dz > 0.4) keys.push('KeyS');
    for (const k2 of keys) await page.keyboard.down(k2);
    await page.waitForTimeout(120);
    for (const k2 of keys) await page.keyboard.up(k2);
  }
  await page.waitForTimeout(250);
  return snap();
}

await shot('01-start');
note(`start: ${JSON.stringify(await snap())}`);
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
