// Avatar close-up from the front: node scripts/closeup.mjs <url> <out.png>
import { chromium } from 'playwright-core';
const [url, out] = process.argv.slice(2);
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport: { width: 900, height: 600 } });
await p.goto(url); await p.waitForFunction(() => window.__riftQA);
await p.waitForTimeout(800);
await p.locator('[data-skip]').click().catch(() => {});
await p.mouse.move(450, 300);
for (let i = 0; i < 12; i++) await p.mouse.wheel(0, -200);
await p.mouse.down({ button: 'right' });
for (let x = 450; x < 450 + 520; x += 26) await p.mouse.move(x, 300 - (x - 450) * 0.12);
await p.mouse.up({ button: 'right' });
await p.waitForTimeout(1200);
await p.screenshot({ path: out });
await b.close();
