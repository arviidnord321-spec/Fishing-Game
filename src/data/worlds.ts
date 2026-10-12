import type { PoolId, WorldId } from './types';

export interface WorldDef {
  id: WorldId;
  name: string;
  blurb: string;
  /** Pool names and lock texts in this world (pools share positions across worlds). */
  pools: Record<PoolId, { name: string; lockText: string }>;
  /** Card colours [light, dark] for the travel panel. */
  theme: [string, string];
}

export const WORLDS: WorldDef[] = [
  {
    id: 1,
    name: 'Sunny Isle',
    blurb: 'Where every angler starts. Meadow, Reed and Moon pools.',
    theme: ['#9be27a', '#2fa6c9'],
    pools: {
      meadow: { name: 'Meadow Pool', lockText: '' },
      reed: { name: 'Reed Pool', lockText: 'Own the Coppercoil rod and discover 4 Meadow species.' },
      moon: { name: 'Moon Pool', lockText: 'Own the Stormline rod and discover 4 Reed species.' },
      rift: { name: 'Rift Bloom', lockText: 'Opens during the Rift Bloom event.' },
    },
  },
  {
    id: 2,
    name: 'Starlight Atoll',
    blurb: 'A twilight island of coral, crystal and deep-sea giants.',
    theme: ['#ffb3e3', '#6a3fd6'],
    pools: {
      meadow: { name: 'Coral Lagoon', lockText: '' },
      reed: { name: 'Glimmer Pool', lockText: 'Own the Tidecrown rod and discover 4 Coral Lagoon species.' },
      moon: { name: 'Abyss Pool', lockText: 'Own the Nebulacast rod and discover 4 Glimmer Pool species.' },
      rift: { name: 'Starfall Rift', lockText: 'Opens during the Starfall event.' },
    },
  },
];
export const WORLDS_BY_ID = Object.fromEntries(WORLDS.map((w) => [w.id, w])) as Record<WorldId, WorldDef>;

/** Per-world pool unlock requirements (rod owned + species discovered in the previous pool). */
export const WORLD_POOL_UNLOCKS: Record<WorldId, Record<'reed' | 'moon', { rod: string; pool: 'meadow' | 'reed'; species: number }>> = {
  1: { reed: { rod: 'coppercoil', pool: 'meadow', species: 4 }, moon: { rod: 'stormline', pool: 'reed', species: 4 } },
  2: { reed: { rod: 'tidecrown', pool: 'meadow', species: 4 }, moon: { rod: 'nebulacast', pool: 'reed', species: 4 } },
};

export function poolName(world: WorldId, pool: PoolId): string {
  return WORLDS_BY_ID[world].pools[pool].name;
}
