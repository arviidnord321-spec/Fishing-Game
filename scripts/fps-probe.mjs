// 5 s rAF frame-rate probe at the start view: node scripts/fps-probe.mjs <url> <label> [quality] [repeats]
import { chromium } from 'playwright-core';
const [url, label, quality = '', reps = '2'] = process.argv.slice(2);
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const out = [];
for (let r = 0; r < +reps; r++) {
  const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
  if (quality) await p.addInitScript((q) => localStorage.setItem('riftfishing.save', JSON.stringify({ version: 1, settings: { quality: q } })), quality);
  await p.goto(url);
  await p.waitForFunction(() => window.__riftQA);
  await p.waitForTimeout(3000);
  const f = await p.evaluate(() => new Promise((res) => { let n = 0; const t0 = performance.now(); const k = () => { n++; if (performance.now() - t0 < 5000) requestAnimationFrame(k); else res(n / ((performance.now() - t0) / 1000)); }; requestAnimationFrame(k); }));
  out.push(f.toFixed(1));
  await p.close();
}
console.log(`${label}: ${out.join(' / ')} fps`);
await b.close();
