import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { PETS } from '../src/data/pets';
import { meshCount, triangleCount } from '../src/game/petKit';
import { animatePet, buildPet, disposeModel, hasPetModel } from '../src/game/petModels';

const EXPECTED_IDS = [
  'sprout-puff', 'pebble-pup', 'bumble-bun', 'mossling', 'glow-moth', 'tidal-fox',
  'coral-crab', 'ripple-otter', 'lantern-jelly', 'kelp-drake', 'prism-ray', 'tide-dragon',
  'comet-kit', 'nebula-owl', 'star-whalelet', 'aurora-phoenix', 'moon-seraph', 'rift-wyrm',
];

describe('pet models', () => {
  it('keeps the 18 pet ids and gives each its own model', () => {
    expect(PETS.map((p) => p.id)).toEqual(EXPECTED_IDS);
    for (const id of EXPECTED_IDS) expect(hasPetModel(id), id).toBe(true);
  });

  it.each(EXPECTED_IDS)('%s stays within the triangle and draw-call budget', (id) => {
    const g = buildPet(id);
    expect(g.userData.pet).toBe(id);
    expect(triangleCount(g)).toBeLessThanOrEqual(4200);
    expect(meshCount(g)).toBeLessThanOrEqual(10);
    for (const part of ['body', 'head', 'eyes']) expect(g.getObjectByName(part), `${id} ${part}`).toBeTruthy();
    disposeModel(g);
  });

  it('animates without drifting away from the rest pose', () => {
    for (const id of EXPECTED_IDS) {
      const g = buildPet(id);
      const body = g.getObjectByName('body')!;
      const rest = body.position.clone();
      for (let i = 0; i < 300; i++) animatePet(g, i / 60, i < 150 ? 1 : 0, false, 1 / 60);
      animatePet(g, 5, 0, true, 1 / 60);
      g.traverse((o) => {
        for (const v of [o.position.x, o.position.y, o.position.z, o.rotation.x, o.rotation.y, o.rotation.z, o.scale.y]) expect(Number.isFinite(v), id).toBe(true);
      });
      expect(body.position.distanceTo(rest)).toBeLessThan(0.06);
      disposeModel(g);
    }
  });

  it('disposes its own baked geometry', () => {
    const g = buildPet('lantern-jelly');
    let disposed = 0;
    g.traverse((o) => {
      if (o instanceof THREE.Mesh && o.name === 'baked') o.geometry.addEventListener('dispose', () => disposed++);
    });
    disposeModel(g);
    expect(disposed).toBe(meshCount(g));
  });
});
