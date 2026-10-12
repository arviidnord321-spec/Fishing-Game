import * as THREE from 'three';
import type { Rng } from '../logic/rng';
import { PALETTE } from './materials';

/** Shared wind state for every swaying material (one uniform update per frame). */
export const WIND = {
  uTime: { value: 0 },
  /** 0 disables sway (low quality); 1 is normal. */
  uWind: { value: 1 },
};

/**
 * Adds a cheap vertex-shader sway to a (possibly instanced) Lambert material. Vertices sway more
 * the higher they are above `base`, so roots stay planted. Phase varies per instance position,
 * which reads as gusts rolling across the island.
 */
export function applyWind(mat: THREE.Material, base: number, amp: number): void {
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = WIND.uTime;
    shader.uniforms.uWind = WIND.uWind;
    shader.vertexShader =
      'uniform float uTime;\nuniform float uWind;\n' +
      shader.vertexShader.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        #ifdef USE_INSTANCING
          vec3 windOrigin = instanceMatrix[3].xyz;
        #else
          vec3 windOrigin = vec3(0.0);
        #endif
        float windH = max(0.0, position.y - (${base.toFixed(3)}));
        float windK = windH * windH * ${amp.toFixed(4)} * uWind;
        float gust = sin(uTime * 1.6 + windOrigin.x * 0.31 + windOrigin.z * 0.23);
        float flutter = sin(uTime * 4.3 + windOrigin.x * 1.7 + windOrigin.z * 1.3) * 0.35;
        transformed.x += (gust + flutter) * windK;
        transformed.z += (gust * 0.6 - flutter) * windK * 0.6;`,
      );
  };
  mat.customProgramCacheKey = () => `wind:${base}:${amp}`;
}

/**
 * Grass terrain: soft sunlit and lush patches plus fine mottling, painted once into a small
 * canvas texture at boot and mapped across the island top (one texture fetch per pixel, so it
 * costs almost nothing on weak GPUs). Island top UVs are world x / -z in metres.
 */
export function terrainMaterial(color: string, halfW: number, halfH: number): THREE.MeshLambertMaterial {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const g = canvas.getContext('2d')!;
  const img = g.createImageData(size, size);
  const hash = (x: number, y: number) => {
    const v = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
    return v - Math.floor(v);
  };
  const noise = (x: number, y: number) => {
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    const fx = x - ix;
    const fy = y - iy;
    const ux = fx * fx * (3 - 2 * fx);
    const uy = fy * fy * (3 - 2 * fy);
    const a = hash(ix, iy);
    const b = hash(ix + 1, iy);
    const c = hash(ix, iy + 1);
    const d = hash(ix + 1, iy + 1);
    return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
  };
  const base = new THREE.Color(color);
  const w = halfW * 2;
  const h = halfH * 2;
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      // pixel -> metres
      const mx = (px / size) * w - halfW;
      const mz = (py / size) * h - halfH;
      const big = noise(mx * 0.075, mz * 0.075) * 0.65 + noise(mx * 0.19 + 7, mz * 0.19 + 3) * 0.35;
      const fine = noise(mx * 1.3 + 11, mz * 1.3 + 5);
      const k = Math.min(1, Math.max(0, (big - 0.3) / 0.45));
      const t = k * k * (3 - 2 * k);
      const edge = Math.hypot(mx / halfW, mz / halfH);
      const edgeDark = 1 - Math.min(1, Math.max(0, (edge - 0.85) / 0.2)) * 0.12;
      const m = (0.91 + 0.16 * fine) * edgeDark;
      const r = base.r * (0.7 + (1.2 - 0.7) * t) * m;
      const gg = base.g * (0.88 + (1.12 - 0.88) * t) * m;
      const b = base.b * (0.7 + (0.82 - 0.7) * t) * m;
      const i = (py * size + px) * 4;
      // canvas stores sRGB; convert from the linear working color
      img.data[i] = Math.round(Math.min(1, lin2srgb(r)) * 255);
      img.data[i + 1] = Math.round(Math.min(1, lin2srgb(gg)) * 255);
      img.data[i + 2] = Math.round(Math.min(1, lin2srgb(b)) * 255);
      img.data[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  // shape-space uv (x, -z) in metres -> [0, 1]
  tex.repeat.set(1 / w, -1 / h);
  tex.offset.set(0.5, 0.5);
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  // no anisotropic filtering: the patches are soft, and it is costly on weak GPUs
  tex.anisotropy = 1;
  return new THREE.MeshLambertMaterial({ map: tex });
}

function lin2srgb(c: number): number {
  return c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
}

/** One tuft: five tapered blades with a dark base and a light tip, fanned around the origin. */
function tuftGeometry(): THREE.BufferGeometry {
  const pos: number[] = [];
  const col: number[] = [];
  const base = new THREE.Color(PALETTE.grassBlade);
  const tip = new THREE.Color(PALETTE.grassTip);
  const blades = 5;
  for (let i = 0; i < blades; i++) {
    const a = (i / blades) * Math.PI * 2 + i * 0.7;
    const h = 0.2 + (i % 3) * 0.06;
    const w = 0.06;
    const lean = 0.07 + (i % 2) * 0.05;
    const cx = Math.cos(a) * 0.05;
    const cz = Math.sin(a) * 0.05;
    const px = -Math.sin(a) * w;
    const pz = Math.cos(a) * w;
    pos.push(cx - px, 0, cz - pz, cx + px, 0, cz + pz, cx + Math.cos(a) * lean, h, cz + Math.sin(a) * lean);
    col.push(base.r, base.g, base.b, base.r, base.g, base.b, tip.r, tip.g, tip.b);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  // Point normals up so both faces light like the ground they grow from.
  const n = g.attributes.normal as THREE.BufferAttribute;
  for (let i = 0; i < n.count; i++) n.setXYZ(i, 0, 1, 0);
  return g;
}

/**
 * Clustered grass split into spatial chunks (one InstancedMesh each) so the renderer can
 * frustum-cull the patches behind or beside the camera.
 */
export class GrassField {
  readonly group = new THREE.Group();
  private chunks: { mesh: THREE.InstancedMesh; placed: number }[] = [];
  private geo = tuftGeometry();
  private mat: THREE.MeshLambertMaterial;
  private wanted = Infinity;
  private total = 0;

  constructor(private max: number, private cell = 14) {
    this.mat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
    applyWind(this.mat, 0, 0.9);
  }

  /**
   * Scatter tufts in clusters (meadow patches) plus a light sprinkle of singles.
   * `ok` rejects points on paths, water, buildings and outside the island.
   */
  scatter(rng: Rng, ok: (x: number, z: number) => boolean, area: { a: number; b: number }): void {
    for (const c of this.chunks) {
      c.mesh.dispose();
      this.group.remove(c.mesh);
    }
    this.chunks = [];
    const buckets = new Map<string, { m: THREE.Matrix4; c: THREE.Color }[]>();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();
    const p = new THREE.Vector3();
    const e = new THREE.Euler();
    let n = 0;
    let guard = 0;
    while (n < this.max && guard++ < this.max * 6) {
      const ang = rng.next() * Math.PI * 2;
      const rr = Math.sqrt(rng.next());
      const cx = Math.cos(ang) * area.a * rr;
      const cz = Math.sin(ang) * area.b * rr;
      const single = rng.next() < 0.18;
      const size = single ? 1 : 12 + rng.int(28);
      const spread = 0.5 + rng.next() * 1.4;
      const hue = rng.next();
      for (let k = 0; k < size && n < this.max; k++) {
        // gaussian-ish cluster around the center
        const x = cx + (rng.next() + rng.next() + rng.next() - 1.5) * spread;
        const z = cz + (rng.next() + rng.next() + rng.next() - 1.5) * spread;
        if (!ok(x, z)) continue;
        const sc = 0.6 + rng.next() * 0.5;
        p.set(x, 0, z);
        q.setFromEuler(e.set(0, rng.next() * Math.PI * 2, 0));
        s.set(sc, sc * (0.8 + rng.next() * 0.5), sc);
        const key = `${Math.floor(x / this.cell)},${Math.floor(z / this.cell)}`;
        const list = buckets.get(key) ?? [];
        // per-cluster hue drift: deeper greens to yellow-greens
        list.push({ m: new THREE.Matrix4().compose(p, q, s), c: new THREE.Color(0.85 + hue * 0.2, 0.95 + rng.next() * 0.1, 0.8 + (1 - hue) * 0.15) });
        buckets.set(key, list);
        n++;
      }
    }
    this.total = n;
    for (const list of buckets.values()) {
      const mesh = new THREE.InstancedMesh(this.geo, this.mat, list.length);
      list.forEach((it, i) => {
        mesh.setMatrixAt(i, it.m);
        mesh.setColorAt(i, it.c);
      });
      mesh.computeBoundingSphere();
      // sway can push blades a little past their rest bounds
      if (mesh.boundingSphere) mesh.boundingSphere.radius += 0.5;
      this.chunks.push({ mesh, placed: list.length });
      this.group.add(mesh);
    }
    this.setCount(this.wanted);
  }

  /** Hide whole chunks far from the camera: tufts there are a few pixels tall. */
  cull(cam: THREE.Vector3, maxDist: number): void {
    for (const c of this.chunks) {
      const bs = c.mesh.boundingSphere;
      if (!bs || c.mesh.count === 0) continue;
      c.mesh.visible = bs.center.distanceTo(cam) - bs.radius < maxDist;
    }
  }

  /** Draw about `count` tufts in total, spread proportionally across chunks. */
  setCount(count: number): void {
    this.wanted = count;
    const f = this.total > 0 ? Math.min(1, count / this.total) : 0;
    for (const c of this.chunks) {
      c.mesh.count = Math.floor(c.placed * f);
      c.mesh.visible = c.mesh.count > 0;
    }
  }
}
