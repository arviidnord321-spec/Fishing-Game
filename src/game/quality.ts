/**
 * Quality presets and automatic adjustment.
 *
 * `auto` starts at the best preset the device is likely to sustain, then watches real frame
 * times. If the game stays below its frame-rate target it first lowers render resolution, then
 * steps the preset down (less grass, fewer particles, simpler water). When there is lots of
 * headroom it slowly steps back up. Hysteresis keeps it from flickering between levels.
 */
export type QualityPreset = 'low' | 'medium' | 'high';
export type QualitySetting = QualityPreset | 'auto';

export interface QualityLevel {
  name: QualityPreset;
  /** Upper bound for devicePixelRatio × render scale. */
  maxPixelRatio: number;
  /** Instanced grass tufts drawn. */
  grass: number;
  /** Decorative flowers drawn. */
  flowers: number;
  /** Particle count multiplier. */
  particles: number;
  /** Water: vertex waves + caustics. */
  waterDetail: boolean;
  /** Painted terrain texture (plain color when false). */
  terrainDetail: boolean;
  /** Wind sway on grass and foliage. */
  wind: boolean;
  /** Stars, lamp glow halos. */
  extras: boolean;
  /** Villagers outside the event are animated at this rate (frames skipped). */
  npcStride: number;
}

export const QUALITY: Record<QualityPreset, QualityLevel> = {
  low: { name: 'low', maxPixelRatio: 1, grass: 700, flowers: 60, particles: 0.45, waterDetail: false, terrainDetail: false, wind: false, extras: false, npcStride: 3 },
  medium: { name: 'medium', maxPixelRatio: 1.25, grass: 1800, flowers: 140, particles: 0.75, waterDetail: true, terrainDetail: true, wind: true, extras: true, npcStride: 2 },
  high: { name: 'high', maxPixelRatio: 1.75, grass: 5200, flowers: 220, particles: 1, waterDetail: true, terrainDetail: true, wind: true, extras: true, npcStride: 1 },
};


/** Name of the WebGL renderer, when the browser exposes it. */
export function gpuName(gl: WebGLRenderingContext | WebGL2RenderingContext): string {
  try {
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    return String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
  } catch {
    return '';
  }
}

/** True for CPU rasterizers (blocklisted GPUs and some Chromebooks fall back to these). */
export function isSoftwareRenderer(name: string): boolean {
  return /swiftshader|llvmpipe|softpipe|software|microsoft basic render/i.test(name);
}

/** Guess a starting preset from cheap device hints (no benchmark needed). */
export function initialPreset(isTouch: boolean, gpu = ''): QualityPreset {
  if (isSoftwareRenderer(gpu)) return 'low';
  const cores = navigator.hardwareConcurrency ?? 4;
  const mem = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 4;
  if (isTouch) return cores >= 8 && mem >= 6 ? 'medium' : 'low';
  if (cores <= 2 || mem <= 2) return 'low';
  return cores >= 8 ? 'high' : 'medium';
}

export interface QualityChange {
  preset: QualityPreset;
  renderScale: number;
  reason: string;
}

/** Quality ladder from cheapest to richest. Auto mode moves one rung at a time. */
export const LADDER: { preset: QualityPreset; scale: number }[] = [
  { preset: 'low', scale: 0.6 },
  { preset: 'low', scale: 0.8 },
  { preset: 'low', scale: 1 },
  { preset: 'medium', scale: 0.85 },
  { preset: 'medium', scale: 1 },
  { preset: 'high', scale: 0.85 },
  { preset: 'high', scale: 1 },
];

/**
 * Tracks frame times in 2 s windows and recommends rung changes. Pure; easy to test.
 * - Two slow windows in a row: step down one rung, and remember that rung as too slow.
 * - Eight fast windows in a row: step up one rung, but never to a rung that already failed,
 *   so a capped 60 Hz display cannot make it oscillate.
 */
export class AutoQuality {
  private idx: number;
  /** First rung known to be too slow this session (exclusive upper bound). */
  private ceiling = LADDER.length;
  private windowTime = 0;
  private windowFrames = 0;
  private slowWindows = 0;
  private fastWindows = 0;
  private cooldown = 0;
  /** Most recent measured window average. */
  lastFps = 60;

  constructor(start: QualityPreset, private target = 55) {
    this.idx = LADDER.map((r) => r.preset).lastIndexOf(start);
  }

  get preset(): QualityPreset {
    return LADDER[this.idx].preset;
  }
  get renderScale(): number {
    return LADDER[this.idx].scale;
  }

  /**
   * Feed one frame's real delta (seconds). Returns a change when one should be applied.
   * Callers must not feed frames while the game is paused or hidden.
   */
  frame(dt: number): QualityChange | null {
    if (dt <= 0 || dt > 0.5) return null;
    this.windowTime += dt;
    this.windowFrames++;
    if (this.windowTime < 2) return null;
    const fps = this.windowFrames / this.windowTime;
    this.lastFps = fps;
    this.windowTime = 0;
    this.windowFrames = 0;
    if (this.cooldown > 0) {
      this.cooldown--;
      return null;
    }
    if (fps < this.target - 8) {
      this.slowWindows++;
      this.fastWindows = 0;
    } else if (fps >= this.target + 2) {
      this.fastWindows++;
      this.slowWindows = 0;
    } else {
      this.slowWindows = 0;
      this.fastWindows = 0;
    }
    if (this.slowWindows >= 2 && this.idx > 0) {
      this.slowWindows = 0;
      this.cooldown = 1;
      this.ceiling = Math.min(this.ceiling, this.idx);
      this.idx--;
      return this.change(`fps ${fps.toFixed(0)}: down`);
    }
    if (this.fastWindows >= 8 && this.idx + 1 < this.ceiling) {
      this.fastWindows = 0;
      this.cooldown = 2;
      this.idx++;
      return this.change(`fps ${fps.toFixed(0)}: up`);
    }
    return null;
  }

  private change(reason: string): QualityChange {
    return { preset: this.preset, renderScale: this.renderScale, reason };
  }

  /** Forget partial measurements (after a pause, resize, or quality change). */
  reset(): void {
    this.windowTime = 0;
    this.windowFrames = 0;
  }
}
