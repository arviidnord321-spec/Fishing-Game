import * as THREE from 'three';
import { PALETTE } from './materials';

const vert = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const frag = /* glsl */ `
uniform float uTime;
uniform float uNight;
uniform vec3 uShallow;
uniform vec3 uDeep;
uniform vec3 uShallowN;
uniform vec3 uDeepN;
uniform vec4 uRipple0; // xy = uv pos, z = age, w = strength
uniform vec4 uRipple1;
uniform float uGlow;    // rift portal glow
uniform vec3 uGlowColor;
uniform float uDim;     // locked pools are dimmer
varying vec2 vUv;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

float ripple(vec4 r, vec2 uv) {
  if (r.w <= 0.0) return 0.0;
  float d = distance(uv, r.xy);
  float ring = 0.0;
  for (int i = 0; i < 3; i++) {
    float rad = r.z * 0.28 - float(i) * 0.06;
    if (rad > 0.0) ring += exp(-abs(d - rad) * 90.0) * (1.0 - float(i) * 0.3);
  }
  return ring * r.w * clamp(1.4 - r.z, 0.0, 1.0);
}

void main() {
  vec2 p = vUv - 0.5;
  float r = length(p) * 2.0;
  vec3 shallow = mix(uShallow, uShallowN, uNight);
  vec3 deep = mix(uDeep, uDeepN, uNight);
  vec3 col = mix(deep, shallow, smoothstep(0.0, 0.95, r));
  // slow animated bands
  float a = atan(p.y, p.x);
  float bands = sin(r * 22.0 - uTime * 1.3 + sin(a * 3.0 + uTime * 0.4) * 0.6);
  col += smoothstep(0.82, 1.0, bands) * 0.08 * (1.0 - r * 0.3);
  // edge foam
  col = mix(col, vec3(1.0), smoothstep(0.9, 0.99, r) * 0.55);
  // restrained sparkles
  vec2 cell = floor(vUv * 40.0);
  float h = hash(cell);
  float tw = sin(uTime * 2.0 + h * 40.0);
  // small round glints, not whole grid cells
  float dotShape = 1.0 - smoothstep(0.08, 0.18, length(fract(vUv * 40.0) - 0.5));
  float sp = step(0.985, h) * smoothstep(0.7, 1.0, tw) * dotShape;
  col += sp * 0.6;
  // bobber ripples
  col += (ripple(uRipple0, vUv) + ripple(uRipple1, vUv)) * 0.65;
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
    uRipple0: { value: THREE.Vector4 };
    uRipple1: { value: THREE.Vector4 };
    uGlow: { value: number };
    uGlowColor: { value: THREE.Color };
    uDim: { value: number };
  };
};

export function createWaterMaterial(): WaterMaterial {
  return new THREE.ShaderMaterial({
    vertexShader: vert,
    fragmentShader: frag,
    uniforms: {
      uTime: { value: 0 },
      uNight: { value: 0 },
      uShallow: { value: PALETTE.water.clone() },
      uDeep: { value: PALETTE.waterDeep.clone() },
      uShallowN: { value: PALETTE.nightWater.clone() },
      uDeepN: { value: PALETTE.nightWaterDeep.clone() },
      uRipple0: { value: new THREE.Vector4() },
      uRipple1: { value: new THREE.Vector4() },
      uGlow: { value: 0 },
      uGlowColor: { value: new THREE.Color('#ff7ae0') },
      uDim: { value: 0 },
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
