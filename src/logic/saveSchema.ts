import { BAG_CAPACITY, BOBBERS, MODIFIERS_BY_ID, RODS, RODS_BY_ID, UPGRADES_BY_ID } from '../data/balance';
import { SPECIES_BY_ID } from '../data/species';
import { BOOSTS, EGGS, PET_MAX_LEVEL, PET_SLOT_COSTS, PETS_BY_ID, type BoostId, type EggId } from '../data/pets';
import type { CatchRecord, LureId, ModifierId, PoolId, UpgradeTrack } from '../data/types';
import type { DailyState, Quest, QuestKind } from './meta';

export const SAVE_VERSION = 2;

export interface JournalEntry {
  count: number;
  maxWeight: number;
  maxValue: number;
  modifiers: ModifierId[];
}

export interface Settings {
  master: number;
  music: number;
  sfx: number;
  quality: 'auto' | 'low' | 'medium' | 'high';
  showFps: boolean;
  reducedMotion: boolean;
  assist: boolean;
  bindings: Record<string, string>;
}

export interface TutorialFlags {
  firstCast: boolean;
  firstCatch: boolean;
  firstSale: boolean;
  firstPurchase: boolean;
  skipped: boolean;
}

export interface SaveData {
  version: number;
  coins: number;
  ownedRods: string[];
  equippedRod: string;
  upgrades: Record<UpgradeTrack, number>;
  inventory: CatchRecord[];
  journal: Record<string, JournalEntry>;
  bestCatch: { speciesId: string; weight: number; modifier: ModifierId } | null;
  tutorial: TutorialFlags;
  settings: Settings;
  playtime: number;
  /** Active simulation seconds; drives the day/night cycle and Rift Bloom schedule. */
  worldClock: number;
  lure: LureId;
  luresUnlocked: boolean;
  bobbers: string[];
  equippedBobber: string;
  nextTx: number;
  nextOrdinal: number;
  announcedPools: PoolId[];
  totalCoinsEarned: number;
  // ---- v2: meta progression ----
  xp: number;
  level: number;
  tickets: Record<'meadow' | 'reef', number>;
  /** Owned pets → level (1–5). */
  pets: Record<string, number>;
  equippedPets: string[];
  petSlots: number;
  /** Spins since the last rare-or-better, per egg (pity counter). */
  eggPity: Record<EggId, number>;
  eggsOpened: number;
  daily: DailyState;
  quests: { day: string; list: Quest[] };
  /** Boost expiry, in active-play seconds (compared with `playtime`). */
  boosts: Record<BoostId, number>;
  streak: number;
  bestStreak: number;
  totalCaught: number;
}

export const DEFAULT_BINDINGS: Record<string, string> = {
  up: 'KeyW',
  down: 'KeyS',
  left: 'KeyA',
  right: 'KeyD',
  action: 'Space',
  interact: 'KeyE',
  bag: 'KeyB',
  journal: 'KeyJ',
  pause: 'KeyP',
  cancel: 'KeyX',
};

export function defaultSettings(): Settings {
  return { master: 0.8, music: 0.5, sfx: 0.8, quality: 'auto', showFps: false, reducedMotion: false, assist: false, bindings: { ...DEFAULT_BINDINGS } };
}

export function newSave(): SaveData {
  return {
    version: SAVE_VERSION,
    coins: 0,
    ownedRods: ['driftwood'],
    equippedRod: 'driftwood',
    upgrades: { poolGrowth: 0, sellValue: 0, bag: 0 },
    inventory: [],
    journal: {},
    bestCatch: null,
    tutorial: { firstCast: false, firstCatch: false, firstSale: false, firstPurchase: false, skipped: false },
    settings: defaultSettings(),
    playtime: 0,
    worldClock: 0,
    lure: 'sun',
    luresUnlocked: false,
    bobbers: ['classic'],
    equippedBobber: 'classic',
    nextTx: 1,
    nextOrdinal: 1,
    announcedPools: ['meadow'],
    totalCoinsEarned: 0,
    xp: 0,
    level: 1,
    tickets: { meadow: 0, reef: 0 },
    pets: {},
    equippedPets: [],
    petSlots: 1,
    eggPity: { meadow: 0, reef: 0, star: 0 },
    eggsOpened: 0,
    daily: { lastClaim: '', streak: 0 },
    quests: { day: '', list: [] },
    boosts: { coinRush: 0, luckyCharm: 0, quickReel: 0 },
    streak: 0,
    bestStreak: 0,
    totalCaught: 0,
  };
}

export type LoadOutcome =
  | { kind: 'none' }
  | { kind: 'ok'; data: SaveData; repairs: string[] }
  | { kind: 'corrupt'; reason: string }
  | { kind: 'unsupported'; version: number };

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const finiteNonNegInt = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.floor(v) : null;
const num = (v: unknown, lo: number, hi: number, d: number): number =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d;

/** Applies forward migrations. Only v1 exists; the hook keeps the pattern explicit. */
function migrate(raw: Record<string, unknown>): Record<string, unknown> {
  const v = typeof raw.version === 'number' ? raw.version : 0;
  if (v < 1) {
    // Pre-release prototype saves had no version field; treat them as v1 shapes.
    raw.version = 1;
  }
  if ((raw.version as number) < 2) {
    // v1 → v2: meta progression fields start at their defaults (filled in by parseSave);
    // existing catches had no bonus factor.
    raw.version = 2;
  }
  return raw;
}

/**
 * Parses and validates a serialized save. Recoverable problems are repaired and listed;
 * the caller decides what to tell the player. Never throws.
 */
export function parseSave(rawText: string | null): LoadOutcome {
  if (rawText === null || rawText === '') return { kind: 'none' };
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    return { kind: 'corrupt', reason: 'Save data is not valid JSON.' };
  }
  if (!isObj(parsed)) return { kind: 'corrupt', reason: 'Save data has an unexpected shape.' };
  if (typeof parsed.version === 'number' && parsed.version > SAVE_VERSION) {
    return { kind: 'unsupported', version: parsed.version };
  }
  const raw = migrate(parsed);
  const repairs: string[] = [];
  const d = newSave();

  const coins = finiteNonNegInt(raw.coins);
  if (coins === null) {
    if (raw.coins !== undefined) repairs.push('coins');
  } else d.coins = coins;

  if (Array.isArray(raw.ownedRods)) {
    const owned = raw.ownedRods.filter((r): r is string => typeof r === 'string' && !!RODS_BY_ID[r]);
    d.ownedRods = Array.from(new Set(['driftwood', ...owned]));
    if (owned.length !== raw.ownedRods.length) repairs.push('ownedRods');
  }
  if (typeof raw.equippedRod === 'string' && d.ownedRods.includes(raw.equippedRod)) d.equippedRod = raw.equippedRod;
  else if (raw.equippedRod !== undefined) repairs.push('equippedRod');

  if (isObj(raw.upgrades)) {
    for (const k of ['poolGrowth', 'sellValue', 'bag'] as UpgradeTrack[]) {
      const lvl = finiteNonNegInt(raw.upgrades[k]);
      const max = UPGRADES_BY_ID[k].costs.length;
      if (lvl === null) continue;
      if (lvl > max) repairs.push(`upgrades.${k}`);
      d.upgrades[k] = Math.min(max, lvl);
    }
  }

  if (Array.isArray(raw.inventory)) {
    const seen = new Set<string>();
    for (const it of raw.inventory) {
      if (!isObj(it)) continue;
      const sp = typeof it.speciesId === 'string' ? SPECIES_BY_ID[it.speciesId] : undefined;
      const id = typeof it.id === 'string' ? it.id : '';
      const mod = typeof it.modifier === 'string' && MODIFIERS_BY_ID[it.modifier] ? (it.modifier as ModifierId) : null;
      const w = typeof it.weight === 'number' && Number.isFinite(it.weight) ? it.weight : NaN;
      if (!sp || !id || seen.has(id) || !mod || !(w > 0) || w > 5000) {
        repairs.push('inventory item');
        continue;
      }
      seen.add(id);
      d.inventory.push({
        id,
        speciesId: sp.id,
        rarity: sp.rarity,
        weight: Math.round(w * 10) / 10,
        modifier: mod,
        matchFactor: it.matchFactor === 1.1 ? 1.1 : 1,
        bonus: num(it.bonus, 1, 20, 1),
        ordinal: finiteNonNegInt(it.ordinal) ?? 0,
        pool: (typeof it.pool === 'string' ? it.pool : sp.pool) as PoolId,
        favorite: it.favorite === true,
      });
    }
  }
  // Capacity must hold every restored catch; never drop catches to fit.
  while (BAG_CAPACITY[d.upgrades.bag] < d.inventory.length && d.upgrades.bag < BAG_CAPACITY.length - 1) {
    d.upgrades.bag++;
    repairs.push('bag capacity raised to fit catches');
  }

  if (isObj(raw.journal)) {
    for (const [k, v] of Object.entries(raw.journal)) {
      if (!SPECIES_BY_ID[k] || !isObj(v)) continue;
      d.journal[k] = {
        count: finiteNonNegInt(v.count) ?? 1,
        maxWeight: num(v.maxWeight, 0, 5000, 0),
        maxValue: finiteNonNegInt(v.maxValue) ?? 0,
        modifiers: Array.isArray(v.modifiers)
          ? (v.modifiers.filter((m) => typeof m === 'string' && MODIFIERS_BY_ID[m]) as ModifierId[])
          : [],
      };
    }
  }
  if (isObj(raw.bestCatch) && typeof raw.bestCatch.speciesId === 'string' && SPECIES_BY_ID[raw.bestCatch.speciesId]) {
    const m = raw.bestCatch.modifier;
    d.bestCatch = {
      speciesId: raw.bestCatch.speciesId,
      weight: num(raw.bestCatch.weight, 0, 5000, 0),
      modifier: typeof m === 'string' && MODIFIERS_BY_ID[m] ? (m as ModifierId) : 'normal',
    };
  }
  if (isObj(raw.tutorial)) {
    for (const k of Object.keys(d.tutorial) as (keyof TutorialFlags)[]) d.tutorial[k] = raw.tutorial[k] === true;
  }
  if (isObj(raw.settings)) {
    const s = raw.settings;
    d.settings.master = num(s.master, 0, 1, d.settings.master);
    d.settings.music = num(s.music, 0, 1, d.settings.music);
    d.settings.sfx = num(s.sfx, 0, 1, d.settings.sfx);
    if (s.quality === 'auto' || s.quality === 'low' || s.quality === 'medium' || s.quality === 'high') d.settings.quality = s.quality;
    d.settings.showFps = s.showFps === true;
    d.settings.reducedMotion = s.reducedMotion === true;
    d.settings.assist = s.assist === true;
    if (isObj(s.bindings)) {
      for (const k of Object.keys(DEFAULT_BINDINGS)) {
        const b = s.bindings[k];
        if (typeof b === 'string' && b.length > 0 && b.length < 32) d.settings.bindings[k] = b;
      }
    }
  }
  d.playtime = num(raw.playtime, 0, 1e9, 0);
  d.worldClock = num(raw.worldClock, 0, 1e9, 0);
  if (raw.lure === 'sun' || raw.lure === 'leaf' || raw.lure === 'moon') d.lure = raw.lure;
  d.luresUnlocked = raw.luresUnlocked === true;
  if (Array.isArray(raw.bobbers)) {
    const valid = raw.bobbers.filter((b): b is string => typeof b === 'string' && BOBBERS.some((x) => x.id === b));
    d.bobbers = Array.from(new Set(['classic', ...valid]));
  }
  if (typeof raw.equippedBobber === 'string' && d.bobbers.includes(raw.equippedBobber)) d.equippedBobber = raw.equippedBobber;
  d.nextTx = Math.max(1, finiteNonNegInt(raw.nextTx) ?? 1);
  d.nextOrdinal = Math.max(1, finiteNonNegInt(raw.nextOrdinal) ?? 1, ...d.inventory.map((c) => c.ordinal + 1));
  if (Array.isArray(raw.announcedPools)) {
    d.announcedPools = raw.announcedPools.filter((p): p is PoolId => p === 'meadow' || p === 'reed' || p === 'moon');
    if (!d.announcedPools.includes('meadow')) d.announcedPools.unshift('meadow');
  }
  d.totalCoinsEarned = finiteNonNegInt(raw.totalCoinsEarned) ?? 0;

  // ---- v2 fields ----
  d.xp = finiteNonNegInt(raw.xp) ?? 0;
  d.level = Math.max(1, Math.min(999, finiteNonNegInt(raw.level) ?? 1));
  if (isObj(raw.tickets)) {
    d.tickets.meadow = Math.min(999, finiteNonNegInt(raw.tickets.meadow) ?? 0);
    d.tickets.reef = Math.min(999, finiteNonNegInt(raw.tickets.reef) ?? 0);
  }
  if (isObj(raw.pets)) {
    for (const [id, lvl] of Object.entries(raw.pets)) {
      const l = finiteNonNegInt(lvl);
      if (PETS_BY_ID[id] && l !== null && l >= 1) d.pets[id] = Math.min(PET_MAX_LEVEL, l);
      else repairs.push('pet');
    }
  }
  d.petSlots = Math.max(1, Math.min(1 + PET_SLOT_COSTS.length, finiteNonNegInt(raw.petSlots) ?? 1));
  if (Array.isArray(raw.equippedPets)) {
    d.equippedPets = Array.from(new Set(raw.equippedPets.filter((p): p is string => typeof p === 'string' && !!d.pets[p]))).slice(0, d.petSlots);
  }
  if (isObj(raw.eggPity)) for (const e of EGGS) d.eggPity[e.id] = Math.min(1000, finiteNonNegInt(raw.eggPity[e.id]) ?? 0);
  d.eggsOpened = finiteNonNegInt(raw.eggsOpened) ?? 0;
  if (isObj(raw.daily) && typeof raw.daily.lastClaim === 'string' && /^\d{4}-\d{2}-\d{2}$|^$/.test(raw.daily.lastClaim)) {
    d.daily = { lastClaim: raw.daily.lastClaim, streak: finiteNonNegInt(raw.daily.streak) ?? 0 };
  }
  if (isObj(raw.quests) && typeof raw.quests.day === 'string' && Array.isArray(raw.quests.list)) {
    const kinds: QuestKind[] = ['catch', 'catchRare', 'sell', 'perfect', 'hatch', 'streak'];
    const list: Quest[] = [];
    for (const q of raw.quests.list) {
      if (!isObj(q) || typeof q.id !== 'string' || !kinds.includes(q.kind as QuestKind) || !isObj(q.reward)) continue;
      list.push({
        id: q.id,
        kind: q.kind as QuestKind,
        target: Math.max(1, finiteNonNegInt(q.target) ?? 1),
        progress: finiteNonNegInt(q.progress) ?? 0,
        claimed: q.claimed === true,
        reward: (() => {
          const r: Quest['reward'] = {};
          const c = finiteNonNegInt(q.reward.coins);
          const x = finiteNonNegInt(q.reward.xp);
          const mt = finiteNonNegInt(q.reward.meadowTickets);
          const rt = finiteNonNegInt(q.reward.reefTickets);
          if (c) r.coins = c;
          if (x) r.xp = x;
          if (mt) r.meadowTickets = Math.min(5, mt);
          if (rt) r.reefTickets = Math.min(5, rt);
          return r;
        })(),
      });
    }
    d.quests = { day: raw.quests.day, list: list.slice(0, 3) };
  }
  if (isObj(raw.boosts)) for (const b of BOOSTS) d.boosts[b.id] = num(raw.boosts[b.id], 0, 1e9, 0);
  d.streak = finiteNonNegInt(raw.streak) ?? 0;
  d.bestStreak = finiteNonNegInt(raw.bestStreak) ?? 0;
  d.totalCaught = finiteNonNegInt(raw.totalCaught) ?? 0;

  return { kind: 'ok', data: d, repairs };
}

export function serializeSave(d: SaveData): string {
  return JSON.stringify(d);
}

/** Every rod that may be bought next: the first unowned rod in ladder order. */
export function nextBuyableRodIndex(owned: string[]): number {
  return RODS.findIndex((r) => !owned.includes(r.id));
}
