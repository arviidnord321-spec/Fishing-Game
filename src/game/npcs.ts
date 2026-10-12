import * as THREE from 'three';
import { POOLS_BY_ID } from '../data/balance';
import type { PoolId } from '../data/types';
import { Character } from './character';
import type { Particles } from './effects';
import type { World } from './world';

interface Npc {
  ch: Character;
  pool: PoolId;
  bobber: THREE.Mesh;
  line: THREE.Line;
  timer: number;
  event: boolean;
  name: string;
}

const COATS = ['#ff7b7b', '#7ee081', '#b9a8ff', '#4fe3f0', '#ff9a1f', '#f6a5d8'];
const NAMES = ['Villager Pim', 'Villager Ode', 'Villager Rue', 'Villager Bo', 'Villager Lark', 'Villager Juno'];

/**
 * Ambient computer-controlled anglers. They are decoration only: they never affect rewards,
 * and their labels say "Villager" so nobody mistakes them for connected players.
 */
export class Npcs {
  private list: Npc[] = [];
  private t = 0;
  /** Animate villagers every Nth frame on lower presets (they are background detail). */
  stride = 1;
  private vTip = new THREE.Vector3();
  private vDir = new THREE.Vector3();
  private vBob = new THREE.Vector3();
  private anchors = [] as { id: string; name: string; pos: THREE.Vector3; visible: boolean }[];
  private frameNo = 0;
  private acc = 0;

  constructor(private world: World, private particles: Particles) {
    const spots: { pool: PoolId; angle: number; event: boolean }[] = [
      { pool: 'reed', angle: 0.4, event: false },
      { pool: 'moon', angle: 2.6, event: false },
      { pool: 'rift', angle: 0.6, event: true },
      { pool: 'rift', angle: 2.5, event: true },
      { pool: 'rift', angle: 3.6, event: true },
      { pool: 'rift', angle: 5.6, event: true },
    ];
    const bobGeo = new THREE.SphereGeometry(0.09, 8, 6);
    spots.forEach((s, i) => {
      const ch = new Character({ coat: COATS[i], hat: COATS[(i + 2) % COATS.length], boots: '#2a3d66', pants: '#3a3a55', skin: ['#f5c9a3', '#c98f65', '#8d5a3b', '#f1d0b5', '#a87048', '#e8b892'][i], rod: '#7a4c2b', rodAccent: '#d7b48a' });
      const p = POOLS_BY_ID[s.pool];
      const r = p.radius + 1.0;
      ch.root.position.set(p.x + Math.cos(s.angle) * r, 0, p.z + Math.sin(s.angle) * r);
      ch.root.rotation.y = Math.atan2(p.x - ch.root.position.x, p.z - ch.root.position.z);
      ch.pose = 'wait';
      world.scene.add(ch.root);
      const bobber = new THREE.Mesh(bobGeo, new THREE.MeshLambertMaterial({ color: '#ff4d4d' }));
      world.scene.add(bobber);
      const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]), new THREE.LineBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.8 }));
      line.frustumCulled = false;
      world.scene.add(line);
      if (!s.event) world.colliders.push({ kind: 'circle', x: ch.root.position.x, z: ch.root.position.z, r: 0.35, h: 1.7 });
      this.list.push({ ch, pool: s.pool, bobber, line, timer: 3 + i * 1.7, event: s.event, name: NAMES[i] });
    });
  }

  /** QA experiments: remove villagers entirely. */
  hideAll(): void {
    for (const n of this.list) {
      n.ch.root.removeFromParent();
      n.bobber.removeFromParent();
      n.line.removeFromParent();
    }
    this.list = [];
  }

  /** Labels for the HUD (world positions). */
  labelAnchors(): { id: string; name: string; pos: THREE.Vector3; visible: boolean }[] {
    if (this.anchors.length !== this.list.length) this.anchors = this.list.map((n, i) => ({ id: `npc${i}`, name: n.name, pos: new THREE.Vector3(), visible: false }));
    this.list.forEach((n, i) => {
      this.anchors[i].pos.copy(n.ch.root.position).setY(2.25);
      this.anchors[i].visible = n.ch.root.visible;
    });
    return this.anchors;
  }

  /** Move event villagers out of a growing rift if needed. */
  update(dtFrame: number, riftOpenness: number, reducedMotion: boolean): void {
    this.acc += dtFrame;
    if (this.frameNo++ % this.stride !== 0) return;
    const dt = this.acc;
    this.acc = 0;
    this.t += dt;
    const tip = this.vTip;
    for (const n of this.list) {
      const visible = !n.event || riftOpenness > 0.6;
      n.ch.root.visible = visible;
      n.bobber.visible = visible;
      n.line.visible = visible;
      if (!visible) continue;
      n.timer -= dt;
      if (n.timer <= 0) {
        if (n.ch.pose === 'wait') {
          n.ch.pose = 'celebrate';
          n.timer = 1.4;
          const b = n.bobber.position;
          this.particles.splash(b.x, b.y, b.z, 18, 0.3);
          this.world.ripple(n.pool, b.x, b.z, 0.7);
        } else {
          n.ch.pose = 'wait';
          n.timer = 6 + Math.random() * 8;
        }
      }
      n.ch.update(dt, reducedMotion);
      n.ch.root.updateMatrixWorld(true);
      n.ch.rodTip.getWorldPosition(tip);
      const p = this.world.pools.get(n.pool)!;
      const dir = this.vDir.set(p.x - n.ch.root.position.x, 0, p.z - n.ch.root.position.z).normalize();
      const bob = n.ch.pose === 'celebrate' ? this.vBob.copy(tip).setY(tip.y - 0.5) : this.vBob.copy(n.ch.root.position).addScaledVector(dir, 2.6);
      if (n.ch.pose !== 'celebrate') bob.y = p.surfaceY + 0.04 + Math.sin(this.t * 2 + n.timer) * 0.02;
      n.bobber.position.copy(bob);
      const pos = n.line.geometry.attributes.position as THREE.BufferAttribute;
      pos.setXYZ(0, tip.x, tip.y, tip.z);
      pos.setXYZ(1, bob.x, bob.y, bob.z);
      pos.needsUpdate = true;
      
    }
  }
}
