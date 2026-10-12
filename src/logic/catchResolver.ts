import { BALANCE, MODIFIERS, MODIFIERS_BY_ID } from '../data/balance';
import { SPECIES, SPECIES_BY_ID } from '../data/species';
import type { ModifierDef, ModifierId, PermanentPoolId, PoolId, Rarity, RodDef, SpeciesDef, WorldId } from '../data/types';
import { RARITIES } from '../data/types';
import type { Rng } from './rng';

export interface CatchContext {
  pool: PoolId;
  rod: RodDef;
  castLuck: number;
  poolGrowthLevel: number;
  isNight: boolean;
  /** True while Rift Bloom accepts casts (only meaningful for the rift pool). */
  eventOpen: boolean;
  /** Permanent pools the player has unlocked; feeds the rift's species list. */
  unlockedPools: PermanentPoolId[];
  /** Pets and boosts (default 1). */
  luckMultiplier?: number;
  /** Which island the cast happens on (default 1). */
  world?: WorldId;
  /** Forces a gentle common species for the guided first catch. */
  tutorial?: boolean;
}

export interface CatchRoll {
  speciesId: string;
  rarity: Rarity;
  weight: number;
  modifier: ModifierId;
  motionSeed: number;
}

function availabilityOk(s: SpeciesDef, ctx: CatchContext): boolean {
  if (s.availability === 'night') return ctx.isNight;
  if (s.availability === 'event') return ctx.pool === 'rift' && ctx.eventOpen;
  return true;
}

/** Species that could be selected for this cast, after pool, time, event and rod filters. */
export function eligibleSpecies(ctx: CatchContext): SpeciesDef[] {
  let pools: PoolId[];
  if (ctx.pool === 'rift') {
    if (!ctx.eventOpen) return [];
    pools = [...ctx.unlockedPools, 'rift'];
  } else {
    pools = [ctx.pool];
  }
  return SPECIES.filter(
    (s) => (s.world ?? 1) === (ctx.world ?? 1) && pools.includes(s.pool) && availabilityOk(s, ctx) && s.minWeight <= ctx.rod.maxWeight,
  );
}

export function effectiveLuck(castLuck: number, poolGrowthLevel: number, pool: PoolId = 'meadow'): number {
  const rift = pool === 'rift' ? BALANCE.event.riftLuck : 1;
  return castLuck * (1 + BALANCE.poolGrowthLuckPerLevel * poolGrowthLevel) * rift;
}

/** Normalized rarity-tier probabilities over the tiers that have at least one eligible species. */
export function tierProbabilities(eligible: SpeciesDef[], luck: number): Record<Rarity, number> {
  const out = { common: 0, uncommon: 0, rare: 0, epic: 0, legendary: 0 } as Record<Rarity, number>;
  let total = 0;
  for (const r of RARITIES) {
    if (!eligible.some((s) => s.rarity === r)) continue;
    const w = BALANCE.rarityWeights[r] * Math.pow(luck, BALANCE.rarityLuckExponent[r]);
    out[r] = w;
    total += w;
  }
  if (total > 0) for (const r of RARITIES) out[r] /= total;
  return out;
}

function modifierAvailable(m: ModifierDef, ctx: CatchContext): boolean {
  if (m.availability === 'night') return ctx.isNight;
  if (m.availability === 'event') return ctx.pool === 'rift' && ctx.eventOpen;
  return true;
}

/** Modifier candidates for a species, excluding any whose minimum weight would exceed the rod cap. */
export function eligibleModifiers(species: SpeciesDef, ctx: CatchContext): ModifierDef[] {
  return MODIFIERS.filter(
    (m) => m.id === 'normal' || (modifierAvailable(m, ctx) && species.minWeight * m.weightMultiplier <= ctx.rod.maxWeight),
  );
}

function pickWeighted<T>(items: T[], weight: (t: T) => number, rng: Rng): T {
  let total = 0;
  for (const it of items) total += weight(it);
  let roll = rng.next() * total;
  for (const it of items) {
    roll -= weight(it);
    if (roll < 0) return it;
  }
  return items[items.length - 1];
}

export function resolveCatch(ctx: CatchContext, rng: Rng): CatchRoll | null {
  const eligible = eligibleSpecies(ctx);
  if (eligible.length === 0) return null;

  let species: SpeciesDef;
  if (ctx.tutorial) {
    const commons = eligible.filter((s) => s.rarity === 'common');
    species = commons.length ? commons[rng.int(commons.length)] : eligible[0];
  } else {
    const probs = tierProbabilities(eligible, effectiveLuck(ctx.castLuck, ctx.poolGrowthLevel, ctx.pool) * (ctx.luckMultiplier ?? 1));
    const tiers = RARITIES.filter((r) => probs[r] > 0);
    const tier = pickWeighted(tiers, (r) => probs[r], rng);
    const inTier = eligible.filter((s) => s.rarity === tier);
    species = inTier[rng.int(inTier.length)];
  }

  const mods = ctx.tutorial ? [MODIFIERS_BY_ID.normal] : eligibleModifiers(species, ctx);
  const mod = pickWeighted(mods, (m) => m.sampleWeight, rng);

  const cap = ctx.rod.maxWeight;
  const hi = Math.max(species.minWeight, Math.min(species.maxWeight, cap / mod.weightMultiplier));
  const base = rng.range(species.minWeight, hi);
  let weight = Math.round(base * mod.weightMultiplier * 10) / 10;
  if (weight > cap) weight = Math.floor(cap * 10) / 10;

  return {
    speciesId: species.id,
    rarity: species.rarity,
    weight,
    modifier: mod.id,
    motionSeed: (rng.next() * 4294967296) >>> 0,
  };
}

export function saleValue(
  speciesId: string,
  weight: number,
  modifier: ModifierId,
  sellValueLevel: number,
  matchFactor: number,
  bonus = 1,
): number {
  const s = SPECIES_BY_ID[speciesId];
  const m = MODIFIERS_BY_ID[modifier];
  if (!s || !m) return 0;
  return Math.floor(
    s.baseValue *
      Math.sqrt(weight / s.minWeight) *
      m.valueMultiplier *
      (1 + BALANCE.sellValuePerLevel * sellValueLevel) *
      matchFactor *
      bonus,
  );
}
