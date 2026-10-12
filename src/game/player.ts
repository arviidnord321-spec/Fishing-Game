import * as THREE from 'three';
import { BALANCE } from '../data/balance';
import type { PoolId } from '../data/types';
import type { World } from './world';

const M = BALANCE.movement;

/** Grounded character movement with acceleration, camera-relative input and collision. */
export class PlayerController {
  readonly pos = new THREE.Vector3();
  readonly prevPos = new THREE.Vector3();
  readonly vel = new THREE.Vector3();
  private sRight = new THREE.Vector3();
  private sDesired = new THREE.Vector3();
  private sDiff = new THREE.Vector3();
  facing = Math.PI; // radians around Y; 0 = +z
  /** Scripted relocation (e.g. rift opening under the player). */
  private push: { from: THREE.Vector3; to: THREE.Vector3; t: number; dur: number } | null = null;

  constructor(private world: World) {}

  teleport(x: number, z: number, facing: number): void {
    this.pos.set(x, 0, z);
    this.prevPos.copy(this.pos);
    this.vel.set(0, 0, 0);
    this.facing = facing;
  }

  get relocating(): boolean {
    return !!this.push;
  }

  relocate(to: THREE.Vector3, dur = 0.7): void {
    this.push = { from: this.pos.clone(), to: to.clone(), t: 0, dur };
  }

  /** Fixed-step update. `move` is camera-relative input (y forward), `locked` freezes the feet. */
  step(dt: number, move: { x: number; y: number }, camForward: THREE.Vector3, locked: boolean): void {
    this.prevPos.copy(this.pos);
    if (this.push) {
      const p = this.push;
      p.t += dt;
      const k = Math.min(1, p.t / p.dur);
      const e = k * k * (3 - 2 * k);
      this.pos.lerpVectors(p.from, p.to, e);
      this.vel.set(0, 0, 0);
      if (k >= 1) this.push = null;
      return;
    }
    const right = this.sRight.set(-camForward.z, 0, camForward.x);
    const desired = this.sDesired
      .set(0, 0, 0)
      .addScaledVector(camForward, move.y)
      .addScaledVector(right, move.x);
    if (locked) desired.set(0, 0, 0);
    const mag = Math.min(1, desired.length());
    const targetVel = mag > 0 ? desired.normalize().multiplyScalar(M.maxSpeed * mag) : desired;
    const diff = this.sDiff.copy(targetVel).sub(this.vel);
    const rate = (mag > 0 ? M.accel : M.decel) * dt;
    if (diff.length() <= rate) this.vel.copy(targetVel);
    else this.vel.addScaledVector(diff.normalize(), rate);

    this.pos.addScaledVector(this.vel, dt);
    this.world.resolve(this.pos, M.radius);

    if (mag > 0.05) {
      const want = Math.atan2(targetVel.x, targetVel.z);
      this.turnToward(want, dt);
    }
  }

  turnToward(angle: number, dt: number): void {
    let d = angle - this.facing;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    const max = ((M.turnRateDeg * Math.PI) / 180) * dt;
    this.facing += Math.abs(d) <= max ? d : Math.sign(d) * max;
  }

  get speed(): number {
    return Math.hypot(this.vel.x, this.vel.z);
  }

  /** Pool whose legal fishing band contains the player (rim + 0.35 … rim + 2.0). */
  fishingPool(riftLive: boolean): PoolId | null {
    let best: PoolId | null = null;
    let bestD = Infinity;
    for (const p of this.world.pools.values()) {
      if (p.id === 'rift' && !riftLive) continue;
      const d = Math.hypot(this.pos.x - p.x, this.pos.z - p.z) - p.radius;
      if (d >= BALANCE.cast.bandInner && d <= BALANCE.cast.bandOuter && d < bestD) {
        best = p.id;
        bestD = d;
      }
    }
    return best;
  }
}
