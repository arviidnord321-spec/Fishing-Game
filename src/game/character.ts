import * as THREE from 'three';
import { bakeChildrenByColor } from './bake';
import { blobShadow, flat } from './materials';

export interface CharacterColors {
  coat: string;
  hat: string;
  boots: string;
  pants: string;
  skin: string;
  rod: string;
  rodAccent: string;
}

export const PLAYER_COLORS: CharacterColors = {
  coat: '#ffd23f',
  hat: '#ffb703',
  boots: '#2a6f97',
  pants: '#36457a',
  skin: '#f5c9a3',
  rod: '#8a5a33',
  rodAccent: '#d7b48a',
};

export type Pose = 'idle' | 'walk' | 'charge' | 'cast' | 'wait' | 'reel' | 'celebrate' | 'shrug';

const ROD_SEGMENTS = 4;
const ROD_LEN = 2.1;

/**
 * Stylized angler built from primitives (~1.65 units tall). Poses blend by weight so
 * transitions never pop. The rod is a chain of segments that bends under tension.
 */
export class Character {
  readonly root = new THREE.Group();
  private body = new THREE.Group();
  private head = new THREE.Group();
  private armL = new THREE.Group();
  private armR = new THREE.Group();
  private legL = new THREE.Group();
  private legR = new THREE.Group();
  private rodSegs: THREE.Group[] = [];
  readonly rodTip = new THREE.Object3D();
  private walkPhase = 0;
  private t = 0;
  pose: Pose = 'idle';
  /** 0..1 how much the rod is bent by line tension. */
  tension = 0;
  /** 0..1 charge amount for the wind-up pose. */
  charge = 0;
  speed = 0;
  private w: Record<Pose, number> = { idle: 1, walk: 0, charge: 0, cast: 0, wait: 0, reel: 0, celebrate: 0, shrug: 0 };
  private castT = 0;

  constructor(colors: CharacterColors = PLAYER_COLORS) {
    const coat = flat(colors.coat);
    const skin = flat(colors.skin);
    const dark = flat('#2b2d42');

    this.root.add(blobShadow(1.1));
    this.root.add(this.body);

    // legs
    for (const [leg, x] of [[this.legL, -0.13], [this.legR, 0.13]] as const) {
      leg.position.set(x, 0.58, 0);
      const thigh = new THREE.Mesh(new THREE.CapsuleGeometry(0.1, 0.32, 3, 8), flat(colors.pants));
      thigh.position.y = -0.24;
      leg.add(thigh);
      const boot = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.18, 0.3), flat(colors.boots));
      boot.position.set(0, -0.5, 0.04);
      leg.add(boot);
      this.body.add(leg);
    }
    // torso (raincoat)
    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.27, 0.36, 4, 10), coat);
    torso.position.y = 0.94;
    torso.scale.set(1, 1, 0.85);
    this.body.add(torso);
    const hem = new THREE.Mesh(new THREE.CylinderGeometry(0.27, 0.33, 0.2, 10), coat);
    hem.position.y = 0.66;
    this.body.add(hem);
    for (let i = 0; i < 3; i++) {
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.03, 5, 4), dark);
      b.position.set(0, 0.78 + i * 0.13, 0.235);
      this.body.add(b);
    }
    // head + bucket hat
    this.head.position.y = 1.36;
    this.body.add(this.head);
    const face = new THREE.Mesh(new THREE.SphereGeometry(0.24, 12, 10), skin);
    this.head.add(face);
    for (const x of [-0.08, 0.08]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.035, 6, 5), dark);
      eye.position.set(x, 0.02, 0.215);
      eye.scale.set(1, 1.3, 0.6);
      this.head.add(eye);
      const cheek = new THREE.Mesh(new THREE.SphereGeometry(0.035, 6, 4), flat('#ff9fa0'));
      cheek.position.set(x * 1.6, -0.06, 0.2);
      cheek.scale.set(1, 0.6, 0.4);
      this.head.add(cheek);
    }
    const smile = new THREE.Mesh(new THREE.TorusGeometry(0.04, 0.01, 4, 8, Math.PI), dark);
    smile.position.set(0, -0.07, 0.225);
    smile.rotation.z = Math.PI;
    this.head.add(smile);
    const hatTop = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.25, 0.2, 10), flat(colors.hat));
    hatTop.position.y = 0.2;
    this.head.add(hatTop);
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.38, 0.04, 14), flat(colors.hat));
    brim.position.y = 0.11;
    brim.rotation.x = 0.08;
    this.head.add(brim);

    // arms with mittens
    for (const [arm, x] of [[this.armL, -0.33], [this.armR, 0.33]] as const) {
      arm.position.set(x, 1.12, 0);
      const sleeve = new THREE.Mesh(new THREE.CapsuleGeometry(0.085, 0.3, 3, 8), coat);
      sleeve.position.y = -0.2;
      arm.add(sleeve);
      const mitten = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), flat(colors.boots));
      mitten.position.y = -0.43;
      arm.add(mitten);
      this.body.add(arm);
    }

    // rod in right hand: chain of segments
    const hand = new THREE.Group();
    hand.position.set(0, -0.43, 0.02);
    this.armR.add(hand);
    const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.05, 0.4, 6), flat(colors.rodAccent));
    handle.rotation.x = Math.PI / 2;
    hand.add(handle);
    const reel = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.07, 8), flat('#d0d6e0'));
    reel.position.set(0.07, -0.02, 0.05);
    reel.rotation.z = Math.PI / 2;
    hand.add(reel);
    let parent: THREE.Object3D = hand;
    const segLen = ROD_LEN / ROD_SEGMENTS;
    const rodMat = flat(colors.rod);
    for (let i = 0; i < ROD_SEGMENTS; i++) {
      const seg = new THREE.Group();
      seg.position.z = i === 0 ? 0.15 : segLen;
      const r0 = 0.035 - i * 0.007;
      const mesh = new THREE.Mesh(new THREE.CylinderGeometry(Math.max(0.008, r0 - 0.007), r0, segLen, 5), rodMat);
      mesh.rotation.x = Math.PI / 2;
      mesh.position.z = segLen / 2;
      seg.add(mesh);
      parent.add(seg);
      this.rodSegs.push(seg);
      parent = seg;
    }
    this.rodTip.position.z = segLen;
    parent.add(this.rodTip);
    for (const g of [this.body, this.head, this.armL, this.armR, this.legL, this.legR]) bakeChildrenByColor(g);
  }

  setRodColors(rod: string, accent: string): void {
    const m = flat(rod);
    for (const s of this.rodSegs) (s.children[0] as THREE.Mesh).material = m;
    const hand = this.armR.children.find((c) => c instanceof THREE.Group) as THREE.Group;
    (hand.children[0] as THREE.Mesh).material = flat(accent);
  }

  /** Play a one-shot cast release swing. */
  triggerCast(): void {
    this.castT = 0;
    this.pose = 'cast';
  }

  update(dt: number, reducedMotion: boolean): void {
    this.t += dt;
    if (this.pose === 'cast') {
      this.castT += dt;
      if (this.castT > 0.45) this.pose = 'wait';
    }
    // pose weights
    const target = this.pose;
    const rate = Math.min(1, dt * 12);
    for (const k of Object.keys(this.w) as Pose[]) this.w[k] += ((k === target ? 1 : 0) - this.w[k]) * rate;

    const w = this.w;
    const speedK = Math.min(1, this.speed / 5.2);
    this.walkPhase += dt * (4 + 7 * speedK) * (w.walk > 0.1 ? 1 : 0);
    const swing = Math.sin(this.walkPhase) * 0.75 * speedK * w.walk;
    const bob = Math.abs(Math.sin(this.walkPhase)) * 0.06 * speedK * w.walk;
    const idleSway = reducedMotion ? 0 : Math.sin(this.t * 1.8) * 0.02;

    // celebrate hop
    const hop = w.celebrate * Math.abs(Math.sin(this.t * 7)) * 0.18 * (reducedMotion ? 0.3 : 1);
    this.body.position.y = bob + hop;
    this.body.rotation.z = idleSway * w.idle;

    this.legL.rotation.x = swing;
    this.legR.rotation.x = -swing;

    // Arm angles: x rotation (negative = forward/up)
    const castSwing = this.castT < 0.45 ? Math.sin((this.castT / 0.45) * Math.PI * 0.5) : 1;
    const armRx =
      w.idle * -0.35 +
      w.walk * (-0.35 + swing * 0.3) +
      w.charge * (-2.8 - 0.4 * this.charge) +
      w.cast * (-3.2 + 2.3 * castSwing) +
      w.wait * -0.9 +
      w.reel * (-0.95 - 0.25 * this.tension + Math.sin(this.t * 14) * 0.05) +
      w.celebrate * -2.6 +
      w.shrug * -0.6;
    this.armR.rotation.set(armRx, 0, w.celebrate * 0.3 + w.shrug * 0.3);
    const armLx =
      w.idle * 0.05 + w.walk * -swing * 0.6 + w.charge * -0.6 + w.cast * -0.7 + w.wait * -0.5 + w.reel * -1.0 + w.celebrate * -2.7 + w.shrug * -0.4;
    this.armL.rotation.set(armLx, 0, -(w.celebrate * 0.3 + w.shrug * 0.6) + w.reel * 0.5);
    this.head.rotation.set(w.reel * 0.15 + w.wait * 0.1, 0, w.shrug * 0.2 * Math.sin(this.t * 6));

    // Rod: segments rotate to aim forward and bend with tension.
    const bend = (0.04 + this.tension * 0.22) * (w.reel + w.wait * 0.3 + w.charge * 0.2);
    for (let i = 0; i < this.rodSegs.length; i++) {
      const base = i === 0 ? -0.15 + w.reel * 0.1 : 0;
      this.rodSegs[i].rotation.x = base + bend * (i + 1) * 0.6 + (w.reel * Math.sin(this.t * 9 + i) * 0.02 * this.tension);
    }
  }
}
