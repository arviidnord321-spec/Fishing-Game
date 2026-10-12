/**
 * Seeded economy simulation. Uses the real resolver, store and sale formula; models player time
 * with simple assumptions (documented in BALANCING.md). Run: npm run simulate
 */
import { BALANCE, RODS, UPGRADES } from '../src/data/balance';
import { SPECIES, SPECIES_BY_ID } from '../src/data/species';
import type { PoolId, UpgradeTrack } from '../src/data/types';
import { resolveCatch } from '../src/logic/catchResolver';
import { dayNightAt } from '../src/logic/dayNight';
import { EventDirector } from '../src/logic/eventDirector';
import { createRng } from '../src/logic/rng';
import { GameStore } from '../src/logic/store';

interface Milestones {
  firstCatch?: number;
  firstSale?: number;
  firstPurchase?: number;
  reed?: number;
  moon?: number;
  all?: number;
  leviathan?: number;
  starweaver?: number;
  lastMissing?: string;
}

const SUCCESS: Record<string, number> = { common: 0.92, uncommon: 0.85, rare: 0.75, epic: 0.62, legendary: 0.5 };

function bestPool(store: GameStore, isNight: boolean, eventOpen: boolean): PoolId {
  if (eventOpen) return 'rift';
  const missing = (p: PoolId) => SPECIES.filter((s) => s.pool === p && !store.state.journal[s.id] && s.minWeight <= store.rod.maxWeight && (s.availability !== 'night' || isNight)).length;
  // Prefer the newest unlocked pool, unless an older one still has catchable undiscovered species.
  const order: PoolId[] = ['moon', 'reed', 'meadow'];
  const unlocked = order.filter((p) => store.isPoolUnlocked(p));
  const withMissing = unlocked.filter((p) => missing(p) > 0);
  // Unlock requirements need discoveries in the previous pool.
  if (!store.isPoolUnlocked('reed') && missing('meadow') > 0) return 'meadow';
  if (store.isPoolUnlocked('reed') && !store.isPoolUnlocked('moon') && missing('reed') > 0) return 'reed';
  return withMissing[0] ?? unlocked[0];
}

function spend(store: GameStore): void {
  // Greedy: next rod first, then the cheapest upgrade, keeping a little reserve logic simple.
  for (let guard = 0; guard < 20; guard++) {
    const nextRod = RODS.find((r) => !store.state.ownedRods.includes(r.id));
    if (nextRod && store.state.coins >= nextRod.cost) {
      store.buyRod(nextRod.id);
      continue;
    }
    const ups = UPGRADES.map((u) => ({ id: u.id as UpgradeTrack, cost: store.upgradeCost(u.id as UpgradeTrack) })).filter((u) => u.cost !== null) as { id: UpgradeTrack; cost: number }[];
    ups.sort((a, b) => a.cost - b.cost);
    // Only buy an upgrade if it does not delay the next rod by more than ~30%.
    const cheap = ups[0];
    if (cheap && store.state.coins >= cheap.cost && (!nextRod || store.state.coins - cheap.cost >= 0 || cheap.cost < nextRod.cost * 0.3)) {
      if (nextRod && cheap.cost > nextRod.cost * 0.3 && store.state.coins < nextRod.cost + cheap.cost) break;
      store.buyUpgrade(cheap.id);
      continue;
    }
    break;
  }
}

function run(seed: number, limitSeconds = 3 * 3600): Milestones {
  const rng = createRng(seed);
  const store = new GameStore();
  const ed = new EventDirector();
  const m: Milestones = {};
  let t = 15; // seconds into gameplay before first cast (orientation)
  while (t < limitSeconds) {
    const dn = dayNightAt(t);
    const ev = ed.info(t);
    const pool = bestPool(store, dn.isNight, ev.phase === 'open');
    if (store.bagFull()) {
      t += 14; // walk to stand and back
      store.sell(store.unlockedIds());
      m.firstSale ??= t;
      spend(store);
      if (store.state.tutorial.firstPurchase) m.firstPurchase ??= t;
      continue;
    }
    // cast: charge ~1s with a skill-dependent quality
    const luck = 1 + Math.min(1, Math.max(0, 0.55 + (rng.next() - 0.5) * 0.7));
    const roll = resolveCatch(
      {
        pool,
        rod: store.rod,
        castLuck: luck,
        poolGrowthLevel: store.state.upgrades.poolGrowth,
        isNight: dn.isNight,
        eventOpen: ev.phase === 'open',
        unlockedPools: store.unlockedPermanentPools(),
        tutorial: !store.state.tutorial.firstCatch,
      },
      rng,
    );
    if (!roll) break;
    const sp = SPECIES_BY_ID[roll.speciesId];
    const wait = store.state.tutorial.firstCatch ? rng.range(BALANCE.bite.waitMin, BALANCE.bite.waitMax) : 1;
    const fight = (0.8 / (store.rod.reelSpeed / sp.fightSeconds)) / 0.8; // ~80% time inside window
    t += 1.2 + 0.45 + wait + 0.4;
    const ok = !store.state.tutorial.firstCatch || rng.next() < SUCCESS[sp.rarity];
    if (ok) {
      t += fight + 2.2; // fight + reveal
      store.reserveSlot();
      store.commitCatch({ id: store.newCatchId(), speciesId: roll.speciesId, rarity: roll.rarity, weight: roll.weight, modifier: roll.modifier, matchFactor: 1, pool });
      m.firstCatch ??= t;
      if (roll.speciesId === 'rift-leviathan') m.leviathan ??= t;
    } else t += fight * 0.6 + 0.65;
    // sell early in the tutorial so the first sale happens quickly
    if (!store.state.tutorial.firstSale && store.bagUsed >= 2) {
      t += 10;
      store.sell(store.unlockedIds());
      m.firstSale ??= t;
      spend(store);
    }
    if (store.state.ownedRods.includes('starweaver')) m.starweaver ??= t;
    if (store.isPoolUnlocked('reed')) m.reed ??= t;
    if (store.isPoolUnlocked('moon')) m.moon ??= t;
    if (store.discoveredCount() === SPECIES.length) {
      m.all ??= t;
      break;
    }
  }
  const missing = SPECIES.filter((x) => !store.state.journal[x.id]).map((x) => x.id);
  if (missing.length) m.lastMissing = missing.join(',');
  return m;
}

const N = 40;
const results = Array.from({ length: N }, (_, i) => run(1000 + i));
const keys = ['firstCatch', 'firstSale', 'firstPurchase', 'reed', 'moon', 'starweaver', 'leviathan', 'all'] as const;
const fmt = (s?: number) => (s === undefined ? 'n/a' : `${(s / 60).toFixed(1)} min`);
console.log(`Seeded economy simulation, ${N} runs (time in active minutes)`);
console.log('milestone        p10        median     p90        reached');
for (const k of keys) {
  const vals = results.map((r) => r[k]).filter((v): v is number => v !== undefined).sort((a, b) => a - b);
  const q = (p: number) => vals[Math.min(vals.length - 1, Math.floor(p * vals.length))];
  console.log(`${k.padEnd(16)} ${fmt(q(0.1)).padEnd(10)} ${fmt(q(0.5)).padEnd(10)} ${fmt(q(0.9)).padEnd(10)} ${vals.length}/${N}`);
}

const miss = new Map<string, number>();
for (const r of results) for (const id of r.lastMissing?.split(',') ?? []) miss.set(id, (miss.get(id) ?? 0) + 1);
if (miss.size) console.log(`still missing at cutoff: ${[...miss].map(([k, v]) => `${k}×${v}`).join(', ')}`);
