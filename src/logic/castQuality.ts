import { BALANCE } from '../data/balance';
import { clamp } from './rng';

/** Ping-pong marker 0→1→0 over one full cycle. `t` is seconds spent charging. */
export function castMarker(t: number): number {
  const cycle = BALANCE.cast.cycleSeconds;
  const phase = (((t % cycle) + cycle) % cycle) / cycle;
  return phase < 0.5 ? phase * 2 : 2 - phase * 2;
}

export interface CastResult {
  marker: number;
  quality: number;
  luck: number;
  perfect: boolean;
}

export function castQuality(marker: number): CastResult {
  const { idealMin, idealMax } = BALANCE.cast;
  const m = clamp(marker, 0, 1);
  const d = m < idealMin ? idealMin - m : m > idealMax ? m - idealMax : 0;
  const quality = clamp(1 - d / 0.86, 0, 1);
  // Two-decimal luck so the displayed multiplier is exactly the one used.
  const luck = Math.round((1 + quality) * 100) / 100;
  return { marker: m, quality, luck, perfect: d === 0 };
}
