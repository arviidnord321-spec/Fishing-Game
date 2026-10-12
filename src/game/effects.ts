import * as THREE from 'three';

const MAX = 420;

const vert = /* glsl */ `
attribute float aSize;
attribute float aAlpha;
attribute vec3 aColor;
varying float vAlpha;
varying vec3 vColor;
void main() {
  vAlpha = aAlpha;
  vColor = aColor;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = aSize * (300.0 / -mv.z);
  gl_Position = projectionMatrix * mv;
}`;
const frag = /* glsl */ `
varying float vAlpha;
varying vec3 vColor;
uniform float uStar;
void main() {
  vec2 p = gl_PointCoord - 0.5;
  float d = length(p);
  float a = 1.0 - smoothstep(0.25, 0.5, d);
  gl_FragColor = vec4(vColor, a * vAlpha);
  #include <colorspace_fragment>
}`;

/** Pooled particles: fixed-size buffers, no per-frame allocation. */
export class Particles {
  readonly points: THREE.Points;
  private pos = new Float32Array(MAX * 3);
  private vel = new Float32Array(MAX * 3);
  private life = new Float32Array(MAX);
  private maxLife = new Float32Array(MAX);
  private size = new Float32Array(MAX);
  private baseSize = new Float32Array(MAX);
  private alpha = new Float32Array(MAX);
  private color = new Float32Array(MAX * 3);
  private gravity = new Float32Array(MAX);
  private cursor = 0;
  private geo = new THREE.BufferGeometry();
  private tmp = new THREE.Color();
  /** Multiplier from quality settings (low quality halves counts). */
  budget = 1;

  constructor(scene: THREE.Scene) {
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    this.geo.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1));
    this.geo.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1));
    this.geo.setAttribute('aColor', new THREE.BufferAttribute(this.color, 3));
    this.geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 500);
    const mat = new THREE.ShaderMaterial({
      vertexShader: vert,
      fragmentShader: frag,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: { uStar: { value: 0 } },
    });
    this.points = new THREE.Points(this.geo, mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 5;
    scene.add(this.points);
  }

  emit(x: number, y: number, z: number, vx: number, vy: number, vz: number, life: number, size: number, color: string, gravity = 9): void {
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % MAX;
    this.pos.set([x, y, z], i * 3);
    this.vel.set([vx, vy, vz], i * 3);
    this.life[i] = life;
    this.maxLife[i] = life;
    this.baseSize[i] = size;
    this.gravity[i] = gravity;
    this.tmp.set(color);
    this.color.set([this.tmp.r, this.tmp.g, this.tmp.b], i * 3);
  }

  /** Water splash burst (roughly 50 particles for ordinary catches, ≤150 for rare/event). */
  splash(x: number, y: number, z: number, count: number, radius = 0.5, colors = ['#ffffff', '#bff6ff', '#7fe9ff']): void {
    const n = Math.round(count * this.budget);
    for (let k = 0; k < n; k++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 1 + Math.random() * 2.5;
      this.emit(
        x + Math.cos(a) * radius * Math.random(),
        y,
        z + Math.sin(a) * radius * Math.random(),
        Math.cos(a) * sp * 0.6,
        3 + Math.random() * 4,
        Math.sin(a) * sp * 0.6,
        0.6 + Math.random() * 0.5,
        0.12 + Math.random() * 0.12,
        colors[k % colors.length],
      );
    }
  }

  sparkle(x: number, y: number, z: number, count: number, spread: number, colors: string[]): void {
    const n = Math.round(count * this.budget);
    for (let k = 0; k < n; k++) {
      this.emit(
        x + (Math.random() - 0.5) * spread,
        y + (Math.random() - 0.5) * spread * 0.6,
        z + (Math.random() - 0.5) * spread,
        (Math.random() - 0.5) * 0.6,
        0.4 + Math.random() * 0.8,
        (Math.random() - 0.5) * 0.6,
        0.8 + Math.random() * 0.8,
        0.1 + Math.random() * 0.14,
        colors[k % colors.length],
        -0.2,
      );
    }
  }

  update(dt: number): void {
    for (let i = 0; i < MAX; i++) {
      if (this.life[i] <= 0) {
        this.alpha[i] = 0;
        continue;
      }
      this.life[i] -= dt;
      const j = i * 3;
      this.vel[j + 1] -= this.gravity[i] * dt;
      this.pos[j] += this.vel[j] * dt;
      this.pos[j + 1] += this.vel[j + 1] * dt;
      this.pos[j + 2] += this.vel[j + 2] * dt;
      const k = Math.max(0, this.life[i] / this.maxLife[i]);
      this.alpha[i] = Math.min(1, k * 2);
      this.size[i] = this.baseSize[i] * (0.5 + 0.5 * k);
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.aAlpha.needsUpdate = true;
    this.geo.attributes.aSize.needsUpdate = true;
    this.geo.attributes.aColor.needsUpdate = true;
  }
}

/** Pooled expanding ring meshes for splash rings on water. */
export class Rings {
  private rings: { mesh: THREE.Mesh; t: number; dur: number; size: number }[] = [];
  constructor(scene: THREE.Scene, n = 8) {
    const geo = new THREE.RingGeometry(0.8, 1, 32).rotateX(-Math.PI / 2);
    for (let i = 0; i < n; i++) {
      const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0, depthWrite: false }));
      mesh.visible = false;
      mesh.renderOrder = 4;
      scene.add(mesh);
      this.rings.push({ mesh, t: 1, dur: 1, size: 1 });
    }
  }
  spawn(x: number, y: number, z: number, size: number, dur = 0.8): void {
    const r = this.rings.reduce((a, b) => (b.t / b.dur > a.t / a.dur ? b : a));
    r.t = 0;
    r.dur = dur;
    r.size = size;
    r.mesh.position.set(x, y + 0.01, z);
    r.mesh.visible = true;
  }
  update(dt: number): void {
    for (const r of this.rings) {
      if (!r.mesh.visible) continue;
      r.t += dt;
      const k = r.t / r.dur;
      if (k >= 1) {
        r.mesh.visible = false;
        continue;
      }
      const s = r.size * (0.2 + k);
      r.mesh.scale.set(s, 1, s);
      (r.mesh.material as THREE.MeshBasicMaterial).opacity = (1 - k) * 0.8;
    }
  }
}
