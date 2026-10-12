import * as THREE from 'three';
import { POOLS_BY_ID } from '../data/balance';
import type { PoolId, WorldId } from '../data/types';
import { WORLDS_BY_ID } from '../data/worlds';
import { PALETTE } from './materials';

/**
 * Applies an island's look and pool names before the scene is built. The world is fixed for a
 * page session: travelling saves and reloads the scene around the new island.
 */
export function applyWorldTheme(world: WorldId): void {
  for (const [id, p] of Object.entries(WORLDS_BY_ID[world].pools)) {
    POOLS_BY_ID[id as PoolId].name = p.name;
    POOLS_BY_ID[id as PoolId].lockText = p.lockText;
  }
  if (world !== 2) return;
  // Starlight Atoll: a pastel twilight island — mint grass, pink sand, blossom trees
  PALETTE.daySky = new THREE.Color('#8f9dff');
  PALETTE.dayHorizon = new THREE.Color('#ffd3ec');
  PALETTE.nightSky = new THREE.Color('#1a1240');
  PALETTE.nightHorizon = new THREE.Color('#7a3f9c');
  PALETTE.grass = '#5fcfae';
  PALETTE.grassDark = '#48b597';
  PALETTE.grassBlade = '#3fae96';
  PALETTE.grassTip = '#b8ffe6';
  PALETTE.sand = '#f7c6dc';
  PALETTE.sandDark = '#dc94b8';
  PALETTE.stone = '#c4b5e6';
  PALETTE.stoneDark = '#9a88c8';
  PALETTE.wood = '#9a5f8f';
  PALETTE.woodDark = '#6f3f6a';
  PALETTE.sea = '#5a7cf0';
  PALETTE.seaNight = '#24186a';
  PALETTE.fog = '#ffd3ec';
  PALETTE.canopy = '#ff9fd0';
  PALETTE.pine = '#7a6ff0';
  PALETTE.bush = '#ffc2e6';
  PALETTE.hemiSky = '#fff0fb';
  PALETTE.hemiGround = '#5f8f9a';
  PALETTE.lamp = '#ffb3f0';
}
