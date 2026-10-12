import { BALANCE, POOLS_BY_ID } from '../data/balance';
import { SPECIES_BY_ID } from '../data/species';
import type { CatchRecord, PoolId } from '../data/types';
import { castMarker, castQuality, type CastResult } from './castQuality';
import { eligibleSpecies, resolveCatch, type CatchContext, type CatchRoll } from './catchResolver';
import type { EventInfo } from './eventDirector';
import { ReelSim } from './reelSim';
import type { Rng } from './rng';
import type { GameStore } from './store';

export type FishState =
  | 'FreeRoam'
  | 'ChargeCast'
  | 'CastFlight'
  | 'WaitingForBite'
  | 'BiteWindow'
  | 'Reeling'
  | 'ResolveSuccess'
  | 'Reveal'
  | 'Escape';

export interface FishInput {
  pressed: boolean;
  released: boolean;
  held: boolean;
  cancel: boolean;
}

export interface FishContext {
  /** Pool whose legal fishing band the player stands in, or null. */
  pool: PoolId | null;
  isNight: boolean;
  event: EventInfo;
}

export type FishEvent =
  | { type: 'blocked'; reason: string }
  | { type: 'chargeStart' }
  | { type: 'castRelease'; cast: CastResult; pool: PoolId }
  | { type: 'landed' }
  | { type: 'nibble' }
  | { type: 'bite' }
  | { type: 'hint'; text: string }
  | { type: 'hooked' }
  | { type: 'caught'; record: Omit<CatchRecord, 'ordinal' | 'favorite'>; newSpecies: boolean; newRecord: boolean; value: number; xp: number }
  | { type: 'escaped'; reason: 'missed' | 'slack' | 'time' }
  | { type: 'cancelled'; reason: string }
  | { type: 'revealDone' };

const RIFT_LIVE = new Set(['open', 'grace']);

/**
 * Explicit fishing state machine, independent of rendering. Advance with fixed steps only.
 * Global pause is handled by the caller simply not ticking.
 */
export class FishingController {
  state: FishState = 'FreeRoam';
  /** Seconds spent in the current state. */
  t = 0;
  pool: PoolId | null = null;
  cast: CastResult | null = null;
  roll: CatchRoll | null = null;
  catchId = '';
  matchFactor = 1;
  reel: ReelSim | null = null;
  waitTime = 0;
  biteWindow = 0;
  tutorial = false;
  revealLength = BALANCE.reveal.normal;
  lastCatch: { record: Omit<CatchRecord, 'ordinal' | 'favorite'>; newSpecies: boolean; newRecord: boolean; value: number; xp: number } | null = null;
  private nibbles = 0;
  private hasReservation = false;
  private listeners = new Set<(e: FishEvent) => void>();
  private heldHintShown = false;

  constructor(private store: GameStore, private rng: Rng) {}

  on(fn: (e: FishEvent) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
  private emit(e: FishEvent): void {
    for (const l of this.listeners) l(e);
  }
  private go(s: FishState): void {
    this.state = s;
    this.t = 0;
  }

  get busy(): boolean {
    return this.state !== 'FreeRoam';
  }
  get canCancel(): boolean {
    return this.state === 'ChargeCast' || this.state === 'CastFlight' || this.state === 'WaitingForBite';
  }
  get chargeMarker(): number {
    return this.state === 'ChargeCast' ? castMarker(this.t) : 0;
  }

  catchContext(pool: PoolId, ctx: FishContext, castLuck: number): CatchContext {
    return {
      pool,
      rod: this.store.rod,
      castLuck,
      poolGrowthLevel: this.store.state.upgrades.poolGrowth,
      isNight: ctx.isNight,
      eventOpen: pool === 'rift' && ctx.event.phase === 'open',
      unlockedPools: this.store.unlockedPermanentPools(),
      world: this.store.state.world,
      luckMultiplier: this.store.luckMultiplier(),
      tutorial: !this.store.state.tutorial.firstCatch,
    };
  }

  /** Returns a player-facing reason why casting is impossible right now, or null. */
  castBlocker(ctx: FishContext): string | null {
    if (!ctx.pool) return 'Walk up to the edge of a pool to fish.';
    if (!this.store.isPoolUnlocked(ctx.pool)) return `${POOLS_BY_ID[ctx.pool].name} is locked. ${POOLS_BY_ID[ctx.pool].lockText}`;
    if (ctx.pool === 'rift' && ctx.event.phase !== 'open') {
      return ctx.event.phase === 'grace' || ctx.event.phase === 'closing' ? 'The rift is closing. No new casts.' : 'The rift is not open.';
    }
    if (this.store.bagFull()) return 'Bag full — sell your catches at the Fish Stand.';
    if (eligibleSpecies(this.catchContext(ctx.pool, ctx, 1)).length === 0) {
      return 'Nothing here can be landed with this rod. Try a stronger rod.';
    }
    return null;
  }

  private release(): void {
    if (this.hasReservation) {
      this.store.releaseSlot();
      this.hasReservation = false;
    }
  }

  /** Cancels any in-progress attempt without penalty. Safe to call in any state. */
  cancel(reason: string): void {
    if (this.state === 'FreeRoam' || this.state === 'Reveal' || this.state === 'ResolveSuccess') return;
    this.release();
    this.reel = null;
    this.roll = null;
    this.go('FreeRoam');
    this.emit({ type: 'cancelled', reason });
  }

  /** Dismisses the reveal card once the minimum display time has passed. */
  continueReveal(): boolean {
    if (this.state !== 'Reveal' || this.t < BALANCE.reveal.continueAfter) return false;
    this.go('FreeRoam');
    this.emit({ type: 'revealDone' });
    return true;
  }

  tick(dt: number, input: FishInput, ctx: FishContext): void {
    this.t += dt;

    // Rift closed under an unresolved attempt: cancel without penalty.
    if (this.pool === 'rift' && !RIFT_LIVE.has(ctx.event.phase) && this.busy && this.state !== 'Reveal' && this.state !== 'Escape') {
      this.cancel('The rift closed before the fish was landed. No penalty.');
      return;
    }
    if (input.cancel && this.canCancel) {
      this.cancel('Cast cancelled.');
      return;
    }

    switch (this.state) {
      case 'FreeRoam': {
        if (!input.pressed) break;
        const blocker = this.castBlocker(ctx);
        if (blocker) {
          this.emit({ type: 'blocked', reason: blocker });
          break;
        }
        if (!this.store.reserveSlot()) {
          this.emit({ type: 'blocked', reason: 'Bag full — sell your catches at the Fish Stand.' });
          break;
        }
        this.hasReservation = true;
        this.pool = ctx.pool;
        this.go('ChargeCast');
        this.emit({ type: 'chargeStart' });
        if (input.released) this.releaseCast(ctx);
        break;
      }
      case 'ChargeCast':
        if (input.released || !input.held || this.t >= BALANCE.cast.maxHoldSeconds) this.releaseCast(ctx);
        break;
      case 'CastFlight':
        if (this.t >= BALANCE.cast.flightSeconds) {
          this.go('WaitingForBite');
          this.nibbles = 0;
          this.emit({ type: 'landed' });
        }
        break;
      case 'WaitingForBite': {
        const nibbleAt = [0.35, 0.65];
        if (this.nibbles < 2 && this.t >= this.waitTime * nibbleAt[this.nibbles]) {
          this.nibbles++;
          this.emit({ type: 'nibble' });
        }
        if (input.pressed) this.emit({ type: 'hint', text: 'Not yet — wait for the bobber to dip.' });
        if (this.t >= this.waitTime) {
          this.go('BiteWindow');
          this.heldHintShown = false;
          this.biteWindow = this.store.state.settings.assist || this.tutorial ? BALANCE.bite.assistWindow : BALANCE.bite.window;
          this.emit({ type: 'bite' });
        }
        break;
      }
      case 'BiteWindow':
        // Only a fresh press hooks; a button held from before the bite does not.
        if (input.pressed) {
          this.startReel();
          break;
        }
        if (input.held && !this.heldHintShown) {
          this.heldHintShown = true;
          this.emit({ type: 'hint', text: 'Tap when the bobber dips.' });
        }
        if (this.t >= this.biteWindow) this.escape('missed');
        break;
      case 'Reeling': {
        const outcome = this.reel!.step(dt, input.held);
        if (outcome === 'caught') this.resolveSuccess();
        else if (outcome === 'escaped') this.escape(this.reel!.state.escapeReason === 'time' ? 'time' : 'slack');
        break;
      }
      case 'Reveal':
        if (input.pressed) this.continueReveal();
        else if (this.t >= this.revealLength + 2.2) this.continueReveal();
        break;
      case 'Escape':
        if (this.t >= BALANCE.escapeSeconds) this.go('FreeRoam');
        break;
      case 'ResolveSuccess':
        break;
    }
  }

  private releaseCast(ctx: FishContext): void {
    const pool = this.pool!;
    this.cast = castQuality(castMarker(this.t));
    if (this.cast.perfect) this.store.recordPerfectCast();
    this.tutorial = !this.store.state.tutorial.firstCatch;
    const cctx = this.catchContext(pool, ctx, this.cast.luck);
    this.roll = resolveCatch(cctx, this.rng);
    if (!this.roll) {
      this.cancel('Nothing is biting here with this rod.');
      return;
    }
    this.catchId = this.store.newCatchId();
    // Lure match is locked at cast release.
    this.matchFactor =
      pool === 'rift' && ctx.event.phase === 'open' && this.store.state.lure === ctx.event.current ? BALANCE.matchFactor : 1;
    this.waitTime = this.tutorial ? BALANCE.bite.tutorialWait : this.rng.range(BALANCE.bite.waitMin, BALANCE.bite.waitMax);
    this.store.markTutorial('firstCast');
    this.go('CastFlight');
    this.emit({ type: 'castRelease', cast: this.cast, pool });
  }

  private startReel(): void {
    const sp = SPECIES_BY_ID[this.roll!.speciesId];
    const rod = this.store.rod;
    this.reel = new ReelSim({
      rarity: sp.rarity,
      fightSeconds: sp.fightSeconds,
      reelSpeed: rod.reelSpeed * this.store.reelMultiplier(),
      windowBonus: rod.windowBonus,
      assist: this.store.state.settings.assist,
      tutorial: this.tutorial,
      motionSeed: this.roll!.motionSeed,
    });
    this.go('Reeling');
    this.emit({ type: 'hooked' });
  }

  private resolveSuccess(): void {
    this.go('ResolveSuccess');
    const r = this.roll!;
    const record = {
      id: this.catchId,
      speciesId: r.speciesId,
      rarity: r.rarity,
      weight: r.weight,
      modifier: r.modifier,
      matchFactor: this.matchFactor,
      pool: this.pool!,
    };
    const flags = this.store.commitCatch(record);
    this.hasReservation = false;
    const res = flags ?? { newSpecies: false, newRecord: false, xp: 0, bonus: 1 };
    const stored = this.store.state.inventory.find((c) => c.id === record.id);
    const value = stored ? this.store.valueOf(stored) : 0;
    const full = { ...record, bonus: res.bonus };
    this.lastCatch = { record: full, newSpecies: res.newSpecies, newRecord: res.newRecord, value, xp: res.xp };
    this.revealLength = res.newSpecies || res.newRecord ? BALANCE.reveal.special : BALANCE.reveal.normal;
    this.reel = null;
    this.go('Reveal');
    this.emit({ type: 'caught', record: full, newSpecies: res.newSpecies, newRecord: res.newRecord, value, xp: res.xp });
  }

  private escape(reason: 'missed' | 'slack' | 'time'): void {
    this.release();
    this.store.breakStreak();
    this.reel = null;
    this.roll = null;
    this.go('Escape');
    this.emit({ type: 'escaped', reason });
  }
}
