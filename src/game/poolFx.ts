import * as THREE from 'three';
import { createRng } from '../logic/rng';
import { flat } from './materials';

/**
 * Pool ambience: slow "mood" colour shifts (teal → deep blue → violet and back), glowing motes
 * drifting over each pool (one draw call, animated entirely in the vertex shader), and the
 * occasional fish leaping out with a splash.
 */
export interface PoolSpot {
  id: string;
  x: number;
  z: number;
  radius: () => number;
  surfaceY: number;
}

const MOTES_PER_POOL = 34;

const moteVert = /* glsl */ `
uniform float uTime;
uniform vec4 uPools[3];   // xyz = centre (y = surface), w = radius
uniform float uMoods[3];
attribute vec4 aSeed;     // x = angle, y = radius frac, z = height, w = phase
attribute float aPool;
varying float vAlpha;
varying vec3 vColor;
void main() {
  int i = int(aPool);
  vec4 pool = uPools[0];
  float mood = uMoods[0];
  if (i == 1) { pool = uPools[1]; mood = uMoods[1]; }
  if (i == 2) { pool = uPools[2]; mood = uMoods[2]; }
  float t = uTime * (0.12 + aSeed.y * 0.08) + aSeed.x;
  float r = pool.w * (0.35 + aSeed.y * 0.95) + sin(uTime * 0.7 + aSeed.w * 6.0) * 0.25;
  vec3 p = vec3(pool.x + cos(t) * r, pool.y + 0.25 + aSeed.z * 1.5 + sin(uTime * 1.3 + aSeed.w * 9.0) * 0.18, pool.z + sin(t) * r);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  float tw = 0.55 + 0.45 * sin(uTime * 2.6 + aSeed.w * 20.0);
  gl_PointSize = (4.0 + aSeed.z * 4.0) * tw * (60.0 / -mv.z);
  gl_Position = projectionMatrix * mv;
  vec3 teal = vec3(0.65, 1.0, 0.92);
  vec3 blue = vec3(0.55, 0.75, 1.0);
  vec3 violet = vec3(1.0, 0.6, 1.0);
  vColor = mix(mix(teal, blue, smoothstep(0.0, 0.5, mood)), violet, smoothstep(0.5, 1.0, mood));
  vAlpha = tw * (0.55 + 0.45 * mood);
}`;
const moteFrag = /* glsl */ `
varying float vAlpha;
varying vec3 vColor;
void main() {
  float d = length(gl_PointCoord - 0.5);
  float a = smoothstep(0.5, 0.0, d);
  gl_FragColor = vec4(vColor * (0.6 + a), a * a * vAlpha);
  #include <colorspace_fragment>
}`;

interface Mood {
  value: number;
  /** seconds until the next shift starts */
  wait: number;
  /** progress through a shift, 0..1 (0 = none running) */
  t: number;
  dur: number;
}

export class PoolAmbience {
  readonly points: THREE.Points;
  readonly group = new THREE.Group();
  private mat: THREE.ShaderMaterial;
  private moods: Mood[];
  private jumper: THREE.Group;
  private jump = { t: 1, dur: 1, from: new THREE.Vector3(), to: new THREE.Vector3(), pool: -1, splashed: true };
  private nextJump = 4;
  private rng = createRng(77);
  /** Called for each splash: at a jump's take-off and landing. */
  onSplash: (x: number, y: number, z: number, pool: string, big: boolean) => void = () => {};
  /** Lets the game skip jumps in the pool the player is fishing in. */
  busyPool: string | null = null;

  constructor(private spots: PoolSpot[]) {
    const n = spots.length * MOTES_PER_POOL;
    const seed = new Float32Array(n * 4);
    const poolIdx = new Float32Array(n);
    const rng = createRng(5);
    for (let k = 0; k < n; k++) {
      seed.set([rng.next() * Math.PI * 2, rng.next(), rng.next(), rng.next()], k * 4);
      poolIdx[k] = Math.floor(k / MOTES_PER_POOL);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 4));
    geo.setAttribute('aPool', new THREE.BufferAttribute(poolIdx, 1));
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 500);
    this.mat = new THREE.ShaderMaterial({
      vertexShader: moteVert,
      fragmentShader: moteFrag,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uTime: { value: 0 },
        uPools: { value: spots.map((s) => new THREE.Vector4(s.x, s.surfaceY, s.z, s.radius())) },
        uMoods: { value: spots.map(() => 0) },
      },
    });
    this.points = new THREE.Points(geo, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 6;
    this.group.add(this.points);
    // staggered so the pools never all change at once
    this.moods = spots.map((_, i) => ({ value: 0, wait: 20 + i * 17 + this.rng.next() * 15, t: 0, dur: 30 }));

    // the leaping fish: a tiny low-poly silhouette with a tail
    this.jumper = new THREE.Group();
    const mat = new THREE.MeshLambertMaterial({ color: '#ffb35c', flatShading: true });
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), mat);
    body.scale.set(1, 0.7, 1.9);
    const tail = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.22, 4), mat);
    tail.rotation.x = -Math.PI / 2;
    tail.position.z = -0.38;
    tail.scale.set(1, 1, 0.35);
    this.jumper.add(body, tail);
    this.jumper.visible = false;
    this.group.add(this.jumper);
  }

  /** Current mood (0 normal, 0.5 deep blue, 1 violet) for a pool. */
  mood(id: string): number {
    const i = this.spots.findIndex((s) => s.id === id);
    return i < 0 ? 0 : this.moods[i].value;
  }

  /** QA: start a mood shift on every pool now, held at its peak by `peak`. */
  debugShift(peak = 0.01): void {
    for (const m of this.moods) {
      m.t = peak;
      m.dur = 60;
    }
  }

  setVisible(on: boolean): void {
    this.points.visible = on;
  }

  update(dt: number, time: number, reduced: boolean): void {
    this.mat.uniforms.uTime.value = time;
    const pools = this.mat.uniforms.uPools.value as THREE.Vector4[];
    const moods = this.mat.uniforms.uMoods.value as number[];
    this.spots.forEach((s, i) => {
      pools[i].w = s.radius();
      const m = this.moods[i];
      if (m.t > 0) {
        m.t += dt / m.dur;
        // ease up through deep blue to violet, hold, then drift back
        const k = Math.min(1, m.t);
        // teal -> deep blue (hold) -> violet (hold) -> back to teal
        m.value = k < 0.2 ? 0.5 * smooth(k / 0.2) : k < 0.38 ? 0.5 : k < 0.52 ? 0.5 + 0.5 * smooth((k - 0.38) / 0.14) : k < 0.78 ? 1 : 1 - smooth((k - 0.78) / 0.22);
        if (m.t >= 1) {
          m.t = 0;
          m.value = 0;
          m.wait = 45 + this.rng.next() * 50;
        }
      } else if ((m.wait -= dt) <= 0) {
        m.t = 1e-4;
        m.dur = 26 + this.rng.next() * 14;
      }
      moods[i] = m.value;
    });

    // leaping fish
    const j = this.jump;
    if (j.t < 1) {
      j.t += dt / j.dur;
      const k = Math.min(1, j.t);
      const p = this.jumper.position.lerpVectors(j.from, j.to, k);
      p.y += Math.sin(k * Math.PI) * 1.1;
      // nose follows the arc
      this.jumper.lookAt(j.to.x, p.y + Math.cos(k * Math.PI) * 1.2, j.to.z);
      if (k >= 1) {
        this.jumper.visible = false;
        this.onSplash(j.to.x, j.to.y, j.to.z, this.spots[j.pool].id, true);
      }
    } else if (!reduced && (this.nextJump -= dt) <= 0) {
      this.nextJump = 5 + this.rng.next() * 9;
      const choices = this.spots.map((_, i) => i).filter((i) => this.spots[i].id !== this.busyPool);
      if (choices.length) {
        const pi = choices[Math.floor(this.rng.next() * choices.length)];
        const s = this.spots[pi];
        const r = s.radius() * 0.55;
        const a = this.rng.next() * Math.PI * 2;
        const span = 1.2 + this.rng.next() * 0.8;
        const ax = s.x + Math.cos(a) * r * this.rng.next();
        const az = s.z + Math.sin(a) * r * this.rng.next();
        const b = a + Math.PI / 2;
        j.from.set(ax - Math.cos(b) * span * 0.5, s.surfaceY, az - Math.sin(b) * span * 0.5);
        j.to.set(ax + Math.cos(b) * span * 0.5, s.surfaceY, az + Math.sin(b) * span * 0.5);
        j.t = 0;
        j.dur = 0.85;
        j.pool = pi;
        this.jumper.visible = true;
        this.jumper.position.copy(j.from);
        const colors = ['#ffb35c', '#ff8fab', '#7fd4ff', '#b48bff', '#ffe066'];
        ((this.jumper.children[0] as THREE.Mesh).material as THREE.MeshLambertMaterial).color.set(colors[Math.floor(this.rng.next() * colors.length)]);
        this.onSplash(j.from.x, j.from.y, j.from.z, s.id, false);
      }
    }
  }

  dispose(): void {
    this.points.geometry.dispose();
    this.mat.dispose();
    this.jumper.traverse((o) => {
      if (o instanceof THREE.Mesh) o.geometry.dispose();
    });
  }
}

function smooth(x: number): number {
  const k = Math.max(0, Math.min(1, x));
  return k * k * (3 - 2 * k);
}

/** Lily pads with a few flowers floating near a pool's rim (added to the static bake). */
export function lilyPads(x: number, z: number, radius: number, y: number, seed: number): THREE.Object3D[] {
  const rng = createRng(seed);
  const out: THREE.Object3D[] = [];
  const padGeo = new THREE.CylinderGeometry(1, 1, 0.03, 12, 1, false, 0.35, Math.PI * 2 - 0.7);
  const count = 3 + Math.floor(radius * 0.8);
  for (let i = 0; i < count; i++) {
    const a = rng.next() * Math.PI * 2;
    const r = radius * (0.72 + rng.next() * 0.16);
    const s = 0.22 + rng.next() * 0.16;
    const pad = new THREE.Mesh(padGeo, flat(i % 2 ? '#4fbf5a' : '#3fa64f'));
    pad.scale.set(s, 1, s);
    pad.rotation.y = rng.next() * Math.PI * 2;
    pad.position.set(x + Math.cos(a) * r, y + 0.03, z + Math.sin(a) * r);
    out.push(pad);
    if (i % 2 === 0) {
      const petals = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.1, 6), flat(i % 4 ? '#ffd1ea' : '#ffffff'));
      petals.position.set(pad.position.x + 0.03, y + 0.1, pad.position.z);
      petals.rotation.x = Math.PI;
      const heart = new THREE.Mesh(new THREE.SphereGeometry(0.035, 6, 4), flat('#ffd23f'));
      heart.position.set(petals.position.x, y + 0.12, petals.position.z);
      out.push(petals, heart);
    }
  }
  return out;
}
