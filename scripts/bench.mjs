// Frame-rate / CPU benchmark: node scripts/bench.mjs <url> <label> [width] [height]
// Measures, over fixed windows: rendered FPS (rAF cadence) and main-thread task time per frame
// (Chrome DevTools Performance.getMetrics). Scenes: idle at the start, camera orbiting, walking.
// NOTE: this container renders WebGL on the CPU (SwiftShader), so absolute FPS is far below a
// real GPU. Compare runs only against each other.
import { chromium } from 'playwright-core';

const [url, label = 'run', W = '1280', H = '720', quality = ''] = process.argv.slice(2);
const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width: +W, height: +H } });
const cdp = await page.context().newCDPSession(page);
await cdp.send('Performance.enable');
if (quality) {
  // Pre-seed a save with a fixed quality preset so runs are comparable.
  await page.addInitScript((q) => {
    try {
      if (!localStorage.getItem('riftfishing.save')) localStorage.setItem('riftfishing.save', JSON.stringify({ version: 1, settings: { quality: q } }));
    } catch {}
  }, quality);
}
await page.goto(url);
await page.waitForFunction(() => typeof window.__riftQA === 'function', null, { timeout: 30000 });
await page.waitForTimeout(3000);

async function measure(name, ms, during) {
  await page.evaluate(() => {
    window.__frames = 0;
    window.__worst = 0;
    let last = performance.now();
    const tick = (t) => {
      window.__frames++;
      window.__worst = Math.max(window.__worst, t - last);
      last = t;
      if (window.__benchOn) requestAnimationFrame(tick);
    };
    window.__benchOn = true;
    requestAnimationFrame(tick);
  });
  const m0 = Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map((m) => [m.name, m.value]));
  const t0 = Date.now();
  const stop = during ? during() : null;
  await page.waitForTimeout(ms);
  if (stop) await stop();
  const r = await page.evaluate(() => {
    window.__benchOn = false;
    return { frames: window.__frames, worst: window.__worst };
  });
  const m1 = Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map((m) => [m.name, m.value]));
  const secs = (Date.now() - t0) / 1000;
  const fps = r.frames / secs;
  const taskMs = ((m1.TaskDuration - m0.TaskDuration) * 1000) / Math.max(1, r.frames);
  const scriptMs = ((m1.ScriptDuration - m0.ScriptDuration) * 1000) / Math.max(1, r.frames);
  const snap = await page.evaluate(() => window.__riftQA());
  const line = `${label} | ${name.padEnd(8)} | fps ${fps.toFixed(1).padStart(5)} | worst frame ${r.worst.toFixed(0).padStart(4)} ms | main-thread ${taskMs.toFixed(1).padStart(5)} ms/frame | script ${scriptMs.toFixed(1).padStart(5)} ms/frame | calls ${snap.calls} | tris ${snap.triangles}${snap.quality ? ` | quality ${snap.quality}` : ''}`;
  console.log(line);
}

await measure('idle', 6000);
await measure('orbit', 6000, () => {
  let on = true;
  (async () => {
    await page.mouse.move(640, 360);
    await page.mouse.down({ button: 'right' });
    let x = 640;
    while (on) {
      x = x > 1000 ? 300 : x + 12;
      await page.mouse.move(x, 360);
      await page.waitForTimeout(16);
    }
    await page.mouse.up({ button: 'right' });
  })();
  return async () => { on = false; await page.waitForTimeout(50); };
});
await measure('walk', 6000, () => {
  let on = true;
  (async () => {
    const keys = ['KeyA', 'KeyS', 'KeyD', 'KeyW'];
    let i = 0;
    while (on) {
      await page.keyboard.down(keys[i % 4]);
      await page.waitForTimeout(700);
      await page.keyboard.up(keys[i % 4]);
      i++;
    }
  })();
  return async () => { on = false; await page.waitForTimeout(800); };
});
await browser.close();
