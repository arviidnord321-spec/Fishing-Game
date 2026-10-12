import type { SpeciesDef } from './types';

// All values are designed starting values (see BALANCING.md); none are measured from the reference.
export const SPECIES: SpeciesDef[] = [
  // ---- Meadow Pool ----
  {
    id: 'pebblefin', name: 'Pebblefin', pool: 'meadow', rarity: 'common', minWeight: 1, maxWeight: 3, baseValue: 18,
    fightSeconds: 5, availability: 'always', hint: 'Meadow Pool, any time.', modelScale: 0.9,
    body: { color: '#7f9bb0', belly: '#d9e4ea', fin: '#5c7487', length: 1, height: 0.62, width: 0.5 }, features: ['spots'],
  },
  {
    id: 'ribbon-minnow', name: 'Ribbon Minnow', pool: 'meadow', rarity: 'common', minWeight: 2, maxWeight: 5, baseValue: 24,
    fightSeconds: 5, availability: 'always', hint: 'Meadow Pool, any time.', modelScale: 1.0,
    body: { color: '#ff8fab', belly: '#ffe0e8', fin: '#ff5d8a', length: 1.1, height: 0.42, width: 0.34 }, features: ['ribbons'],
  },
  {
    id: 'button-carp', name: 'Button Carp', pool: 'meadow', rarity: 'common', minWeight: 3, maxWeight: 8, baseValue: 30,
    fightSeconds: 5.5, availability: 'always', hint: 'Meadow Pool, any time.', modelScale: 1.05,
    body: { color: '#f2b54a', belly: '#fff0c8', fin: '#d98a2b', length: 1, height: 0.8, width: 0.6 }, features: ['buttons'],
  },
  {
    id: 'lantern-gill', name: 'Lantern Gill', pool: 'meadow', rarity: 'uncommon', minWeight: 4, maxWeight: 12, baseValue: 55,
    fightSeconds: 6, availability: 'always', hint: 'Meadow Pool. A little luck helps.', modelScale: 1.1,
    body: { color: '#3c5a8c', belly: '#9fb6dd', fin: '#2b406a', length: 1.1, height: 0.7, width: 0.52 }, features: ['lantern'],
  },
  {
    id: 'mossback', name: 'Mossback Turtlefish', pool: 'meadow', rarity: 'uncommon', minWeight: 8, maxWeight: 20, baseValue: 80,
    fightSeconds: 6, availability: 'always', hint: 'Meadow Pool. Heavy for a starter rod.', modelScale: 1.2,
    body: { color: '#6f9a4a', belly: '#d8e6b4', fin: '#4d7232', length: 1, height: 0.62, width: 0.8 }, features: ['shell'],
  },
  {
    id: 'bubble-ram', name: 'Bubble Ram', pool: 'meadow', rarity: 'rare', minWeight: 16, maxWeight: 35, baseValue: 160,
    fightSeconds: 7, availability: 'always', hint: 'Meadow Pool. Needs a rod rated 16 kg+.', modelScale: 1.35,
    body: { color: '#9ad7f2', belly: '#eefaff', fin: '#b7f0ff', length: 1, height: 0.82, width: 0.7 }, features: ['horns'],
  },
  // ---- Reed Pool ----
  {
    id: 'reed-skipper', name: 'Reed Skipper', pool: 'reed', rarity: 'common', minWeight: 8, maxWeight: 18, baseValue: 60,
    fightSeconds: 5.5, availability: 'always', hint: 'Reed Pool, any time.', modelScale: 1.15,
    body: { color: '#b9c86a', belly: '#f3f5d2', fin: '#8aa04a', length: 1.25, height: 0.42, width: 0.38 }, features: ['wings'],
  },
  {
    id: 'spiral-perch', name: 'Spiral Perch', pool: 'reed', rarity: 'uncommon', minWeight: 12, maxWeight: 28, baseValue: 95,
    fightSeconds: 6, availability: 'always', hint: 'Reed Pool, any time.', modelScale: 1.2,
    body: { color: '#e46f4a', belly: '#ffe1cf', fin: '#b84a2c', length: 1.05, height: 0.7, width: 0.5 }, features: ['spiral'],
  },
  {
    id: 'copper-catfish', name: 'Copper Catfish', pool: 'reed', rarity: 'uncommon', minWeight: 20, maxWeight: 45, baseValue: 135,
    fightSeconds: 6.5, availability: 'always', hint: 'Reed Pool. Needs a rod rated 20 kg+.', modelScale: 1.4,
    body: { color: '#c3793f', belly: '#f0caa0', fin: '#93522a', length: 1.35, height: 0.5, width: 0.62 }, features: ['whiskers'],
  },
  {
    id: 'sailtail', name: 'Sailtail', pool: 'reed', rarity: 'rare', minWeight: 35, maxWeight: 80, baseValue: 240,
    fightSeconds: 7, availability: 'always', hint: 'Reed Pool. Rare; needs 35 kg+.', modelScale: 1.5,
    body: { color: '#4fb3a9', belly: '#d7f5f0', fin: '#f6d860', length: 1.2, height: 0.55, width: 0.42 }, features: ['sail'],
  },
  {
    id: 'crown-koi', name: 'Crown Koi', pool: 'reed', rarity: 'rare', minWeight: 50, maxWeight: 100, baseValue: 340,
    fightSeconds: 7.5, availability: 'always', hint: 'Reed Pool. Rare; needs 50 kg+.', modelScale: 1.6,
    body: { color: '#fafafa', belly: '#ffffff', fin: '#ff6a3d', length: 1.15, height: 0.62, width: 0.5 }, features: ['crown', 'spots'],
  },
  {
    id: 'driftback-ray', name: 'Driftback Ray', pool: 'reed', rarity: 'epic', minWeight: 85, maxWeight: 160, baseValue: 700,
    fightSeconds: 8.5, availability: 'always', hint: 'Reed Pool. Epic; needs an 85 kg+ rod.', modelScale: 1.9,
    body: { color: '#5b6fb5', belly: '#e1e6ff', fin: '#3e4f8d', length: 1, height: 0.22, width: 1.2 }, features: ['ray'],
  },
  // ---- Moon Pool ----
  {
    id: 'moon-guppy', name: 'Moon Guppy', pool: 'moon', rarity: 'common', minWeight: 25, maxWeight: 45, baseValue: 110,
    fightSeconds: 5.5, availability: 'always', hint: 'Moon Pool, any time.', modelScale: 1.3,
    body: { color: '#c7b8ff', belly: '#f3efff', fin: '#fff2a8', length: 1, height: 0.62, width: 0.48 }, features: ['crescent'],
  },
  {
    id: 'cloud-eel', name: 'Cloud Eel', pool: 'moon', rarity: 'uncommon', minWeight: 45, maxWeight: 90, baseValue: 210,
    fightSeconds: 6.5, availability: 'always', hint: 'Moon Pool. Needs 45 kg+.', modelScale: 1.9,
    body: { color: '#eef4ff', belly: '#ffffff', fin: '#a9c7ff', length: 1, height: 0.3, width: 0.3 }, features: ['eel'],
  },
  {
    id: 'prism-puffer', name: 'Prism Puffer', pool: 'moon', rarity: 'rare', minWeight: 80, maxWeight: 150, baseValue: 400,
    fightSeconds: 7.5, availability: 'always', hint: 'Moon Pool. Rare; needs 80 kg+.', modelScale: 1.6,
    body: { color: '#7ee0c9', belly: '#e8fff8', fin: '#ff9de2', length: 0.9, height: 0.9, width: 0.9 }, features: ['puffer'],
  },
  {
    id: 'comet-marlin', name: 'Comet Marlin', pool: 'moon', rarity: 'epic', minWeight: 130, maxWeight: 260, baseValue: 900,
    fightSeconds: 8.5, availability: 'night', hint: 'Moon Pool at night only. Needs 130 kg+.', modelScale: 2.3,
    body: { color: '#2f3d8a', belly: '#c9d6ff', fin: '#ffcf5a', length: 1.45, height: 0.48, width: 0.38 }, features: ['spear', 'sail'],
  },
  {
    id: 'observatory-whale', name: 'Observatory Whale', pool: 'moon', rarity: 'legendary', minWeight: 250, maxWeight: 500, baseValue: 1800,
    fightSeconds: 10, availability: 'night', hint: 'Moon Pool at night only. Legendary; needs 250 kg+.', modelScale: 2.9,
    body: { color: '#28315e', belly: '#9fb0e6', fin: '#ffd76e', length: 1.4, height: 0.7, width: 0.75 }, features: ['whale'],
  },
  // ---- Rift Bloom ----
  {
    id: 'rift-leviathan', name: 'Rift Leviathan', pool: 'rift', rarity: 'legendary', minWeight: 450, maxWeight: 850, baseValue: 3000,
    fightSeconds: 11, availability: 'event', hint: 'Only during Rift Bloom. Legendary; needs 450 kg+.', modelScale: 3.3,
    body: { color: '#7a3cc9', belly: '#ffb6f2', fin: '#ff7a3d', length: 1, height: 0.45, width: 0.45 }, features: ['serpent', 'horns'],
  },
  // ======== Starlight Atoll (world 2) ========
  {
    id: 'coral-guppy', name: 'Coral Guppy', world: 2, pool: 'meadow', rarity: 'common', minWeight: 120, maxWeight: 300, baseValue: 420,
    fightSeconds: 6, availability: 'always', hint: 'Coral Lagoon, any time.', modelScale: 1.3,
    body: { color: '#ff8a7a', belly: '#ffe1da', fin: '#ff5f6e', length: 1.0, height: 0.6, width: 0.5 }, features: ['spots'],
  },
  {
    id: 'bubblebeak', name: 'Bubblebeak', world: 2, pool: 'meadow', rarity: 'common', minWeight: 150, maxWeight: 380, baseValue: 480,
    fightSeconds: 6, availability: 'always', hint: 'Coral Lagoon, any time.', modelScale: 1.35,
    body: { color: '#7fd8ff', belly: '#e6f9ff', fin: '#ffb3e3', length: 1.1, height: 0.5, width: 0.42 }, features: ['spear'],
  },
  {
    id: 'sandsifter', name: 'Sandsifter', world: 2, pool: 'meadow', rarity: 'common', minWeight: 200, maxWeight: 480, baseValue: 560,
    fightSeconds: 6.5, availability: 'always', hint: 'Coral Lagoon, any time.', modelScale: 1.4,
    body: { color: '#f3c48a', belly: '#fff3dc', fin: '#e0905a', length: 1.0, height: 0.7, width: 0.6 }, features: ['whiskers', 'buttons'],
  },
  {
    id: 'lumen-tetra', name: 'Lumen Tetra', world: 2, pool: 'meadow', rarity: 'uncommon', minWeight: 300, maxWeight: 700, baseValue: 900,
    fightSeconds: 7, availability: 'always', hint: 'Coral Lagoon. A little luck helps.', modelScale: 1.45,
    body: { color: '#6a7cff', belly: '#d6dcff', fin: '#7ff3ff', length: 1.1, height: 0.62, width: 0.45 }, features: ['lantern', 'ribbons'],
  },
  {
    id: 'pearl-puffer', name: 'Pearl Puffer', world: 2, pool: 'meadow', rarity: 'uncommon', minWeight: 400, maxWeight: 900, baseValue: 1200,
    fightSeconds: 7, availability: 'always', hint: 'Coral Lagoon. Heavy for a Riftcaller.', modelScale: 1.5,
    body: { color: '#f6f0ff', belly: '#ffffff', fin: '#c9b8ff', length: 1.0, height: 0.9, width: 0.9 }, features: ['puffer'],
  },
  {
    id: 'reefking-grouper', name: 'Reefking Grouper', world: 2, pool: 'meadow', rarity: 'rare', minWeight: 1250, maxWeight: 1900, baseValue: 2600,
    fightSeconds: 8, availability: 'always', hint: 'Coral Lagoon. Needs a Coralspire (1,250 kg+).', modelScale: 1.9,
    body: { color: '#d9524a', belly: '#ffd2b8', fin: '#ffcf4a', length: 1.1, height: 0.8, width: 0.7 }, features: ['crown', 'spots'],
  },
  {
    id: 'glass-eel', name: 'Glass Eel', world: 2, pool: 'reed', rarity: 'common', minWeight: 600, maxWeight: 1200, baseValue: 1500,
    fightSeconds: 7, availability: 'always', hint: 'Glimmer Pool, any time.', modelScale: 1.7,
    body: { color: '#bff6ff', belly: '#ffffff', fin: '#7fe9ff', length: 1.0, height: 0.32, width: 0.3 }, features: ['eel'],
  },
  {
    id: 'prism-angelfish', name: 'Prism Angelfish', world: 2, pool: 'reed', rarity: 'uncommon', minWeight: 900, maxWeight: 1800, baseValue: 2400,
    fightSeconds: 7.5, availability: 'always', hint: 'Glimmer Pool, any time.', modelScale: 1.7,
    body: { color: '#ff9de2', belly: '#fff0fa', fin: '#7ff3ff', length: 0.9, height: 1.0, width: 0.35 }, features: ['sail', 'wings'],
  },
  {
    id: 'twinkle-ray', name: 'Twinkle Ray', world: 2, pool: 'reed', rarity: 'uncommon', minWeight: 1100, maxWeight: 2200, baseValue: 3000,
    fightSeconds: 8, availability: 'always', hint: 'Glimmer Pool. Glides near the bottom.', modelScale: 1.9,
    body: { color: '#5fd3c0', belly: '#e9fffa', fin: '#ffd76e', length: 1.0, height: 0.3, width: 1.0 }, features: ['ray'],
  },
  {
    id: 'opal-koi', name: 'Opal Koi', world: 2, pool: 'reed', rarity: 'rare', minWeight: 1500, maxWeight: 3000, baseValue: 5000,
    fightSeconds: 8.5, availability: 'always', hint: 'Glimmer Pool. Needs 1,500 kg+.', modelScale: 2.0,
    body: { color: '#fff5e8', belly: '#ffffff', fin: '#ff9a6b', length: 1.1, height: 0.6, width: 0.5 }, features: ['crown', 'ribbons'],
  },
  {
    id: 'crystal-swordfish', name: 'Crystal Swordfish', world: 2, pool: 'reed', rarity: 'rare', minWeight: 2000, maxWeight: 3400, baseValue: 6500,
    fightSeconds: 9, availability: 'always', hint: 'Glimmer Pool. Needs a Tidecrown (2,000 kg+).', modelScale: 2.2,
    body: { color: '#9fd8ff', belly: '#eef9ff', fin: '#c9b8ff', length: 1.4, height: 0.5, width: 0.4 }, features: ['spear', 'sail'],
  },
  {
    id: 'aurora-manta', name: 'Aurora Manta', world: 2, pool: 'reed', rarity: 'epic', minWeight: 2600, maxWeight: 3400, baseValue: 12000,
    fightSeconds: 9.5, availability: 'night', hint: 'Glimmer Pool at night. Epic; needs 2,600 kg+.', modelScale: 2.6,
    body: { color: '#6a3fd6', belly: '#ffd6f5', fin: '#7ff3ff', length: 1.0, height: 0.3, width: 1.2 }, features: ['ray', 'crescent'],
  },
  {
    id: 'lantern-angler', name: 'Lantern Angler', world: 2, pool: 'moon', rarity: 'common', minWeight: 2500, maxWeight: 4000, baseValue: 5000,
    fightSeconds: 8.5, availability: 'always', hint: 'Abyss Pool, any time.', modelScale: 2.1,
    body: { color: '#2a2f5a', belly: '#6f7ab0', fin: '#ffd23f', length: 1.0, height: 0.8, width: 0.7 }, features: ['lantern', 'whiskers'],
  },
  {
    id: 'void-squid', name: 'Void Squid', world: 2, pool: 'moon', rarity: 'uncommon', minWeight: 3000, maxWeight: 5000, baseValue: 8000,
    fightSeconds: 9, availability: 'always', hint: 'Abyss Pool. Pulls hard.', modelScale: 2.3,
    body: { color: '#3a1a6a', belly: '#b48bff', fin: '#ff7ad9', length: 1.1, height: 0.6, width: 0.6 }, features: ['spiral', 'ribbons'],
  },
  {
    id: 'gloom-serpent', name: 'Gloom Serpent', world: 2, pool: 'moon', rarity: 'rare', minWeight: 4000, maxWeight: 6000, baseValue: 14000,
    fightSeconds: 10, availability: 'night', hint: 'Abyss Pool at night. Needs a Nebulacast.', modelScale: 2.8,
    body: { color: '#1f6a5a', belly: '#9ff0d0', fin: '#ff7a3d', length: 1.0, height: 0.42, width: 0.42 }, features: ['serpent'],
  },
  {
    id: 'comet-coelacanth', name: 'Comet Coelacanth', world: 2, pool: 'moon', rarity: 'epic', minWeight: 4500, maxWeight: 6000, baseValue: 22000,
    fightSeconds: 10, availability: 'always', hint: 'Abyss Pool. Epic; needs 4,500 kg+.', modelScale: 2.7,
    body: { color: '#3c5a9c', belly: '#cfe0ff', fin: '#ffd76e', length: 1.2, height: 0.7, width: 0.55 }, features: ['horns', 'spots'],
  },
  {
    id: 'abyssal-titan', name: 'Abyssal Titan', world: 2, pool: 'moon', rarity: 'legendary', minWeight: 6200, maxWeight: 9500, baseValue: 45000,
    fightSeconds: 11, availability: 'night', hint: 'Abyss Pool at night. Legendary; needs a Starforged.', modelScale: 3.2,
    body: { color: '#141a3a', belly: '#5f6fd0', fin: '#7ff3ff', length: 1.4, height: 0.75, width: 0.8 }, features: ['whale', 'lantern'],
  },
  {
    id: 'starfall-leviathan', name: 'Starfall Leviathan', world: 2, pool: 'rift', rarity: 'legendary', minWeight: 8000, maxWeight: 10000, baseValue: 80000,
    fightSeconds: 12, availability: 'event', hint: 'Only during Starfall. Legendary; needs 8,000 kg+.', modelScale: 3.6,
    body: { color: '#ffd23f', belly: '#fff6cf', fin: '#ff7ad9', length: 1.0, height: 0.45, width: 0.45 }, features: ['serpent', 'crown'],
  },
];

export const SPECIES_BY_ID: Record<string, SpeciesDef> = Object.fromEntries(SPECIES.map((s) => [s.id, s]));

/** Species that live in a world (world 1 has no `world` field). */
export function speciesIn(world: 1 | 2): SpeciesDef[] {
  return SPECIES.filter((s) => (s.world ?? 1) === world);
}
