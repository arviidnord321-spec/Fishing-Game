import { BALANCE } from '../data/balance';

export type DayPhase = 'day' | 'dusk' | 'night' | 'dawn';

export interface DayNightInfo {
  phase: DayPhase;
  /** 0 = full day lighting, 1 = full night lighting. */
  nightBlend: number;
  isNight: boolean;
  /** Seconds until the next phase change. */
  untilNext: number;
  cyclePos: number;
}

export const CYCLE_SECONDS = BALANCE.dayNight.day + BALANCE.dayNight.dusk + BALANCE.dayNight.night + BALANCE.dayNight.dawn;

const smooth = (t: number) => t * t * (3 - 2 * t);

export function dayNightAt(worldClock: number): DayNightInfo {
  const { day, dusk, night } = BALANCE.dayNight;
  const t = ((worldClock % CYCLE_SECONDS) + CYCLE_SECONDS) % CYCLE_SECONDS;
  if (t < day) return { phase: 'day', nightBlend: 0, isNight: false, untilNext: day - t, cyclePos: t };
  if (t < day + dusk) {
    const k = (t - day) / dusk;
    return { phase: 'dusk', nightBlend: smooth(k), isNight: false, untilNext: day + dusk - t, cyclePos: t };
  }
  if (t < day + dusk + night) return { phase: 'night', nightBlend: 1, isNight: true, untilNext: day + dusk + night - t, cyclePos: t };
  const k = (t - day - dusk - night) / BALANCE.dayNight.dawn;
  return { phase: 'dawn', nightBlend: 1 - smooth(k), isNight: false, untilNext: CYCLE_SECONDS - t, cyclePos: t };
}
