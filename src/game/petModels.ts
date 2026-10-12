import * as THREE from 'three';
import { PETS_BY_ID, type PetDef } from '../data/pets';
import { bakeChildrenByColor } from './bake';
import { flat } from './materials';

/**
 * Chibi pets built from primitives: a big round body with a face, plus feature parts.
 * Static parts are baked into one mesh; moving parts (wings, tail, flames, orbiting stars)
 * stay in named groups for `animatePet`. Faces +z. About 0.6 units tall before scaling.
 */

const white = flat('#ffffff');
const ink = flat('#1d1b2e');
const blush = flat('#ff9fb5');
const glowGold = new THREE.MeshBasicMaterial({ color: '#ffe27a' });
const flameMat = new THREE.MeshBasicMaterial({ color: '#ff9a3d' });
const flameCore = new THREE.MeshBasicMaterial({ color: '#fff0a8' });

function m(geo: THREE.BufferGeometry, mat: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh {
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(x, y, z);
  return mesh;
}

export function buildPet(id: string): THREE.Group {
  const p = PETS_BY_ID[id];
  const root = new THREE.Group();
  const bodyG = new THREE.Group(); // bobs as a whole
  root.add(bodyG);
  const stat = new THREE.Group(); // baked static parts
  bodyG.add(stat);
  const body = flat(p.color);
  const belly = flat(p.belly);
  const accent = flat(p.accent);

  // ---- body ----
  const sx = p.body === 'long' ? 1.15 : p.body === 'tall' ? 0.88 : 1;
  const sy = p.body === 'tall' ? 1.12 : p.body === 'long' ? 0.88 : 0.95;
  const sz = p.body === 'long' ? 1.25 : 0.95;
  const torso = m(new THREE.SphereGeometry(0.3, 22, 16), body, 0, 0.3, 0);
  torso.scale.set(sx, sy, sz);
  stat.add(torso);
  // belly: a flat oval patch laid on the body surface (no intersecting spheres, no seams)
  const by = 0.17;
  const ny = (by - 0.3) / (0.3 * sy);
  const zSurf = sz * 0.3 * Math.sqrt(Math.max(0, 1 - ny * ny));
  const tummy = m(new THREE.CircleGeometry(0.115, 24), belly, 0, by, zSurf + 0.004);
  tummy.scale.set(sx * 1.05, sy * 0.95, 1);
  tummy.rotation.x = Math.asin(Math.max(-1, Math.min(1, ny))) * 0.8;
  stat.add(tummy);
  // feet
  for (const s of [-1, 1]) {
    const foot = m(new THREE.SphereGeometry(0.075, 10, 8), accent, s * 0.13 * sx, 0.04, 0.08);
    foot.scale.set(1, 0.6, 1.2);
    stat.add(foot);
  }
  // ---- face: big glossy eyes, blush, tiny smile ----
  const fz = 0.27 * sz;
  for (const s of [-1, 1]) {
    const eyeW = m(new THREE.SphereGeometry(0.075, 12, 10), white, s * 0.1, 0.36, fz - 0.02);
    eyeW.scale.set(1, 1.15, 0.55);
    stat.add(eyeW);
    const pupil = m(new THREE.SphereGeometry(0.052, 12, 10), ink, s * 0.1, 0.355, fz + 0.005);
    pupil.scale.set(1, 1.2, 0.5);
    stat.add(pupil);
    stat.add(m(new THREE.SphereGeometry(0.018, 6, 5), white, s * 0.1 + 0.02, 0.385, fz + 0.03));
    stat.add(m(new THREE.SphereGeometry(0.009, 5, 4), white, s * 0.1 - 0.015, 0.335, fz + 0.03));
    const cheek = m(new THREE.SphereGeometry(0.035, 8, 6), blush, s * 0.18, 0.29, fz - 0.05);
    cheek.scale.set(1, 0.55, 0.4);
    stat.add(cheek);
  }
  const smile = m(new THREE.TorusGeometry(0.03, 0.009, 4, 10, Math.PI), ink, 0, 0.29, fz + 0.005);
  smile.rotation.z = Math.PI;
  stat.add(smile);

  const top = 0.3 + 0.3 * sy;
  const back = -0.28 * sz;
  for (const f of p.features) addFeature(f, p, { root, bodyG, stat, body, belly, accent, top, back, sx, sz });

  bakeChildrenByColor(stat);
  root.userData.pet = id;
  root.userData.bodyG = bodyG;
  return root;
}

interface Ctx {
  root: THREE.Group;
  bodyG: THREE.Group;
  stat: THREE.Group;
  body: THREE.Material;
  belly: THREE.Material;
  accent: THREE.Material;
  top: number;
  back: number;
  sx: number;
  sz: number;
}

function addFeature(f: PetDef['features'][number], p: PetDef, c: Ctx): void {
  const { stat, bodyG, body, accent, top, back } = c;
  switch (f) {
    case 'catEars':
      for (const s of [-1, 1]) {
        const ear = m(new THREE.ConeGeometry(0.08, 0.16, 4), body, s * 0.15, top - 0.02, 0);
        ear.rotation.z = -s * 0.35;
        stat.add(ear);
        const inner = m(new THREE.ConeGeometry(0.045, 0.1, 4), flat(p.belly), s * 0.15, top - 0.03, 0.025);
        inner.rotation.z = -s * 0.35;
        stat.add(inner);
      }
      break;
    case 'bunnyEars':
      for (const s of [-1, 1]) {
        const ear = m(new THREE.CapsuleGeometry(0.045, 0.2, 4, 8), body, s * 0.09, top + 0.1, -0.02);
        ear.rotation.z = -s * 0.2;
        stat.add(ear);
      }
      break;
    case 'beeWings':
    case 'mothWings':
    case 'birdWings': {
      const wings = new THREE.Group();
      wings.name = 'wings';
      wings.position.set(0, 0.38, back * 0.6);
      for (const s of [-1, 1]) {
        const pivot = new THREE.Group();
        pivot.name = s < 0 ? 'wingL' : 'wingR';
        let w: THREE.Mesh;
        if (f === 'beeWings') {
          w = m(new THREE.SphereGeometry(0.14, 10, 6), new THREE.MeshLambertMaterial({ color: '#eaffff', transparent: true, opacity: 0.8 }), s * 0.2, 0.1, 0);
          w.scale.set(1, 0.65, 0.12);
        } else if (f === 'mothWings') {
          w = m(new THREE.CircleGeometry(0.22, 14), new THREE.MeshLambertMaterial({ color: p.accent, side: THREE.DoubleSide }), s * 0.26, 0.1, 0);
          w.scale.set(1.15, 0.95, 1);
          const spot = m(new THREE.CircleGeometry(0.065, 10), new THREE.MeshBasicMaterial({ color: '#ffffff', side: THREE.DoubleSide }), s * 0.3, 0.13, 0.002);
          pivot.add(spot);
        } else {
          w = m(new THREE.ConeGeometry(0.12, 0.36, 4), accent, s * 0.27, 0.06, 0);
          w.rotation.z = s * 1.05;
          w.scale.set(1, 1, 0.3);
        }
        pivot.add(w);
        wings.add(pivot);
      }
      bodyG.add(wings);
      c.root.userData.flies = true;
      break;
    }
    case 'horn': {
      const horn = m(new THREE.ConeGeometry(0.045, 0.18, 6), glowGold, 0, top + 0.04, 0.12);
      horn.rotation.x = 0.35;
      stat.add(horn);
      break;
    }
    case 'antlers':
      for (const s of [-1, 1]) {
        const a = m(new THREE.CylinderGeometry(0.015, 0.02, 0.18, 5), flat('#8a5a33'), s * 0.12, top + 0.05, 0);
        a.rotation.z = -s * 0.4;
        stat.add(a);
        const b = m(new THREE.CylinderGeometry(0.012, 0.015, 0.09, 5), flat('#8a5a33'), s * 0.19, top + 0.1, 0);
        b.rotation.z = s * 0.5;
        stat.add(b);
      }
      break;
    case 'leaf': {
      stat.add(m(new THREE.CylinderGeometry(0.012, 0.015, 0.1, 5), flat('#3d7a35'), 0, top + 0.03, 0));
      const leaf = m(new THREE.SphereGeometry(0.07, 8, 6), flat('#7ee081'), 0.05, top + 0.09, 0);
      leaf.scale.set(1.4, 0.4, 0.8);
      leaf.rotation.z = 0.5;
      stat.add(leaf);
      break;
    }
    case 'foxTail':
    case 'fishTail': {
      const tail = new THREE.Group();
      tail.name = 'tail';
      tail.position.set(0, 0.25, back - 0.02);
      if (f === 'foxTail') {
        const t = m(new THREE.SphereGeometry(0.1, 10, 8), body, 0, 0.08, -0.12);
        t.scale.set(0.9, 0.9, 1.8);
        tail.add(t);
        const tip = m(new THREE.SphereGeometry(0.06, 8, 6), white, 0, 0.12, -0.26);
        tail.add(tip);
      } else {
        const t = m(new THREE.ConeGeometry(0.11, 0.2, 4), accent, 0, 0.02, -0.12);
        t.rotation.x = Math.PI / 2;
        t.scale.set(1, 1, 0.25);
        tail.add(t);
      }
      bodyG.add(tail);
      break;
    }
    case 'flame': {
      const flame = new THREE.Group();
      flame.name = 'flame';
      flame.position.set(0, top + 0.02, -0.02);
      flame.add(m(new THREE.ConeGeometry(0.08, 0.22, 7), flameMat, 0, 0.1, 0));
      flame.add(m(new THREE.ConeGeometry(0.045, 0.13, 7), flameCore, 0, 0.07, 0.02));
      bodyG.add(flame);
      break;
    }
    case 'shell': {
      const shell = m(new THREE.SphereGeometry(0.26, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), accent, 0, 0.32, -0.06);
      shell.scale.set(1, 0.7, 0.9);
      shell.rotation.x = -0.4;
      stat.add(shell);
      break;
    }
    case 'claws':
      for (const s of [-1, 1]) {
        const arm = m(new THREE.SphereGeometry(0.08, 8, 6), accent, s * 0.34, 0.24, 0.1);
        arm.scale.set(1, 0.8, 1.2);
        stat.add(arm);
        const pinch = m(new THREE.ConeGeometry(0.04, 0.1, 4), accent, s * 0.36, 0.3, 0.17);
        pinch.rotation.x = 0.6;
        stat.add(pinch);
      }
      break;
    case 'tentacles':
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        const t = m(new THREE.CapsuleGeometry(0.025, 0.14, 3, 6), flat(p.accent), Math.cos(a) * 0.15, 0.02, Math.sin(a) * 0.15);
        stat.add(t);
      }
      break;
    case 'halo': {
      const halo = m(new THREE.TorusGeometry(0.13, 0.018, 6, 20), glowGold, 0, top + 0.12, 0);
      halo.rotation.x = Math.PI / 2;
      halo.name = 'halo';
      bodyG.add(halo);
      break;
    }
    case 'stars': {
      const orbit = new THREE.Group();
      orbit.name = 'orbit';
      orbit.position.y = 0.32;
      for (let i = 0; i < 3; i++) {
        const st = m(new THREE.OctahedronGeometry(0.035, 0), glowGold);
        const a = (i / 3) * Math.PI * 2;
        st.position.set(Math.cos(a) * 0.42, Math.sin(a * 2) * 0.05, Math.sin(a) * 0.42);
        orbit.add(st);
      }
      c.root.add(orbit);
      break;
    }
    case 'crest':
      for (let i = 0; i < 3; i++) {
        const sp = m(new THREE.ConeGeometry(0.035, 0.1, 4), accent, 0, top - 0.01 - i * 0.04, -0.06 - i * 0.08);
        sp.rotation.x = -0.5 - i * 0.3;
        stat.add(sp);
      }
      break;
    case 'whiskers':
      for (const s of [-1, 1]) {
        for (let k = 0; k < 2; k++) {
          const w = m(new THREE.BoxGeometry(0.14, 0.008, 0.008), ink, s * 0.22, 0.29 - k * 0.025, 0.24 * c.sz);
          w.rotation.z = s * (0.15 - k * 0.3);
          stat.add(w);
        }
      }
      break;
  }
}

/** Idle/hover animation. `speed` is the owner's walking speed (0..1). */
export function animatePet(g: THREE.Group, t: number, speed: number, reduced: boolean): void {
  const bodyG = g.userData.bodyG as THREE.Group;
  const flies = !!g.userData.flies;
  const k = reduced ? 0.3 : 1;
  // fliers hover, walkers hop while moving
  bodyG.position.y = flies ? 0.05 + Math.sin(t * 3.1) * 0.06 * k : Math.abs(Math.sin(t * (6 + speed * 6))) * (0.03 + speed * 0.09) * k;
  bodyG.rotation.z = Math.sin(t * 2.3) * 0.06 * k;
  const wings = bodyG.getObjectByName('wings');
  if (wings) {
    const flap = Math.sin(t * (flies ? 16 : 8)) * 0.6 * k;
    const l = wings.getObjectByName('wingL');
    const r = wings.getObjectByName('wingR');
    if (l) l.rotation.y = -0.3 + flap;
    if (r) r.rotation.y = 0.3 - flap;
  }
  const tail = bodyG.getObjectByName('tail');
  if (tail) tail.rotation.y = Math.sin(t * (5 + speed * 6)) * 0.5 * k;
  const flame = bodyG.getObjectByName('flame');
  if (flame) flame.scale.set(1 + Math.sin(t * 13) * 0.08, 1 + Math.sin(t * 17) * 0.15 * k, 1);
  const halo = bodyG.getObjectByName('halo');
  if (halo) halo.rotation.z = t * 0.8;
  const orbit = g.getObjectByName('orbit');
  if (orbit) orbit.rotation.y = t * 1.6;
}

/** Pets fly or hop after the player in a loose formation. */
export class PetFollowers {
  private items: { id: string; g: THREE.Group; pos: THREE.Vector3; facing: number }[] = [];
  private key = '';
  private t = 0;
  private aura: THREE.Mesh[] = [];
  private tmp = new THREE.Vector3();

  constructor(private scene: THREE.Scene) {}

  /** Rebuild when the equipped list changes. */
  sync(ids: string[], near: THREE.Vector3): void {
    const key = ids.join(',');
    if (key === this.key) return;
    this.key = key;
    for (const it of this.items) this.scene.remove(it.g);
    for (const a of this.aura) this.scene.remove(a);
    this.items = [];
    this.aura = [];
    ids.forEach((id) => {
      const g = buildPet(id);
      g.scale.setScalar(1.15);
      g.position.copy(near);
      this.scene.add(g);
      this.items.push({ id, g, pos: near.clone(), facing: 0 });
      const r = PETS_BY_ID[id].rarity;
      if (r === 'epic' || r === 'legendary') {
        const ring = new THREE.Mesh(
          new THREE.RingGeometry(0.28, 0.4, 24).rotateX(-Math.PI / 2),
          new THREE.MeshBasicMaterial({ color: r === 'legendary' ? '#ffd23f' : '#c38bff', transparent: true, opacity: 0.5, depthWrite: false }),
        );
        ring.userData.owner = g;
        this.scene.add(ring);
        this.aura.push(ring);
      }
    });
  }

  update(dt: number, player: THREE.Vector3, facing: number, speed: number, reduced: boolean, cam?: THREE.Vector3): void {
    this.t += dt;
    const n = this.items.length;
    this.items.forEach((it, i) => {
      // slots fan out behind the player
      const spread = n === 1 ? 0 : (i / (n - 1) - 0.5) * 1.8;
      const behind = 1.1 + (i % 2) * 0.25;
      const ox = Math.cos(facing) * spread - Math.sin(facing) * behind;
      const oz = -Math.sin(facing) * spread - Math.cos(facing) * behind;
      const flies = !!it.g.userData.flies;
      this.tmp.set(player.x + ox, flies ? 0.9 + i * 0.12 : 0, player.z + oz);
      const k = 1 - Math.exp(-dt * (4 + i));
      const dx = this.tmp.x - it.pos.x;
      const dz = this.tmp.z - it.pos.z;
      it.pos.lerp(this.tmp, k);
      if (dx * dx + dz * dz > 0.002) it.facing = Math.atan2(dx, dz);
      else {
        // at rest, turn to look at the camera so their faces show
        const want = cam ? Math.atan2(cam.x - it.pos.x, cam.z - it.pos.z) : facing;
        it.facing += Math.atan2(Math.sin(want - it.facing), Math.cos(want - it.facing)) * Math.min(1, dt * 3);
      }
      it.g.position.copy(it.pos);
      it.g.rotation.y = it.facing;
      animatePet(it.g, this.t + i * 1.3, Math.min(1, speed / 5.2), reduced);
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
