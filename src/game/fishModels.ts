import * as THREE from 'three';
import { SPECIES_BY_ID } from '../data/species';
import type { FishFeature, ModifierId, SpeciesDef } from '../data/types';
import { flat } from './materials';

/**
 * Procedural low-poly fish. Every species is assembled from shared parts plus
 * species-specific features so silhouettes differ, not just colors.
 * The fish faces +X. Returned group has userData { tail, radius }.
 */

const gold = new THREE.MeshPhongMaterial({ color: '#ffcc4d', emissive: '#6b4a00', specular: '#fff3c4', shininess: 90, flatShading: true });
const glow = new THREE.MeshBasicMaterial({ color: '#c8f6ff' });
const white = flat('#ffffff');
const black = flat('#1a1a2e');
const PRISM = ['#ff7ad9', '#6ff3ff', '#fff27a'];

function bodyGeometry(sp: SpeciesDef, prismatic: boolean): THREE.BufferGeometry {
  const { length, height, width } = sp.body;
  const geo = new THREE.SphereGeometry(0.5, 14, 10);
  geo.scale(length, height, width);
  // taper the tail end
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const colors: number[] = [];
  const top = new THREE.Color(sp.body.color);
  const belly = new THREE.Color(sp.body.belly);
  const tmp = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const back = Math.max(0, -x / (length * 0.5));
    const taper = 1 - back * back * 0.55;
    pos.setY(i, y * taper);
    pos.setZ(i, z * taper);
    if (prismatic) {
      const band = Math.min(2, Math.floor(((x / length) + 0.5) * 3));
      tmp.set(PRISM[band]);
    } else {
      tmp.copy(y < -height * 0.12 ? belly : top);
    }
    colors.push(tmp.r, tmp.g, tmp.b);
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  return geo;
}

const vcMat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });

function fin(w: number, h: number, mat: THREE.Material): THREE.Mesh {
  const g = new THREE.ConeGeometry(w, h, 3);
  g.scale(1, 1, 0.18);
  return new THREE.Mesh(g, mat);
}

function addEyes(g: THREE.Group, sp: SpeciesDef, size = 1): void {
  const { length, height, width } = sp.body;
  for (const s of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.075 * size, 8, 6), white);
    eye.position.set(length * 0.3, height * 0.12, s * width * 0.36);
    g.add(eye);
    const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.042 * size, 6, 5), black);
    pupil.position.set(length * 0.33, height * 0.12, s * (width * 0.36 + 0.045 * size));
    g.add(pupil);
  }
}

function addFeature(g: THREE.Group, f: FishFeature, sp: SpeciesDef, finMat: THREE.Material, mod: ModifierId): void {
  const { length: L, height: H, width: W } = sp.body;
  switch (f) {
    case 'spots':
      for (let i = 0; i < 5; i++) {
        const s = new THREE.Mesh(new THREE.SphereGeometry(0.06, 5, 4), flat(sp.id === 'crown-koi' ? '#ff6a3d' : '#ffffff'));
        s.position.set(-L * 0.25 + i * L * 0.12, H * (0.18 + (i % 2) * 0.08), (i % 2 ? 1 : -1) * W * 0.4);
        s.scale.set(1, 0.6, 0.4);
        g.add(s);
      }
      break;
    case 'ribbons':
      for (const s of [-1, 1]) {
        for (let k = 0; k < 2; k++) {
          const r = new THREE.Mesh(new THREE.BoxGeometry(L * 0.9, 0.03, 0.06), finMat);
          r.position.set(-L * 0.6, -H * 0.2 - k * 0.06, s * W * 0.25);
          r.rotation.z = 0.25 + k * 0.15;
          g.add(r);
        }
      }
      break;
    case 'buttons':
      for (let i = 0; i < 3; i++) {
        const b = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.03, 8), flat('#fff0c8'));
        b.rotation.x = Math.PI / 2;
        b.position.set(-L * 0.15 + i * L * 0.18, H * 0.05, W * 0.48);
        g.add(b);
        const b2 = b.clone();
        b2.position.z *= -1;
        g.add(b2);
      }
      break;
    case 'lantern': {
      const stalk = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.02, 0.5, 4), finMat);
      stalk.position.set(L * 0.38, H * 0.6, 0);
      stalk.rotation.z = -0.6;
      g.add(stalk);
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), new THREE.MeshBasicMaterial({ color: '#fff08a' }));
      bulb.position.set(L * 0.55, H * 0.78, 0);
      g.add(bulb);
      break;
    }
    case 'shell': {
      const shell = new THREE.Mesh(new THREE.SphereGeometry(0.5, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2), flat('#8a6b3a'));
      shell.scale.set(L * 0.85, H * 0.9, W * 0.95);
      shell.position.y = H * 0.12;
      g.add(shell);
      for (let i = 0; i < 4; i++) {
        const plate = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 0.05, 6), flat('#a8884e'));
        plate.position.set(-L * 0.2 + (i % 2) * L * 0.3, H * 0.5, (i < 2 ? 1 : -1) * W * 0.15);
        g.add(plate);
      }
      break;
    }
    case 'horns':
      for (const s of [-1, 1]) {
        const horn = new THREE.Mesh(new THREE.TorusGeometry(0.16 * Math.max(1, H), 0.045, 5, 10, Math.PI * 1.3), mod === 'gilded' ? gold : flat(sp.id === 'rift-leviathan' ? '#ffe6a8' : '#d9f6ff', { opacity: sp.id === 'bubble-ram' ? 0.75 : 1 }));
        horn.position.set(L * 0.25, H * 0.42, s * W * 0.3);
        horn.rotation.set(0, s * 0.3, 0.8);
        g.add(horn);
      }
      break;
    case 'wings':
      for (const s of [-1, 1]) {
        const w = fin(0.22, L * 0.7, finMat);
        w.rotation.set(s * 1.2, 0, Math.PI / 2 + 0.3);
        w.position.set(0, 0, s * W * 0.55);
        g.add(w);
      }
      break;
    case 'spiral':
      for (let i = 0; i < 3; i++) {
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.03, 4, 16), flat('#ffe1cf'));
        ring.rotation.y = Math.PI / 2;
        ring.scale.set(H * (0.95 - i * 0.12), H * (0.95 - i * 0.12), 1);
        ring.position.x = L * (0.12 - i * 0.18);
        ring.rotation.z = 0.25 * i;
        g.add(ring);
      }
      break;
    case 'whiskers':
      for (const s of [-1, 1]) {
        for (let k = 0; k < 2; k++) {
          const w = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.015, 0.55, 3), flat('#5a3418'));
          w.position.set(L * 0.5, -H * 0.1 - k * 0.05, s * W * 0.2);
          w.rotation.set(s * 0.6, 0, Math.PI / 2 + 0.4 + k * 0.3);
          g.add(w);
        }
      }
      break;
    case 'sail': {
      const sail = new THREE.Mesh(new THREE.CircleGeometry(L * 0.45, 8, 0, Math.PI), finMat);
      (sail.material as THREE.Material).side = THREE.DoubleSide;
      sail.scale.set(1, 1.3, 1);
      sail.position.set(-L * 0.02, H * 0.38, 0);
      g.add(sail);
      break;
    }
    case 'crown':
      for (let i = 0; i < 5; i++) {
        const spike = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.22, 4), mod === 'normal' ? flat('#ffd23f') : gold);
        const a = (i - 2) * 0.3;
        spike.position.set(L * 0.22 + Math.sin(a) * 0.1, H * 0.55, Math.sin(a) * 0.14);
        spike.rotation.x = a * 0.6;
        g.add(spike);
      }
      break;
    case 'ray':
      // wide flat body handled by proportions; add long whip tail and wing tips
      {
        const tail = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.04, L * 1.4, 4), finMat);
        tail.rotation.z = Math.PI / 2;
        tail.position.x = -L * 1.1;
        g.add(tail);
        for (const s of [-1, 1]) {
          const tip = fin(0.18, 0.5, finMat);
          tip.rotation.set(Math.PI / 2, 0, s * 0.6);
          tip.position.set(-L * 0.05, 0, s * W * 0.55);
          g.add(tip);
        }
      }
      break;
    case 'crescent': {
      const c = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.05, 4, 10, Math.PI * 1.2), new THREE.MeshBasicMaterial({ color: '#fff2a8' }));
      c.position.set(-L * 0.62, 0, 0);
      c.rotation.z = Math.PI * 0.4;
      g.add(c);
      break;
    }
    case 'eel':
      for (let i = 1; i <= 5; i++) {
        const seg = new THREE.Mesh(new THREE.IcosahedronGeometry(H * 0.55 * (1 - i * 0.1), 0), flat(i % 2 ? '#ffffff' : sp.body.fin));
        seg.position.set(-L * 0.35 * i, Math.sin(i * 1.1) * 0.1, 0);
        seg.name = `seg${i}`;
        g.add(seg);
      }
      break;
    case 'puffer':
      for (let i = 0; i < 18; i++) {
        const phi = Math.acos(1 - (2 * (i + 0.5)) / 18);
        const th = Math.PI * (1 + Math.sqrt(5)) * i;
        const dir = new THREE.Vector3(Math.sin(phi) * Math.cos(th), Math.cos(phi), Math.sin(phi) * Math.sin(th));
        const spike = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.16, 4), flat(PRISM[i % 3]));
        spike.position.copy(dir.clone().multiplyScalar(0.46));
        spike.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
        g.add(spike);
      }
      break;
    case 'spear': {
      const spear = new THREE.Mesh(new THREE.ConeGeometry(0.05, L * 0.6, 5), flat('#c9d6ff'));
      spear.rotation.z = -Math.PI / 2;
      spear.position.x = L * 0.75;
      g.add(spear);
      break;
    }
    case 'whale': {
      const sail = new THREE.Mesh(new THREE.ConeGeometry(0.35, 0.5, 5), mod === 'normal' ? flat('#ffd76e') : gold);
      sail.position.set(0, H * 0.6, 0);
      sail.scale.set(1, 1.2, 0.25);
      g.add(sail);
      for (let i = 0; i < 6; i++) {
        const st = new THREE.Mesh(new THREE.OctahedronGeometry(0.05, 0), new THREE.MeshBasicMaterial({ color: '#fff6c8' }));
        st.position.set(-L * 0.3 + (i % 3) * L * 0.25, H * (0.2 + (i % 2) * 0.12), (i < 3 ? 1 : -1) * W * 0.42);
        g.add(st);
      }
      break;
    }
    case 'serpent':
      for (let i = 1; i <= 7; i++) {
        const seg = new THREE.Mesh(new THREE.IcosahedronGeometry(H * 0.62 * (1 - i * 0.08), 0), flat(i % 2 ? sp.body.color : sp.body.belly));
        seg.position.set(-L * 0.38 * i, Math.sin(i * 0.9) * 0.12, Math.cos(i * 0.7) * 0.06);
        seg.name = `seg${i}`;
        g.add(seg);
        if (i % 2 === 1) {
          const sp2 = fin(0.08, 0.25, finMat);
          sp2.position.set(-L * 0.38 * i, H * 0.42 * (1 - i * 0.08) + seg.position.y, 0);
          g.add(sp2);
        }
      }
      break;
  }
}

export function buildFish(speciesId: string, modifier: ModifierId = 'normal'): THREE.Group {
  const sp = SPECIES_BY_ID[speciesId];
  const g = new THREE.Group();
  const inner = new THREE.Group();
  g.add(inner);
  const prismatic = modifier === 'prismatic';
  const finMat = modifier === 'gilded' ? gold : flat(prismatic ? PRISM[1] : sp.body.fin);
  const { length: L, height: H } = sp.body;

  const body = new THREE.Mesh(bodyGeometry(sp, prismatic), vcMat);
  inner.add(body);

  // tail (skip for eel/serpent which end in segments; ray has a whip)
  const tail = new THREE.Group();
  const noTail = sp.features.includes('ray');
  if (!noTail) {
    const tailFin = fin(H * 0.45, H * 0.7, finMat);
    tailFin.rotation.z = Math.PI / 2;
    tailFin.position.x = -H * 0.3;
    tail.add(tailFin);
  }
  const segmented = sp.features.includes('eel') || sp.features.includes('serpent');
  const segCount = sp.features.includes('serpent') ? 7 : 5;
  tail.position.x = segmented ? -L * (sp.features.includes('serpent') ? 0.38 : 0.35) * segCount - 0.05 : -L * 0.45;
  inner.add(tail);

  // dorsal + pectoral fins
  if (!sp.features.includes('sail') && !sp.features.includes('shell') && !sp.features.includes('ray') && !sp.features.includes('puffer')) {
    const dorsal = fin(L * 0.18, H * 0.45, finMat);
    dorsal.position.set(-L * 0.05, H * 0.48, 0);
    dorsal.rotation.z = -0.4;
    inner.add(dorsal);
  }
  if (!sp.features.includes('ray') && !sp.features.includes('wings')) {
    for (const s of [-1, 1]) {
      const pec = fin(0.08, 0.26, finMat);
      pec.position.set(L * 0.08, -H * 0.18, s * sp.body.width * 0.45);
      pec.rotation.set(s * 0.9, 0, Math.PI / 2 + 0.6);
      inner.add(pec);
    }
  }
  for (const f of sp.features) addFeature(inner, f, sp, finMat, modifier);
  addEyes(inner, sp, sp.features.includes('whale') ? 0.8 : 1);

  if (modifier === 'gilded') {
    for (const s of [-1, 1]) {
      const tip = new THREE.Mesh(new THREE.OctahedronGeometry(0.06, 0), gold);
      tip.position.set(-L * 0.55, H * 0.25, s * 0.02);
      inner.add(tip);
    }
  }
  if (modifier === 'moonlit') {
    for (let i = 0; i < 7; i++) {
      const dot = new THREE.Mesh(new THREE.SphereGeometry(0.035, 5, 4), glow);
      dot.position.set(-L * 0.3 + (i % 4) * L * 0.18, H * (0.05 + (i % 3) * 0.1), (i % 2 ? 1 : -1) * sp.body.width * 0.44);
      inner.add(dot);
    }
  }

  // Normalize so the model is ~1 unit long before species scale.
  const box = new THREE.Box3().setFromObject(inner);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const norm = 1 / Math.max(size.x, size.z, 0.001);
  inner.position.sub(center).multiplyScalar(norm);
  inner.scale.setScalar(norm);
  g.userData.tail = tail;
  g.userData.inner = inner;
  g.userData.radius = (Math.max(size.x, size.y, size.z) * norm) / 2;
  return g;
}

/**
 * Display scale: species model scale times a restrained weight factor (0.8–1.6), times the
 * modifier's visual scale. kg is never used directly as mesh size.
 */
export function displayScale(speciesId: string, weight: number, modifier: ModifierId): number {
  const sp = SPECIES_BY_ID[speciesId];
  const rel = (weight - sp.minWeight) / Math.max(0.001, sp.maxWeight - sp.minWeight);
  const wf = Math.min(1.6, Math.max(0.8, 0.85 + rel * 0.5));
  return sp.modelScale * wf * (modifier === 'giant' ? 1.35 : 1);
}

/** Tail wiggle / segment wave; call each frame on a displayed fish. */
export function animateFish(g: THREE.Group, t: number, intensity: number): void {
  const tail = g.userData.tail as THREE.Group | undefined;
  if (tail) tail.rotation.y = Math.sin(t * 10) * 0.5 * intensity;
  const inner = g.userData.inner as THREE.Group | undefined;
  if (!inner) return;
  for (const c of inner.children) {
    if (c.name.startsWith('seg')) {
      const i = Number(c.name.slice(3));
      c.position.z = Math.sin(t * 5 - i * 0.8) * 0.12 * intensity;
    }
  }
}
