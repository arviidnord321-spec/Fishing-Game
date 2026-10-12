import * as THREE from 'three';
import { PALETTE } from './materials';

export const RIPPLE_SLOTS = 4;

const vert = /* glsl */ `
uniform float uTime;
uniform float uDetail;
varying vec2 vUv;
varying float vWave;
void main() {
  vUv = uv;
  vec3 p = position;
  float r = length(p.xz);
  // Gentle rolling waves; pinned to zero at the rim so the water never gaps from the stone.
  float fade = 1.0 - smoothstep(0.78, 1.0, r);
  float w = 0.0;
  if (uDetail > 0.5) {
    w = sin(p.x * 7.0 + uTime * 1.8) * 0.5
      + sin(p.z * 9.0 - uTime * 1.3) * 0.35
      + sin((p.x + p.z) * 13.0 + uTime * 2.7) * 0.2;
    w *= 0.022 * fade;
  }
  p.y += w;
  vWave = w;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}`;

const frag = /* glsl */ `
uniform float uTime;
uniform float uNight;
uniform float uDetail;
uniform vec3 uShallow;
uniform vec3 uMid;
uniform vec3 uDeep;
uniform vec3 uShallowN;
uniform vec3 uMidN;
uniform vec3 uDeepN;
uniform vec4 uRipples[${RIPPLE_SLOTS}]; // xy = uv pos, z = age (s), w = strength
uniform float uGlow;    // rift portal glow
uniform vec3 uGlowColor;
uniform float uDim;     // locked pools are dimmer
uniform float uMood;    // 0 teal, 0.5 deep blue, 1 violet
varying vec2 vUv;
varying float vWave;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

float ripple(vec4 r, vec2 uv) {
  if (r.w <= 0.0) return 0.0;
  float d = distance(uv, r.xy);
  float ring = 0.0;
  for (int i = 0; i < 3; i++) {
    float rad = r.z * 0.26 - float(i) * 0.055;
    if (rad > 0.0) ring += exp(-abs(d - rad) * 110.0) * (1.0 - float(i) * 0.3);
  }
  // a soft dark trough just inside the leading ring sells the depth
  float trough = exp(-abs(d - r.z * 0.26 + 0.02) * 60.0) * 0.35;
  return (ring - trough) * r.w * clamp(1.5 - r.z, 0.0, 1.0);
}

void main() {
  vec2 p = vUv - 0.5;
  float r = length(p) * 2.0;
  float a = atan(p.y, p.x);
  vec3 shallow = mix(uShallow, uShallowN, uNight);
  vec3 mid = mix(uMid, uMidN, uNight);
  vec3 deep = mix(uDeep, uDeepN, uNight);
  // teal depth gradient: deep core -> mid teal -> bright shallows at the rim
  // mood shift: teal -> deep blue -> violet
  float mb = smoothstep(0.0, 0.5, uMood);
  float mv = smoothstep(0.5, 1.0, uMood);
  shallow = mix(mix(shallow, vec3(0.30, 0.55, 0.95), mb), vec3(0.78, 0.55, 1.0), mv);
  mid = mix(mix(mid, vec3(0.09, 0.27, 0.72), mb), vec3(0.45, 0.22, 0.86), mv);
  deep = mix(mix(deep, vec3(0.03, 0.08, 0.32), mb), vec3(0.17, 0.05, 0.42), mv);
  vec3 col = mix(deep, mid, smoothstep(0.0, 0.6, r));
  col = mix(col, shallow, smoothstep(0.55, 0.97, r));

  if (uDetail > 0.5) {
    // caustic web, strongest in the shallows
    vec2 q = vUv * 9.0;
    float c1 = sin(q.x * 1.7 + uTime * 0.9 + sin(q.y * 1.3 + uTime * 0.6) * 1.2);
    float c2 = sin(q.y * 1.9 - uTime * 0.7 + sin(q.x * 1.1 - uTime * 0.4) * 1.3);
    float caustic = smoothstep(0.6, 1.0, abs(c1 * c2));
    col += caustic * 0.10 * smoothstep(0.25, 0.9, r) * (1.0 - uNight * 0.5);
    // wave crests catch the light
    col += smoothstep(0.006, 0.02, vWave) * 0.07;
  }
  // slow concentric current bands
  float bands = sin(r * 22.0 - uTime * 1.3 + sin(a * 3.0 + uTime * 0.4) * 0.6);
  col += smoothstep(0.85, 1.0, bands) * 0.05 * (1.0 - r * 0.3);
  // wobbling foam line at the rim, plus a broken inner line
  float edge = r + 0.012 * sin(a * 9.0 + uTime * 1.5) + 0.008 * sin(a * 23.0 - uTime * 2.1);
  col = mix(col, vec3(1.0), smoothstep(0.91, 0.985, edge) * 0.6);
  float inner = smoothstep(0.02, 0.0, abs(edge - 0.86)) * step(0.35, sin(a * 14.0 + uTime * 0.8));
  col = mix(col, vec3(1.0), inner * 0.22);
  // small round glints
  vec2 cell = floor(vUv * 40.0);
  float h = hash(cell);
  float tw = sin(uTime * 2.0 + h * 40.0);
  float dotShape = 1.0 - smoothstep(0.08, 0.18, length(fract(vUv * 40.0) - 0.5));
  col += step(0.985 - uMood * 0.03, h) * smoothstep(0.7, 1.0, tw) * dotShape * (0.6 + uMood * 0.5) * mix(vec3(1.0), vec3(1.0, 0.75, 1.0), mv);
  // soft swirling light in the deep while the pool is shifting
  if (uMood > 0.01) {
    float sw = sin(a * 3.0 - uTime * 0.8 + r * 8.0) * 0.5 + 0.5;
    col += uMood * sw * (1.0 - r) * 0.16 * mix(vec3(0.4, 0.6, 1.0), vec3(1.0, 0.5, 1.0), mv);
  }
  // bobber / catch ripples
  float rip = 0.0;
  for (int i = 0; i < ${RIPPLE_SLOTS}; i++) rip += ripple(uRipples[i], vUv);
  col += rip * 0.6;
  // portal glow swirl
  if (uGlow > 0.0) {
    float swirl = sin(a * 5.0 + r * 10.0 - uTime * 2.5) * 0.5 + 0.5;
    col = mix(col, uGlowColor, uGlow * (0.25 + 0.35 * swirl) * (1.0 - r));
  }
  col *= mix(1.0, 0.62, uDim);
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}`;

export type WaterMaterial = THREE.ShaderMaterial & {
  uniforms: {
    uTime: { value: number };
    uNight: { value: number };
    uDetail: { value: number };
    uRipples: { value: THREE.Vector4[] };
    uGlow: { value: number };
    uGlowColor: { value: THREE.Color };
    uDim: { value: number };
    uMood: { value: number };
  };
};

/** Unit disc as a polar grid (rings × segments) so vertex waves have vertices to move. */
export function waterGeometry(rings = 14, segments = 64): THREE.BufferGeometry {
  const pos: number[] = [0, 0, 0];
  const uv: number[] = [0.5, 0.5];
  const idx: number[] = [];
  for (let r = 1; r <= rings; r++) {
    const rad = r / rings;
    for (let s = 0; s < segments; s++) {
      const a = (s / segments) * Math.PI * 2;
      const x = Math.cos(a) * rad;
      const y = Math.sin(a) * rad;
      pos.push(x, y, 0);
      uv.push(x * 0.5 + 0.5, y * 0.5 + 0.5);
    }
  }
  const ringStart = (r: number) => (r === 0 ? 0 : 1 + (r - 1) * segments);
  for (let s = 0; s < segments; s++) idx.push(0, 1 + s, 1 + ((s + 1) % segments));
  for (let r = 1; r < rings; r++) {
    const a0 = ringStart(r);
    const b0 = ringStart(r + 1);
    for (let s = 0; s < segments; s++) {
      const s1 = (s + 1) % segments;
      idx.push(a0 + s, b0 + s, b0 + s1, a0 + s, b0 + s1, a0 + s1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.rotateX(-Math.PI / 2);
  g.computeVertexNormals();
  return g;
}

export function createWaterMaterial(): WaterMaterial {
  return new THREE.ShaderMaterial({
    vertexShader: vert,
    fragmentShader: frag,
    uniforms: {
      uTime: { value: 0 },
      uNight: { value: 0 },
      uDetail: { value: 1 },
      uShallow: { value: new THREE.Color('#6fe6da') },
      uMid: { value: new THREE.Color('#1cb3c2') },
      uDeep: { value: new THREE.Color('#0a6680') },
      uShallowN: { value: PALETTE.nightWater.clone() },
      uMidN: { value: new THREE.Color('#2a74a8') },
      uDeepN: { value: PALETTE.nightWaterDeep.clone() },
      uRipples: { value: Array.from({ length: RIPPLE_SLOTS }, () => new THREE.Vector4()) },
      uGlow: { value: 0 },
      uGlowColor: { value: new THREE.Color('#ff7ae0') },
      uDim: { value: 0 },
      uMood: { value: 0 },
    },
  }) as WaterMaterial;
}

const skyVert = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;
const skyFrag = /* glsl */ `
uniform vec3 uTop;
uniform vec3 uHorizon;
varying vec3 vDir;
void main() {
  float h = clamp(vDir.y, -0.2, 1.0);
  vec3 col = mix(uHorizon, uTop, smoothstep(-0.05, 0.55, h));
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}`;

export function createSkyMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader: skyVert,
    fragmentShader: skyFrag,
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: { uTop: { value: PALETTE.daySky.clone() }, uHorizon: { value: PALETTE.dayHorizon.clone() } },
  });
}
