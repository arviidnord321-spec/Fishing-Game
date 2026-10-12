import { describe, expect, it } from 'vitest';
import { EGGS, PETS_BY_ID, PITY, petBonusAt } from '../src/data/pets';
import { dailyReward, dailyStatus, generateQuests, rollEgg, streakFactor, xpToNext } from '../src/logic/meta';
import { createRng } from '../src/logic/rng';
import { newSave, parseSave, serializeSave } from '../src/logic/saveSchema';
import { GameStore } from '../src/logic/store';
import { speciesIn } from '../src/data/species';
import { RODS } from '../src/data/balance';

const rec = (id: string, rarity: 'common' | 'rare' = 'common') => ({ id, speciesId: rarity === 'rare' ? 'bubble-ram' : 'pebblefin', rarity, weight: rarity === 'rare' ? 20 : 2, modifier: 'normal' as const, matchFactor: 1, pool: 'meadow' as const });

describe('eggs', () => {
  it('has 12 eggs, priced cheapest to dearest, each with a valid pool for every tier it lists', () => {
    expect(EGGS.length).toBe(12);
    for (let i = 1; i < EGGS.length; i++) expect(EGGS[i].cost).toBeGreaterThan(EGGS[i - 1].cost);
    expect(EGGS[0].cost).toBeLessThan(300); // a cheaper egg than the old starter
    expect(EGGS[EGGS.length - 1].cost).toBeGreaterThan(15000); // pricier than the old top egg
    for (const egg of EGGS) {
      const sum = Object.values(egg.odds).reduce((a, b) => a + b!, 0);
      expect(sum).toBeCloseTo(100, 5);
      for (const id of egg.pool) expect(PETS_BY_ID[id], `${egg.id}:${id}`).toBeTruthy();
      for (const [r, pct] of Object.entries(egg.odds)) if (pct) expect(egg.pool.some((id) => PETS_BY_ID[id].rarity === r), `${egg.id} ${r}`).toBe(true);
    }
    // every pet can be hatched from at least one egg
    for (const id of Object.keys(PETS_BY_ID)) expect(EGGS.some((e) => e.pool.includes(id)), id).toBe(true);
  });

  it('every egg hatches only pets from its own pool, and opens for a player who meets its level', () => {
    for (const egg of EGGS) {
      const s = new GameStore();
      s.state.level = egg.level;
      s.state.coins = egg.cost * 3;
      for (let i = 0; i < 3; i++) {
        const r = s.hatch(egg.id, createRng(i + 1));
        expect(r.ok, egg.id).toBe(true);
        expect(egg.pool).toContain(r.petId);
      }
      expect(s.state.coins).toBeLessThan(egg.cost);
      if (egg.level > 1) {
        const low = new GameStore();
        low.state.level = egg.level - 1;
        low.state.coins = egg.cost;
        expect(low.hatch(egg.id, createRng(1)).ok).toBe(false);
      }
    }
  });

  it('old saves (3 eggs) load with pity for every new egg', () => {
    const raw = JSON.parse(serializeSave(newSave()));
    raw.eggPity = { meadow: 4, reef: 2, star: 7 };
    const r = parseSave(JSON.stringify(raw));
    expect(r.kind).toBe('ok');
    if (r.kind !== 'ok') return;
    expect(r.data.eggPity.meadow).toBe(4);
    expect(r.data.eggPity.star).toBe(7);
    for (const e of EGGS) expect(r.data.eggPity[e.id]).toBeGreaterThanOrEqual(0);
  });

  it('rolls match the published tier odds (±1.5%) without pity', () => {
    for (const egg of EGGS) {
      const rng = createRng(11);
      const counts: Record<string, number> = {};
      const n = 40000;
      for (let i = 0; i < n; i++) {
        const { petId } = rollEgg(egg.id, 0, 1e9, rng);
        const r = PETS_BY_ID[petId].rarity;
        counts[r] = (counts[r] ?? 0) + 1;
      }
      for (const [r, pct] of Object.entries(egg.odds)) expect(Math.abs(((counts[r] ?? 0) / n) * 100 - pct!)).toBeLessThan(1.5);
    }
  });

  it('pity guarantees a rare-or-better on the 10th spin without one', () => {
    const rng = createRng(3);
    for (let i = 0; i < 500; i++) {
      const { petId, pityUsed } = rollEgg('meadow', PITY - 1, PITY, rng);
      expect(pityUsed).toBe(true);
      expect(['rare', 'epic', 'legendary']).toContain(PETS_BY_ID[petId].rarity);
    }
  });

  it('hatching charges once, respects level gates, uses tickets first, and resets pity on rare+', () => {
    const s = new GameStore();
    s.state.coins = 1000;
    expect(s.hatch('reef', createRng(1)).ok).toBe(false); // level 5 needed
    s.state.tickets.meadow = 1;
    const r1 = s.hatch('meadow', createRng(1));
    expect(r1.ok).toBe(true);
    expect(s.state.tickets.meadow).toBe(0);
    expect(s.state.coins).toBe(1000);
    s.hatch('meadow', createRng(2));
    expect(s.state.coins).toBe(700);
    expect(s.state.eggsOpened).toBe(2);
    // the first new pet auto-equips into the free slot
    expect(s.state.equippedPets.length).toBe(1);
    s.state.coins = 0;
    expect(s.hatch('meadow', createRng(3)).ok).toBe(false);
  });

  it('duplicates level a pet up to max, then refund coins', () => {
    const s = new GameStore();
    s.state.coins = 1e7;
    let maxed = 0;
    for (let i = 0; i < 400; i++) {
      const r = s.hatch('meadow', createRng(100 + i));
      if (r.refund) maxed++;
    }
    expect(Object.values(s.state.pets).every((l) => l >= 1 && l <= 5)).toBe(true);
    expect(maxed).toBeGreaterThan(0);
  });
});

describe('pets, boosts, streak', () => {
  it('equipped pet bonuses add up and slots limit equips', () => {
    const s = new GameStore();
    s.state.pets = { 'sprout-puff': 1, 'glow-moth': 3, 'pebble-pup': 1 };
    expect(s.equipPet('sprout-puff').ok).toBe(true);
    expect(s.equipPet('glow-moth').ok).toBe(false); // one slot
    s.state.coins = 1500;
    expect(s.buyPetSlot().ok).toBe(true);
    expect(s.equipPet('glow-moth').ok).toBe(true);
    expect(s.petBonus('coins')).toBeCloseTo(0.05 + petBonusAt(PETS_BY_ID['glow-moth'], 3));
    expect(s.petBonus('luck')).toBe(0);
  });

  it('catch bonus is locked in when landed; sale uses the stored bonus', () => {
    const s = new GameStore();
    s.state.pets = { 'glow-moth': 1 };
    s.state.equippedPets = ['glow-moth'];
    s.commitCatch(rec('a'));
    const a = s.state.inventory[0];
    expect(a.bonus).toBeCloseTo(1.15);
    s.unequipPet('glow-moth');
    // unequipping later does not change the stored bonus
    expect(s.state.inventory[0].bonus).toBeCloseTo(1.15);
  });

  it('Coin Rush doubles catch value while active and expires with play time', () => {
    const s = new GameStore();
    s.state.coins = 1000;
    expect(s.buyBoost('coinRush').ok).toBe(true);
    expect(s.state.coins).toBe(800);
    s.commitCatch(rec('a'));
    expect(s.state.inventory[0].bonus).toBe(2);
    s.tickClock(301);
    s.commitCatch(rec('b'));
    expect(s.state.inventory[1].bonus).toBe(1);
  });

  it('buying a boost again extends it', () => {
    const s = new GameStore();
    s.state.coins = 1000;
    s.buyBoost('luckyCharm');
    s.buyBoost('luckyCharm');
    expect(s.boostLeft('luckyCharm')).toBe(600);
    expect(s.luckMultiplier()).toBe(2);
  });

  it('hot streak raises value at 3/5/10 and breaks on an escape', () => {
    expect([1, 2, 3, 5, 10].map(streakFactor)).toEqual([1, 1, 1.1, 1.2, 1.3]);
    const s = new GameStore();
    for (const id of ['a', 'b', 'c']) s.commitCatch(rec(id));
    expect(s.state.streak).toBe(3);
    expect(s.state.inventory[2].bonus).toBeCloseTo(1.1);
    s.breakStreak();
    expect(s.state.streak).toBe(0);
    expect(s.state.bestStreak).toBe(3);
  });
});

describe('levels, daily, quests', () => {
  it('XP levels up with rewards; every 3rd level gives an egg ticket', () => {
    const s = new GameStore();
    const levels: number[] = [];
    s.subscribe((e) => {
      if (e.type === 'levelUp') levels.push(e.level);
    });
    for (let i = 0; i < 60; i++) s.commitCatch(rec(`r${i}`, 'rare'));
    expect(s.state.level).toBeGreaterThan(3);
    expect(levels[0]).toBe(2);
    expect(s.state.tickets.meadow).toBeGreaterThanOrEqual(1);
    expect(s.state.xp).toBeLessThan(xpToNext(s.state.level));
  });

  it('daily streak: once per day, continues on consecutive days, resets after a gap, wraps after 7', () => {
    const s = new GameStore();
    expect(s.claimDaily('2026-10-12').day).toBe(1);
    expect(s.claimDaily('2026-10-12').ok).toBe(false);
    expect(s.claimDaily('2026-10-13').day).toBe(2);
    expect(s.claimDaily('2026-10-15').day).toBe(1); // missed a day
    let d = new Date(2026, 9, 16);
    for (let i = 2; i <= 8; i++) {
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      expect(s.claimDaily(key).day).toBe(((i - 1) % 7) + 1);
      d = new Date(d.getTime() + 86400000);
    }
    expect(dailyStatus({ lastClaim: '2026-12-31', streak: 3 }, '2027-01-01')).toEqual({ available: true, day: 4 });
    expect(dailyReward(7, 1).reefTickets).toBe(1);
  });

  it('quests are deterministic per day, progress from play, and pay once', () => {
    expect(generateQuests('2026-10-12', 3)).toEqual(generateQuests('2026-10-12', 3));
    const s = new GameStore();
    s.ensureQuests('2026-10-12');
    const catchQ = s.state.quests.list.find((q) => q.kind === 'catch')!;
    for (let i = 0; i < catchQ.target; i++) s.commitCatch(rec(`q${i}`));
    expect(catchQ.progress).toBe(catchQ.target);
    const coins = s.state.coins;
    expect(s.claimQuest(catchQ.id).ok).toBe(true);
    expect(s.state.coins).toBeGreaterThan(coins);
    expect(s.claimQuest(catchQ.id).ok).toBe(false);
    // a new day brings a new set
    s.ensureQuests('2026-10-13');
    expect(s.state.quests.day).toBe('2026-10-13');
  });
});

describe('save v2', () => {
  it('migrates a v1 save without losing data', () => {
    const v1 = JSON.parse(serializeSave(newSave()));
    v1.version = 1;
    v1.coins = 777;
    v1.inventory = [{ id: 'old', speciesId: 'pebblefin', rarity: 'common', weight: 2, modifier: 'normal', matchFactor: 1, ordinal: 1, pool: 'meadow', favorite: false }];
    for (const k of ['xp', 'level', 'tickets', 'pets', 'equippedPets', 'petSlots', 'eggPity', 'daily', 'quests', 'boosts', 'streak']) delete v1[k];
    const out = parseSave(JSON.stringify(v1));
    expect(out.kind).toBe('ok');
    if (out.kind !== 'ok') return;
    expect(out.data.version).toBe(2);
    expect(out.data.coins).toBe(777);
    expect(out.data.inventory[0].bonus).toBe(1);
    expect(out.data.level).toBe(1);
    expect(out.data.petSlots).toBe(1);
  });

  it('round-trips meta progression and drops invalid pets', () => {
    const s = new GameStore();
    s.state.coins = 5000;
    s.hatch('meadow', createRng(5));
    s.buyBoost('quickReel');
    s.ensureQuests('2026-10-12');
    s.claimDaily('2026-10-12');
    const out = parseSave(serializeSave(s.state));
    expect(out.kind === 'ok' && out.data).toEqual(s.state);
    const raw = JSON.parse(serializeSave(s.state));
    raw.pets['not-a-pet'] = 2;
    raw.equippedPets.push('not-a-pet');
    const fixed = parseSave(JSON.stringify(raw));
    expect(fixed.kind === 'ok' && fixed.data.pets['not-a-pet']).toBeUndefined();
    expect(fixed.kind === 'ok' && fixed.data.equippedPets.includes('not-a-pet')).toBe(false);
  });
});

describe('worlds', () => {
  const finishWorld1 = (s: GameStore) => {
    for (const sp of speciesIn(1)) s.state.journal[sp.id] = { count: 1, maxWeight: sp.minWeight, maxValue: 1, modifiers: ['normal'] };
  };

  it('Starlight Atoll unlocks only after every Sunny Isle species is caught, and announces once', () => {
    const s = new GameStore();
    const events: string[] = [];
    s.subscribe((e) => events.push(e.type));
    expect(s.isWorldUnlocked(2)).toBe(false);
    expect(s.travel(2).ok).toBe(false);
    finishWorld1(s);
    delete s.state.journal['rift-leviathan'];
    expect(s.isWorldUnlocked(2)).toBe(false);
    finishWorld1(s);
    s.debugAddCoins(1);
    expect(events.filter((e) => e === 'worldUnlocked').length).toBe(1);
    s.debugAddCoins(1);
    expect(events.filter((e) => e === 'worldUnlocked').length).toBe(1);
    expect(s.travel(2).ok).toBe(true);
    expect(s.state.world).toBe(2);
    expect(s.discoveredCount()).toBe(0);
    expect(s.travel(1).ok).toBe(true);
  });

  it('world 2 rods stay locked until the world opens, then follow the rod chain', () => {
    const s = new GameStore();
    s.state.coins = 10_000_000;
    s.state.ownedRods = RODS.filter((r) => !r.world).map((r) => r.id);
    expect(s.rodStatus('coralspire')).toBe('locked');
    finishWorld1(s);
    expect(s.rodStatus('coralspire')).toBe('buy');
    expect(s.rodStatus('tidecrown')).toBe('locked');
    expect(s.buyRod('coralspire').ok).toBe(true);
    expect(s.rodStatus('tidecrown')).toBe('buy');
  });

  it('pool unlocks in world 2 use that world’s rods and species', () => {
    const s = new GameStore();
    finishWorld1(s);
    s.travel(2);
    expect(s.isPoolUnlocked('reed')).toBe(false);
    s.state.ownedRods.push('coralspire', 'tidecrown');
    for (const sp of speciesIn(2).filter((x) => x.pool === 'meadow').slice(0, 4)) s.state.journal[sp.id] = { count: 1, maxWeight: 1, maxValue: 1, modifiers: ['normal'] };
    expect(s.isPoolUnlocked('reed')).toBe(true);
    expect(s.isPoolUnlocked('moon')).toBe(false);
  });

  it('saves keep the world, but a forged world-2 save without the journal falls back to world 1', () => {
    const s = new GameStore();
    finishWorld1(s);
    s.travel(2);
    const ok = parseSave(serializeSave(s.state));
    expect(ok.kind === 'ok' && ok.data.world).toBe(2);
    const forged = JSON.parse(serializeSave(newSave()));
    forged.world = 2;
    const r = parseSave(JSON.stringify(forged));
    expect(r.kind === 'ok' && r.data.world).toBe(1);
  });
});
