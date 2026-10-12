// Screenshot tour of every UI screen with a mid-game save, for visual review.
// Usage: node scripts/ui-tour.mjs <qaBuildUrl> <outDir> [width] [height] [touch]
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import { fishOnce, installBot, walkTo } from './qa-bot.mjs';

const [base, outDir, W = '1280', H = '720', touchFlag] = process.argv.slice(2);
const touch = touchFlag === 'touch';
fs.mkdirSync(outDir, { recursive: true });
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await b.newPage({ viewport: { width: +W, height: +H }, hasTouch: touch, isMobile: touch, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

const d = new Date();
const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const inv = [
  ['crown-koi', 'rare', 72.4, 'gilded'], ['lantern-gill', 'uncommon', 9.1, 'normal'], ['pebblefin', 'common', 2.2, 'normal'],
  ['sailtail', 'rare', 51.0, 'normal'], ['driftback-ray', 'epic', 120.5, 'moonlit'], ['ribbon-minnow', 'common', 3.9, 'normal'],
  ['spiral-perch', 'uncommon', 20.2, 'normal'],
].map(([speciesId, rarity, weight, modifier], i) => ({ id: `t${i}`, speciesId, rarity, weight, modifier, matchFactor: i === 1 ? 1.1 : 1, bonus: 1.2, ordinal: i + 1, pool: 'reed', favorite: i === 0 }));
const journal = Object.fromEntries(['pebblefin', 'ribbon-minnow', 'button-carp', 'lantern-gill', 'mossback', 'reed-skipper', 'spiral-perch', 'sailtail', 'crown-koi', 'driftback-ray'].map((id) => [id, { count: 3, maxWeight: 10, maxValue: 200, modifiers: ['normal'] }]));
const save = {
  version: 2, coins: 48230, ownedRods: ['driftwood', 'riverglass', 'coppercoil'], equippedRod: 'coppercoil', upgrades: { poolGrowth: 2, sellValue: 1, bag: 1 },
  inventory: inv, journal, tutorial: { firstCast: true, firstCatch: true, firstSale: true, firstPurchase: true, skipped: true }, luresUnlocked: true,
  nextOrdinal: 20, nextTx: 40, announcedPools: ['meadow', 'reed'], xp: 120, level: 8, tickets: { meadow: 1, reef: 0 },
  pets: { 'sprout-puff': 2, 'bumble-bun': 1, 'glow-moth': 1, 'tidal-fox': 1, 'coral-crab': 3 }, equippedPets: ['tidal-fox', 'glow-moth'], petSlots: 2,
  daily: { lastClaim: '', streak: 2 }, settings: { quality: process.env.TOUR_QUALITY || 'high' }, streak: 4, bestStreak: 6, totalCaught: 40, playtime: 900, worldClock: 60, boosts: { coinRush: 1100, luckyCharm: 0, quickReel: 0 },
};
await page.addInitScript((s) => { if (!sessionStorage.getItem('seeded')) { localStorage.setItem('riftfishing.save', JSON.stringify(s)); sessionStorage.setItem('seeded', '1'); } }, save);
await page.goto(`${base}?qa`);
await page.waitForFunction(() => typeof window.__riftQA === 'function');
await page.addStyleTag({ content: '.debug{display:none!important}' });
await page.waitForTimeout(1500);
const shot = (n) => page.screenshot({ path: `${outDir}/${n}.png` });
const close = async () => { await page.locator('.overlay .close').first().click().catch(() => {}); await page.waitForTimeout(250); };
const open = async (label) => { await page.locator(`[aria-label="${label}"]`).first().click(); await page.waitForTimeout(800); };

// The daily reward pops up on load when available.
if (await page.locator('.panel[aria-label="Daily reward"]').count()) await shot('01-daily');
await close();
await page.waitForTimeout(500);
await shot('02-hud');
await open('Daily reward'); await shot('01-daily'); await close();
await open('Bag'); await shot('03-bag'); await close();
await open('Shop'); await shot('04-shop-eggs');
for (const [t, n] of [['Boosts', '05-shop-boosts'], ['Rods', '06-shop-rods'], ['Upgrades', '07-shop-upgrades'], ['Style', '08-shop-style']]) {
  await page.locator('.tab', { hasText: t }).click(); await page.waitForTimeout(600); await shot(n);
}
await page.locator('.tab', { hasText: 'Eggs' }).click(); await page.waitForTimeout(300);
await page.locator('.hatch-btn').first().click();
await page.waitForTimeout(500); await shot('09-hatch-egg');
await page.waitForTimeout(1300); await shot('10-hatch-reveal');
await page.locator('.hatch-overlay .btn', { hasText: 'Close' }).click().catch(() => {});
await close();
await open('Pets'); await shot('11-pets'); await close();
await open('Journal'); await shot('12-journal'); await close();
await open('Pause and settings'); await shot('13-pause'); await close();

// Fishing: cast meter, bite, reel, reveal card.
await installBot(page, touch);
const snap = () => page.evaluate(() => window.__riftQA());
await page.evaluate(() => window.__botCast());
const got = new Set();
const t0 = Date.now();
while (Date.now() - t0 < 40000) {
  const s = await snap();
  if (s.state === 'ChargeCast' && !got.has('c')) { got.add('c'); await page.waitForTimeout(250); await shot('14-cast'); }
  if (s.state === 'BiteWindow' && !got.has('b')) { got.add('b'); await shot('15-bite'); }
  if (s.state === 'Reeling' && !got.has('r')) { got.add('r'); await page.waitForTimeout(700); await shot('16-reel'); }
  if (s.state === 'Reveal') { await page.waitForTimeout(1600); await shot('17-catch'); break; }
  await page.waitForTimeout(40);
}
await page.click('.catch-card .btn').catch(() => {});
await page.waitForTimeout(800);
if (!touch) {
  await walkTo(page, -6.6, 10.6);
  await page.keyboard.press('KeyE');
  await page.waitForTimeout(500);
  await shot('18-stand');
  await close();
}
await shot('19-hud-after');
console.log('errors', errors.length, errors.slice(0, 5));
await b.close();
