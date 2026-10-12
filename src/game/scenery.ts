import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { createRng } from '../logic/rng';

/**
 * Cheap atmosphere: a ring of puffy low-poly clouds (one merged mesh, one draw call) and a
 * soft foam band where the island meets the sea (one mesh, alpha in vertex colours).
 */

const CLOUD_TOP = new THREE.Color('#ffffff');
const CLOUD_BOTTOM = new THREE.Color('#dbe9f7');

export class Clouds {
  readonly mesh: THREE.Mesh;
  private mat: THREE.MeshLambertMaterial;
  private day = new THREE.Color('#ffffff');
  private night = new THREE.Color('#58629a');

  constructor(count = 16) {
    const rng = createRng(31);
    const parts: THREE.BufferGeometry[] = [];
    const puff = new THREE.IcosahedronGeometry(1, 1);
    for (let c = 0; c < count; c++) {
      const a = (c / count) * Math.PI * 2 + rng.next() * 0.3;
      const dist = 125 + rng.next() * 70;
      const cx = Math.cos(a) * dist;
      const cz = Math.sin(a) * dist;
      const cy = 14 + rng.next() * 20;
      const size = 7 + rng.next() * 7;
      const puffs = 4 + Math.floor(rng.next() * 4);
      // cloud axis is tangent to the ring so the long side faces the island
      const tx = -Math.sin(a);
      const tz = Math.cos(a);
      for (let i = 0; i < puffs; i++) {
        const t = (i / (puffs - 1) - 0.5) * 2;
        const r = size * (0.62 + 0.4 * (1 - Math.abs(t)) + rng.next() * 0.15);
        const g = puff.clone();
        g.scale(r, r * 0.78, r);
        g.translate(cx + tx * t * size * 1.5, cy + (1 - Math.abs(t)) * size * 0.35 + rng.next() * 1.5, cz + tz * t * size * 1.5 + (rng.next() - 0.5) * size * 0.4);
        parts.push(g);
      }
      // flat base so clouds read as cartoon puffs
      const base = puff.clone();
      base.scale(size * 1.9, size * 0.32, size * 0.9);
      base.rotateY(-a);
      base.translate(cx, cy - size * 0.28, cz);
      parts.push(base);
    }
    const merged = mergeGeometries(parts.map((g) => (g.index ? g.toNonIndexed() : g)))!;
    for (const g of parts) g.dispose();
    puff.dispose();
    merged.computeVertexNormals();
    // vertical gradient: white tops, cool undersides
    const pos = merged.attributes.position;
    const col = new Float32Array(pos.count * 3);
    const tmp = new THREE.Color();
    merged.computeBoundingBox();
    for (let i = 0; i < pos.count; i += 3) {
      // per-face colour keeps the faceted look
      const y = (pos.getY(i) + pos.getY(i + 1) + pos.getY(i + 2)) / 3;
      const k = THREE.MathUtils.clamp((y - 10) / 24, 0, 1);
      tmp.copy(CLOUD_BOTTOM).lerp(CLOUD_TOP, k);
      for (let j = 0; j < 3; j++) col.set([tmp.r, tmp.g, tmp.b], (i + j) * 3);
    }
    merged.setAttribute('color', new THREE.BufferAttribute(col, 3));
    this.mat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, fog: false, emissive: new THREE.Color('#b9cfe8'), emissiveIntensity: 0.62 });
    this.mesh = new THREE.Mesh(merged, this.mat);
    this.mesh.renderOrder = -5;
    this.mesh.frustumCulled = false;
  }

  update(dt: number, night: number): void {
    this.mesh.rotation.y += dt * 0.0035;
    this.mat.color.copy(this.day).lerp(this.night, night);
    this.mat.emissiveIntensity = 0.62 - 0.5 * night;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.mat.dispose();
  }
}

/** Foam band hugging the island outline at the waterline. `outline` points are (x, z). */
export function shoreFoam(outline: THREE.Vector2[], y: number, inner = 0.2, outer = 2.6): THREE.Mesh {
  const n = outline.length;
  const pos: number[] = [];
  const col: number[] = [];
  const idx: number[] = [];
  let cx = 0;
  let cz = 0;
  for (const p of outline) {
    cx += p.x / n;
    cz += p.y / n;
  }
  for (let i = 0; i < n; i++) {
    const p = outline[i];
    const d = new THREE.Vector2(p.x - cx, p.y - cz).normalize();
    // three rings: hidden inner edge, bright foam line, transparent outer edge
    for (const [off, a] of [[inner, 0.0], [inner + 0.55, 0.85], [outer, 0]] as const) {
      pos.push(p.x + d.x * off, y, p.y + d.y * off);
      col.push(1, 1, 1, a);
    }
    if (i > 0) {
      const b = (i - 1) * 3;
      const c = i * 3;
      for (let k = 0; k < 2; k++) idx.push(b + k, c + k, b + k + 1, b + k + 1, c + k, c + k + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 4));
  g.setIndex(idx);
  const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide }));
  m.renderOrder = 1;
  return m;
}
