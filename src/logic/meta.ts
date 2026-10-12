import { EGGS_BY_ID, PETS, type EggId } from '../data/pets';
import type { Rarity } from '../data/types';
import { RARITIES } from '../data/types';
import { createRng, hashSeed, type Rng } from './rng';

// ------------------------------------------------------------------ levels
/** XP needed to go from `level` to `level + 1`. */
export function xpToNext(level: number): number {
  return Math.floor(40 + 30 * Math.pow(Math.max(0, level - 1), 1.35));
}

const RARITY_XP: Record<Rarity, number> = { common: 5, uncommon: 10, rare: 25, epic: 60, legendary: 150 };
export function xpForCatch(rarity: Rarity, newSpecies: boolean, xpBonus: number): number {
  return Math.round((RARITY_XP[rarity] + (newSpecies ? 25 : 0)) * (1 + xpBonus));
}

export interface Reward {
  coins?: number;
  meadowTickets?: number;
  reefTickets?: number;
  xp?: number;
}

/** Reward for reaching `level`. Every 3rd level adds an egg ticket; every 10th a Reef ticket. */
export function levelReward(level: number): Reward {
  const r: Reward = { coins: 40 * level };
  if (level % 3 === 0) r.meadowTickets = 1;
  if (level % 10 === 0) r.reefTickets = 1;
  return r;
}

// ------------------------------------------------------------------ daily
/** Local calendar day as YYYY-MM-DD (the player's own day boundary). */
export function dayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function daysBetween(a: string, b: string): number {
  const pa = a.split('-').map(Number);
  const pb = b.split('-').map(Number);
  const ta = Date.UTC(pa[0], pa[1] - 1, pa[2]);
  const tb = Date.UTC(pb[0], pb[1] - 1, pb[2]);
  return Math.round((tb - ta) / 86400000);
}

/** The 7-day reward calendar. Coins scale gently with level. */
export function dailyReward(day: number, level: number): Reward {
  const scale = 1 + 0.1 * Math.max(0, level - 1);
  const table: Reward[] = [
    { coins: 100 },
    { meadowTickets: 1 },
    { coins: 250 },
    { meadowTickets: 2 },
    { coins: 600 },
    { reefTickets: 1 },
    { coins: 1500, reefTickets: 1 },
  ];
  const r = { ...table[(day - 1) % 7] };
  if (r.coins) r.coins = Math.round(r.coins * scale);
  return r;
}

export interface DailyState {
  lastClaim: string;
  streak: number;
}

/** What claiming today would give: streak day 1–7 (resets after a missed day). */
export function dailyStatus(state: DailyState, today: string): { available: boolean; day: number } {
  if (!state.lastClaim) return { available: true, day: 1 };
  const gap = daysBetween(state.lastClaim, today);
  if (gap <= 0) return { available: false, day: ((state.streak - 1) % 7) + 1 };
  if (gap === 1) return { available: true, day: (state.streak % 7) + 1 };
  return { available: true, day: 1 };
}

// ------------------------------------------------------------------ quests
export type QuestKind = 'catch' | 'catchRare' | 'sell' | 'perfect' | 'hatch' | 'streak';
export interface Quest {
  id: string;
  kind: QuestKind;
  target: number;
  progress: number;
  claimed: boolean;
  reward: Reward;
}

export function questLabel(q: Quest): string {
  switch (q.kind) {
    case 'catch': return `Catch ${q.target} fish`;
    case 'catchRare': return `Catch ${q.target} rare-or-better fish`;
    case 'sell': return `Sell fish worth ¢${q.target.toLocaleString('en-US')}`;
    case 'perfect': return `Land ${q.target} perfect casts`;
    case 'hatch': return `Hatch ${q.target} pet${q.target > 1 ? 's' : ''}`;
    case 'streak': return `Reach a ×${q.target} catch streak`;
  }
}

/** Three quests per calendar day, deterministic from the day so reloads keep them. */
export function generateQuests(day: string, level: number): Quest[] {
  const rng = createRng(hashSeed(`quests:${day}`));
  const kinds: QuestKind[] = ['catch', 'catchRare', 'sell', 'perfect', 'hatch', 'streak'];
  // always one easy catch quest, then two distinct others
  const picks: QuestKind[] = ['catch'];
  while (picks.length < 3) {
    const k = kinds[1 + rng.int(kinds.length - 1)];
    if (!picks.includes(k)) picks.push(k);
  }
  const L = Math.max(1, level);
  return picks.map((kind, i) => {
    let target = 1;
    switch (kind) {
      case 'catch': target = 8 + rng.int(8); break;
      case 'catchRare': target = 1 + rng.int(2); break;
      case 'sell': target = Math.round((300 + 220 * L) / 50) * 50; break;
      case 'perfect': target = 3 + rng.int(4); break;
      case 'hatch': target = 1 + (L >= 8 ? rng.int(2) : 0); break;
      case 'streak': target = 5 + rng.int(2) * 5; break;
    }
    const reward: Reward = { coins: Math.round((120 + 60 * L) * (1 + i * 0.5)), xp: 30 + 10 * L };
    if (i === 2) reward.meadowTickets = 1;
    return { id: `${day}:${i}`, kind, target, progress: 0, claimed: false, reward };
  });
}

// ------------------------------------------------------------------ streak
/** Hot streak: consecutive landed fish without an escape. Multiplies catch value. */
export function streakFactor(streak: number): number {
  if (streak >= 10) return 1.3;
  if (streak >= 5) return 1.2;
  if (streak >= 3) return 1.1;
  return 1;
}

// ------------------------------------------------------------------ eggs
const RARE_PLUS: Rarity[] = ['rare', 'epic', 'legendary'];

/**
 * Roll one pet from an egg. Uses the egg's published tier odds; after PITY-1 spins without a
 * rare-or-better, the next roll is drawn only from rare-or-better tiers (same relative odds).
 */
export function rollEgg(egg: EggId, spinsSinceRare: number, pity: number, rng: Rng): { petId: string; pityUsed: boolean } {
  const def = EGGS_BY_ID[egg];
  const pool = PETS.filter((p) => p.egg === egg);
  const guaranteed = spinsSinceRare >= pity - 1;
  const tiers = RARITIES.filter((r) => (def.odds[r] ?? 0) > 0 && pool.some((p) => p.rarity === r) && (!guaranteed || RARE_PLUS.includes(r)));
  const total = tiers.reduce((s, r) => s + (def.odds[r] ?? 0), 0);
  let roll = rng.next() * total;
  let tier = tiers[tiers.length - 1];
  for (const r of tiers) {
    roll -= def.odds[r] ?? 0;
    if (roll < 0) {
      tier = r;
      break;
    }
  }
  const inTier = pool.filter((p) => p.rarity === tier);
  return { petId: inTier[rng.int(inTier.length)].id, pityUsed: guaranteed };
}

export function isRarePlus(r: Rarity): boolean {
  return RARE_PLUS.includes(r);
}
