import * as THREE from 'three';

export const PALETTE = {
  daySky: new THREE.Color('#71DDF0'),
  dayHorizon: new THREE.Color('#d8f6ff'),
  nightSky: new THREE.Color('#182655'),
  nightHorizon: new THREE.Color('#6650A5'),
  grass: '#72CC68',
  grassDark: '#5cb457',
  water: new THREE.Color('#27CEE0'),
  waterDeep: new THREE.Color('#0f7fa6'),
  nightWater: new THREE.Color('#3D9DCE'),
  nightWaterDeep: new THREE.Color('#163f78'),
  sand: '#E9C995',
  sandDark: '#cfa877',
  lamp: '#FFC978',
  stone: '#b9b2a6',
  stoneDark: '#8f887c',
  wood: '#a06a3f',
  woodDark: '#7a4c2b',
};

const lambertCache = new Map<string, THREE.MeshLambertMaterial>();

/** Shared flat-shaded material per color so meshes batch well and nothing allocates per frame. */
export function flat(color: string, opts: { emissive?: string; transparent?: boolean; opacity?: number } = {}): THREE.MeshLambertMaterial {
  const key = `${color}|${opts.emissive ?? ''}|${opts.opacity ?? 1}`;
  let m = lambertCache.get(key);
  if (!m) {
    m = new THREE.MeshLambertMaterial({
      color,
      flatShading: true,
      transparent: opts.transparent ?? (opts.opacity !== undefined && opts.opacity < 1),
      opacity: opts.opacity ?? 1,
    });
    if (opts.emissive) m.emissive.set(opts.emissive);
    lambertCache.set(key, m);
  }
  return m;
}

let blobTex: THREE.Texture | null = null;
/** Soft round contact shadow texture, generated once. */
export function blobShadowTexture(): THREE.Texture {
  if (blobTex) return blobTex;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(32, 32, 2, 32, 32, 31);
  grad.addColorStop(0, 'rgba(0,0,0,0.55)');
  grad.addColorStop(0.6, 'rgba(0,0,0,0.25)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  blobTex = new THREE.CanvasTexture(c);
  return blobTex;
}

let blobMat: THREE.MeshBasicMaterial | null = null;
const blobGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
export function blobShadow(size: number): THREE.Mesh {
  if (!blobMat) blobMat = new THREE.MeshBasicMaterial({ map: blobShadowTexture(), transparent: true, depthWrite: false });
  const m = new THREE.Mesh(blobGeo, blobMat);
  m.scale.set(size, 1, size);
  m.position.y = 0.02;
  m.renderOrder = 1;
  return m;
}

/** Canvas-text sign texture using system fonts only (no font files shipped). */
export function signTexture(text: string, bg: string, fg: string, w = 512, h = 128): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d')!;
  g.fillStyle = bg;
  const r = 24;
  g.beginPath();
  g.roundRect(4, 4, w - 8, h - 8, r);
  g.fill();
  g.lineWidth = 8;
  g.strokeStyle = 'rgba(255,255,255,0.6)';
  g.stroke();
  g.fillStyle = fg;
  g.font = `900 ${Math.floor(h * 0.48)}px "Trebuchet MS", "Segoe UI", system-ui, sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, w / 2, h / 2 + 4);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
