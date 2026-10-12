// Frame-rate A/B with 0 vs 3 equipped pets at the start view.
// Usage: node scripts/pet-perf.mjs <qaBuildUrl> [repeats]
import { chromium } from 'playwright-core';
const [url, reps = '3'] = process.argv.slice(2);
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const heavy = ['kelp-drake', 'tide-dragon', 'rift-wyrm'];
const cases = {
  'no pets': { pets: {}, equippedPets: [], petSlots: 1 },
  '3 pets (heaviest)': { pets: Object.fromEntries(heavy.map((id) => [id, 1])), equippedPets: heavy, petSlots: 3 },
};
for (const [label, extra] of Object.entries(cases)) {
  const fps = [];
  let info = '';
  const errors = [];
  for (let r = 0; r < +reps; r++) {
    const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
    p.on('pageerror', (e) => errors.push(e.message));
    p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    await p.addInitScript((x) => localStorage.setItem('riftfishing.save', JSON.stringify({ version: 2, daily: { lastClaimDay: new Date().toISOString().slice(0, 10) }, ...x })), extra);
    await p.goto(`${url}?qa`);
    await p.waitForFunction(() => window.__riftQA);
    await p.waitForTimeout(3000);
    fps.push((await p.evaluate(() => new Promise((res) => { let n = 0; const t0 = performance.now(); const k = () => { n++; if (performance.now() - t0 < 5000) requestAnimationFrame(k); else res(n / ((performance.now() - t0) / 1000)); }; requestAnimationFrame(k); }))).toFixed(1));
    info = await p.evaluate(() => [...document.querySelectorAll('pre, div')].map((d) => d.textContent).find((t) => t && /^fps/.test(t.trim()) && t.includes('calls'))?.match(/calls \d+ tris \d+/)?.[0] ?? '');
    await p.close();
  }
  console.log(`${label}: ${fps.join(' / ')} fps · ${info} · errors ${errors.length}`);
}
await b.close();
