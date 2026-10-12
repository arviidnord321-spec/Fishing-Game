import { describe, expect, it } from 'vitest';
import { BALANCE, RODS, RODS_BY_ID } from '../src/data/balance';
import { SPECIES } from '../src/data/species';
import type { PermanentPoolId, PoolId } from '../src/data/types';
import { castMarker, castQuality } from '../src/logic/castQuality';
import { eligibleModifiers, eligibleSpecies, resolveCatch, saleValue, tierProbabilities, type CatchContext } from '../src/logic/catchResolver';
import { dayNightAt } from '../src/logic/dayNight';
import { EventDirector, type EventInfo } from '../src/logic/eventDirector';
import { FishingController, type FishContext, type FishInput } from '../src/logic/fishing';
import { PauseManager } from '../src/logic/pause';
import { ReelSim } from '../src/logic/reelSim';
import { createRng } from '../src/logic/rng';
import { newSave, parseSave, serializeSave } from '../src/logic/saveSchema';
import { GameStore } from '../src/logic/store';

const IDLE_EVENT: EventInfo = { phase: 'idle', remaining: 100, untilOpen: 100, openness: 0, current: 'sun', index: 0 };
const ctxFor = (pool: PoolId | null, event: EventInfo = IDLE_EVENT, isNight = false): FishContext => ({ pool, isNight, event });
const NONE: FishInput = { pressed: false, released: false, held: false, cancel: false };
const DT = BALANCE.sim.step;

function baseCtx(over: Partial<CatchContext> = {}): CatchContext {
  return {
    pool: 'meadow',
    rod: RODS[0],
    castLuck: 1,
    poolGrowthLevel: 0,
    isNight: false,
    eventOpen: false,
    unlockedPools: ['meadow'],
    ...over,
  };
}

/** Drives a controller through a full attempt. `reelPolicy` decides holding each step. */
function playAttempt(
  fc: FishingController,
  ctx: FishContext,
  opts: { releaseAt?: number; reelPolicy?: (fc: FishingController) => boolean; hook?: boolean; maxSteps?: number } = {},
) {
  const releaseAt = opts.releaseAt ?? 0.91 * (BALANCE.cast.cycleSeconds / 2);
  fc.tick(DT, { pressed: true, released: false, held: true, cancel: false }, ctx);
  let steps = 0;
  let pressNext = false;
  while (steps++ < (opts.maxSteps ?? 60 * 60)) {
    const s = fc.state;
    let input: FishInput = NONE;
    if (s === 'ChargeCast') input = fc.t + DT >= releaseAt ? { ...NONE, released: true } : { ...NONE, held: true };
    else if (s === 'BiteWindow' && opts.hook !== false) {
      input = pressNext ? { pressed: true, released: false, held: true, cancel: false } : NONE;
      pressNext = true;
    } else if (s === 'Reeling') {
      const held = opts.reelPolicy ? opts.reelPolicy(fc) : smartPolicy(fc);
      input = { ...NONE, held };
    } else if (s === 'Reveal' || s === 'Escape' || s === 'FreeRoam') break;
    fc.tick(DT, input, ctx);
  }
  return fc.state;
}

function smartPolicy(fc: FishingController): boolean {
  const r = fc.reel!.state;
  return r.fishPos > r.windowCenter;
}

describe('cast quality', () => {
  it('is deterministic and always within ×1–×2', () => {
    for (let m = 0; m <= 1.0001; m += 0.01) {
      const a = castQuality(m);
      const b = castQuality(m);
      expect(a).toEqual(b);
      expect(a.luck).toBeGreaterThanOrEqual(1);
      expect(a.luck).toBeLessThanOrEqual(2);
    }
    expect(castQuality(0.9).perfect).toBe(true);
    expect(castQuality(0.9).luck).toBe(2);
    expect(castQuality(0).luck).toBe(1);
    expect(castQuality(0.5).perfect).toBe(false);
  });
  it('marker ping-pongs over 1.8s', () => {
    expect(castMarker(0)).toBe(0);
    expect(castMarker(0.9)).toBeCloseTo(1);
    expect(castMarker(1.8)).toBeCloseTo(0);
    expect(castMarker(0.45)).toBeCloseTo(0.5);
  });
});

describe('catch resolver', () => {
  it('tier probabilities normalize after filtering and do not depend on species count in a tier', () => {
    const elig = eligibleSpecies(baseCtx());
    const p = tierProbabilities(elig, 1);
    const sum = Object.values(p).reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1);
    expect(p.rare).toBe(0); // Bubble Ram filtered by Driftwood's 10 kg cap
    const extra = [...elig, { ...elig[0], id: 'dup-common' }, { ...elig[0], id: 'dup-common-2' }];
    expect(tierProbabilities(extra, 1)).toEqual(p);
  });

  it('never exceeds the rod capacity, including Giant modifiers', () => {
    const rng = createRng(42);
    for (const rod of RODS) {
      for (const pool of ['meadow', 'reed', 'moon', 'rift'] as PoolId[]) {
        for (let i = 0; i < 400; i++) {
          const roll = resolveCatch(
            baseCtx({ pool, rod, castLuck: 2, isNight: i % 2 === 0, eventOpen: true, unlockedPools: ['meadow', 'reed', 'moon'] }),
            rng,
          );
          if (!roll) continue;
          expect(roll.weight).toBeLessThanOrEqual(rod.maxWeight);
          expect(roll.weight).toBeGreaterThan(0);
        }
      }
    }
  });

  it('excludes Giant when its minimum weight would exceed the cap', () => {
    // Mossback min 8 kg × 1.5 = 12 kg > Driftwood's 10 kg cap.
    const moss = SPECIES.find((s) => s.id === 'mossback')!;
    const mods = eligibleModifiers(moss, baseCtx({ pool: 'rift', eventOpen: true, rod: RODS_BY_ID.driftwood }));
    expect(mods.some((m) => m.id === 'giant')).toBe(false);
    expect(mods.some((m) => m.id === 'normal')).toBe(true);
  });

  it('every permanent pool has eligible catches with the rod that unlocks it', () => {
    expect(eligibleSpecies(baseCtx({ pool: 'meadow', rod: RODS_BY_ID.driftwood })).length).toBeGreaterThan(0);
    expect(eligibleSpecies(baseCtx({ pool: 'reed', rod: RODS_BY_ID.coppercoil })).length).toBeGreaterThan(0);
    expect(eligibleSpecies(baseCtx({ pool: 'moon', rod: RODS_BY_ID.stormline })).length).toBeGreaterThan(0);
  });

  it('every species is reachable with some rod and condition', () => {
    const all: PermanentPoolId[] = ['meadow', 'reed', 'moon'];
    for (const s of SPECIES) {
      const ctx = baseCtx({ pool: s.pool, rod: RODS_BY_ID.riftcaller, isNight: true, eventOpen: true, unlockedPools: all });
      expect(eligibleSpecies(ctx).map((x) => x.id)).toContain(s.id);
    }
  });

  it('night-only species are excluded by day', () => {
    const ids = eligibleSpecies(baseCtx({ pool: 'moon', rod: RODS_BY_ID.riftcaller, isNight: false })).map((s) => s.id);
    expect(ids).not.toContain('comet-marlin');
    expect(ids).not.toContain('observatory-whale');
  });

  it('luck raises rare odds but never common', () => {
    const elig = eligibleSpecies(baseCtx({ rod: RODS_BY_ID.riverglass }));
    expect(tierProbabilities(elig, 2).rare).toBeGreaterThan(tierProbabilities(elig, 1).rare);
  });

  it('sale formula matches the spec', () => {
    // Pebblefin 2 kg normal, level 0: floor(18 * sqrt(2/1)) = 25
    expect(saleValue('pebblefin', 2, 'normal', 0, 1)).toBe(25);
    expect(saleValue('pebblefin', 1, 'gilded', 2, 1.1)).toBe(Math.floor(18 * 1 * 1.5 * 1.2 * 1.1));
  });
});

describe('reeling', () => {
  const params = { rarity: 'common' as const, fightSeconds: 5, reelSpeed: 1, windowBonus: 0, assist: false, tutorial: false, motionSeed: 7 };
  it('can be won by tracking and lost by ignoring', () => {
    const win = new ReelSim(params);
    let out = 'active';
    while (out === 'active') out = win.step(DT, win.state.fishPos > win.state.windowCenter);
    expect(out).toBe('caught');

    const lose = new ReelSim({ ...params, rarity: 'rare' });
    out = 'active';
    let steps = 0;
    while (out === 'active') out = lose.step(DT, steps++ % 240 < 200);
    expect(out).toBe('escaped');
  });

  it('is identical across 30 Hz and 144 Hz render rates when stepped at a fixed rate', () => {
    const run = (frameDt: number) => {
      const store = new GameStore();
      store.state.tutorial.firstCatch = true;
      const fc = new FishingController(store, createRng(99));
      const ctx = ctxFor('meadow');
      let acc = 0;
      let simTime = 0;
      // Input trace defined over simulation time.
      const inputAt = (t: number): FishInput => {
        if (fc.state === 'FreeRoam' && t < 0.05) return { pressed: true, released: false, held: true, cancel: false };
        if (fc.state === 'ChargeCast') return fc.t >= 0.8 ? { ...NONE, released: true } : { ...NONE, held: true };
        if (fc.state === 'BiteWindow') return { pressed: fc.t > 0.2, released: false, held: fc.t > 0.2, cancel: false };
        if (fc.state === 'Reeling') return { ...NONE, held: smartPolicy(fc) };
        return NONE;
      };
      for (let frame = 0; frame < 60 / frameDt && simTime < 40; frame++) {
        acc += frameDt;
        while (acc >= DT) {
          fc.tick(DT, inputAt(simTime), ctx);
          simTime += DT;
          acc -= DT;
        }
        if (fc.state === 'Reveal' || (fc.state === 'FreeRoam' && simTime > 1)) break;
      }
      return { state: fc.state, inv: store.state.inventory.map((c) => [c.speciesId, c.weight]), coins: store.quoteSale(store.state.inventory.map((c) => c.id)).coins };
    };
    expect(run(1 / 30)).toEqual(run(1 / 144));
  });
});

describe('fishing state machine', () => {
  it('a button held before the bite does not hook', () => {
    const store = new GameStore();
    const fc = new FishingController(store, createRng(1));
    const ctx = ctxFor('meadow');
    fc.tick(DT, { pressed: true, released: false, held: true, cancel: false }, ctx);
    fc.tick(DT, { ...NONE, released: true }, ctx);
    let hint = '';
    fc.on((e) => {
      if (e.type === 'hint') hint = e.text;
    });
    let guard = 0;
    while (fc.state !== 'BiteWindow' && guard++ < 1000) fc.tick(DT, NONE, ctx);
    for (let i = 0; i < 400 && fc.state === 'BiteWindow'; i++) fc.tick(DT, { ...NONE, held: true }, ctx);
    expect(fc.state).toBe('Escape');
    expect(hint).toBe('Tap when the bobber dips.');
    expect(store.reserved).toBe(0);
  });

  it('completes a guided first catch and commits exactly one item', () => {
    const store = new GameStore();
    const fc = new FishingController(store, createRng(3));
    expect(playAttempt(fc, ctxFor('meadow'))).toBe('Reveal');
    expect(store.state.inventory.length).toBe(1);
    expect(store.state.inventory[0].rarity).toBe('common');
    expect(store.reserved).toBe(0);
  });

  it('a full bag prevents casting', () => {
    const store = new GameStore();
    store.state.inventory = Array.from({ length: 8 }, (_, i) => ({
      id: `x${i}`, speciesId: 'pebblefin', rarity: 'common' as const, weight: 1, modifier: 'normal' as const, matchFactor: 1, ordinal: i, pool: 'meadow' as const, favorite: false,
    }));
    const fc = new FishingController(store, createRng(1));
    let blocked = '';
    fc.on((e) => {
      if (e.type === 'blocked') blocked = e.reason;
    });
    fc.tick(DT, { pressed: true, released: false, held: true, cancel: false }, ctxFor('meadow'));
    expect(fc.state).toBe('FreeRoam');
    expect(blocked).toMatch(/Bag full/);
  });

  it('cancel before bite releases the reservation', () => {
    const store = new GameStore();
    const fc = new FishingController(store, createRng(1));
    fc.tick(DT, { pressed: true, released: false, held: true, cancel: false }, ctxFor('meadow'));
    expect(store.reserved).toBe(1);
    fc.tick(DT, { ...NONE, held: true, cancel: true }, ctxFor('meadow'));
    expect(fc.state).toBe('FreeRoam');
    expect(store.reserved).toBe(0);
  });

  it('a hooked night fish stays valid after dawn', () => {
    const store = new GameStore();
    store.state.tutorial.firstCatch = true;
    store.state.ownedRods = RODS.map((r) => r.id);
    store.state.equippedRod = 'starweaver';
    for (const s of SPECIES.filter((x) => x.pool === 'meadow' || x.pool === 'reed')) store.state.journal[s.id] = { count: 1, maxWeight: 1, maxValue: 1, modifiers: [] };
    // Find a seed that yields a night-only species.
    for (let seed = 1; seed < 4000; seed++) {
      const fc = new FishingController(store, createRng(seed));
      fc.tick(DT, { pressed: true, released: false, held: true, cancel: false }, ctxFor('moon', IDLE_EVENT, true));
      fc.tick(DT, { ...NONE, released: true }, ctxFor('moon', IDLE_EVENT, true));
      const sp = SPECIES.find((s) => s.id === fc.roll?.speciesId)!;
      if (sp?.availability !== 'night') {
        fc.cancel('x');
        continue;
      }
      // Dawn arrives: subsequent ticks use isNight=false.
      const end = playAttempt(fc, ctxFor('moon', IDLE_EVENT, false), { maxSteps: 60 * 40 });
      if (end === 'Reveal') {
        expect(store.state.inventory.some((c) => c.speciesId === sp.id)).toBe(true);
        return;
      }
    }
    throw new Error('no night catch found');
  });

  it('rift attempts finish during grace and are cancelled without penalty after close', () => {
    const store = new GameStore();
    store.state.tutorial.firstCatch = true;
    const fc = new FishingController(store, createRng(5));
    const open: EventInfo = { ...IDLE_EVENT, phase: 'open', openness: 1, current: 'sun' };
    store.state.lure = 'sun';
    fc.tick(DT, { pressed: true, released: false, held: true, cancel: false }, ctxFor('rift', open));
    fc.tick(DT, { ...NONE, released: true }, ctxFor('rift', open));
    expect(fc.matchFactor).toBe(1.1);
    // Grace: new casts are rejected but this attempt continues.
    const grace: EventInfo = { ...open, phase: 'grace' };
    fc.tick(DT, NONE, ctxFor('rift', grace));
    expect(fc.state).toBe('CastFlight');
    expect(new FishingController(store, createRng(1)).castBlocker(ctxFor('rift', grace))).toMatch(/closing/);
    const closing: EventInfo = { ...open, phase: 'closing' };
    const coins = store.state.coins;
    fc.tick(DT, NONE, ctxFor('rift', closing));
    expect(fc.state).toBe('FreeRoam');
    expect(store.reserved).toBe(0);
    expect(store.state.coins).toBe(coins);
  });

  it('lure bonus is locked at release and applied once to the sale value', () => {
    const store = new GameStore();
    store.state.tutorial.firstCatch = true;
    const fc = new FishingController(store, createRng(8));
    const open: EventInfo = { ...IDLE_EVENT, phase: 'open', openness: 1, current: 'leaf' };
    store.state.lure = 'leaf';
    fc.tick(DT, { pressed: true, released: false, held: true, cancel: false }, ctxFor('rift', open));
    fc.tick(DT, { ...NONE, released: true }, ctxFor('rift', open));
    // Current changes and lure is switched after release: factor must not change.
    store.state.lure = 'moon';
    const later: EventInfo = { ...open, current: 'moon' };
    const end = playAttempt(fc, ctxFor('rift', later));
    if (end === 'Reveal') {
      const c = store.state.inventory[0];
      expect(c.matchFactor).toBe(1.1);
      expect(store.valueOf(c)).toBe(saleValue(c.speciesId, c.weight, c.modifier, 0, 1.1));
    } else {
      expect(store.state.inventory.length).toBe(0);
    }
  });
});

describe('store transactions', () => {
  const rec = (id: string) => ({ id, speciesId: 'pebblefin', rarity: 'common' as const, weight: 2, modifier: 'normal' as const, matchFactor: 1, pool: 'meadow' as const });

  it('commitCatch with the same ID adds one item only', () => {
    const s = new GameStore();
    s.reserveSlot();
    expect(s.commitCatch(rec('c1'))).not.toBeNull();
    expect(s.commitCatch(rec('c1'))).toBeNull();
    expect(s.state.inventory.length).toBe(1);
  });

  it('Sell All excludes favorites and pays the displayed amount once', () => {
    const s = new GameStore();
    for (const id of ['a', 'b', 'c']) s.commitCatch(rec(id));
    s.toggleFavorite('b');
    const ids = s.unlockedIds();
    const quote = s.quoteSale(ids);
    const r = s.sell(ids);
    expect(r.coins).toBe(quote.coins);
    expect(s.state.coins).toBe(quote.coins);
    expect(s.state.inventory.map((c) => c.id)).toEqual(['b']);
    const again = s.sell(ids);
    expect(again.ok).toBe(false);
    expect(s.state.coins).toBe(quote.coins);
    expect(s.state.journal.pebblefin.count).toBe(3);
  });

  it('rapid double purchase charges once and never goes negative', () => {
    const s = new GameStore();
    s.state.coins = 200;
    expect(s.buyRod('riverglass').ok).toBe(true);
    expect(s.buyRod('riverglass').ok).toBe(false);
    expect(s.state.coins).toBe(20);
    expect(s.buyUpgrade('bag').ok).toBe(false);
    expect(s.state.coins).toBe(20);
    expect(s.rodStatus('stormline')).toBe('locked');
  });

  it('pool unlocks follow the documented rules', () => {
    const s = new GameStore();
    expect(s.isPoolUnlocked('reed')).toBe(false);
    s.state.ownedRods.push('riverglass', 'coppercoil');
    for (const id of ['pebblefin', 'ribbon-minnow', 'button-carp']) s.state.journal[id] = { count: 1, maxWeight: 1, maxValue: 1, modifiers: [] };
    expect(s.isPoolUnlocked('reed')).toBe(false);
    s.state.journal['lantern-gill'] = { count: 1, maxWeight: 1, maxValue: 1, modifiers: [] };
    expect(s.isPoolUnlocked('reed')).toBe(true);
    expect(s.isPoolUnlocked('moon')).toBe(false);
  });
});

describe('saves', () => {
  it('round-trips durable state', () => {
    const s = new GameStore();
    s.state.coins = 500;
    s.buyRod('riverglass');
    s.buyUpgrade('bag');
    s.commitCatch({ id: 'c9', speciesId: 'button-carp', rarity: 'common', weight: 4, modifier: 'gilded', matchFactor: 1, pool: 'meadow' });
    s.markTutorial('firstSale');
    const out = parseSave(serializeSave(s.state));
    expect(out.kind).toBe('ok');
    if (out.kind === 'ok') {
      expect(out.data).toEqual(s.state);
      expect(out.repairs).toEqual([]);
    }
  });

  it('distinguishes missing, corrupt and unsupported saves', () => {
    expect(parseSave(null).kind).toBe('none');
    expect(parseSave('{not json').kind).toBe('corrupt');
    expect(parseSave('[1,2]').kind).toBe('corrupt');
    expect(parseSave(JSON.stringify({ version: 99 })).kind).toBe('unsupported');
  });

  it('repairs invalid fields without discarding valid data', () => {
    const d = newSave();
    const raw = JSON.parse(serializeSave(d));
    raw.coins = -5;
    raw.equippedRod = 'stormline';
    raw.upgrades.bag = 9;
    raw.inventory = [
      { id: 'a', speciesId: 'pebblefin', weight: 2, modifier: 'normal' },
      { id: 'a', speciesId: 'pebblefin', weight: 2, modifier: 'normal' },
      { id: 'b', speciesId: 'nope', weight: 2, modifier: 'normal' },
    ];
    const out = parseSave(JSON.stringify(raw));
    expect(out.kind).toBe('ok');
    if (out.kind !== 'ok') return;
    expect(out.data.coins).toBe(0);
    expect(out.data.equippedRod).toBe('driftwood');
    expect(out.data.upgrades.bag).toBe(4);
    expect(out.data.inventory.map((c) => c.id)).toEqual(['a']);
    expect(out.repairs.length).toBeGreaterThan(0);
  });

  it('raises capacity so no restored catch is lost', () => {
    const d = newSave();
    d.inventory = Array.from({ length: 10 }, (_, i) => ({ id: `i${i}`, speciesId: 'pebblefin', rarity: 'common' as const, weight: 1, modifier: 'normal' as const, matchFactor: 1, ordinal: i, pool: 'meadow' as const, favorite: false }));
    const out = parseSave(serializeSave(d));
    expect(out.kind === 'ok' && out.data.inventory.length).toBe(10);
    expect(out.kind === 'ok' && out.data.upgrades.bag).toBe(1);
  });
});

describe('pause manager', () => {
  it('closing one of two pause reasons does not resume', () => {
    const p = new PauseManager();
    p.add('USER_MENU');
    p.add('AD_REQUEST');
    p.remove('USER_MENU');
    expect(p.paused).toBe(true);
    p.remove('AD_REQUEST');
    expect(p.paused).toBe(false);
  });
});

describe('world clock', () => {
  it('day/night phases follow the 360s cycle', () => {
    expect(dayNightAt(0).phase).toBe('day');
    expect(dayNightAt(215).phase).toBe('dusk');
    expect(dayNightAt(250).isNight).toBe(true);
    expect(dayNightAt(335).phase).toBe('dawn');
    expect(dayNightAt(361).phase).toBe('day');
  });
  it('Rift Bloom schedule', () => {
    const ed = new EventDirector();
    expect(ed.info(100).phase).toBe('idle');
    expect(ed.info(230).phase).toBe('notice');
    expect(ed.info(241).phase).toBe('opening');
    expect(ed.info(250).phase).toBe('open');
    expect(ed.info(250).current).toBe('sun');
    expect(ed.info(265).current).toBe('leaf');
    expect(ed.info(320).phase).toBe('grace');
    expect(ed.info(343).phase).toBe('closing');
    expect(ed.info(350).phase).toBe('idle');
    expect(ed.info(600 + 5).phase).toBe('open');
  });
  it('grace may end early', () => {
    const ed = new EventDirector();
    ed.endGraceEarly(320);
    expect(ed.info(320.5).phase).toBe('closing');
    expect(ed.info(323).phase).toBe('idle');
  });
});
