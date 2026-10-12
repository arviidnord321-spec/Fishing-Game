import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * Small modelling kit for the procedural pets: shared materials, cached base geometry,
 * surface-placed facial features, tapered tubes and thin extruded plates, plus a baker that
 * merges every static mesh of an animated part into one vertex-coloured mesh.
 */

// ---------------------------------------------------------------- materials
export const VC_SMOOTH = new THREE.MeshLambertMaterial({ vertexColors: true });
export const VC_FLAT = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
const DOUBLE_SMOOTH = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
export const GOLD_GLOW = new THREE.MeshBasicMaterial({ color: '#ffd45c' });

const matCache = new Map<string, THREE.MeshLambertMaterial>();
/** Placeholder material carrying a colour for the baker (never rendered directly). */
export function col(hex: string): THREE.MeshLambertMaterial {
  let m = matCache.get(hex);
  if (!m) {
    m = new THREE.MeshLambertMaterial({ color: hex });
    matCache.set(hex, m);
  }
  return m;
}

// ---------------------------------------------------------------- geometry cache
const geoCache = new Map<string, THREE.BufferGeometry>();
const shared = new WeakSet<THREE.BufferGeometry>();
function cached(key: string, make: () => THREE.BufferGeometry): THREE.BufferGeometry {
  let g = geoCache.get(key);
  if (!g) {
    g = make();
    geoCache.set(key, g);
    shared.add(g);
  }
  return g;
}
export const sphereGeo = (w = 20, h = 14) => cached(`s${w}:${h}`, () => new THREE.SphereGeometry(1, w, h));
export const coneGeo = (seg = 10) => cached(`c${seg}`, () => new THREE.ConeGeometry(1, 1, seg));
export const cylGeo = (seg = 10) => cached(`y${seg}`, () => new THREE.CylinderGeometry(1, 1, 1, seg));

export type V3 = [number, number, number];

export interface MeshOpts {
  rot?: V3;
  flat?: boolean;
  seg?: [number, number];
  double?: boolean;
  /** keep the requested tessellation instead of capping it by size */
  keep?: boolean;
}

function finish(m: THREE.Mesh, opts?: MeshOpts): THREE.Mesh {
  if (opts?.rot) m.rotation.set(...opts.rot);
  if (opts?.flat) m.userData.flat = true;
  if (opts?.double) m.userData.double = true;
  return m;
}

/** Ellipsoid with radii r at position p. */
export function ell(parent: THREE.Object3D, p: V3, r: V3, color: string, opts?: MeshOpts): THREE.Mesh {
  // tessellation follows on-screen size: small blobs don't need many triangles
  const m0 = Math.max(...r);
  const cap: [number, number] = m0 >= 0.15 ? [14, 10] : m0 >= 0.085 ? [11, 8] : m0 >= 0.045 ? [9, 6] : [6, 5];
  const want = opts?.seg ?? [14, 10];
  const seg = opts?.keep ? want : [Math.min(want[0], cap[0]), Math.min(want[1], cap[1])];
  const m = new THREE.Mesh(sphereGeo(seg[0], seg[1]), col(color));
  m.position.set(...p);
  m.scale.set(...r);
  parent.add(finish(m, opts));
  return m;
}

/** Cone pointing +y: base radius r, height hgt, base at the position (not centre). */
export function cone(parent: THREE.Object3D, p: V3, r: number, hgt: number, color: string, opts?: MeshOpts & { seg2?: number; sx?: number; sz?: number }): THREE.Mesh {
  const g = new THREE.Group();
  g.position.set(...p);
  if (opts?.rot) g.rotation.set(...opts.rot);
  const m = new THREE.Mesh(coneGeo(opts?.seg2 ?? 10), col(color));
  m.scale.set(r * (opts?.sx ?? 1), hgt, r * (opts?.sz ?? 1));
  m.position.y = hgt / 2;
  if (opts?.flat) m.userData.flat = true;
  g.add(m);
  parent.add(g);
  return m;
}

/** Tapered tube along a smooth curve through `pts`, radius r0 → r1, with rounded ends. */
export function tube(parent: THREE.Object3D, pts: V3[], r0: number, r1: number, color: string, seg = 10, radial = 7): THREE.Mesh {
  const curve = new THREE.CatmullRomCurve3(pts.map((q) => new THREE.Vector3(...q)));
  const geo = new THREE.TubeGeometry(curve, seg, 1, radial, false);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const c = new THREE.Vector3();
  const v = new THREE.Vector3();
  for (let i = 0; i <= seg; i++) {
    const t = i / seg;
    curve.getPointAt(t, c);
    const r = r0 + (r1 - r0) * t;
    for (let j = 0; j <= radial; j++) {
      const k = i * (radial + 1) + j;
      v.fromBufferAttribute(pos, k).sub(c).multiplyScalar(r).add(c);
      pos.setXYZ(k, v.x, v.y, v.z);
    }
  }
  geo.computeVertexNormals();
  const m = new THREE.Mesh(geo, col(color));
  parent.add(m);
  // rounded caps
  ell(parent, pts[0], [r0, r0, r0], color, { seg: [6, 5] });
  if (r1 > 0.004) ell(parent, pts[pts.length - 1], [r1, r1, r1], color, { seg: [6, 5] });
  return m;
}

/** Thin extruded plate from a 2D shape (in the XY plane), softened with a small bevel. */
export function plate(parent: THREE.Object3D, shape: THREE.Shape, depth: number, color: string, p: V3 = [0, 0, 0], rot: V3 = [0, 0, 0], bevel = 0.008): THREE.Mesh {
  const geo = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 1, curveSegments: 5 });
  geo.translate(0, 0, -depth / 2);
  const m = new THREE.Mesh(geo, col(color));
  m.position.set(...p);
  m.rotation.set(...rot);
  parent.add(m);
  return m;
}

// ---------------------------------------------------------------- 2D shapes
/** Pointed leaf from (0,0) to (0,len) with half-width w. */
export function leafShape(len: number, w: number): THREE.Shape {
  const s = new THREE.Shape();
  s.moveTo(0, 0);
  s.quadraticCurveTo(w * 1.3, len * 0.45, 0, len);
  s.quadraticCurveTo(-w * 1.3, len * 0.45, 0, 0);
  return s;
}
export function ellipseShape(rx: number, ry: number, cx = 0, cy = 0, n = 18): THREE.Shape {
  // explicit points so big round plates stay round regardless of curveSegments
  const s = new THREE.Shape();
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    if (i === 0) s.moveTo(cx + rx, cy);
    else s.lineTo(cx + Math.cos(a) * rx, cy + Math.sin(a) * ry);
  }
  s.closePath();
  return s;
}
/** Bat/dragon wing pointing +x from the root at (0,0); `scallops` points along the trailing edge. */
export function batWingShape(span: number, height: number, scallops = 3): THREE.Shape {
  const s = new THREE.Shape();
  s.moveTo(0, 0.02);
  s.quadraticCurveTo(span * 0.45, height * 1.05, span, height * 0.85);
  let x = span;
  let y = height * 0.85;
  for (let i = 0; i < scallops; i++) {
    const nx = span * (1 - (i + 1) / (scallops + 0.4));
    const ny = height * (0.55 - i * 0.18) - 0.02;
    s.quadraticCurveTo((x + nx) / 2 - 0.01, (y + ny) / 2 - height * 0.28, nx, ny);
    x = nx;
    y = ny;
  }
  s.quadraticCurveTo(span * 0.08, -0.02, 0, 0.02);
  return s;
}
/** Four-point star. */
export function starShape(r: number, inner = 0.38): THREE.Shape {
  const s = new THREE.Shape();
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 2;
    const rr = i % 2 === 0 ? r : r * inner;
    if (i === 0) s.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
    else s.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
  }
  s.closePath();
  return s;
}
export function crescentShape(r: number): THREE.Shape {
  const s = new THREE.Shape();
  s.absarc(0, 0, r, Math.PI * 0.25, Math.PI * 1.75, false);
  s.absarc(r * 0.45, 0, r * 0.78, Math.PI * 1.6, Math.PI * 0.4, true);
  return s;
}
export function diamondShape(w: number, hgt: number): THREE.Shape {
  const s = new THREE.Shape();
  s.moveTo(0, hgt);
  s.lineTo(w, 0);
  s.lineTo(0, -hgt);
  s.lineTo(-w, 0);
  s.closePath();
  return s;
}

// ---------------------------------------------------------------- surface placement
/** Point and outward normal on an ellipsoid (centre c, radii r) in direction d. */
export function onSurface(c: V3, r: V3, d: V3): { p: THREE.Vector3; n: THREE.Vector3 } {
  const dn = new THREE.Vector3(...d).normalize();
  const p = new THREE.Vector3(c[0] + r[0] * dn.x, c[1] + r[1] * dn.y, c[2] + r[2] * dn.z);
  const n = new THREE.Vector3(dn.x / r[0], dn.y / r[1], dn.z / r[2]).normalize();
  return { p, n };
}
const Z = new THREE.Vector3(0, 0, 1);
/** Orient `o` so its local +z points along n, at p pushed out by `lift`. */
export function stick(o: THREE.Object3D, s: { p: THREE.Vector3; n: THREE.Vector3 }, lift = 0, spin = 0): void {
  o.position.copy(s.p).addScaledVector(s.n, lift);
  o.quaternion.setFromUnitVectors(Z, s.n);
  if (spin) o.rotateZ(spin);
}

export interface FaceOpts {
  eyeSize?: number;
  /** horizontal spread of the eyes (direction x component) */
  spread?: number;
  /** vertical position of the eyes (direction y component) */
  lift?: number;
  mouth?: 'open' | 'small' | 'none';
  mouthLift?: number;
  blush?: boolean;
  /** Where the mouth/nose sit when there is a muzzle in front of the head. */
  muzzle?: { c: V3; r: V3; color: string };
  nose?: string;
  beak?: string;
}

const EYE = '#191a2e';
const MOUTH = '#6b2235';
const TONGUE = '#ff8fa3';
const BLUSH = '#ffa5b5';

/**
 * Big glossy eyes go into the `eyes` part (so they can blink); mouth, blush and nose into
 * `faceParent` (usually the head part). Head is an ellipsoid (c, r).
 */
export function face(faceParent: THREE.Group, eyes: THREE.Group, c: V3, r: V3, o: FaceOpts = {}): void {
  const es = o.eyeSize ?? 0.06;
  const spread = o.spread ?? 0.42;
  const lift = o.lift ?? 0.12;
  eyes.updateMatrixWorld(true);
  const eyeY = onSurface(c, r, [0, lift, 1]).p.y;
  eyes.position.set(0, eyeY, 0);
  for (const s of [-1, 1]) {
    const surf = onSurface(c, r, [s * spread, lift, 1]);
    const eg = new THREE.Group();
    stick(eg, surf, -es * 0.25);
    eg.position.y -= eyeY;
    ell(eg, [0, 0, 0], [es * 0.86, es, es * 0.55], EYE, { seg: [12, 9], keep: true });
    ell(eg, [-es * 0.3, es * 0.36, es * 0.42], [es * 0.32, es * 0.32, es * 0.2], '#ffffff', { seg: [8, 6] });
    ell(eg, [es * 0.32, -es * 0.38, es * 0.44], [es * 0.14, es * 0.14, es * 0.1], '#ffffff', { seg: [6, 4] });
    eyes.add(eg);
    if (o.blush !== false) {
      const b = new THREE.Group();
      stick(b, onSurface(c, r, [s * (spread + 0.28), lift - 0.26, 1]), -0.008);
      ell(b, [0, 0, 0], [es * 0.62, es * 0.36, es * 0.2], BLUSH, { seg: [12, 8] });
      faceParent.add(b);
    }
  }
  const mc = o.muzzle ? o.muzzle.c : c;
  const mr = o.muzzle ? o.muzzle.r : r;
  if (o.muzzle) ell(faceParent, o.muzzle.c, o.muzzle.r, o.muzzle.color);
  if (o.nose) {
    const n = new THREE.Group();
    stick(n, onSurface(mc, mr, [0, o.muzzle ? 0.35 : lift - 0.16, 1]), -0.004);
    ell(n, [0, 0, 0], [es * 0.42, es * 0.3, es * 0.3], '#2b2230', { seg: [10, 8] });
    faceParent.add(n);
  }
  if (o.beak) {
    const bk = new THREE.Group();
    stick(bk, onSurface(c, r, [0, lift - 0.18, 1]), -0.01);
    cone(bk, [0, 0, 0], es * 0.55, es * 1.1, o.beak, { rot: [Math.PI / 2 + 0.5, 0, 0], seg2: 8 });
    faceParent.add(bk);
  }
  const ml = o.mouthLift ?? (o.muzzle ? -0.15 : lift - 0.3);
  if (o.mouth === 'open' || o.mouth === undefined) {
    const m = new THREE.Group();
    stick(m, onSurface(mc, mr, [0, ml, 1]), -0.002);
    const w = es * 0.72;
    // "D" smile: flat top, round bottom, with a pink tongue
    const d = new THREE.Shape();
    d.moveTo(-w, 0);
    d.lineTo(w, 0);
    d.absellipse(0, 0, w, w * 0.95, 0, -Math.PI, true, 0);
    plate(m, d, 0.006, MOUTH, [0, w * 0.35, 0], [0, 0, 0], 0.004);
    plate(m, ellipseShape(w * 0.55, w * 0.32), 0.004, TONGUE, [0, -w * 0.25, 0.007], [0, 0, 0], 0.003);
    faceParent.add(m);
  } else if (o.mouth === 'small') {
    const m = new THREE.Group();
    stick(m, onSurface(mc, mr, [0, ml, 1]), -0.004);
    ell(m, [0, 0, 0], [es * 0.32, es * 0.24, es * 0.2], MOUTH, { seg: [10, 8] });
    faceParent.add(m);
  }
}

// ---------------------------------------------------------------- baking
/**
 * Merge every mesh that belongs to `owner` (i.e. not inside a nested part group) into one
 * vertex-coloured mesh per material kind. Meshes with non-Lambert materials (gold glow) stay.
 */
export function bakePart(owner: THREE.Group): void {
  owner.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(owner.matrixWorld).invert();
  const buckets: Record<'smooth' | 'flat' | 'double', THREE.BufferGeometry[]> = { smooth: [], flat: [], double: [] };
  const remove: THREE.Mesh[] = [];
  const visit = (o: THREE.Object3D) => {
    for (const ch of [...o.children]) {
      if (ch !== owner && ch.userData.part) continue; // nested part: baked on its own
      if (ch instanceof THREE.Mesh && ch.material instanceof THREE.MeshLambertMaterial && !ch.material.vertexColors) {
        if (!ch.visible) {
          remove.push(ch);
          continue;
        }
        let g = ch.geometry.clone();
        if (g.index) g = g.toNonIndexed();
        g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, ch.matrixWorld));
        for (const name of Object.keys(g.attributes)) if (name !== 'position' && name !== 'normal') g.deleteAttribute(name);
        const cc = ch.material.color;
        const n = g.attributes.position.count;
        const arr = new Float32Array(n * 3);
        for (let i = 0; i < n; i++) arr.set([cc.r, cc.g, cc.b], i * 3);
        g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
        // mirrored transforms flip winding; fix so faces stay outward
        if (new THREE.Matrix4().multiplyMatrices(inv, ch.matrixWorld).determinant() < 0) {
          const pos = g.attributes.position as THREE.BufferAttribute;
          const nor = g.attributes.normal as THREE.BufferAttribute;
          for (let i = 0; i < pos.count; i += 3) {
            for (const a of [pos, nor]) {
              const x = a.getX(i + 1), y = a.getY(i + 1), z = a.getZ(i + 1);
              a.setXYZ(i + 1, a.getX(i + 2), a.getY(i + 2), a.getZ(i + 2));
              a.setXYZ(i + 2, x, y, z);
            }
          }
        }
        buckets[ch.userData.double ? 'double' : ch.userData.flat ? 'flat' : 'smooth'].push(g);
        remove.push(ch);
      } else if (!(ch instanceof THREE.Mesh)) visit(ch);
    }
  };
  visit(owner);
  for (const m of remove) {
    m.removeFromParent();
    // one-off source geometry (tubes, plates) is no longer needed once merged
    if (!shared.has(m.geometry)) m.geometry.dispose();
  }
  // drop now-empty helper groups (but keep nested parts)
  const prune = (o: THREE.Object3D) => {
    for (const ch of [...o.children]) {
      if (ch.userData.part) continue;
      if (!(ch instanceof THREE.Mesh)) {
        prune(ch);
        if (ch.children.length === 0) ch.removeFromParent();
      }
    }
  };
  prune(owner);
  for (const [kind, list] of Object.entries(buckets)) {
    if (!list.length) continue;
    const merged = mergeGeometries(list);
    for (const g of list) g.dispose();
    if (!merged) continue;
    const mesh = new THREE.Mesh(merged, kind === 'flat' ? VC_FLAT : kind === 'double' ? DOUBLE_SMOOTH : VC_SMOOTH);
    mesh.name = 'baked';
    owner.add(mesh);
  }
}

/** Create an animated part group (pivot at p) under parent. */
export function part(parent: THREE.Object3D, name: string, p: V3 = [0, 0, 0]): THREE.Group {
  const g = new THREE.Group();
  g.name = name;
  g.userData.part = name;
  g.position.set(...p);
  parent.add(g);
  return g;
}

/** Bake every part under root (deepest first is not required: each bakes only its own meshes). */
export function bakeAll(root: THREE.Object3D): void {
  const parts: THREE.Group[] = [];
  root.traverse((o) => {
    if (o.userData.part && o instanceof THREE.Group) parts.push(o);
  });
  for (const p of parts) bakePart(p);
}

export function triangleCount(o: THREE.Object3D): number {
  let n = 0;
  o.traverse((m) => {
    if (m instanceof THREE.Mesh) {
      const g = m.geometry as THREE.BufferGeometry;
      n += (g.index ? g.index.count : g.attributes.position.count) / 3;
    }
  });
  return Math.round(n);
}

export function meshCount(o: THREE.Object3D): number {
  let n = 0;
  o.traverse((m) => {
    if (m instanceof THREE.Mesh && m.visible) n++;
  });
  return n;
}
