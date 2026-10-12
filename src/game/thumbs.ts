import * as THREE from 'three';
import type { ModifierId } from '../data/types';
import { buildFish } from './fishModels';

const W = 192;
const H = 132;

/** Renders fish icons once via the main renderer into a small render target; cached as data URLs. */
export class ThumbnailRenderer {
  private cache = new Map<string, string>();
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(30, W / H, 0.1, 50);
  private target = new THREE.WebGLRenderTarget(W, H, { colorSpace: THREE.SRGBColorSpace });
  private pixels = new Uint8Array(W * H * 4);
  private canvas = document.createElement('canvas');
  private silhouette = new THREE.MeshBasicMaterial({ color: '#0d2236' });

  constructor(private renderer: THREE.WebGLRenderer) {
    this.scene.add(new THREE.HemisphereLight('#ffffff', '#5d7fa0', 2.2));
    const d = new THREE.DirectionalLight('#ffffff', 1.8);
    d.position.set(2, 3, 4);
    this.scene.add(d);
    this.camera.position.set(0.35, 0.35, 2.6);
    this.camera.lookAt(0, 0, 0);
    this.canvas.width = W;
    this.canvas.height = H;
  }

  get(speciesId: string, modifier: ModifierId, silhouette: boolean): string {
    const key = `${speciesId}|${modifier}|${silhouette ? 1 : 0}`;
    const hit = this.cache.get(key);
    if (hit) return hit;
    let url = '';
    try {
      const fish = buildFish(speciesId, modifier);
      fish.rotation.y = -0.45;
      this.scene.add(fish);
      this.scene.overrideMaterial = silhouette ? this.silhouette : null;
      const prevTarget = this.renderer.getRenderTarget();
      const prevClear = this.renderer.getClearAlpha();
      this.renderer.setRenderTarget(this.target);
      this.renderer.setClearColor(0x000000, 0);
      this.renderer.clear();
      this.renderer.render(this.scene, this.camera);
      this.renderer.readRenderTargetPixels(this.target, 0, 0, W, H, this.pixels);
      this.renderer.setRenderTarget(prevTarget);
      this.renderer.setClearAlpha(prevClear);
      this.scene.remove(fish);
      const g = this.canvas.getContext('2d')!;
      const img = g.createImageData(W, H);
      // flip vertically: GL rows start at the bottom
      for (let y = 0; y < H; y++) img.data.set(this.pixels.subarray((H - 1 - y) * W * 4, (H - y) * W * 4), y * W * 4);
      g.putImageData(img, 0, 0);
      url = this.canvas.toDataURL('image/png');
    } catch {
      url = '';
    }
    this.cache.set(key, url);
    return url;
  }

  dispose(): void {
    this.target.dispose();
  }
}
