import { BALANCE } from '../data/balance';
import type { LureId } from '../data/types';

export type EventPhase = 'idle' | 'notice' | 'opening' | 'open' | 'grace' | 'closing';

export interface EventInfo {
  phase: EventPhase;
  /** Seconds remaining in the current phase. */
  remaining: number;
  /** Seconds until the next bloom opens (idle/notice phases). */
  untilOpen: number;
  /** 0..1 portal openness for visuals. */
  openness: number;
  current: LureId;
  /** Index of the bloom (0 = first). */
  index: number;
}

const E = BALANCE.event;
const CURRENTS: LureId[] = ['sun', 'leaf', 'moon'];

/** Start time (world clock) of bloom number n. */
export function bloomStart(n: number): number {
  return E.firstStart + n * E.interval;
}

/**
 * Pure schedule for Rift Bloom driven by active world time. The grace phase may end early
 * when no rift attempt is still active (`graceDone`).
 */
export class EventDirector {
  private graceEndedEarlyFor = -1;
  /** Forces the next bloom to start now (debug / QA builds only). */
  private offset = 0;

  info(worldClock: number): EventInfo {
    const t = worldClock + this.offset;
    const n = t < E.firstStart - E.notice ? -1 : Math.floor((t - E.firstStart + E.notice) / E.interval);
    const idx = Math.max(0, n);
    const start = bloomStart(idx);
    const rel = t - start;
    const base = { index: idx, current: 'sun' as LureId };
    if (n < 0 || rel < -E.notice) {
      return { ...base, phase: 'idle', remaining: start - E.notice - t, untilOpen: start - t, openness: 0 };
    }
    if (rel < 0) return { ...base, phase: 'notice', remaining: -rel, untilOpen: -rel, openness: 0 };
    if (rel < E.opening) return { ...base, phase: 'opening', remaining: E.opening - rel, untilOpen: 0, openness: rel / E.opening };
    const openRel = rel - E.opening;
    const current = CURRENTS[Math.floor(Math.min(openRel, E.open - 0.001) / E.currentSwap) % 3];
    if (openRel < E.open) return { ...base, current, phase: 'open', remaining: E.open - openRel, untilOpen: 0, openness: 1 };
    const graceRel = openRel - E.open;
    const graceLen = this.graceEndedEarlyFor === idx ? Math.min(E.grace, this.graceEndAt - E.open) : E.grace;
    if (graceRel < graceLen) return { ...base, current, phase: 'grace', remaining: graceLen - graceRel, untilOpen: 0, openness: 1 };
    const closeRel = graceRel - graceLen;
    if (closeRel < E.closing) return { ...base, current, phase: 'closing', remaining: E.closing - closeRel, untilOpen: 0, openness: 1 - closeRel / E.closing };
    const next = bloomStart(idx + 1);
    return { ...base, index: idx + 1, phase: 'idle', remaining: next - E.notice - t, untilOpen: next - t, openness: 0 };
  }

  private graceEndAt = 0;
  /** Called during grace when no attempt at the rift is active, so the portal can close sooner. */
  endGraceEarly(worldClock: number): void {
    const i = this.info(worldClock);
    if (i.phase !== 'grace' || this.graceEndedEarlyFor === i.index) return;
    this.graceEndedEarlyFor = i.index;
    this.graceEndAt = worldClock + this.offset - bloomStart(i.index) - E.opening;
  }

  /** Debug: shift the schedule so a notice begins now. */
  debugTriggerSoon(worldClock: number): void {
    const t = worldClock + this.offset;
    const n = Math.max(0, Math.ceil((t - E.firstStart + E.notice) / E.interval));
    this.offset += bloomStart(n) - E.notice + 0.01 - t;
  }

  getOffset(): number {
    return this.offset;
  }
  setOffset(o: number): void {
    this.offset = o;
  }
}
