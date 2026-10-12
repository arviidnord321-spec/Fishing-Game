import * as THREE from 'three';
import { PETS_BY_ID } from '../data/pets';
import {
  bakeAll,
  col,
  batWingShape,
  cone,
  crescentShape,
  diamondShape,
  ell,
  ellipseShape,
  face,
  GOLD_GLOW,
  leafShape,
  onSurface,
  part,
  plate,
  starShape,
  stick,
  tube,
  type V3,
} from './petKit';

/**
 * Procedural pets modelled after the redesign sheet. Every pet has its own anatomy built from
 * the pet kit; each animated part (eyes, ears, tail, wings, leg pairs, claws, fins...) is baked
 * into one smooth vertex-coloured mesh, so a pet costs about 6–11 draw calls.
 *
 * Conventions: faces +z, y up, root at the ground (or hover anchor) below the body centre,
 * about 0.6–0.75 units tall. root.userData.kind: 'ground' | 'fly' | 'float'.
 */

type Kind = 'ground' | 'fly' | 'float';
interface Rig {
  root: THREE.Group;
  body: THREE.Group;
  head: THREE.Group;
  eyes: THREE.Group;
}

function rig(kind: Kind, bodyPivot: V3 = [0, 0.25, 0]): Rig {
  const root = new THREE.Group();
  root.userData.kind = kind;
  const body = part(root, 'body', bodyPivot);
  const head = part(body, 'head', [0, 0, 0]);
  const eyes = part(head, 'eyes');
  return { root, body, head, eyes };
}

// ---------------------------------------------------------------- shared anatomy
/** Four short legs as two diagonal pairs (A: front-left + back-right, B: front-right + back-left). */
function quadLegs(r: Rig, o: { fx: number; fz: number; bz: number; top: number; rad: number; color: string; paw: string; pawR?: number }): void {
  const A = part(r.root, 'legsA');
  const B = part(r.root, 'legsB');
  const leg = (g: THREE.Group, x: number, z: number) => {
    ell(g, [x, o.top * 0.55, z], [o.rad, o.top * 0.55, o.rad], o.color, { seg: [8, 6] });
    ell(g, [x, (o.pawR ?? o.rad) * 0.7, z + 0.012], [(o.pawR ?? o.rad) * 1.15, (o.pawR ?? o.rad) * 0.75, (o.pawR ?? o.rad) * 1.3], o.paw, { seg: [9, 6] });
  };
  leg(A, -o.fx, o.fz);
  leg(A, o.fx, o.bz);
  leg(B, o.fx, o.fz);
  leg(B, -o.fx, o.bz);
}

/** Two round feet for blob creatures (A = left, B = right). */
function feet(r: Rig, x: number, z: number, rad: number, color: string): void {
  ell(part(r.root, 'legsA'), [-x, rad * 0.6, z], [rad * 1.1, rad * 0.7, rad * 1.35], color, { seg: [10, 6] });
  ell(part(r.root, 'legsB'), [x, rad * 0.6, z], [rad * 1.1, rad * 0.7, rad * 1.35], color, { seg: [10, 6] });
}

/** Mirrored wing pair: `make(group, side)` builds one wing extending along +x·side from the pivot. */
function wings(r: Rig, at: V3, make: (g: THREE.Group, s: 1 | -1) => void, parent: THREE.Object3D = r.body): void {
  for (const s of [-1, 1] as const) {
    const g = part(parent, s < 0 ? 'wingL' : 'wingR', [s * at[0], at[1], at[2]]);
    make(g, s);
  }
}

function mirrorShape(shape: THREE.Shape, s: 1 | -1): THREE.Shape {
  if (s === 1) return shape;
  const pts = shape.getPoints(6).map((p) => new THREE.Vector2(-p.x, p.y)).reverse();
  return new THREE.Shape(pts);
}

function batWing(g: THREE.Group, s: 1 | -1, span: number, hgt: number, color: string, membrane: string, tilt = 0.45): void {
  const sh = mirrorShape(batWingShape(span, hgt), s);
  plate(g, sh, 0.012, membrane, [0, 0, 0], [0.15, s * -tilt, s * 0.25], 0.006);
  // leading-edge bone
  tube(g, ([[0, 0.02, 0], [s * span * 0.45, hgt * 0.9, 0], [s * span * 0.95, hgt * 0.85, -0.02]] as V3[]).map((q) => rotY(q, s * -tilt)), 0.014, 0.008, color, 10, 6);
}

function rotY(q: V3, a: number): V3 {
  const c = Math.cos(a), sn = Math.sin(a);
  return [q[0] * c + q[2] * sn, q[1], -q[0] * sn + q[2] * c];
}

function halo(r: Rig, y: number, rad: number): void {
  const g = part(r.root, 'halo', [0, y, 0]);
  const m = new THREE.Mesh(new THREE.TorusGeometry(rad, rad * 0.11, 6, 22), GOLD_GLOW);
  m.rotation.x = Math.PI / 2;
  m.name = 'baked'; // own geometry: released by disposeModel
  g.add(m);
}

function goldStar(parent: THREE.Object3D, c: V3, rr: V3, d: V3, size: number, spin = 0): void {
  const g = new THREE.Group();
  stick(g, onSurface(c, rr, d), 0.004, spin);
  plate(g, starShape(size), 0.008, '#ffd24a', [0, 0, 0], [0, 0, 0], 0.004);
  parent.add(g);
}

// ---------------------------------------------------------------- the 18 pets
const BUILDERS: Record<string, () => THREE.Group> = {
  'sprout-puff': () => {
    const r = rig('ground', [0, 0.27, 0]);
    const C: V3 = [0, 0, 0];
    const R: V3 = [0.26, 0.24, 0.24];
    ell(r.head, C, R, '#8fdc5a');
    ell(r.head, [0, -0.06, 0.1], [0.19, 0.16, 0.15], '#f3f6cf');
    face(r.head, r.eyes, C, R, { eyeSize: 0.062, spread: 0.36, lift: 0.18 });
    // two big leaves sprouting from the top
    const sprout = part(r.head, 'ears', [0, 0.22, 0]);
    tube(sprout, [[0, -0.02, 0], [0, 0.06, 0.01]], 0.018, 0.014, '#4fb146', 6, 6);
    plate(sprout, leafShape(0.2, 0.06), 0.016, '#66c94a', [0.01, 0.05, 0], [0, 0.2, -0.85]);
    plate(sprout, leafShape(0.22, 0.065), 0.016, '#7bd85a', [-0.01, 0.05, 0], [0, -0.2, 0.85]);
    // leafy arms
    const arms = part(r.body, 'arms');
    for (const s of [-1, 1]) plate(arms, leafShape(0.17, 0.06), 0.016, '#5bbf44', [s * 0.21, -0.06, 0.04], [0.25, s * 0.3, s * (Math.PI / 2 + 0.7)]);
    feet(r, 0.11, 0.07, 0.06, '#5ab845');
    return r.root;
  },

  'pebble-pup': () => {
    const r = rig('ground', [0, 0.17, -0.05]);
    // faceted stone body + head (flat shading gives the rock facets)
    ell(r.body, [0, 0, -0.04], [0.15, 0.13, 0.19], '#a7a4a0', { flat: true, seg: [9, 7] });
    ell(r.body, [0, 0.0, 0.08], [0.1, 0.1, 0.07], '#efe6d6', { seg: [12, 9] });
    const HC: V3 = [0, 0.19, 0.09];
    const HR: V3 = [0.2, 0.18, 0.18];
    r.head.position.set(0, 0, 0);
    ell(r.head, HC, HR, '#b3afaa', { flat: true, seg: [10, 8] });
    face(r.head, r.eyes, HC, HR, { eyeSize: 0.052, spread: 0.4, lift: 0.18, nose: '#2b2230', muzzle: { c: [0, 0.13, 0.24], r: [0.095, 0.07, 0.07], color: '#f1e8d8' } });
    // floppy angular ears
    const ears = part(r.head, 'ears', [0, 0.31, 0.06]);
    for (const s of [-1, 1]) {
      const e = ell(ears, [s * 0.17, -0.04, -0.01], [0.055, 0.12, 0.085], '#8f8b86', { flat: true, seg: [6, 5] });
      e.rotation.set(0.1, 0, s * 0.55);
    }
    quadLegs(r, { fx: 0.09, fz: 0.07, bz: -0.16, top: 0.13, rad: 0.05, color: '#a7a4a0', paw: '#efe6d6', pawR: 0.05 });
    const tail = part(r.body, 'tail', [0, 0.06, -0.21]);
    tube(tail, [[0, 0, 0], [0, 0.07, -0.05], [0, 0.13, -0.02], [0, 0.12, 0.03]], 0.03, 0.022, '#a7a4a0', 12, 7);
    return r.root;
  },

  'bumble-bun': () => {
    const r = rig('ground', [0, 0.26, 0]);
    const C: V3 = [0, 0, 0];
    const R: V3 = [0.24, 0.23, 0.24];
    ell(r.head, C, R, '#ffcf2e');
    ell(r.head, [0, -0.05, 0.11], [0.17, 0.15, 0.14], '#fff1c2');
    // bee stripes wrap the back half
    for (const [y, w] of [[-0.05, 0.035], [-0.14, 0.03]] as const) {
      ell(r.head, [0, y, -0.06], [0.242, w, 0.2], '#4a3420', { seg: [20, 6] });
    }
    face(r.head, r.eyes, C, R, { eyeSize: 0.06, spread: 0.36, lift: 0.14 });
    const ears = part(r.head, 'ears', [0, 0.18, -0.02]);
    for (const s of [-1, 1]) {
      const g = new THREE.Group();
      g.position.set(s * 0.08, 0, 0);
      g.rotation.z = -s * 0.12;
      ell(g, [0, 0.15, 0], [0.055, 0.17, 0.04], '#ffcf2e', { seg: [12, 10] });
      ell(g, [0, 0.15, 0.022], [0.032, 0.13, 0.02], '#ffa5b5', { seg: [10, 8] });
      ears.add(g);
    }
    wings(r, [0.12, 0.08, -0.16], (g, s) => {
      plate(g, ellipseShape(0.1, 0.065, s * 0.09, 0.03), 0.01, '#d6f1ff', [0, 0, 0], [0, s * 0.6, s * 0.35], 0.005);
      plate(g, ellipseShape(0.065, 0.04, s * 0.07, -0.05), 0.01, '#c4e8fb', [0, 0, 0], [0, s * 0.6, s * 0.1], 0.005);
    });
    feet(r, 0.1, 0.07, 0.055, '#5a3d22');
    return r.root;
  },

  mossling: () => {
    const r = rig('ground', [0, 0.27, 0]);
    const C: V3 = [0, 0, 0];
    const R: V3 = [0.24, 0.25, 0.23];
    ell(r.head, C, R, '#5fa83f');
    // layered moss tufts around the body (flat-shaded leaf clumps)
    const tufts = [
      [0.2, 0.05, -0.05], [-0.2, 0.05, -0.05], [0.16, -0.12, 0.05], [-0.16, -0.12, 0.05], [0, 0.17, -0.1], [0.12, 0.15, -0.12],
      [-0.12, 0.15, -0.12], [0, -0.05, -0.2], [0.17, -0.02, -0.15], [-0.17, -0.02, -0.15], [0.08, -0.18, -0.08], [-0.08, -0.18, -0.08],
    ] as V3[];
    tufts.forEach((t, i) => {
      const m = ell(r.head, t, [0.1, 0.08, 0.09], i % 2 ? '#4f9636' : '#68b347', { flat: true, seg: [6, 4] });
      m.rotation.set(i * 0.7, i * 1.3, i * 0.4);
    });
    ell(r.head, [0, -0.06, 0.12], [0.15, 0.14, 0.12], '#cfe8a8');
    face(r.head, r.eyes, C, R, { eyeSize: 0.058, spread: 0.36, lift: 0.16, nose: '#3a2a22' });
    const ant = part(r.head, 'ears', [0, 0.2, -0.02]);
    for (const s of [-1, 1]) {
      tube(ant, [[s * 0.07, 0, 0], [s * 0.1, 0.09, -0.01], [s * 0.17, 0.17, -0.02]], 0.022, 0.014, '#8a5a33', 6, 5);
      tube(ant, [[s * 0.1, 0.08, -0.01], [s * 0.18, 0.1, 0.0]], 0.014, 0.01, '#8a5a33', 3, 5);
      tube(ant, [[s * 0.15, 0.15, -0.02], [s * 0.13, 0.22, -0.02]], 0.012, 0.009, '#8a5a33', 3, 5);
    }
    tube(ant, [[0, 0, 0], [0.01, 0.05, 0]], 0.012, 0.01, '#3d7a35', 4, 5);
    plate(ant, leafShape(0.13, 0.045), 0.012, '#7ee081', [0.01, 0.04, 0], [0, 0, -0.7]);
    // root feet
    for (const [nm, s] of [['legsA', -1], ['legsB', 1]] as const) {
      const g = part(r.root, nm);
      ell(g, [s * 0.11, 0.035, 0.07], [0.065, 0.04, 0.08], '#7a4c2b', { seg: [10, 6] });
      tube(g, [[s * 0.11, 0.02, 0.12], [s * 0.13, 0.01, 0.16]], 0.016, 0.008, '#7a4c2b', 4, 5);
      tube(g, [[s * 0.13, 0.02, 0.1], [s * 0.18, 0.01, 0.13]], 0.014, 0.007, '#7a4c2b', 4, 5);
    }
    return r.root;
  },

  'glow-moth': () => {
    const r = rig('fly', [0, 0.3, 0]);
    const C: V3 = [0, 0, 0];
    const R: V3 = [0.2, 0.21, 0.19];
    ell(r.head, C, R, '#fbe9b6');
    // fluffy collar
    for (let i = 0; i < 5; i++) {
      const a = Math.PI * (0.2 + (i / 4) * 0.6);
      ell(r.body, [Math.cos(a) * 0.1, -0.15 + Math.abs(i - 2) * 0.012, Math.sin(a) * 0.12 + 0.02], [0.06, 0.045, 0.05], '#fff7dd', { seg: [8, 6] });
    }
    ell(r.body, [0, -0.2, -0.02], [0.13, 0.1, 0.12], '#f6dc95');
    face(r.head, r.eyes, C, R, { eyeSize: 0.058, spread: 0.38, lift: 0.1, nose: '#c98a4a', mouth: 'small' });
    // whiskers
    for (const s of [-1, 1]) for (const k of [0, 1]) {
      tube(r.head, [[s * 0.12, -0.04 - k * 0.025, 0.15], [s * 0.22, -0.03 - k * 0.04, 0.13]], 0.004, 0.003, '#7a5a3a', 3, 4);
    }
    const ant = part(r.head, 'ears', [0, 0.16, 0.02]);
    for (const s of [-1, 1]) {
      tube(ant, [[s * 0.05, 0, 0], [s * 0.08, 0.08, 0.02], [s * 0.13, 0.12, 0.03]], 0.012, 0.01, '#e9a93a', 8, 5);
      ell(ant, [s * 0.14, 0.12, 0.03], [0.025, 0.025, 0.025], '#ffbe3d', { seg: [8, 6] });
    }
    wings(r, [0.1, 0.04, -0.1], (g, s) => {
      const sw = s * 0.2;
      plate(g, ellipseShape(0.22, 0.2, s * 0.2, 0.12), 0.014, '#f4b43a', [0, 0, 0], [0, sw, 0], 0.008);
      plate(g, ellipseShape(0.14, 0.12, s * 0.15, -0.12), 0.014, '#eea22a', [0, 0, -0.004], [0, sw, 0], 0.008);
      for (const [x, y, rr] of [[0.26, 0.16, 0.06], [0.13, 0.24, 0.035], [0.17, -0.13, 0.04]] as const) {
        // spots go through the wing so they show on both faces
        ell(g, rotY([s * x, y, 0], sw), [rr, rr, 0.024], '#fff3cf', { seg: [12, 6], keep: true }).rotation.y = sw;
      }
    });
    feet(r, 0.06, 0.04, 0.035, '#e9b04a');
    for (const n of ['legsA', 'legsB']) {
      const g = r.root.getObjectByName(n)!;
      g.position.y = 0.06;
    }
    return r.root;
  },

  'tidal-fox': () => {
    const r = rig('ground', [0, 0.17, -0.05]);
    ell(r.body, [0, 0, -0.04], [0.15, 0.125, 0.19], '#3ec4dc');
    ell(r.body, [0, 0.0, 0.08], [0.1, 0.1, 0.075], '#f4fdff');
    const HC: V3 = [0, 0.2, 0.09];
    const HR: V3 = [0.19, 0.17, 0.17];
    ell(r.head, HC, HR, '#46cbe2');
    // cheek fluff
    for (const s of [-1, 1]) ell(r.head, [s * 0.15, 0.13, 0.12], [0.07, 0.06, 0.06], '#eafcff', { seg: [10, 8] });
    face(r.head, r.eyes, HC, HR, { eyeSize: 0.052, spread: 0.4, lift: 0.16, nose: '#22303a', muzzle: { c: [0, 0.13, 0.23], r: [0.085, 0.065, 0.075], color: '#f4fdff' } });
    const ears = part(r.head, 'ears', [0, 0.33, 0.06]);
    for (const s of [-1, 1]) {
      cone(ears, [s * 0.1, -0.02, 0], 0.075, 0.2, '#3ec4dc', { rot: [0, 0, -s * 0.28], sz: 0.55, seg2: 8 });
      cone(ears, [s * 0.1, -0.01, 0.02], 0.045, 0.14, '#f4fdff', { rot: [0, 0, -s * 0.28], sz: 0.3, seg2: 8 });
    }
    quadLegs(r, { fx: 0.085, fz: 0.07, bz: -0.16, top: 0.13, rad: 0.048, color: '#3ec4dc', paw: '#f4fdff', pawR: 0.05 });
    // big curled tail with pale fin tips
    const tail = part(r.body, 'tail', [0, 0.04, -0.2]);
    const pts: V3[] = [[0, 0, 0], [0, 0.06, -0.12], [0, 0.19, -0.18], [0, 0.3, -0.12], [0, 0.32, -0.04]];
    const curve = new THREE.CatmullRomCurve3(pts.map((q) => new THREE.Vector3(...q)));
    for (let i = 0; i <= 7; i++) {
      const t = i / 7;
      const p = curve.getPointAt(t);
      const rad = 0.06 + Math.sin(t * Math.PI) * 0.055;
      ell(tail, [p.x, p.y, p.z], [rad, rad, rad], t > 0.72 ? '#c4f6ff' : '#3ec4dc', { seg: [10, 7] });
    }
    plate(tail, leafShape(0.1, 0.05), 0.012, '#c4f6ff', [0, 0.32, -0.03], [0, Math.PI / 2, 0.4]);
    return r.root;
  },

  'coral-crab': () => {
    const r = rig('ground', [0, 0.16, 0]);
    const C: V3 = [0, 0.02, 0];
    const R: V3 = [0.25, 0.16, 0.19];
    ell(r.head, C, R, '#f2604c');
    ell(r.head, [0, -0.04, 0.09], [0.16, 0.09, 0.11], '#ffc9b5');
    face(r.head, r.eyes, C, R, { eyeSize: 0.055, spread: 0.36, lift: 0.3, mouthLift: -0.05 });
    // raised pincers
    for (const s of [-1, 1] as const) {
      const arm = part(r.body, s < 0 ? 'clawL' : 'clawR', [s * 0.22, 0.02, 0.06]);
      tube(arm, [[0, 0, 0], [s * 0.07, 0.07, 0.02], [s * 0.1, 0.15, 0.04]], 0.03, 0.026, '#e4513e', 8, 7);
      ell(arm, [s * 0.11, 0.2, 0.05], [0.075, 0.07, 0.06], '#f2604c', { seg: [14, 10] });
      const pinch = part(arm, s < 0 ? 'pinchL' : 'pinchR', [s * 0.11, 0.24, 0.05]);
      // V-shaped pincer: the inner finger (pinch part) opens and closes against the fixed outer one
      cone(pinch, [0, -0.01, 0], 0.034, 0.11, '#f2604c', { rot: [0, 0, s * 0.45], sz: 0.8, seg2: 8 });
      cone(arm, [s * 0.14, 0.24, 0.05], 0.036, 0.12, '#e4513e', { rot: [0, 0, -s * 0.3], sz: 0.8, seg2: 8 });
    }
    // three short curved legs per side, as two alternating sets
    const A = part(r.root, 'legsA');
    const B = part(r.root, 'legsB');
    for (const s of [-1, 1]) for (let i = 0; i < 3; i++) {
      const z = 0.05 - i * 0.08;
      tube((i + (s > 0 ? 1 : 0)) % 2 ? A : B, [[s * 0.2, 0.13, z], [s * 0.29, 0.1, z - 0.01], [s * 0.31, 0.02, z - 0.02]], 0.02, 0.012, '#e4513e', 8, 6);
    }
    return r.root;
  },

  'ripple-otter': () => {
    const r = rig('ground', [0, 0.25, 0]);
    // upright sitting body
    ell(r.body, [0, -0.05, -0.02], [0.17, 0.2, 0.15], '#9a6a44');
    ell(r.body, [0, -0.07, 0.07], [0.12, 0.15, 0.09], '#f1dcc0');
    const HC: V3 = [0, 0.18, 0.03];
    const HR: V3 = [0.18, 0.16, 0.16];
    ell(r.head, HC, HR, '#a2734c');
    face(r.head, r.eyes, HC, HR, { eyeSize: 0.05, spread: 0.42, lift: 0.18, nose: '#3a2420', muzzle: { c: [0, 0.12, 0.16], r: [0.1, 0.07, 0.06], color: '#f4e2c9' } });
    for (const s of [-1, 1]) for (const k of [0, 1]) tube(r.head, [[s * 0.07, 0.12 - k * 0.02, 0.21], [s * 0.19, 0.13 - k * 0.04, 0.2]], 0.004, 0.003, '#3a2420', 3, 4);
    const ears = part(r.head, 'ears', [0, 0.3, 0.0]);
    for (const s of [-1, 1]) {
      ell(ears, [s * 0.13, -0.02, 0], [0.045, 0.04, 0.03], '#8a5a38', { seg: [10, 8] });
      ell(ears, [s * 0.13, -0.02, 0.012], [0.025, 0.022, 0.02], '#e8c9a8', { seg: [8, 6] });
    }
    // little front paws held at the chest
    const arms = part(r.body, 'arms', [0, 0.0, 0.1]);
    for (const s of [-1, 1]) ell(arms, [s * 0.07, 0, 0.02], [0.042, 0.05, 0.04], '#8a5a38', { seg: [10, 8] });
    feet(r, 0.09, 0.08, 0.05, '#8a5a38');
    const tail = part(r.body, 'tail', [0.04, -0.2, -0.14]);
    tube(tail, [[0, 0, 0], [0.03, -0.03, -0.08]], 0.05, 0.045, '#8a5a38', 4, 8);
    ell(tail, [0.06, -0.04, -0.17], [0.075, 0.03, 0.12], '#8a5a38', { rot: [0.1, -0.35, 0] });
    return r.root;
  },

  'lantern-jelly': () => {
    const r = rig('float', [0, 0.36, 0]);
    // bell: dome with a scalloped lilac rim
    const bell = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 9, 0, Math.PI * 2, 0, Math.PI * 0.58), col('#ff9fdc'));
    bell.scale.set(0.24, 0.22, 0.23);
    r.head.add(bell);
    const C: V3 = [0, 0, 0];
    const R: V3 = [0.24, 0.22, 0.23];
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      ell(r.head, [Math.cos(a) * 0.205, -0.05, Math.sin(a) * 0.195], [0.06, 0.045, 0.06], i % 2 ? '#e48fe0' : '#f3a6e6', { seg: [8, 5] });
    }
    face(r.head, r.eyes, C, R, { eyeSize: 0.056, spread: 0.36, lift: 0.28, mouthLift: 0.02 });
    // short curled tentacles in two alternating sets
    const A = part(r.body, 'tentA', [0, -0.08, 0]);
    const B = part(r.body, 'tentB', [0, -0.08, 0]);
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2 + 0.3;
      const x = Math.cos(a) * 0.12;
      const z = Math.sin(a) * 0.11;
      const curl = i % 2 ? 1 : -1;
      tube(i % 2 ? A : B, [[x, 0, z], [x * 1.1, -0.08, z * 1.1], [x * 1.25 + curl * 0.03, -0.15, z], [x * 1.1 + curl * 0.05, -0.19, z * 0.9]], 0.026, 0.014, i % 3 ? '#e48fe0' : '#c37fe0', 8, 6);
    }
    halo(r, 0.66, 0.11);
    return r.root;
  },

  'kelp-drake': () => {
    const r = rig('ground', [0, 0.18, -0.04]);
    ell(r.body, [0, 0, -0.03], [0.16, 0.15, 0.19], '#2fa86a');
    ell(r.body, [0, -0.02, 0.08], [0.11, 0.11, 0.085], '#c9f2c8');
    const HC: V3 = [0, 0.21, 0.1];
    const HR: V3 = [0.18, 0.16, 0.16];
    ell(r.head, HC, HR, '#36b574');
    ell(r.head, [0, 0.15, 0.21], [0.1, 0.07, 0.07], '#3dbf7c');
    face(r.head, r.eyes, HC, HR, { eyeSize: 0.055, spread: 0.4, lift: 0.2, muzzle: { c: [0, 0.15, 0.21], r: [0.1, 0.07, 0.07], color: '#43c584' } });
    const ears = part(r.head, 'ears', [0, 0.36, 0.1]);
    cone(ears, [0, -0.02, 0.02], 0.035, 0.12, '#ffd23f', { rot: [-0.25, 0, 0], seg2: 8 });
    for (const s of [-1, 1]) plate(ears, leafShape(0.09, 0.035), 0.01, '#9ad94a', [s * 0.15, -0.1, -0.02], [0, 0, -s * 1.1]);
    // back spikes
    for (let i = 0; i < 3; i++) cone(r.body, [0, 0.14 - i * 0.02, -0.04 - i * 0.07], 0.025, 0.06, '#ffd23f', { rot: [-0.4, 0, 0], seg2: 6 });
    wings(r, [0.08, 0.12, -0.06], (g, s) => batWing(g, s, 0.25, 0.18, '#2a9a5f', '#c6e24a', 0.35));
    quadLegs(r, { fx: 0.09, fz: 0.07, bz: -0.15, top: 0.13, rad: 0.05, color: '#2fa86a', paw: '#2a9a5f', pawR: 0.048 });
    const tail = part(r.body, 'tail', [0, -0.06, -0.19]);
    tube(tail, [[0, 0, 0], [0.06, -0.06, -0.1], [0.16, -0.06, -0.1], [0.21, 0.0, -0.03]], 0.06, 0.025, '#2fa86a', 14, 8);
    plate(tail, leafShape(0.11, 0.045), 0.012, '#9ad94a', [0.22, 0.01, -0.02], [0, 0.4, -0.9]);
    plate(tail, leafShape(0.09, 0.04), 0.012, '#7ec43e', [0.22, 0.01, -0.02], [0, 0.4, -2.2]);
    return r.root;
  },

  'prism-ray': () => {
    const r = rig('float', [0, 0.3, 0]);
    // broad flattened body
    const C: V3 = [0, 0, 0];
    const R: V3 = [0.17, 0.11, 0.2];
    ell(r.head, C, R, '#7ee6cf');
    ell(r.head, [0, -0.04, 0.02], [0.155, 0.075, 0.18], '#ffffff');
    face(r.head, r.eyes, C, R, { eyeSize: 0.05, spread: 0.5, lift: 0.25, mouthLift: -0.25 });
    for (const s of [-1, 1]) goldStar(r.head, C, R, [s * 0.75, -0.05, 0.75], 0.025, 0.78);
    cone(r.head, [0, 0.09, -0.04], 0.03, 0.08, '#ff8fcf', { rot: [-0.7, 0, 0], sz: 0.35, seg2: 6 });
    // wide curved side fins (each is one wing part that undulates)
    wings(r, [0.13, 0.0, 0.0], (g, s) => {
      const sh = new THREE.Shape();
      sh.moveTo(0, 0.1);
      sh.quadraticCurveTo(0.2, 0.12, 0.34, -0.02);
      sh.quadraticCurveTo(0.18, -0.02, 0.0, -0.14);
      sh.closePath();
      plate(g, mirrorShape(sh, s), 0.035, '#7ee6cf', [0, 0, 0], [-Math.PI / 2, 0, 0], 0.012);
      plate(g, mirrorShape(sh, s), 0.01, '#f2fffb', [0, -0.034, 0], [-Math.PI / 2, 0, 0], 0.004).scale.set(0.9, 0.9, 1);
    }, r.head);
    const tail = part(r.body, 'tail', [0, 0, -0.18]);
    tube(tail, [[0, 0, 0], [0, 0.01, -0.12], [0, 0.04, -0.24]], 0.03, 0.008, '#7ee6cf', 10, 6);
    plate(tail, leafShape(0.07, 0.03), 0.01, '#ff8fcf', [0, 0.035, -0.22], [Math.PI / 2 + 0.3, 0, Math.PI]);
    return r.root;
  },

  'tide-dragon': () => {
    const r = rig('ground', [0, 0.18, -0.04]);
    ell(r.body, [0, 0, -0.03], [0.16, 0.15, 0.19], '#2f5fd0');
    ell(r.body, [0, -0.02, 0.08], [0.11, 0.11, 0.085], '#bfe9ff');
    const HC: V3 = [0, 0.21, 0.1];
    const HR: V3 = [0.18, 0.16, 0.16];
    ell(r.head, HC, HR, '#3468da');
    face(r.head, r.eyes, HC, HR, { eyeSize: 0.055, spread: 0.4, lift: 0.2, muzzle: { c: [0, 0.15, 0.21], r: [0.1, 0.07, 0.07], color: '#3b72e2' } });
    const ears = part(r.head, 'ears', [0, 0.36, 0.1]);
    cone(ears, [0, -0.02, 0.02], 0.035, 0.12, '#ffd23f', { rot: [-0.25, 0, 0], seg2: 8 });
    // fin frills on the head sides
    for (const s of [-1, 1]) {
      const fin = new THREE.Shape();
      fin.moveTo(0, 0);
      fin.quadraticCurveTo(0.06, 0.08, 0.13, 0.06);
      fin.quadraticCurveTo(0.08, 0.02, 0.1, -0.03);
      fin.quadraticCurveTo(0.05, -0.01, 0, 0);
      plate(ears, mirrorShape(fin, s as 1 | -1), 0.01, '#5fe0f0', [s * 0.13, -0.11, -0.03], [0, s * -0.5, 0]);
    }
    for (let i = 0; i < 3; i++) cone(r.body, [0, 0.14 - i * 0.02, -0.04 - i * 0.07], 0.025, 0.06, '#5fe0f0', { rot: [-0.4, 0, 0], seg2: 6 });
    wings(r, [0.08, 0.12, -0.06], (g, s) => batWing(g, s, 0.27, 0.2, '#2a54bf', '#5fe0f0', 0.35));
    quadLegs(r, { fx: 0.09, fz: 0.07, bz: -0.15, top: 0.13, rad: 0.05, color: '#2f5fd0', paw: '#2a54bf', pawR: 0.048 });
    const tail = part(r.body, 'tail', [0, -0.06, -0.19]);
    tube(tail, [[0, 0, 0], [-0.06, -0.06, -0.1], [-0.16, -0.06, -0.1], [-0.2, 0.0, -0.03]], 0.06, 0.025, '#2f5fd0', 14, 8);
    const tf = new THREE.Shape();
    tf.moveTo(0, 0);
    tf.quadraticCurveTo(0.05, 0.1, 0.13, 0.08);
    tf.quadraticCurveTo(0.08, 0.02, 0.12, -0.04);
    tf.quadraticCurveTo(0.05, -0.02, 0, 0);
    plate(tail, tf, 0.012, '#5fe0f0', [-0.2, 0.01, -0.02], [0, -0.6, 1.4]);
    return r.root;
  },

  'comet-kit': () => {
    const r = rig('ground', [0, 0.17, -0.05]);
    ell(r.body, [0, 0, -0.04], [0.15, 0.125, 0.18], '#ff9a45');
    ell(r.body, [0, 0.0, 0.08], [0.1, 0.1, 0.075], '#fff1dc');
    const HC: V3 = [0, 0.2, 0.09];
    const HR: V3 = [0.19, 0.17, 0.17];
    ell(r.head, HC, HR, '#ffa24e');
    for (const s of [-1, 1]) ell(r.head, [s * 0.15, 0.13, 0.12], [0.06, 0.055, 0.055], '#fff1dc', { seg: [10, 8] });
    face(r.head, r.eyes, HC, HR, { eyeSize: 0.054, spread: 0.4, lift: 0.16, nose: '#5a2a2a', muzzle: { c: [0, 0.13, 0.23], r: [0.08, 0.06, 0.07], color: '#fff1dc' } });
    const ears = part(r.head, 'ears', [0, 0.32, 0.07]);
    for (const s of [-1, 1]) {
      cone(ears, [s * 0.11, -0.03, 0], 0.075, 0.15, '#ff9a45', { rot: [0, 0, -s * 0.3], sz: 0.55, seg2: 8 });
      cone(ears, [s * 0.11, -0.02, 0.02], 0.045, 0.1, '#ffa5b5', { rot: [0, 0, -s * 0.3], sz: 0.3, seg2: 8 });
    }
    // flame tuft on the head
    const tuft = part(r.head, 'flame', [0, 0.36, 0.05]);
    cone(tuft, [0, -0.03, 0], 0.06, 0.15, '#ff6a2a', { rot: [-0.3, 0, 0], seg2: 8 });
    cone(tuft, [0.035, -0.03, 0.01], 0.035, 0.1, '#ffb33d', { rot: [-0.3, 0, -0.4], seg2: 8 });
    cone(tuft, [-0.035, -0.03, 0.01], 0.035, 0.09, '#ffb33d', { rot: [-0.3, 0, 0.4], seg2: 8 });
    quadLegs(r, { fx: 0.085, fz: 0.07, bz: -0.16, top: 0.13, rad: 0.048, color: '#ff9a45', paw: '#ffd24a', pawR: 0.05 });
    const tail = part(r.body, 'tail', [0, 0.03, -0.19]);
    tube(tail, [[0, 0, 0], [0.02, 0.08, -0.08], [0.0, 0.2, -0.1], [-0.03, 0.27, -0.04]], 0.03, 0.04, '#ff9a45', 14, 8);
    cone(tail, [-0.03, 0.27, -0.04], 0.06, 0.13, '#ff6a2a', { rot: [0.3, 0, 0.3], seg2: 8 });
    cone(tail, [-0.02, 0.27, -0.03], 0.035, 0.09, '#ffd24a', { rot: [0.3, 0, 0.1], seg2: 8 });
    return r.root;
  },

  'nebula-owl': () => {
    const r = rig('ground', [0, 0.28, 0]);
    const C: V3 = [0, 0, 0];
    const R: V3 = [0.23, 0.25, 0.21];
    ell(r.head, C, R, '#6a4fc4');
    // lavender face disc and belly
    ell(r.head, [0, 0.06, 0.1], [0.18, 0.13, 0.12], '#c9b8ff');
    ell(r.head, [0, -0.11, 0.1], [0.14, 0.12, 0.11], '#b9a6f6');
    face(r.head, r.eyes, C, R, { eyeSize: 0.065, spread: 0.36, lift: 0.22, mouth: 'none', beak: '#ffc23d', blush: true });
    const ears = part(r.head, 'ears', [0, 0.22, 0]);
    for (const s of [-1, 1]) cone(ears, [s * 0.13, -0.03, 0], 0.06, 0.13, '#5a40b0', { rot: [0, 0, -s * 0.45], sz: 0.5, seg2: 6 });
    // layered folded wings with gold stars
    wings(r, [0.2, 0.0, -0.02], (g, s) => {
      for (let k = 0; k < 3; k++) {
        const m = ell(g, [s * 0.02, -0.02 - k * 0.04, -0.01 - k * 0.01], [0.06, 0.15 - k * 0.025, 0.12 - k * 0.02], k % 2 ? '#5a40b0' : '#7a5ad6', { seg: [12, 10] });
        m.rotation.z = s * (0.15 + k * 0.08);
      }
      const st = new THREE.Group();
      st.position.set(s * 0.065, 0.0, 0.0);
      st.rotation.y = s * Math.PI / 2;
      plate(st, starShape(0.03), 0.008, '#ffd24a', [0, 0, 0], [0, 0, 0], 0.004);
      g.add(st);
    });
    goldStar(r.head, C, R, [0.15, -0.55, 0.9], 0.02);
    feet(r, 0.07, 0.06, 0.04, '#ffc23d');
    return r.root;
  },

  'star-whalelet': () => {
    const r = rig('float', [0, 0.3, 0]);
    const C: V3 = [0, 0, 0];
    const R: V3 = [0.23, 0.2, 0.25];
    ell(r.head, C, R, '#28326f');
    ell(r.head, [0, -0.07, 0.05], [0.19, 0.13, 0.21], '#b9b0f0');
    face(r.head, r.eyes, C, R, { eyeSize: 0.052, spread: 0.5, lift: 0.15, mouthLift: -0.2 });
    for (const [d, sz] of [[[0.3, 0.6, 0.2], 0.035], [[-0.25, 0.75, -0.2], 0.03], [[0.55, 0.4, -0.4], 0.028], [[-0.6, 0.3, 0.1], 0.025]] as const) goldStar(r.head, C, R, d as unknown as V3, sz);
    wings(r, [0.18, -0.08, 0.04], (g, s) => {
      const fl = ell(g, [s * 0.06, -0.02, 0], [0.08, 0.025, 0.05], '#28326f', { seg: [12, 6] });
      fl.rotation.z = -s * 0.5;
    }, r.head);
    // upward tail with a split fluke
    const tail = part(r.body, 'tail', [0, 0.02, -0.22]);
    tube(tail, [[0, 0, 0], [0, 0.03, -0.1], [0, 0.11, -0.17], [0, 0.18, -0.19]], 0.085, 0.03, '#28326f', 12, 9);
    for (const s of [-1, 1]) {
      const fluke = new THREE.Shape();
      fluke.moveTo(0, 0);
      fluke.quadraticCurveTo(0.06, 0.02, 0.13, 0.07);
      fluke.quadraticCurveTo(0.1, -0.02, 0, -0.03);
      plate(tail, mirrorShape(fluke, s as 1 | -1), 0.02, '#3a438a', [0, 0.19, -0.19], [-0.3, 0, 0], 0.008);
    }
    return r.root;
  },

  'aurora-phoenix': () => {
    const r = rig('fly', [0, 0.28, 0]);
    const C: V3 = [0, 0, 0];
    const R: V3 = [0.2, 0.22, 0.2];
    ell(r.head, C, R, '#ff6f3a');
    ell(r.head, [0, -0.08, 0.1], [0.14, 0.13, 0.11], '#ffd27a');
    face(r.head, r.eyes, C, R, { eyeSize: 0.056, spread: 0.38, lift: 0.18, mouth: 'none', beak: '#ffc23d' });
    // swept crest
    const crest = part(r.head, 'ears', [0, 0.19, -0.02]);
    plate(crest, leafShape(0.18, 0.05), 0.012, '#ff8a2a', [0, 0, 0], [0.9, 0, 0]);
    plate(crest, leafShape(0.15, 0.04), 0.012, '#ffb33d', [0.04, 0, 0.02], [0.8, 0, -0.4]);
    plate(crest, leafShape(0.15, 0.04), 0.012, '#ff6a3a', [-0.04, 0, 0.02], [0.8, 0, 0.4]);
    // pink feather wings
    wings(r, [0.15, 0.04, -0.04], (g, s) => {
      for (let k = 0; k < 4; k++) {
        const pl = plate(g, leafShape(0.32 - k * 0.04, 0.06), 0.012, ['#ff5f8f', '#ff8a3a', '#ff6fb0', '#ffb33d'][k], [0, 0, -k * 0.006], [0, 0, -s * (0.75 + k * 0.32)]);
        pl.rotateX(-0.12);
      }
    });
    const tail = part(r.body, 'tail', [0, -0.1, -0.16]);
    for (let k = 0; k < 5; k++) plate(tail, leafShape(0.22 - Math.abs(k - 2) * 0.03, 0.045), 0.012, k % 2 ? '#ff6fb0' : '#ff8a2a', [0, 0, -k * 0.004], [-1.6 - 0.25, 0, (k - 2) * 0.32]);
    feet(r, 0.06, 0.04, 0.035, '#ffc23d');
    for (const n of ['legsA', 'legsB']) r.root.getObjectByName(n)!.position.y = 0.05;
    return r.root;
  },

  'moon-seraph': () => {
    const r = rig('fly', [0, 0.3, 0]);
    const C: V3 = [0, 0, 0];
    const R: V3 = [0.22, 0.22, 0.21];
    ell(r.head, C, R, '#f7f5ff');
    ell(r.head, [0, -0.08, 0.08], [0.15, 0.13, 0.13], '#ffffff');
    face(r.head, r.eyes, C, R, { eyeSize: 0.058, spread: 0.36, lift: 0.14, mouth: 'small', blush: false });
    for (const s of [-1, 1]) {
      const g = new THREE.Group();
      stick(g, onSurface(C, R, [s * 0.62, -0.05, 0.78]), 0.003, 0.78);
      plate(g, diamondShape(0.022, 0.03), 0.006, '#ffd24a', [0, 0, 0], [0, 0, 0], 0.003);
      r.head.add(g);
    }
    // rounded lavender wings with pale crescents
    wings(r, [0.16, 0.05, -0.06], (g, s) => {
      plate(g, ellipseShape(0.16, 0.15, s * 0.14, 0.04), 0.03, '#bba6ff', [0, 0, 0], [0, s * 0.3, 0], 0.012);
      plate(g, ellipseShape(0.1, 0.09, s * 0.1, -0.1), 0.03, '#a994f5', [0, 0, 0], [0, s * 0.3, 0], 0.012);
      for (const zz of [0.022, -0.022]) {
        const c = new THREE.Group();
        c.position.copy(new THREE.Vector3(...rotY([s * 0.15, 0.05, zz], s * 0.3)));
        c.rotation.y = s * 0.3;
        plate(c, crescentShape(0.05), 0.006, '#efe9ff', [0, 0, 0], [0, 0, s * 0.6], 0.003);
        g.add(c);
      }
    });
    // tiny paws
    const arms = part(r.body, 'arms', [0, -0.12, 0.16]);
    for (const s of [-1, 1]) ell(arms, [s * 0.06, 0, 0], [0.035, 0.03, 0.03], '#efeaff', { seg: [8, 6] });
    feet(r, 0.07, 0.05, 0.035, '#e7e0ff');
    for (const n of ['legsA', 'legsB']) r.root.getObjectByName(n)!.position.y = 0.07;
    halo(r, 0.62, 0.1);
    return r.root;
  },

  'rift-wyrm': () => {
    const r = rig('ground', [0, 0.18, -0.06]);
    // longer body than the other dragons
    ell(r.body, [0, 0, -0.06], [0.15, 0.14, 0.24], '#7a3fd1');
    ell(r.body, [0, -0.03, 0.06], [0.1, 0.1, 0.1], '#ff9ed6');
    const HC: V3 = [0, 0.2, 0.12];
    const HR: V3 = [0.18, 0.16, 0.16];
    ell(r.head, HC, HR, '#8447dc');
    face(r.head, r.eyes, HC, HR, { eyeSize: 0.055, spread: 0.4, lift: 0.2, muzzle: { c: [0, 0.14, 0.23], r: [0.1, 0.07, 0.07], color: '#ff9ed6' } });
    const ears = part(r.head, 'ears', [0, 0.35, 0.1]);
    cone(ears, [0.0, -0.02, 0.03], 0.035, 0.13, '#ffd23f', { rot: [-0.25, 0, 0], seg2: 8 });
    for (const s of [-1, 1]) cone(ears, [s * 0.09, -0.04, -0.03], 0.025, 0.09, '#ffd23f', { rot: [-0.6, 0, -s * 0.4], seg2: 7 });
    for (let i = 0; i < 4; i++) cone(r.body, [0, 0.13 - i * 0.015, -0.0 - i * 0.075], 0.024, 0.055, '#ff8a2a', { rot: [-0.4, 0, 0], seg2: 6 });
    wings(r, [0.08, 0.12, -0.04], (g, s) => batWing(g, s, 0.32, 0.24, '#ff7a2a', '#ff9a3d', 0.3));
    quadLegs(r, { fx: 0.085, fz: 0.08, bz: -0.2, top: 0.13, rad: 0.05, color: '#7a3fd1', paw: '#ff8a2a', pawR: 0.046 });
    const tail = part(r.body, 'tail', [0, -0.05, -0.28]);
    tube(tail, [[0, 0, 0], [0.04, -0.06, -0.12], [0.16, -0.08, -0.17], [0.27, -0.03, -0.12], [0.32, 0.05, -0.04]], 0.06, 0.02, '#7a3fd1', 18, 8);
    cone(tail, [0.32, 0.05, -0.04], 0.045, 0.12, '#ff7a2a', { rot: [0.4, 0, -0.7], sz: 0.4, seg2: 6 });
    return r.root;
  },
};

/** Build a pet model; animated parts are baked and tagged for `animatePet`. */
/** True when the pet id has its own model (not the fallback). */
export function hasPetModel(id: string): boolean {
  return id in BUILDERS;
}

/** Unbaked model (dev tooling). */
export function buildPetRaw(id: string): THREE.Group {
  return (BUILDERS[id] ?? BUILDERS['sprout-puff'])();
}

export function buildPet(id: string): THREE.Group {
  const root = buildPetRaw(id);
  bakeAll(root);
  root.userData.pet = id;
  root.userData.flies = root.userData.kind !== 'ground';
  root.userData.phase = Math.random() * 100;
  root.userData.blinkAt = 1 + Math.random() * 3;
  root.userData.gait = 0;
  const rest: Record<string, { p: THREE.Vector3; r: THREE.Euler; s: THREE.Vector3 }> = {};
  root.traverse((o) => {
    if (o.userData.part) rest[o.name] = { p: o.position.clone(), r: o.rotation.clone(), s: o.scale.clone() };
  });
  root.userData.rest = rest;
  return root;
}


/**
 * Time-based animation. `speed` is the owner's walking speed (0..1); `dt` advances the gait
 * so feet move in proportion to distance travelled (no foot sliding).
 */
export function animatePet(g: THREE.Group, time: number, speed: number, reduced: boolean, dt = 1 / 60): void {
  const u = g.userData;
  const rest = u.rest as Record<string, { p: THREE.Vector3; r: THREE.Euler; s: THREE.Vector3 }>;
  if (!rest) return;
  const t = time + u.phase;
  const k = reduced ? 0.35 : 1;
  const kind = u.kind as Kind;
  const get = (n: string) => {
    const o = g.getObjectByName(n);
    const rs = rest[n];
    if (o && rs) {
      o.position.copy(rs.p);
      o.rotation.copy(rs.r);
      o.scale.copy(rs.s);
    }
    return o;
  };
  const body = get('body');
  const head = get('head');
  const eyes = get('eyes');
  const ears = get('ears');
  const tail = get('tail');
  const wl = get('wingL');
  const wr = get('wingR');
  const la = get('legsA');
  const lb = get('legsB');
  const moving = speed > 0.05;
  u.gait += dt * speed * 14;

  // ---- body: breathing, hover or hop ----
  if (body) {
    const br = Math.sin(t * 2.4) * 0.018 * k;
    body.scale.set(rest.body.s.x * (1 - br * 0.5), rest.body.s.y * (1 + br), rest.body.s.z * (1 - br * 0.5));
    if (kind === 'float') body.position.y += Math.sin(t * 1.6) * 0.035 * k;
    else if (kind === 'fly') body.position.y += Math.sin(t * 2.6) * 0.03 * k;
    else if (moving) body.position.y += Math.abs(Math.sin(u.gait)) * 0.025 * k;
  }
  if (head) {
    head.rotation.z = Math.sin(t * 0.9) * 0.05 * k;
    head.rotation.y = Math.sin(t * 0.47) * 0.12 * k;
    head.rotation.x = Math.sin(t * 0.7 + 1) * 0.04 * k;
  }
  // ---- blink every few seconds ----
  if (eyes && !u.noBlink) {
    const since = t % (u.blinkAt + 2.5);
    eyes.scale.y = since < 0.12 ? 0.12 : 1;
  }
  // ---- ears / antennae / crest ----
  if (ears) {
    const twitch = Math.max(0, Math.sin(t * 0.6)) > 0.97 ? Math.sin(t * 40) * 0.12 : 0;
    ears.rotation.x = Math.sin(t * 1.7) * 0.06 * k + twitch * k;
  }
  // ---- tail ----
  if (tail) {
    if (u.pet === 'star-whalelet') tail.rotation.x = Math.sin(t * 1.4) * 0.18 * k;
    else tail.rotation.y = Math.sin(t * (2.6 + speed * 6)) * (0.22 + speed * 0.15) * k;
  }
  // ---- wings / fins / flippers ----
  if (wl && wr) {
    let a = 0;
    if (u.pet === 'prism-ray') a = Math.sin(t * 2.2) * 0.32;
    else if (u.pet === 'star-whalelet') a = Math.sin(t * 1.5) * 0.3;
    else if (kind === 'fly') a = 0.25 + Math.sin(t * 9) * 0.5;
    else if (u.pet === 'nebula-owl') a = Math.max(0, Math.sin(t * 0.8)) > 0.95 ? Math.sin(t * 20) * 0.25 : 0;
    else a = Math.sin(t * (moving ? 6 : 2.2)) * (moving ? 0.25 : 0.1);
    wl.rotation.z = rest.wingL.r.z - a * k;
    wr.rotation.z = rest.wingR.r.z + a * k;
  }
  // ---- legs: diagonal pairs step with distance travelled ----
  if (la && lb && kind === 'ground') {
    if (moving) {
      const s1 = Math.sin(u.gait);
      la.position.y += Math.max(0, s1) * 0.03;
      lb.position.y += Math.max(0, -s1) * 0.03;
      la.position.z += s1 * 0.02;
      lb.position.z -= s1 * 0.02;
    }
  } else if (la && lb) {
    // dangling feet for fliers
    la.rotation.x = Math.sin(t * 2) * 0.15 * k;
    lb.rotation.x = -Math.sin(t * 2) * 0.15 * k;
  }
  // ---- species extras ----
  const arms = get('arms');
  if (arms) arms.rotation.x = Math.sin(t * 1.9) * 0.08 * k;
  const flame = get('flame');
  if (flame) flame.scale.set(1 + Math.sin(t * 11) * 0.06, 1 + Math.sin(t * 15) * 0.12 * k, 1);
  for (const n of ['clawL', 'clawR']) {
    const c = get(n);
    if (c) c.rotation.z = (n === 'clawL' ? 1 : -1) * Math.max(0, Math.sin(t * 1.3)) * 0.18 * k;
  }
  for (const n of ['pinchL', 'pinchR']) {
    const p = get(n);
    if (p) p.rotation.z = (n === 'pinchL' ? 1 : -1) * (0.15 + Math.sin(t * 5) * 0.25) * k;
  }
  const ta = get('tentA');
  const tb = get('tentB');
  if (ta && tb) {
    ta.rotation.y = Math.sin(t * 1.3) * 0.2 * k;
    tb.rotation.y = -Math.sin(t * 1.3 + 0.8) * 0.2 * k;
    ta.scale.y = 1 + Math.sin(t * 2.1) * 0.08 * k;
    tb.scale.y = 1 + Math.sin(t * 2.1 + 1.2) * 0.08 * k;
  }
  if (u.pet === 'lantern-jelly' && body) {
    const pulse = Math.sin(t * 2.1) * 0.06 * k;
    body.scale.set(1 + pulse, 1 - pulse * 0.8, 1 + pulse);
  }
  const hl = get('halo');
  if (hl) hl.position.y += Math.sin(t * 1.5) * 0.015 * k;
  if (u.pet === 'coral-crab' && la && lb) {
    // side shuffle: legs alternate a little even at rest
    la.rotation.z = Math.sin(t * (moving ? 10 : 1.6)) * (moving ? 0.12 : 0.03);
    lb.rotation.z = -Math.sin(t * (moving ? 10 : 1.6)) * (moving ? 0.12 : 0.03);
  }
}

/** Pets fly or hop after the player in a loose formation. */
export class PetFollowers {
  private items: { id: string; g: THREE.Group; pos: THREE.Vector3; facing: number }[] = [];
  private key = '';
  private t = 0;
  private aura: THREE.Mesh[] = [];
  private tmp = new THREE.Vector3();
  private auraGeo = new THREE.RingGeometry(0.28, 0.4, 24).rotateX(-Math.PI / 2);
  private auraMats: Record<string, THREE.MeshBasicMaterial> = {
    legendary: new THREE.MeshBasicMaterial({ color: '#ffd23f', transparent: true, opacity: 0.45, depthWrite: false }),
    epic: new THREE.MeshBasicMaterial({ color: '#c38bff', transparent: true, opacity: 0.45, depthWrite: false }),
  };

  constructor(private scene: THREE.Scene) {}

  /** Rebuild when the equipped list changes; disposes only per-instance geometry. */
  sync(ids: string[], near: THREE.Vector3): void {
    const key = ids.join(',');
    if (key === this.key) return;
    this.key = key;
    for (const it of this.items) {
      this.scene.remove(it.g);
      disposeModel(it.g);
    }
    for (const a of this.aura) this.scene.remove(a);
    this.items = [];
    this.aura = [];
    ids.forEach((id) => {
      const g = buildPet(id);
      g.scale.setScalar(1.1);
      g.position.copy(near);
      this.scene.add(g);
      this.items.push({ id, g, pos: near.clone(), facing: 0 });
      const r = PETS_BY_ID[id].rarity;
      if (r === 'epic' || r === 'legendary') {
        const ring = new THREE.Mesh(this.auraGeo, this.auraMats[r]);
        ring.userData.owner = g;
        this.scene.add(ring);
        this.aura.push(ring);
      }
    });
  }

  update(dt: number, player: THREE.Vector3, facing: number, _speed: number, reduced: boolean, cam?: THREE.Vector3): void {
    this.t += dt;
    const n = this.items.length;
    this.items.forEach((it, i) => {
      // slots fan out behind the player
      const spread = n === 1 ? 0 : (i / (n - 1) - 0.5) * 1.8;
      const behind = 1.1 + (i % 2) * 0.25;
      const ox = Math.cos(facing) * spread - Math.sin(facing) * behind;
      const oz = -Math.sin(facing) * spread - Math.cos(facing) * behind;
      const flies = !!it.g.userData.flies;
      this.tmp.set(player.x + ox, flies ? 0.75 + i * 0.1 : 0, player.z + oz);
      const k = 1 - Math.exp(-dt * (4 + i));
      const dx = this.tmp.x - it.pos.x;
      const dz = this.tmp.z - it.pos.z;
      const px = it.pos.x, pz = it.pos.z;
      it.pos.lerp(this.tmp, k);
      const moved = Math.hypot(it.pos.x - px, it.pos.z - pz) / Math.max(dt, 1e-4);
      if (dx * dx + dz * dz > 0.002) it.facing = Math.atan2(dx, dz);
      else {
        // at rest, turn to look at the camera so their faces show
        const want = cam ? Math.atan2(cam.x - it.pos.x, cam.z - it.pos.z) : facing;
        it.facing += Math.atan2(Math.sin(want - it.facing), Math.cos(want - it.facing)) * Math.min(1, dt * 3);
      }
      it.g.position.copy(it.pos);
      it.g.rotation.y = it.facing;
      // gait follows the pet's own ground speed, so feet don't slide
      animatePet(it.g, this.t, Math.min(1, moved / 5.2), reduced, dt);
    });
    for (const a of this.aura) {
      const owner = a.userData.owner as THREE.Group;
      a.position.set(owner.position.x, 0.03, owner.position.z);
      const s = 1 + Math.sin(this.t * 3) * 0.12;
      a.scale.set(s, 1, s);
    }
  }

  /** World positions for sparkle effects on rare pets. */
  sparklePoints(): { pos: THREE.Vector3; rarity: string }[] {
    return this.items.map((it) => ({ pos: it.pos, rarity: PETS_BY_ID[it.id].rarity }));
  }
}

/** Dispose a pet's own baked geometry (shared materials and cached geometry are kept). */
export function disposeModel(g: THREE.Object3D): void {
  g.traverse((o) => {
    if (o instanceof THREE.Mesh && o.name === 'baked') o.geometry.dispose();
  });
}
