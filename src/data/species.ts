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
];

export const SPECIES_BY_ID: Record<string, SpeciesDef> = Object.fromEntries(SPECIES.map((s) => [s.id, s]));
