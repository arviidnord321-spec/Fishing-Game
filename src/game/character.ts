import * as THREE from 'three';
import { bakeChildrenByColor, recolorBakedPart } from './bake';
import { blobShadow, flat } from './materials';

export interface CharacterColors {
  coat: string;
  hat: string;
  boots: string;
  pants: string;
  skin: string;
  rod: string;
  rodAccent: string;
  /** Scarf / hat band accent. Optional for villagers. */
  scarf?: string;
}

export const PLAYER_COLORS: CharacterColors = {
  coat: '#ffcf3a',
  hat: '#f2a93b',
  boots: '#22507a',
  pants: '#34477c',
  skin: '#f5c9a3',
  rod: '#8a5a33',
  rodAccent: '#d7b48a',
  scarf: '#22b8b0',
};

export type Pose = 'idle' | 'walk' | 'charge' | 'cast' | 'wait' | 'reel' | 'celebrate' | 'shrug';
const POSES: Pose[] = ['idle', 'walk', 'charge', 'cast', 'wait', 'reel', 'celebrate', 'shrug'];

/** Joint targets for one pose. Angles in radians; negative shoulder/elbow x = forward/up. */
interface Joints {
  hipsY: number;
  lean: number;
  twist: number;
  headX: number;
  headY: number;
  headZ: number;
  lShX: number;
  lShZ: number;
  lElb: number;
  rShX: number;
  rShZ: number;
  rElb: number;
  lHip: number;
  rHip: number;
  lKnee: number;
  rKnee: number;
  /** Rod pitch relative to the body (negative = raised). */
  rod: number;
}

const ZERO: Joints = { hipsY: 0, lean: 0, twist: 0, headX: 0, headY: 0, headZ: 0, lShX: 0, lShZ: 0, lElb: 0, rShX: 0, rShZ: 0, rElb: 0, lHip: 0, rHip: 0, lKnee: 0, rKnee: 0, rod: 0 };
const KEYS = Object.keys(ZERO) as (keyof Joints)[];

const ROD_SEGMENTS = 4;
const ROD_LEN = 2.2;

function easeOutBack(k: number): number {
  const c = 1.9;
  return 1 + (c + 1) * Math.pow(k - 1, 3) + c * Math.pow(k - 1, 2);
}

/**
 * Stylized angler (~1.68 units tall incl. hat), built from primitives and baked per limb so a
 * character costs about a dozen draw calls. Poses are joint-target functions blended by weight.
 */
export class Character {
  readonly root = new THREE.Group();
  private hips = new THREE.Group();
  private torso = new THREE.Group();
  private head = new THREE.Group();
  private shL = new THREE.Group();
  private shR = new THREE.Group();
  private elbL = new THREE.Group();
  private elbR = new THREE.Group();
  private hand = new THREE.Group();
  private hipL = new THREE.Group();
  private hipR = new THREE.Group();
  private kneeL = new THREE.Group();
  private kneeR = new THREE.Group();
  private crank = new THREE.Group();
  private rodSegs: THREE.Group[] = [];
  readonly rodTip = new THREE.Object3D();
  private walkPhase = 0;
  private t = 0;
  private spin = 0;
  pose: Pose = 'idle';
  /** 0..1 how much the rod is bent by line tension. */
  tension = 0;
  /** 0..1 cast charge marker for the wind-up pose. */
  charge = 0;
  speed = 0;
  private w: Record<Pose, number> = { idle: 1, walk: 0, charge: 0, cast: 0, wait: 0, reel: 0, celebrate: 0, shrug: 0 };
  private castT = 1;
  private cur: Joints = { ...ZERO };
  private tmp: Joints = { ...ZERO };

  constructor(colors: CharacterColors = PLAYER_COLORS) {
    const coat = flat(colors.coat);
    const coatDark = flat(shade(colors.coat, 0.82));
    const skin = flat(colors.skin);
    const dark = flat('#26283c');
    const scarf = flat(colors.scarf ?? shade(colors.hat, 0.7));
    const boot = flat(colors.boots);

    this.root.add(blobShadow(1.15));
    this.root.add(this.hips);
    this.hips.position.y = 0.62;

    // ---- legs: thigh, knee, shin, boot with sole ----
    for (const [hip, knee, x] of [[this.hipL, this.kneeL, -0.12], [this.hipR, this.kneeR, 0.12]] as const) {
      hip.position.set(x, 0, 0);
      const thigh = new THREE.Mesh(new THREE.CapsuleGeometry(0.1, 0.16, 3, 8), flat(colors.pants));
      thigh.position.y = -0.15;
      hip.add(thigh);
      knee.position.y = -0.3;
      const shin = new THREE.Mesh(new THREE.CapsuleGeometry(0.095, 0.14, 3, 8), flat(colors.pants));
      shin.position.y = -0.12;
      knee.add(shin);
      const bootTop = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.115, 0.14, 8), boot);
      bootTop.position.y = -0.22;
      knee.add(bootTop);
      const toe = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.1, 0.28), boot);
      toe.position.set(0, -0.28, 0.05);
      knee.add(toe);
      const sole = new THREE.Mesh(new THREE.BoxGeometry(0.21, 0.03, 0.3), dark);
      sole.position.set(0, -0.33, 0.05);
      knee.add(sole);
      hip.add(knee);
      this.hips.add(hip);
    }

    // ---- torso: raincoat with hem flare, zipper, pockets, belt, hood, scarf, creel ----
    this.hips.add(this.torso);
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.26, 0.3, 4, 12), coat);
    body.position.y = 0.3;
    body.scale.set(1, 1, 0.82);
    this.torso.add(body);
    const hem = new THREE.Mesh(new THREE.CylinderGeometry(0.27, 0.34, 0.24, 12), coat);
    hem.position.y = 0.02;
    this.torso.add(hem);
    const hemEdge = new THREE.Mesh(new THREE.CylinderGeometry(0.345, 0.345, 0.035, 12), coatDark);
    hemEdge.position.y = -0.1;
    this.torso.add(hemEdge);
    const zip = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.42, 0.02), coatDark);
    zip.position.set(0, 0.24, 0.218);
    this.torso.add(zip);
    for (const x of [-0.13, 0.13]) {
      const pocket = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.09, 0.03), coatDark);
      pocket.position.set(x, 0.1, 0.22);
      pocket.rotation.y = x * 0.9;
      this.torso.add(pocket);
    }
    const belt = new THREE.Mesh(new THREE.CylinderGeometry(0.275, 0.275, 0.05, 12), flat('#6b4a2e'));
    belt.position.y = 0.17;
    belt.scale.z = 0.84;
    this.torso.add(belt);
    const buckle = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.05, 0.02), flat('#e3c16f'));
    buckle.position.set(0, 0.17, 0.235);
    this.torso.add(buckle);
    const hood = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), coatDark);
    hood.position.set(0, 0.52, -0.13);
    hood.rotation.x = -1.2;
    hood.scale.set(1.1, 0.75, 0.7);
    this.torso.add(hood);
    const scarfRing = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.06, 6, 14), scarf);
    scarfRing.position.y = 0.58;
    scarfRing.rotation.x = Math.PI / 2;
    this.torso.add(scarfRing);
    const scarfTail = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.22, 0.04), scarf);
    scarfTail.position.set(0.1, 0.45, 0.2);
    scarfTail.rotation.z = 0.25;
    this.torso.add(scarfTail);
    // wicker creel on the back with a strap
    const creel = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.3, 0.17), flat('#b98a4b'));
    creel.position.set(0, 0.3, -0.29);
    this.torso.add(creel);
    const lid = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.05, 0.19), flat('#8f6532'));
    lid.position.set(0, 0.47, -0.29);
    this.torso.add(lid);
    for (const y of [0.22, 0.34]) {
      const weave = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.02, 0.175), flat('#9b723d'));
      weave.position.set(0, y, -0.29);
      this.torso.add(weave);
    }
    const strap = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.62, 0.02), flat('#6b4a2e'));
    strap.position.set(0.02, 0.3, 0.215);
    strap.rotation.z = -0.55;
    this.torso.add(strap);

    // ---- head: face, nose, ears, brows, eyes with catchlights, cheeks, smile, hair, bucket hat ----
    this.head.position.y = 0.82;
    this.torso.add(this.head);
    const face = new THREE.Mesh(new THREE.SphereGeometry(0.235, 14, 12), skin);
    face.scale.set(1, 0.98, 0.96);
    this.head.add(face);
    const nose = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 6), flat(shade(colors.skin, 0.93)));
    nose.position.set(0, -0.02, 0.23);
    this.head.add(nose);
    for (const s of [-1, 1]) {
      const ear = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), skin);
      ear.position.set(s * 0.225, -0.01, 0);
      ear.scale.set(0.5, 1, 0.8);
      this.head.add(ear);
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.036, 8, 6), dark);
      eye.position.set(s * 0.085, 0.035, 0.205);
      eye.scale.set(1, 1.35, 0.6);
      this.head.add(eye);
      const glint = new THREE.Mesh(new THREE.SphereGeometry(0.011, 5, 4), flat('#ffffff'));
      glint.position.set(s * 0.085 + 0.01, 0.052, 0.226);
      this.head.add(glint);
      const brow = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.016, 0.02), flat('#5a3a24'));
      brow.position.set(s * 0.085, 0.105, 0.205);
      brow.rotation.z = s * -0.12;
      this.head.add(brow);
      const cheek = new THREE.Mesh(new THREE.SphereGeometry(0.035, 6, 4), flat('#ff9fa0'));
      cheek.position.set(s * 0.14, -0.045, 0.18);
      cheek.scale.set(1, 0.6, 0.4);
      this.head.add(cheek);
    }
    const smile = new THREE.Mesh(new THREE.TorusGeometry(0.04, 0.011, 4, 10, Math.PI), dark);
    smile.position.set(0, -0.085, 0.215);
    smile.rotation.z = Math.PI;
    this.head.add(smile);
    const hair = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2.4), flat('#7a4a2a'));
    hair.position.set(0, 0.06, -0.04);
    hair.rotation.x = -0.35;
    this.head.add(hair);
    const hatTop = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.245, 0.2, 14), flat(colors.hat));
    hatTop.position.y = 0.2;
    this.head.add(hatTop);
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.248, 0.25, 0.05, 14), scarf);
    band.position.y = 0.13;
    this.head.add(band);
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.39, 0.36, 0.04, 16), flat(colors.hat));
    brim.position.set(0, 0.105, 0.02);
    brim.rotation.x = 0.1;
    this.head.add(brim);

    // ---- arms: shoulder → upper arm → elbow → forearm + mitten ----
    for (const [sh, elb, x] of [[this.shL, this.elbL, -0.32], [this.shR, this.elbR, 0.32]] as const) {
      sh.position.set(x, 0.5, 0);
      const upper = new THREE.Mesh(new THREE.CapsuleGeometry(0.085, 0.13, 3, 8), coat);
      upper.position.y = -0.11;
      sh.add(upper);
      elb.position.y = -0.24;
      const fore = new THREE.Mesh(new THREE.CapsuleGeometry(0.08, 0.12, 3, 8), coat);
      fore.position.y = -0.1;
      elb.add(fore);
      const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.085, 0.04, 8), coatDark);
      cuff.position.y = -0.19;
      elb.add(cuff);
      const mitten = new THREE.Mesh(new THREE.SphereGeometry(0.095, 8, 6), boot);
      mitten.position.y = -0.27;
      mitten.scale.set(1, 1.1, 0.9);
      elb.add(mitten);
      const thumb = new THREE.Mesh(new THREE.SphereGeometry(0.04, 6, 4), boot);
      thumb.position.set(x > 0 ? -0.07 : 0.07, -0.24, 0.05);
      elb.add(thumb);
      sh.add(elb);
      this.torso.add(sh);
    }

    // ---- rod in the right hand: grip, reel with spinning crank, bending segments ----
    this.hand.position.set(0, -0.27, 0.02);
    this.elbR.add(this.hand);
    const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 0.42, 6), flat(colors.rodAccent));
    grip.rotation.x = Math.PI / 2;
    grip.position.z = 0.05;
    this.hand.add(grip);
    const reel = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.07, 10), flat('#d5dbe5'));
    reel.position.set(0.085, -0.03, 0.12);
    reel.rotation.z = Math.PI / 2;
    this.hand.add(reel);
    this.crank.position.set(0.13, -0.03, 0.12);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.1, 0.02), flat('#8d96a6'));
    arm.position.y = 0.05;
    this.crank.add(arm);
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.022, 6, 4), dark);
    knob.position.set(0.02, 0.1, 0);
    this.crank.add(knob);
    this.hand.add(this.crank);
    let parent: THREE.Object3D = this.hand;
    const segLen = ROD_LEN / ROD_SEGMENTS;
    const rodMat = flat(colors.rod);
    for (let i = 0; i < ROD_SEGMENTS; i++) {
      const seg = new THREE.Group();
      seg.position.z = i === 0 ? 0.26 : segLen;
      const r0 = 0.032 - i * 0.006;
      const mesh = new THREE.Mesh(new THREE.CylinderGeometry(Math.max(0.008, r0 - 0.006), r0, segLen, 5), rodMat);
      mesh.rotation.x = Math.PI / 2;
      mesh.position.z = segLen / 2;
      seg.add(mesh);
      if (i < ROD_SEGMENTS - 1) {
        const guide = new THREE.Mesh(new THREE.TorusGeometry(0.025 - i * 0.004, 0.006, 4, 8), flat('#d5dbe5'));
        guide.position.set(0, -0.03, segLen * 0.9);
        seg.add(guide);
      }
      parent.add(seg);
      this.rodSegs.push(seg);
      parent = seg;
    }
    this.rodTip.position.z = segLen;
    parent.add(this.rodTip);

    for (const g of [this.torso, this.head, this.shL, this.shR, this.elbL, this.elbR, this.hipL, this.hipR, this.kneeL, this.kneeR, this.crank, this.hand, ...this.rodSegs]) bakeChildrenByColor(g);
  }

  setRodColors(rod: string, accent: string): void {
    // part 0 of every baked rod segment is the blank; part 0 of the hand is the grip
    for (const seg of this.rodSegs) recolorBakedPart(seg, 0, rod);
    recolorBakedPart(this.hand, 0, accent);
  }

  /** Play a one-shot cast release swing. */
  triggerCast(): void {
    this.castT = 0;
    this.pose = 'cast';
  }

  // ------------------------------------------------------------ pose targets
  private target(p: Pose, out: Joints, reduced: boolean): Joints {
    Object.assign(out, ZERO);
    const t = this.t;
    const breathe = reduced ? 0 : Math.sin(t * 1.7);
    switch (p) {
      case 'idle': {
        const look = reduced ? 0 : Math.sin(t * 0.37) * Math.sin(t * 0.13 + 1) * 0.7;
        Object.assign(out, { hipsY: breathe * 0.006, lean: 0.02 + breathe * 0.012, headY: look, headX: -0.04, lShX: -0.08, lShZ: 0.14, lElb: -0.25, rShX: -0.35, rShZ: -0.12, rElb: -0.8, rod: -0.55, lKnee: 0.04, rKnee: 0.04 });
        break;
      }
      case 'walk': {
        const k = Math.min(1, this.speed / 5.2);
        const s = Math.sin(this.walkPhase);
        const c = Math.cos(this.walkPhase);
        Object.assign(out, {
          hipsY: Math.abs(c) * 0.055 * k - 0.02 * k,
          lean: 0.05 + 0.1 * k,
          twist: s * 0.12 * k,
          headY: -s * 0.06 * k,
          lHip: s * 0.75 * k,
          rHip: -s * 0.75 * k,
          lKnee: Math.max(0, -s) * 1.1 * k + 0.1,
          rKnee: Math.max(0, s) * 1.1 * k + 0.1,
          lShX: -s * 0.6 * k - 0.05,
          lShZ: 0.12,
          lElb: -0.35 - 0.2 * k,
          rShX: -0.35 + s * 0.15 * k,
          rShZ: -0.12,
          rElb: -0.85,
          rod: -0.45 + s * 0.05,
        });
        break;
      }
      case 'charge': {
        const c = this.charge;
        Object.assign(out, { hipsY: -0.05, lean: -0.1 - c * 0.06, twist: -0.45 - c * 0.15, headY: 0.35, headX: -0.08, lShX: -1.1, lShZ: 0.25, lElb: -0.5, rShX: -2.75 - c * 0.3, rShZ: -0.2, rElb: -0.45, rod: -2.5 - c * 0.35, lHip: -0.25, rHip: 0.2, lKnee: 0.3, rKnee: 0.25 });
        break;
      }
      case 'cast': {
        // whip forward with overshoot, follow through, settle
        const k = Math.min(1, this.castT / 0.45);
        const e = reduced ? k : easeOutBack(k);
        const lerp = (a: number, b: number) => a + (b - a) * e;
        Object.assign(out, {
          hipsY: -0.04,
          lean: lerp(-0.14, 0.14),
          twist: lerp(-0.55, 0.18),
          headY: lerp(0.35, 0),
          headX: lerp(-0.08, 0.05),
          lShX: lerp(-1.1, -0.6),
          lShZ: 0.2,
          lElb: -0.6,
          rShX: lerp(-3.05, -0.75),
          rShZ: -0.15,
          rElb: lerp(-0.45, -0.55),
          rod: lerp(-2.85, -0.62),
          lHip: lerp(-0.25, 0.1),
          rHip: lerp(0.2, -0.15),
          lKnee: 0.25,
          rKnee: lerp(0.25, 0.35),
        });
        break;
      }
      case 'wait': {
        const bob = reduced ? 0 : Math.sin(t * 2.1) * 0.02;
        Object.assign(out, { hipsY: -0.02 + breathe * 0.005, lean: 0.06, headX: 0.12, lShX: -0.85, lShZ: 0.35, lElb: -1.05, rShX: -0.7, rShZ: -0.1, rElb: -0.65, rod: -0.72 + bob, lKnee: 0.12, rKnee: 0.12, lHip: -0.06 });
        break;
      }
      case 'reel': {
        const ten = this.tension;
        const shake = reduced ? 0 : Math.sin(t * 31) * 0.035 * ten;
        Object.assign(out, {
          hipsY: -0.07 - ten * 0.03,
          lean: -0.1 - 0.16 * ten,
          twist: shake,
          headX: 0.15 - ten * 0.05,
          // left hand turns the crank in a circle
          lShX: -0.95 + Math.sin(this.spin) * 0.22,
          lShZ: 0.42,
          lElb: -1.2 + Math.cos(this.spin) * 0.3,
          rShX: -0.95 - 0.35 * ten,
          rShZ: -0.1,
          rElb: -0.75,
          rod: -0.95 - 0.3 * ten,
          lHip: -0.3,
          rHip: 0.15,
          lKnee: 0.45,
          rKnee: 0.35,
        });
        break;
      }
      case 'celebrate': {
        const hop = reduced ? 0 : Math.max(0, Math.sin(t * 6.5));
        Object.assign(out, { hipsY: hop * 0.22, lean: -0.08, headX: -0.25, lShX: -2.85 + hop * 0.2, lShZ: 0.35, lElb: -0.25, rShX: -2.6, rShZ: -0.3, rElb: -0.3, rod: -1.6, lKnee: hop * 0.6, rKnee: hop * 0.6, lHip: -hop * 0.3, rHip: -hop * 0.3 });
        break;
      }
      case 'shrug': {
        Object.assign(out, { hipsY: -0.01, headZ: reduced ? 0.12 : 0.15 * Math.sin(t * 5), headX: 0.08, lShX: -0.35, lShZ: 0.75, lElb: -1.45, rShX: -0.4, rShZ: -0.75, rElb: -1.35, rod: -0.3 });
        break;
      }
    }
    return out;
  }

  update(dt: number, reducedMotion: boolean): void {
    this.t += dt;
    if (this.pose === 'cast') {
      this.castT += dt;
      if (this.castT > 0.6) this.pose = 'wait';
    }
    const k = Math.min(1, this.speed / 5.2);
    this.walkPhase += dt * (5 + 6 * k) * (this.w.walk > 0.05 ? 1 : 0);
    // crank speed follows line tension (fast when the fish is inside the window)
    this.spin += dt * (this.pose === 'reel' ? 9 + 6 * (1 - this.tension) : 0);
    this.crank.rotation.x = this.spin;

    // pose weights ease toward the active pose (fast for snappy actions)
    const rate = Math.min(1, dt * (this.pose === 'cast' || this.pose === 'charge' ? 18 : 10));
    for (const p of POSES) this.w[p] += ((p === this.pose ? 1 : 0) - this.w[p]) * rate;

    // weighted blend of every pose with meaningful weight
    let total = 0;
    for (const key of KEYS) this.cur[key] = 0;
    for (const p of POSES) {
      const wt = this.w[p];
      if (wt < 0.002) continue;
      total += wt;
      const j = this.target(p, this.tmp, reducedMotion);
      for (const key of KEYS) this.cur[key] += j[key] * wt;
    }
    if (total > 0) for (const key of KEYS) this.cur[key] /= total;
    const j = this.cur;

    this.hips.position.y = 0.62 + j.hipsY;
    this.torso.rotation.set(j.lean, j.twist, 0);
    this.head.rotation.set(j.headX - j.lean * 0.5, j.headY - j.twist * 0.6, j.headZ);
    this.shL.rotation.set(j.lShX, 0, j.lShZ);
    this.shR.rotation.set(j.rShX, 0, j.rShZ);
    this.elbL.rotation.x = j.lElb;
    this.elbR.rotation.x = j.rElb;
    this.hipL.rotation.x = j.lHip - j.lean * 0.6;
    this.hipR.rotation.x = j.rHip - j.lean * 0.6;
    this.kneeL.rotation.x = j.lKnee;
    this.kneeR.rotation.x = j.rKnee;
    // keep the rod's pitch independent of how the arm is bent
    this.hand.rotation.x = j.rod - (j.rShX + j.rElb) - j.lean;

    // rod bends progressively under tension
    const bendW = this.w.reel + this.w.wait * 0.35 + this.w.charge * 0.25;
    const bend = (0.04 + this.tension * 0.24) * bendW;
    const quiver = reducedMotion ? 0 : Math.sin(this.t * 11) * 0.025 * this.tension * this.w.reel;
    for (let i = 0; i < this.rodSegs.length; i++) this.rodSegs[i].rotation.x = (i === 0 ? 0 : bend * (i + 0.5) * 0.55) + quiver * i;
  }
}

function shade(hex: string, f: number): string {
  const c = new THREE.Color(hex).multiplyScalar(f);
  return `#${c.getHexString()}`;
}
