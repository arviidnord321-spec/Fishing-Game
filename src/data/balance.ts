import type { ModifierDef, PoolDef, Rarity, RodDef, UpgradeTrack } from './types';

/** Central tuning file. Every number here is a designed default, see BALANCING.md. */
export const BALANCE = {
  sim: { step: 1 / 60, maxStepsPerFrame: 6, backgroundGapSeconds: 0.5 },
  movement: { maxSpeed: 5.2, accel: 24, decel: 32, radius: 0.32, turnRateDeg: 600 },
  cast: {
    cycleSeconds: 1.8,
    idealMin: 0.86,
    idealMax: 0.96,
    maxHoldSeconds: 6,
    flightSeconds: 0.45,
    bandInner: 0.35,
    bandOuter: 2.0,
  },
  bite: { waitMin: 1.2, waitMax: 2.5, tutorialWait: 1.0, window: 1.8, assistWindow: 2.5 },
  reel: {
    baseWindow: 0.28,
    assistWindowBonus: 0.1,
    holdSpeed: 0.62,
    releaseSpeed: 0.48,
    startProgress: 0.2,
    outsideDrain: 0.07,
    slackGain: 1,
    slackRecover: 1.8,
    slackLimit: 2.5,
    assistSlackLimit: 3.5,
    maxFightSeconds: 18,
    velocitySmoothing: 0.14,
    burstTelegraph: 0.25,
  },
  escapeSeconds: 0.65,
  reveal: { normal: 1.5, special: 2.2, continueAfter: 0.65 },
  rarityWeights: { common: 65, uncommon: 24, rare: 9, epic: 1.8, legendary: 0.2 } as Record<Rarity, number>,
  rarityLuckExponent: { common: 0, uncommon: 0.35, rare: 0.65, epic: 1, legendary: 1 } as Record<Rarity, number>,
  poolGrowthLuckPerLevel: 0.08,
  poolGrowthRadiusPerLevel: 0.35,
  sellValuePerLevel: 0.1,
  matchFactor: 1.1,
  dayNight: { day: 210, dusk: 30, night: 90, dawn: 30 },
  event: {
    firstStart: 240,
    interval: 360,
    notice: 15,
    opening: 2,
    open: 75,
    grace: 25,
    closing: 2,
    currentSwap: 20,
  },
  startingBag: 8,
  cosmeticCost: 300,
};

export const RODS: RodDef[] = [
  { id: 'driftwood', name: 'Driftwood', cost: 0, maxWeight: 10, reelSpeed: 1.0, windowBonus: 0, color: '#8a5a33', accent: '#d7b48a', blurb: 'A sturdy stick with a dream.' },
  { id: 'riverglass', name: 'Riverglass', cost: 180, maxWeight: 25, reelSpeed: 1.1, windowBonus: 0.01, color: '#4fc6d8', accent: '#e4fbff', blurb: 'Clear resin, smooth reel.' },
  { id: 'coppercoil', name: 'Coppercoil', cost: 900, maxWeight: 80, reelSpeed: 1.22, windowBonus: 0.02, color: '#c87b3e', accent: '#ffd29b', blurb: 'Coiled copper handles real weight.' },
  { id: 'stormline', name: 'Stormline', cost: 3200, maxWeight: 180, reelSpeed: 1.35, windowBonus: 0.03, color: '#5160c9', accent: '#ffe066', blurb: 'Charged line for heavy fighters.' },
  { id: 'starweaver', name: 'Starweaver', cost: 9500, maxWeight: 500, reelSpeed: 1.5, windowBonus: 0.04, color: '#2a2f5e', accent: '#ffd76e', blurb: 'Woven from night-sky thread.' },
  { id: 'riftcaller', name: 'Riftcaller', cost: 26000, maxWeight: 1200, reelSpeed: 1.65, windowBonus: 0.05, color: '#8a3cd1', accent: '#ff8be0', blurb: 'Hums when a portal is near.' },
];
export const RODS_BY_ID: Record<string, RodDef> = Object.fromEntries(RODS.map((r) => [r.id, r]));

export const MODIFIERS: ModifierDef[] = [
  { id: 'normal', name: 'Normal', sampleWeight: 90, availability: 'always', weightMultiplier: 1, valueMultiplier: 1, visualScale: 1 },
  { id: 'gilded', name: 'Gilded', sampleWeight: 5, availability: 'always', weightMultiplier: 1, valueMultiplier: 1.5, visualScale: 1 },
  { id: 'moonlit', name: 'Moonlit', sampleWeight: 5, availability: 'night', weightMultiplier: 1, valueMultiplier: 1.4, visualScale: 1 },
  { id: 'giant', name: 'Giant', sampleWeight: 15, availability: 'event', weightMultiplier: 1.5, valueMultiplier: 1.6, visualScale: 1.35 },
  { id: 'prismatic', name: 'Prismatic', sampleWeight: 4, availability: 'event', weightMultiplier: 1, valueMultiplier: 2, visualScale: 1 },
];
export const MODIFIERS_BY_ID = Object.fromEntries(MODIFIERS.map((m) => [m.id, m])) as Record<string, ModifierDef>;

export interface UpgradeDef {
  id: UpgradeTrack;
  name: string;
  costs: number[];
  describe: (level: number) => string;
}

export const BAG_CAPACITY = [8, 12, 18, 26, 36];

export const UPGRADES: UpgradeDef[] = [
  {
    id: 'poolGrowth',
    name: 'Meadow Pool growth',
    costs: [150, 450, 1200, 3000],
    describe: (l) => `Luck ×${(1 + BALANCE.poolGrowthLuckPerLevel * l).toFixed(2)} at all pools · Meadow radius ${(3.2 + BALANCE.poolGrowthRadiusPerLevel * l).toFixed(2)} m`,
  },
  {
    id: 'sellValue',
    name: 'Sale value',
    costs: [200, 700, 2000, 6000],
    describe: (l) => `+${Math.round(l * BALANCE.sellValuePerLevel * 100)}% sale value`,
  },
  {
    id: 'bag',
    name: 'Bag capacity',
    costs: [120, 400, 1100, 3000],
    describe: (l) => `${BAG_CAPACITY[l]} slots`,
  },
];
export const UPGRADES_BY_ID = Object.fromEntries(UPGRADES.map((u) => [u.id, u])) as Record<UpgradeTrack, UpgradeDef>;

export const POOLS: PoolDef[] = [
  { id: 'meadow', name: 'Meadow Pool', x: 0, z: 4, radius: 3.2, lockText: '' },
  { id: 'reed', name: 'Reed Pool', x: -18, z: -7, radius: 4.5, lockText: 'Own the Coppercoil rod and discover 4 Meadow species.' },
  { id: 'moon', name: 'Moon Pool', x: 18, z: -9, radius: 5.5, lockText: 'Own the Stormline rod and discover 4 Reed species.' },
  { id: 'rift', name: 'Rift Bloom', x: 0, z: -16, radius: 7.5, lockText: 'Opens during the Rift Bloom event.' },
];
export const POOLS_BY_ID = Object.fromEntries(POOLS.map((p) => [p.id, p])) as Record<string, PoolDef>;

export const LANDMARKS = {
  stand: { x: -8, z: 8 },
  workshop: { x: 8, z: 8 },
  plinth: { x: 6, z: 13.5 },
  wardrobe: { x: -6, z: 13.5 },
};

export const RARITY_LABEL: Record<Rarity, string> = {
  common: 'Common',
  uncommon: 'Uncommon',
  rare: 'Rare',
  epic: 'Epic',
  legendary: 'Legendary',
};

export const RARITY_COLOR: Record<Rarity, string> = {
  common: '#cfd8dc',
  uncommon: '#7ee081',
  rare: '#4fc3ff',
  epic: '#c38bff',
  legendary: '#ffc94d',
};

/** Shape glyph for each rarity so color is never the only signal. */
export const RARITY_GLYPH: Record<Rarity, string> = {
  common: '●',
  uncommon: '◆',
  rare: '★',
  epic: '✦',
  legendary: '♛',
};

export const LURES = [
  { id: 'sun', name: 'Sun', glyph: '●', color: '#ffc94d' },
  { id: 'leaf', name: 'Leaf', glyph: '▲', color: '#6fdc7a' },
  { id: 'moon', name: 'Moon', glyph: '☾', color: '#b9a8ff' },
] as const;

export const BOBBERS = [
  { id: 'classic', name: 'Classic', top: '#ff4d4d', bottom: '#ffffff', cost: 0 },
  { id: 'sunburst', name: 'Sunburst', top: '#ffb000', bottom: '#fff4c2', cost: BALANCE.cosmeticCost },
] as const;
