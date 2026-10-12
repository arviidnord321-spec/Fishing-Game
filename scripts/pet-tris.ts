/** Dev tool: per-pet triangle and draw-call counts (`npx vite-node scripts/pet-tris.ts [--detail]`). */
import * as THREE from 'three';
import { PETS } from '../src/data/pets';
import { buildPet, buildPetRaw } from '../src/game/petModels';
import { meshCount, triangleCount } from '../src/game/petKit';

const detail = !!(globalThis as { process?: { argv: string[] } }).process?.argv.includes('--detail');
let total = 0;
for (const p of PETS) {
  const g = buildPet(p.id);
  const t = triangleCount(g);
  total += t;
  let line = `${p.id.padEnd(15)} ${String(t).padStart(5)} tris ${String(meshCount(g)).padStart(2)} meshes`;
  if (detail) {
    const by: Record<string, [number, number]> = {};
    buildPetRaw(p.id).traverse((o) => {
      if (!(o instanceof THREE.Mesh)) return;
      const k = o.geometry.type.replace('Geometry', '');
      const n = (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3;
      by[k] ??= [0, 0];
      by[k][0] += n;
      by[k][1]++;
    });
    line += ' | ' + Object.entries(by).map(([k, [n, c]]) => `${k} ${c}x=${n}`).join(' ');
  }
  console.log(line);
}
console.log('avg', Math.round(total / PETS.length));
