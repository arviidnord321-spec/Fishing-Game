// Shared helpers for browser QA scripts.
/** Installs an in-page bot driven by requestAnimationFrame so timing is not limited by CDP latency. */
export async function installBot(page, touch = false) {
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

export async function fishOnce(page, i = 1, shot = async () => {}) {
  const snap = () => page.evaluate(() => window.__riftQA());
  await page.evaluate(() => window.__botCast());
  const t0 = Date.now();
  let shotTaken = { cast: false, reel: false };
  while (Date.now() - t0 < 60000) {
    // Cast was refused (e.g. blocked): stop charging instead of waiting forever.
    if ((await page.evaluate(() => window.__bot.phase)) === 'charging' && Date.now() - t0 > 8000) { await page.evaluate(() => { window.__bot.phase = 'done'; window.__bot.result = 'blocked'; window.__bot.held = false; window.dispatchEvent(new KeyboardEvent('keyup', { code: 'Space' })); }); }
    const b = await page.evaluate(() => ({ ...window.__bot }));
    const s = await snap();
    if (i === 0 && !shotTaken.cast && s.state === 'ChargeCast') { await shot('02-charging'); shotTaken.cast = true; }
    if (i === 0 && !shotTaken.reel && s.state === 'Reeling') { await page.waitForTimeout(600); await shot('03-reeling'); shotTaken.reel = true; }
    if (b.phase === 'done') return b.result;
    await page.waitForTimeout(60);
  }
  return 'timeout';
}

export async function walkTo(page, x, z, tol = 0.6) {
  const snap = () => page.evaluate(() => window.__riftQA());
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

