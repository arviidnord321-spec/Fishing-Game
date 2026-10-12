import * as THREE from 'three';
import type { World } from './world';

const DEG = Math.PI / 180;
const UP = new THREE.Vector3(0, 1, 0);

/**
 * Third-person follow/orbit camera with damped motion, scenery clearance and blended
 * cast-bias and reveal shots.
 */
export class CameraRig {
  readonly camera: THREE.PerspectiveCamera;
  yaw = 0; // radians; 0 = camera south of target looking north (-z)
  pitch = 33 * DEG;
  distance = 8.3;
  private pos = new THREE.Vector3();
  private look = new THREE.Vector3();
  private desiredPos = new THREE.Vector3();
  private desiredLook = new THREE.Vector3();
  private revealW = 0;
  private castW = 0;
  revealTarget: { center: THREE.Vector3; radius: number; from: THREE.Vector3 } | null = null;
  /** Last reveal shot, kept so the camera can ease back out after the reveal ends. */
  private lastReveal: { center: THREE.Vector3; radius: number; from: THREE.Vector3 } | null = null;
  get revealWeight(): number {
    return this.revealW;
  }
  castFocus: THREE.Vector3 | null = null;
  reducedMotion = false;
  private initialized = false;
  private tmp = new THREE.Vector3();
  private tmp2 = new THREE.Vector3();

  constructor(aspect: number) {
    this.camera = new THREE.PerspectiveCamera(55, aspect, 0.1, 600);
  }

  orbit(dx: number, dy: number, zoom: number): void {
    this.yaw -= dx * 0.006;
    this.pitch = THREE.MathUtils.clamp(this.pitch + dy * 0.005, 20 * DEG, 65 * DEG);
    this.distance = THREE.MathUtils.clamp(this.distance + zoom, 4, 10);
  }

  /** Forward direction on the ground for camera-relative movement. */
  forward(out: THREE.Vector3): THREE.Vector3 {
    return out.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
  }

  snapBehind(yaw: number): void {
    this.yaw = yaw;
    this.initialized = false;
  }

  update(dt: number, target: THREE.Vector3, world: World): void {
    const chest = this.tmp.copy(target).add(new THREE.Vector3(0, 1.25, 0));
    // follow pose
    const horiz = Math.cos(this.pitch) * this.distance;
    this.desiredPos.set(
      chest.x + Math.sin(this.yaw) * horiz,
      chest.y + Math.sin(this.pitch) * this.distance,
      chest.z + Math.cos(this.yaw) * horiz,
    );
    this.desiredLook.copy(chest);

    // cast bias toward bobber landing point (keeps avatar and water both in view)
    const castTarget = this.castFocus ? 1 : 0;
    this.castW += (castTarget - this.castW) * Math.min(1, dt * 5);
    if (this.castFocus && this.castW > 0.001) {
      this.tmp2.copy(chest).lerp(this.castFocus, 0.45);
      this.desiredLook.lerp(this.tmp2, this.castW);
    }

    // scenery clearance
    const clear = world.cameraClearance(this.desiredLook, this.desiredPos, 0.35);
    if (clear < 1) {
      const f = Math.max(0.25, clear - 0.05);
      this.desiredPos.sub(this.desiredLook).multiplyScalar(f).add(this.desiredLook);
    }

    // reveal shot: blend in over 0.25s, out over 0.35s
    this.revealW = THREE.MathUtils.clamp(this.revealW + (this.revealTarget ? dt / 0.25 : -dt / 0.35), 0, 1);
    if (this.revealTarget) this.lastReveal = this.revealTarget;
    if (this.revealW > 0 && this.lastReveal && !this.reducedMotion) {
      const { center, radius, from } = this.lastReveal;
      const fov = this.camera.fov * DEG;
      const dist = THREE.MathUtils.clamp((radius / Math.sin(fov / 2)) * 1.35, 3.2, 14);
      // Look from beside the angler (swung ~40°) so the avatar never blocks the catch.
      const dir = this.tmp2.copy(from).sub(center).setY(0).normalize().applyAxisAngle(UP, 0.7);
      const rp = new THREE.Vector3().copy(center).addScaledVector(dir, dist * 0.92);
      rp.y = center.y + dist * 0.3;
      // keep the reveal camera out of scenery
      const c2 = world.cameraClearance(center, rp, 0.35);
      if (c2 < 1) rp.sub(center).multiplyScalar(Math.max(0.35, c2 - 0.05)).add(center);
      const look = new THREE.Vector3().copy(center).add(new THREE.Vector3(0, radius * 0.15, 0));
      const k = smooth(this.revealW);
      this.desiredPos.lerp(rp, k);
      this.desiredLook.lerp(look, k);
    }
    if (this.desiredPos.y < 0.6) this.desiredPos.y = 0.6;

    if (!this.initialized) {
      this.pos.copy(this.desiredPos);
      this.look.copy(this.desiredLook);
      this.initialized = true;
    }
    // frame-rate independent damping (~0.2s settle)
    const k = 1 - Math.exp(-dt * 14);
    this.pos.lerp(this.desiredPos, k);
    this.look.lerp(this.desiredLook, k);
    this.camera.position.copy(this.pos);
    this.camera.lookAt(this.look);
  }
}

function smooth(t: number): number {
  return t * t * (3 - 2 * t);
}
