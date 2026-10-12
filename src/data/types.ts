export type Rarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';
export const RARITIES: Rarity[] = ['common', 'uncommon', 'rare', 'epic', 'legendary'];

export type PermanentPoolId = 'meadow' | 'reed' | 'moon';
export type PoolId = PermanentPoolId | 'rift';
export type Availability = 'always' | 'night' | 'event';
export type ModifierId = 'normal' | 'gilded' | 'moonlit' | 'giant' | 'prismatic';
export type LureId = 'sun' | 'leaf' | 'moon';
export type UpgradeTrack = 'poolGrowth' | 'sellValue' | 'bag';

/** Visual feature flags used by the procedural fish builder. */
export type FishFeature =
  | 'spots'
  | 'ribbons'
  | 'buttons'
  | 'lantern'
  | 'shell'
  | 'horns'
  | 'wings'
  | 'spiral'
  | 'whiskers'
  | 'sail'
  | 'crown'
  | 'ray'
  | 'crescent'
  | 'eel'
  | 'puffer'
  | 'spear'
  | 'whale'
  | 'serpent';

export interface SpeciesDef {
  id: string;
  name: string;
  pool: PoolId;
  rarity: Rarity;
  minWeight: number;
  maxWeight: number;
  baseValue: number;
  fightSeconds: number;
  availability: Availability;
  hint: string;
  /** Base model length in world units for the reveal (independent of kg). */
  modelScale: number;
  body: { color: string; belly: string; fin: string; length: number; height: number; width: number };
  features: FishFeature[];
}

export interface RodDef {
  id: string;
  name: string;
  cost: number;
  maxWeight: number;
  reelSpeed: number;
  windowBonus: number;
  color: string;
  accent: string;
  blurb: string;
}

export interface ModifierDef {
  id: ModifierId;
  name: string;
  sampleWeight: number;
  availability: Availability;
  weightMultiplier: number;
  valueMultiplier: number;
  visualScale: number;
}

export interface PoolDef {
  id: PoolId;
  name: string;
  x: number;
  z: number;
  radius: number;
  /** Plain-language unlock explanation for the lock sign. */
  lockText: string;
}

/** Immutable catch record stored in the bag. Sale value is computed at sale time. */
export interface CatchRecord {
  id: string;
  speciesId: string;
  rarity: Rarity;
  weight: number;
  modifier: ModifierId;
  matchFactor: number;
  /** Pets, boosts and hot streak locked in when the fish was landed (≥ 1). */
  bonus: number;
  ordinal: number;
  pool: PoolId;
  favorite: boolean;
}
