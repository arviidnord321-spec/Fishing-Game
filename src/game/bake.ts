import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const vcMaterial = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });

function prepared(mesh: THREE.Mesh, matrix: THREE.Matrix4, color?: THREE.Color): THREE.BufferGeometry {
  let g = mesh.geometry.clone();
  if (g.index) g = g.toNonIndexed();
  g.applyMatrix4(matrix);
  for (const name of Object.keys(g.attributes)) if (name !== 'position' && name !== 'normal' && name !== 'uv') g.deleteAttribute(name);
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
  if (color) {
    const n = g.attributes.position.count;
    const c = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) c.set([color.r, color.g, color.b], i * 3);
    g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  }
  return g;
}

function bakeable(o: THREE.Object3D): o is THREE.Mesh {
  if (!(o instanceof THREE.Mesh) || o instanceof THREE.InstancedMesh) return false;
  const m = o.material;
  return m instanceof THREE.MeshLambertMaterial && !m.transparent && !m.map && !m.vertexColors;
}

/**
 * Replaces the direct mesh children of `group` with one vertex-colored mesh (keeps sub-groups,
 * which may animate). Cuts draw calls for characters built from many primitives.
 */
export function bakeChildrenByColor(group: THREE.Object3D): void {
  const meshes = group.children.filter(bakeable);
  if (meshes.length < 2) return;
  const geos = meshes.map((m) => {
    m.updateMatrix();
    return prepared(m, m.matrix, (m.material as THREE.MeshLambertMaterial).color);
  });
  // remember each source mesh's vertex range so parts can be recolored later
  const ranges: { start: number; count: number }[] = [];
  let start = 0;
  for (const g of geos) {
    ranges.push({ start, count: g.attributes.position.count });
    start += g.attributes.position.count;
  }
  const merged = mergeGeometries(geos);
  for (const g of geos) g.dispose();
  if (!merged) return;
  for (const m of meshes) group.remove(m);
  const baked = new THREE.Mesh(merged, vcMaterial);
  baked.userData.ranges = ranges;
  baked.name = 'baked';
  group.add(baked);
}

/** Recolor the `part`-th original mesh inside a group baked by bakeChildrenByColor. */
export function recolorBakedPart(group: THREE.Object3D, part: number, color: string): void {
  const baked = group.children.find((c) => c.name === 'baked') as THREE.Mesh | undefined;
  const range = baked?.userData.ranges?.[part] as { start: number; count: number } | undefined;
  if (!baked || !range) return;
  const attr = baked.geometry.attributes.color as THREE.BufferAttribute;
  const c = new THREE.Color(color);
  for (let i = range.start; i < range.start + range.count; i++) attr.setXYZ(i, c.r, c.g, c.b);
  attr.needsUpdate = true;
}

/** Merges every static mesh under `root` (world space) into one mesh per material. */
export function bakeStatic(root: THREE.Object3D, scene: THREE.Object3D): void {
  root.updateMatrixWorld(true);
  const byMat = new Map<THREE.Material, THREE.BufferGeometry[]>();
  const keep: THREE.Object3D[] = [];
  root.traverse((o) => {
    if (o === root) return;
    if (o instanceof THREE.Mesh && !(o instanceof THREE.InstancedMesh) && !Array.isArray(o.material)) {
      const list = byMat.get(o.material) ?? [];
      list.push(prepared(o, o.matrixWorld));
      byMat.set(o.material, list);
    } else if (!(o instanceof THREE.Group) && !(o instanceof THREE.Mesh)) keep.push(o);
  });
  for (const [mat, geos] of byMat) {
    const merged = mergeGeometries(geos);
    for (const g of geos) g.dispose();
    if (!merged) continue;
    const mesh = new THREE.Mesh(merged, mat);
    mesh.renderOrder = (mat as THREE.Material).transparent ? 1 : 0;
    scene.add(mesh);
  }
  scene.remove(root);
}
