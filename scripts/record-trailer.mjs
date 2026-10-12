// Records smooth 30 fps gameplay clips for store videos, independent of how fast this machine
// renders: the page runs on a virtual clock (performance.now, requestAnimationFrame, timers) that
// advances exactly 1/30 s per captured frame; CSS animations are slowed to match.
// Usage: node scripts/record-trailer.mjs <baseUrl> <outDir> <landscape|portrait> <segment>
//   segments: catch | pools | hatch | atoll
import { chromium } from 'playwright-core';
import fs from 'node:fs';

const [base, outDir, orient = 'landscape', seg = 'catch'] = process.argv.slice(2);
const FPS = 30;
const view = orient === 'portrait' ? { width: 533, height: 800 } : { width: 1280, height: 720 };
fs.mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: view, deviceScaleFactor: 1.5, hasTouch: orient === 'portrait', isMobile: orient === 'portrait' });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));

// ---- virtual clock ----
await page.addInitScript(() => {
  let now = 0;
  let rafQ = [];
  let rafId = 0;
  let timers = [];
  let timerId = 0;
  performance.now = () => now;
  window.requestAnimationFrame = (cb) => {
    rafQ.push({ id: ++rafId, cb });
    return rafId;
  };
  window.cancelAnimationFrame = (id) => {
    rafQ = rafQ.filter((r) => r.id !== id);
  };
  window.setTimeout = (cb, ms = 0, ...args) => {
    timers.push({ id: ++timerId, at: now + Math.max(0, ms), cb: () => (typeof cb === 'function' ? cb(...args) : undefined), every: 0 });
    return timerId;
  };
  window.setInterval = (cb, ms = 0, ...args) => {
    timers.push({ id: ++timerId, at: now + Math.max(1, ms), cb: () => cb(...args), every: Math.max(1, ms) });
    return timerId;
  };
  window.clearTimeout = window.clearInterval = (id) => {
    timers = timers.filter((t) => t.id !== id);
  };
  window.__vstep = (ms) => {
    const end = now + ms;
    for (;;) {
      timers.sort((a, b) => a.at - b.at);
      const t = timers[0];
      if (!t || t.at > end) break;
      now = t.at;
      if (t.every) t.at += t.every;
      else timers.shift();
      try {
        t.cb();
      } catch (e) {
        console.error(e);
      }
    }
    now = end;
    const q = rafQ;
    rafQ = [];
    for (const r of q) {
      try {
        r.cb(now);
      } catch (e) {
        console.error(e);
      }
    }
  };
});

const d = new Date();
const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const allW1 = ['pebblefin', 'ribbon-minnow', 'button-carp', 'lantern-gill', 'mossback', 'bubble-ram', 'reed-skipper', 'spiral-perch', 'copper-catfish', 'sailtail', 'crown-koi', 'driftback-ray', 'moon-guppy', 'cloud-eel', 'prism-puffer', 'comet-marlin', 'observatory-whale', 'rift-leviathan'];
const journal = Object.fromEntries(allW1.slice(0, seg === 'atoll' ? 18 : 9).map((id) => [id, { count: 2, maxWeight: 10, maxValue: 100, modifiers: ['normal'] }]));
const save = {
  version: 2, coins: 184250, level: 16, xp: 300,
  ownedRods: ['driftwood', 'riverglass', 'coppercoil', 'stormline', 'starweaver', 'riftcaller'], equippedRod: seg === 'atoll' ? 'riftcaller' : 'coppercoil',
  upgrades: { poolGrowth: 2, sellValue: 2, bag: 2 }, journal, luresUnlocked: true,
  tutorial: { firstCast: true, firstCatch: true, firstSale: true, firstPurchase: true, skipped: true },
  pets: { 'tidal-fox': 3, 'glow-moth': 2, 'sprout-puff': 4, 'bumble-bun': 1, 'coral-crab': 1, 'lantern-jelly': 2, 'nebula-owl': 1 },
  equippedPets: seg === 'atoll' ? ['lantern-jelly', 'nebula-owl', 'tidal-fox'] : ['tidal-fox', 'glow-moth', 'sprout-puff'], petSlots: 3,
  eggPity: { lunar: 0 }, eggsOpened: 12, daily: { lastClaim: today, streak: 3 }, streak: 4, bestStreak: 9, totalCaught: 120,
  playtime: 1200, worldClock: 40, settings: { quality: 'high', master: 0 }, world: seg === 'atoll' ? 2 : 1, world2Announced: seg === 'atoll',
  inventory: [], announcedPools: ['meadow', 'reed', 'moon'], world2Pools: ['meadow'],
};
await page.addInitScript((s) => localStorage.setItem('riftfishing.save', JSON.stringify(s)), save);

const cdp = await page.context().newCDPSession(page);
await cdp.send('Animation.enable');
await page.goto(`${base}?qa`);
// boot on the virtual clock
const step = (ms = 1000 / FPS) => page.evaluate((ms) => window.__vstep(ms), ms);
for (let i = 0; i < 400; i++) {
  await step(50);
  if (await page.evaluate(() => typeof window.__riftQA === 'function')) break;
}
await page.addStyleTag({ content: '.debug{display:none!important} .controls-hint{display:none!important} .quest{display:none!important}' });
for (let i = 0; i < 40; i++) await step(50); // settle: pets walk in, world fades up
const qa = () => page.evaluate(() => window.__riftQA());
const debug = (label) => page.evaluate((l) => [...document.querySelectorAll('.debug button')].find((b) => b.textContent === l)?.click(), label);
const key = (code, down) => page.evaluate(([c, dn]) => window.dispatchEvent(new KeyboardEvent(dn ? 'keydown' : 'keyup', { code: c, key: c === 'Space' ? ' ' : c, bubbles: true })), [code, down]);
const orbit = (dx, dy = 0) => page.evaluate(([x, y]) => {
  const c = document.getElementById('game');
  if (!window.__orbiting) {
    window.__orbiting = { x: 640, y: 360 };
    c.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 9, pointerType: 'mouse', button: 2, buttons: 2, clientX: 640, clientY: 360, bubbles: true }));
  }
  window.__orbiting.x += x;
  window.__orbiting.y += y;
  window.dispatchEvent(new PointerEvent('pointermove', { pointerId: 9, pointerType: 'mouse', buttons: 2, clientX: window.__orbiting.x, clientY: window.__orbiting.y, bubbles: true }));
}, [dx, dy]);
const endOrbit = () => page.evaluate(() => {
  if (!window.__orbiting) return;
  window.dispatchEvent(new PointerEvent('pointerup', { pointerId: 9, pointerType: 'mouse', button: 2, bubbles: true }));
  window.__orbiting = null;
});

let frame = 0;
let lastReal = Date.now();
let rate = 0.2;
/** Advance one video frame and save it. */
const shoot = async () => {
  await step();
  const real = (Date.now() - lastReal) / 1000;
  lastReal = Date.now();
  // keep CSS animations in step with the virtual clock (approximately)
  const want = Math.max(0.02, Math.min(1, 1 / FPS / Math.max(0.001, real)));
  if (Math.abs(want - rate) / rate > 0.15) {
    rate = want;
    await cdp.send('Animation.setPlaybackRate', { playbackRate: rate });
  }
  const { data } = await cdp.send('Page.captureScreenshot', { format: 'jpeg', quality: 92 });
  fs.writeFileSync(`${outDir}/f${String(frame++).padStart(4, '0')}.jpg`, Buffer.from(data, 'base64'));
};
const shootN = async (n, each) => {
  for (let i = 0; i < n; i++) {
    if (each) await each(i);
    await shoot();
  }
};

// In-page fishing bot (perfect cast, hooks, keeps the fish in the window), driven by rAF.
await page.evaluate(() => {
  const key = (type) => window.dispatchEvent(new KeyboardEvent(type, { code: 'Space', key: ' ', bubbles: true }));
  const bot = (window.__bot = { held: false, phase: 'idle' });
  const set = (h) => { if (h !== bot.held) { bot.held = h; key(h ? 'keydown' : 'keyup'); } };
  window.__botCast = () => { bot.phase = 'charging'; set(true); };
  const loop = () => {
    requestAnimationFrame(loop);
    const s = window.__riftQA().state;
    if (bot.phase === 'charging') {
      const m = document.querySelector('.cast-meter .marker');
      const v = m ? parseFloat(m.style.bottom) / 100 : 0;
      if (v >= 0.89 && v <= 0.94) { set(false); bot.phase = 'waiting'; }
    } else if (bot.phase === 'waiting' && s === 'BiteWindow') {
      bot.phase = 'hookwait';
      bot.t = performance.now();
    } else if (bot.phase === 'hookwait' && performance.now() - bot.t > 260) {
      set(true);
      bot.phase = 'reeling';
    } else if (bot.phase === 'reeling') {
      if (s === 'Reeling') {
        const w = document.querySelector('.reel .window');
        const f = document.querySelector('.reel .fish');
        const l = parseFloat(w.style.left) / 100;
        const ww = parseFloat(w.style.width) / 100;
        set(parseFloat(f.style.left) / 100 > l + ww / 2);
      } else if (s === 'Reveal' || s === 'FreeRoam' || s === 'Escape') { set(false); bot.phase = 'done'; }
    }
  };
  loop();
});
const botPhase = () => page.evaluate(() => window.__bot.phase);
const castAndRecordUntil = async (stopState, extraFrames, maxFrames = 900, each) => {
  await page.evaluate(() => window.__botCast());
  for (let i = 0; i < maxFrames; i++) {
    if (each) await each(i);
    await shoot();
    if ((await qa()).state === stopState) break;
  }
  await shootN(extraFrames);
};

if (seg === 'catch') {
  // a slow push-in while charging; perfect cast, bite, reel, reveal + catch card
  await shootN(8);
  await castAndRecordUntil('Reveal', 75);
} else if (seg === 'pools') {
  await debug('Pool violet');
  for (let i = 0; i < 60; i++) await step(50); // let the shift reach violet before filming
  await debug('Pool violet');
  for (let i = 0; i < 20; i++) await step(50);
  await shootN(105, () => orbit(orient === 'portrait' ? 3 : 4.5));
  await endOrbit();
} else if (seg === 'hatch') {
  await page.locator('[aria-label="Shop"]').first().evaluate((el) => el.click());
  await shootN(8);
  const card = page.locator('.egg-card', { hasText: 'Lunar Egg' });
  await card.evaluate((el) => el.scrollIntoView({ block: 'center' }));
  await shootN(6);
  await card.locator('.btn').evaluate((el) => el.click());
  await shootN(95);
} else if (seg === 'atoll') {
  await shootN(10, () => orbit(orient === 'portrait' ? -2 : -3));
  await endOrbit();
  await castAndRecordUntil('Reveal', 45);
}
console.log(JSON.stringify({ seg, orient, frames: frame, seconds: (frame / FPS).toFixed(2), errors }));
await browser.close();
