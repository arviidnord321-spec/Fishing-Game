import { BALANCE } from '../data/balance';
import type { Rarity } from '../data/types';
import { clamp, createRng, type Rng } from './rng';

/** Seeded fish-motion profile per rarity (design defaults, see BALANCING.md). */
interface MotionProfile {
  speed: number;
  changeMin: number;
  changeMax: number;
  burst?: { speed: number; duration: number; rest: number; restSpeed: number; chance: number };
}

const PROFILES: Record<Rarity | 'tutorial', MotionProfile> = {
  tutorial: { speed: 0.12, changeMin: 2.2, changeMax: 3 },
  common: { speed: 0.22, changeMin: 1.5, changeMax: 2.5 },
  uncommon: { speed: 0.3, changeMin: 1, changeMax: 2 },
  rare: { speed: 0.38, changeMin: 0.8, changeMax: 1.5, burst: { speed: 0.46, duration: 0.45, rest: 0.7, restSpeed: 0.22, chance: 0.3 } },
  epic: { speed: 0.36, changeMin: 0.8, changeMax: 1.4, burst: { speed: 0.55, duration: 0.6, rest: 0.8, restSpeed: 0.2, chance: 0.4 } },
  legendary: { speed: 0.38, changeMin: 0.7, changeMax: 1.3, burst: { speed: 0.55, duration: 0.6, rest: 0.75, restSpeed: 0.22, chance: 0.5 } },
};

export interface ReelParams {
  rarity: Rarity;
  fightSeconds: number;
  reelSpeed: number;
  windowBonus: number;
  assist: boolean;
  tutorial: boolean;
  motionSeed: number;
}

export type ReelOutcome = 'active' | 'caught' | 'escaped';
type FishMode = 'drift' | 'telegraph' | 'burst' | 'rest';

export interface ReelState {
  windowCenter: number;
  windowWidth: number;
  fishPos: number;
  fishVel: number;
  targetVel: number;
  progress: number;
  slack: number;
  slackLimit: number;
  time: number;
  inside: boolean;
  /** 0..1 fin-flare telegraph intensity, for the UI. */
  flare: number;
  mode: FishMode;
  modeTimer: number;
  outcome: ReelOutcome;
  escapeReason: '' | 'slack' | 'time';
}

/**
 * Deterministic hold/release tracking minigame. Advance only with fixed steps.
 * Holding moves the catch window right, releasing moves it left.
 */
export class ReelSim {
  readonly state: ReelState;
  private rng: Rng;
  private profile: MotionProfile;
  private burstDir = 1;

  constructor(private p: ReelParams) {
    this.rng = createRng(p.motionSeed);
    this.profile = p.tutorial ? PROFILES.tutorial : PROFILES[p.rarity];
    const width = BALANCE.reel.baseWindow + p.windowBonus + (p.assist ? BALANCE.reel.assistWindowBonus : 0);
    this.state = {
      windowCenter: 0.5,
      windowWidth: width,
      fishPos: 0.5,
      fishVel: 0,
      targetVel: 0,
      progress: BALANCE.reel.startProgress,
      slack: 0,
      slackLimit: p.assist ? BALANCE.reel.assistSlackLimit : BALANCE.reel.slackLimit,
      time: 0,
      inside: true,
      flare: 0,
      mode: 'drift',
      // Give the first readable moment before the fish moves.
      modeTimer: 0.6,
      outcome: 'active',
      escapeReason: '',
    };
  }

  private pickDrift(): void {
    const s = this.state;
    const pr = this.profile;
    const dir = this.rng.next() < 0.5 ? -1 : 1;
    s.targetVel = dir * pr.speed * this.rng.range(0.45, 1);
    s.modeTimer = this.rng.range(pr.changeMin, pr.changeMax);
    s.mode = 'drift';
  }

  private nextMode(): void {
    const s = this.state;
    const b = this.profile.burst;
    if (s.mode === 'telegraph' && b) {
      s.mode = 'burst';
      s.targetVel = this.burstDir * b.speed;
      s.modeTimer = b.duration;
      return;
    }
    if (s.mode === 'burst' && b) {
      s.mode = 'rest';
      s.targetVel = (this.rng.next() < 0.5 ? -1 : 1) * b.restSpeed * this.rng.range(0.2, 1);
      s.modeTimer = b.rest;
      return;
    }
    if (b && this.rng.next() < b.chance) {
      s.mode = 'telegraph';
      // Burst toward the side with more room so it is never unavoidable across the whole track.
      this.burstDir = s.fishPos < 0.5 ? 1 : -1;
      s.targetVel = s.fishVel * 0.3;
      s.modeTimer = BALANCE.reel.burstTelegraph;
      return;
    }
    this.pickDrift();
  }

  step(dt: number, holding: boolean): ReelOutcome {
    const s = this.state;
    if (s.outcome !== 'active') return s.outcome;
    const R = BALANCE.reel;
    s.time += dt;

    // --- fish motion ---
    s.modeTimer -= dt;
    if (s.modeTimer <= 0) this.nextMode();
    const k = Math.min(1, dt / R.velocitySmoothing);
    s.fishVel += (s.targetVel - s.fishVel) * k;
    s.fishPos += s.fishVel * dt;
    const margin = 0.04;
    if (s.fishPos < margin) {
      s.fishPos = margin;
      s.fishVel = Math.abs(s.fishVel) * 0.3;
      s.targetVel = Math.abs(s.targetVel);
      if (s.mode === 'burst') this.burstDir = 1;
    } else if (s.fishPos > 1 - margin) {
      s.fishPos = 1 - margin;
      s.fishVel = -Math.abs(s.fishVel) * 0.3;
      s.targetVel = -Math.abs(s.targetVel);
      if (s.mode === 'burst') this.burstDir = -1;
    }
    s.flare = s.mode === 'telegraph' ? 1 : s.mode === 'burst' ? 0.5 : Math.max(0, s.flare - dt * 4);

    // --- player window ---
    s.windowCenter += (holding ? R.holdSpeed : -R.releaseSpeed) * dt;
    const half = s.windowWidth / 2;
    s.windowCenter = clamp(s.windowCenter, half, 1 - half);

    // --- capture ---
    s.inside = Math.abs(s.fishPos - s.windowCenter) <= half;
    if (s.inside) {
      s.progress += (this.p.reelSpeed / this.p.fightSeconds) * dt;
      s.slack = Math.max(0, s.slack - R.slackRecover * dt);
    } else {
      s.progress -= R.outsideDrain * dt;
      s.slack += R.slackGain * dt;
    }
    s.progress = clamp(s.progress, 0, 1);

    if (s.progress >= 1) s.outcome = 'caught';
    else if (s.slack >= s.slackLimit) {
      s.outcome = 'escaped';
      s.escapeReason = 'slack';
    } else if (s.time >= R.maxFightSeconds) {
      s.outcome = 'escaped';
      s.escapeReason = 'time';
    }
    return s.outcome;
  }

  /** Line integrity notches remaining (3 = full, 0 = about to snap). */
  integrityNotches(): number {
    const frac = 1 - this.state.slack / this.state.slackLimit;
    return Math.max(0, Math.ceil(frac * 3 - 1e-6));
  }
}
