import type { Rarity } from './types';

/** What a pet multiplies. Bonuses from equipped pets add together per type. */
export type PetBonus = 'coins' | 'luck' | 'reel' | 'xp';

export type PetBody = 'round' | 'long' | 'tall';
export type PetFeature =
  | 'catEars'
  | 'bunnyEars'
  | 'beeWings'
  | 'mothWings'
  | 'birdWings'
  | 'horn'
  | 'antlers'
  | 'leaf'
  | 'foxTail'
  | 'fishTail'
  | 'flame'
  | 'shell'
  | 'claws'
  | 'tentacles'
  | 'halo'
  | 'stars'
  | 'crest'
  | 'whiskers';

export interface PetDef {
  id: string;
  name: string;
  egg: EggId;
  rarity: Rarity;
  bonus: PetBonus;
  /** Bonus at level 1, as a fraction (0.1 = +10%). */
  base: number;
  body: PetBody;
  color: string;
  belly: string;
  accent: string;
  features: PetFeature[];
}

export type EggId = 'meadow' | 'reef' | 'star';

export interface EggDef {
  id: EggId;
  name: string;
  cost: number;
  /** Player level needed before this egg can be opened. */
  level: number;
  /** Tier weights (percent). Shown to players exactly as written. */
  odds: Partial<Record<Rarity, number>>;
  shell: string;
  spots: string;
  blurb: string;
}

export const EGGS: EggDef[] = [
  { id: 'meadow', name: 'Meadow Egg', cost: 300, level: 1, odds: { common: 60, uncommon: 28, rare: 10, epic: 2 }, shell: '#bff0a8', spots: '#62c46a', blurb: 'Soft and warm. Hatches island critters.' },
  { id: 'reef', name: 'Reef Egg', cost: 2500, level: 5, odds: { common: 50, uncommon: 30, rare: 15, epic: 4.5, legendary: 0.5 }, shell: '#9ee8f0', spots: '#2f9fc2', blurb: 'Smells like the sea. Hatches water spirits.' },
  { id: 'star', name: 'Star Egg', cost: 15000, level: 12, odds: { uncommon: 45, rare: 35, epic: 17, legendary: 3 }, shell: '#cdb8ff', spots: '#ffd76e', blurb: 'Hums at night. Hatches sky legends.' },
];
export const EGGS_BY_ID = Object.fromEntries(EGGS.map((e) => [e.id, e])) as Record<EggId, EggDef>;

export const PETS: PetDef[] = [
  // ---- Meadow Egg ----
  { id: 'sprout-puff', name: 'Sprout Puff', egg: 'meadow', rarity: 'common', bonus: 'coins', base: 0.05, body: 'round', color: '#9be27a', belly: '#e9ffd8', accent: '#4fae4a', features: ['leaf'] },
  { id: 'pebble-pup', name: 'Pebble Pup', egg: 'meadow', rarity: 'common', bonus: 'luck', base: 0.05, body: 'round', color: '#b9b2a6', belly: '#ece6dc', accent: '#7d756a', features: ['catEars', 'foxTail'] },
  { id: 'bumble-bun', name: 'Bumble Bun', egg: 'meadow', rarity: 'uncommon', bonus: 'reel', base: 0.08, body: 'round', color: '#ffd23f', belly: '#fff3c4', accent: '#3a2a1a', features: ['bunnyEars', 'beeWings'] },
  { id: 'mossling', name: 'Mossling', egg: 'meadow', rarity: 'uncommon', bonus: 'xp', base: 0.1, body: 'tall', color: '#6fae5a', belly: '#cfe9b8', accent: '#3d7a35', features: ['antlers', 'leaf'] },
  { id: 'glow-moth', name: 'Glow Moth', egg: 'meadow', rarity: 'rare', bonus: 'coins', base: 0.15, body: 'tall', color: '#f6e7b0', belly: '#fffbe8', accent: '#ffb63d', features: ['mothWings', 'whiskers'] },
  { id: 'tidal-fox', name: 'Tidal Fox', egg: 'meadow', rarity: 'epic', bonus: 'luck', base: 0.25, body: 'long', color: '#4fc6d8', belly: '#e4fbff', accent: '#ffffff', features: ['catEars', 'foxTail', 'crest'] },
  // ---- Reef Egg ----
  { id: 'coral-crab', name: 'Coral Crab', egg: 'reef', rarity: 'common', bonus: 'coins', base: 0.12, body: 'round', color: '#ff7b6b', belly: '#ffd9cf', accent: '#c44a3c', features: ['claws', 'shell'] },
  { id: 'ripple-otter', name: 'Ripple Otter', egg: 'reef', rarity: 'common', bonus: 'reel', base: 0.12, body: 'long', color: '#a8774f', belly: '#f1d8bd', accent: '#6b4a2e', features: ['whiskers', 'fishTail'] },
  { id: 'lantern-jelly', name: 'Lantern Jelly', egg: 'reef', rarity: 'uncommon', bonus: 'luck', base: 0.15, body: 'tall', color: '#ff9de2', belly: '#ffe6f7', accent: '#ffd0f2', features: ['tentacles', 'halo'] },
  { id: 'kelp-drake', name: 'Kelp Drake', egg: 'reef', rarity: 'rare', bonus: 'coins', base: 0.25, body: 'long', color: '#3fae7a', belly: '#c9f2d8', accent: '#ffd23f', features: ['horn', 'birdWings', 'fishTail'] },
  { id: 'prism-ray', name: 'Prism Ray', egg: 'reef', rarity: 'epic', bonus: 'reel', base: 0.35, body: 'long', color: '#7ee0c9', belly: '#ffffff', accent: '#ff7ad9', features: ['fishTail', 'stars', 'crest'] },
  { id: 'tide-dragon', name: 'Tide Dragon', egg: 'reef', rarity: 'legendary', bonus: 'coins', base: 0.6, body: 'long', color: '#2f62c9', belly: '#bfe6ff', accent: '#6ff3ff', features: ['horn', 'birdWings', 'fishTail', 'crest', 'stars'] },
  // ---- Star Egg ----
  { id: 'comet-kit', name: 'Comet Kit', egg: 'star', rarity: 'uncommon', bonus: 'luck', base: 0.2, body: 'round', color: '#ffb36b', belly: '#fff0dc', accent: '#ffe066', features: ['catEars', 'flame'] },
  { id: 'nebula-owl', name: 'Nebula Owl', egg: 'star', rarity: 'rare', bonus: 'xp', base: 0.35, body: 'tall', color: '#5a4fb5', belly: '#cbbfff', accent: '#ffd76e', features: ['birdWings', 'catEars', 'stars'] },
  { id: 'star-whalelet', name: 'Star Whalelet', egg: 'star', rarity: 'rare', bonus: 'luck', base: 0.3, body: 'round', color: '#28315e', belly: '#9fb0e6', accent: '#ffd76e', features: ['fishTail', 'stars'] },
  { id: 'aurora-phoenix', name: 'Aurora Phoenix', egg: 'star', rarity: 'epic', bonus: 'coins', base: 0.5, body: 'tall', color: '#ff6a3d', belly: '#ffd27a', accent: '#ff7ad9', features: ['birdWings', 'flame', 'crest'] },
  { id: 'moon-seraph', name: 'Moon Seraph', egg: 'star', rarity: 'legendary', bonus: 'luck', base: 0.6, body: 'tall', color: '#f3efff', belly: '#ffffff', accent: '#b9a8ff', features: ['mothWings', 'halo', 'stars'] },
  { id: 'rift-wyrm', name: 'Rift Wyrm', egg: 'star', rarity: 'legendary', bonus: 'coins', base: 1.0, body: 'long', color: '#7a3cc9', belly: '#ffb6f2', accent: '#ff7a3d', features: ['horn', 'birdWings', 'flame', 'stars'] },
];
export const PETS_BY_ID = Object.fromEntries(PETS.map((p) => [p.id, p])) as Record<string, PetDef>;

export const PET_MAX_LEVEL = 5;
/** Duplicates level a pet up; each level adds 25% of its base bonus. */
export function petBonusAt(pet: PetDef, level: number): number {
  return pet.base * (1 + 0.25 * (Math.min(PET_MAX_LEVEL, Math.max(1, level)) - 1));
}
/** Spins without a rare-or-better before one is guaranteed. Shown in the shop. */
export const PITY = 10;
/** Coins refunded for a duplicate of a max-level pet. */
export const DUPLICATE_REFUND = 0.4;

export const PET_SLOT_COSTS = [1500, 8000]; // slot 2, slot 3

export const BONUS_LABEL: Record<PetBonus, string> = { coins: 'catch value', luck: 'luck', reel: 'reel speed', xp: 'XP' };
export const BONUS_ICON: Record<PetBonus, string> = { coins: '¢', luck: '☘', reel: '⟳', xp: '★' };

export type BoostId = 'coinRush' | 'luckyCharm' | 'quickReel';
export interface BoostDef {
  id: BoostId;
  name: string;
  /** Active-play seconds. */
  seconds: number;
  baseCost: number;
  perLevel: number;
  describe: string;
}
export const BOOSTS: BoostDef[] = [
  { id: 'coinRush', name: 'Coin Rush', seconds: 300, baseCost: 200, perLevel: 60, describe: '×2 value on fish you catch' },
  { id: 'luckyCharm', name: 'Lucky Charm', seconds: 300, baseCost: 150, perLevel: 50, describe: '×2 luck on every cast' },
  { id: 'quickReel', name: 'Quick Reel', seconds: 300, baseCost: 120, perLevel: 40, describe: '+40% reel speed' },
];
export const BOOSTS_BY_ID = Object.fromEntries(BOOSTS.map((b) => [b.id, b])) as Record<BoostId, BoostDef>;
