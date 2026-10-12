/**
 * Platform boundary. Game code talks only to this interface; SDK calls live in one place.
 *
 * CrazyGames HTML5 SDK v3 surface used here (from the official docs: SDK init, game events,
 * settings, Data module, video ads). Re-verify against the live docs before submission:
 *   await window.CrazyGames.SDK.init()
 *   SDK.game.gameplayStart() / gameplayStop() / loadingStart() / loadingStop() / happytime()
 *   SDK.game.settings.muteAudio, SDK.game.addSettingsChangeListener(fn)
 *   SDK.data.getItem(key) / setItem(key, value)          (1 MB limit, synced for signed-in users)
 *   SDK.ad.requestAd('rewarded', { adStarted, adFinished, adError })
 *   SDK.user.addAuthListener(fn)                          (account changes)
 */

export type PlatformKind = 'standalone' | 'crazygames-basic' | 'crazygames-full';

export interface KeyValueBackend {
  readonly name: string;
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
}

export type AdResult = 'finished' | 'error';

export interface AdHooks {
  started: () => void;
}

export interface Platform {
  readonly kind: PlatformKind;
  /** True when monetization may be shown (Full Launch build only). */
  readonly adsEnabled: boolean;
  init(): Promise<{ ok: boolean; message?: string }>;
  storage(): KeyValueBackend;
  gameplayStart(): void;
  gameplayStop(): void;
  loadingStart(): void;
  loadingStop(): void;
  happytime(): void;
  isMuted(): boolean;
  onMuteChange(fn: (muted: boolean) => void): void;
  onAccountChange(fn: () => void): void;
  /** Resolves exactly once. `hooks.started` fires only if playback actually begins. */
  requestRewarded(hooks: AdHooks): Promise<AdResult>;
}

/** Deduplicates gameplay start/stop so they map to real transitions only. */
abstract class BasePlatform implements Platform {
  abstract readonly kind: PlatformKind;
  abstract readonly adsEnabled: boolean;
  private gameplay: boolean | null = null;
  abstract init(): Promise<{ ok: boolean; message?: string }>;
  abstract storage(): KeyValueBackend;
  protected abstract sendGameplay(start: boolean): void;
  gameplayStart(): void {
    if (this.gameplay === true) return;
    this.gameplay = true;
    this.sendGameplay(true);
  }
  gameplayStop(): void {
    if (this.gameplay !== true) return;
    this.gameplay = false;
    this.sendGameplay(false);
  }
  loadingStart(): void {}
  loadingStop(): void {}
  happytime(): void {}
  isMuted(): boolean {
    return false;
  }
  onMuteChange(_fn: (muted: boolean) => void): void {}
  onAccountChange(_fn: () => void): void {}
  async requestRewarded(_hooks: AdHooks): Promise<AdResult> {
    return 'error';
  }
  /** For QA overlays: count of forwarded gameplay transitions. */
  transitions = 0;
}

class LocalStorageBackend implements KeyValueBackend {
  readonly name = 'localStorage';
  async getItem(key: string): Promise<string | null> {
    // Throws (rather than returning null) when storage is blocked, so the caller can
    // distinguish "no save" from "save could not be read".
    return window.localStorage.getItem(key);
  }
  async setItem(key: string, value: string): Promise<void> {
    window.localStorage.setItem(key, value);
  }
}

export class StandalonePlatform extends BasePlatform {
  readonly kind = 'standalone' as const;
  readonly adsEnabled = false;
  private backend = new LocalStorageBackend();
  async init() {
    return { ok: true };
  }
  storage(): KeyValueBackend {
    return this.backend;
  }
  protected sendGameplay(): void {
    this.transitions++;
  }
}

/* eslint-disable @typescript-eslint/no-explicit-any */
type CGSdk = any;

class CrazyDataBackend implements KeyValueBackend {
  readonly name = 'CrazyGames Data';
  constructor(private sdk: CGSdk) {}
  async getItem(key: string): Promise<string | null> {
    return this.sdk.data.getItem(key);
  }
  async setItem(key: string, value: string): Promise<void> {
    this.sdk.data.setItem(key, value);
  }
}

export class CrazyGamesPlatform extends BasePlatform {
  readonly adsEnabled: boolean;
  private sdk: CGSdk = null;
  private muteListeners: ((m: boolean) => void)[] = [];
  private accountListeners: (() => void)[] = [];
  private adPending = false;

  constructor(readonly kind: 'crazygames-basic' | 'crazygames-full') {
    super();
    this.adsEnabled = kind === 'crazygames-full';
  }

  async init(): Promise<{ ok: boolean; message?: string }> {
    const g = (window as any).CrazyGames;
    if (!g?.SDK) return { ok: false, message: 'CrazyGames SDK script not available.' };
    try {
      await g.SDK.init();
      this.sdk = g.SDK;
    } catch (e) {
      return { ok: false, message: `CrazyGames SDK init failed: ${String(e)}` };
    }
    try {
      this.sdk.game.addSettingsChangeListener?.((settings: { muteAudio?: boolean }) => {
        for (const l of this.muteListeners) l(!!settings?.muteAudio);
      });
    } catch {
      /* optional */
    }
    try {
      this.sdk.user?.addAuthListener?.(() => {
        for (const l of this.accountListeners) l();
      });
    } catch {
      /* optional */
    }
    return { ok: true };
  }
  get ready(): boolean {
    return !!this.sdk;
  }
  storage(): KeyValueBackend {
    if (!this.sdk) throw new Error('SDK not initialised');
    return new CrazyDataBackend(this.sdk);
  }
  protected sendGameplay(start: boolean): void {
    this.transitions++;
    try {
      if (start) this.sdk?.game.gameplayStart();
      else this.sdk?.game.gameplayStop();
    } catch {
      /* never let analytics break play */
    }
  }
  loadingStart(): void {
    try {
      this.sdk?.game.loadingStart();
    } catch {
      /* ignore */
    }
  }
  loadingStop(): void {
    try {
      this.sdk?.game.loadingStop();
    } catch {
      /* ignore */
    }
  }
  happytime(): void {
    try {
      this.sdk?.game.happytime();
    } catch {
      /* ignore */
    }
  }
  isMuted(): boolean {
    try {
      return !!this.sdk?.game.settings?.muteAudio;
    } catch {
      return false;
    }
  }
  onMuteChange(fn: (muted: boolean) => void): void {
    this.muteListeners.push(fn);
  }
  onAccountChange(fn: () => void): void {
    this.accountListeners.push(fn);
  }

  requestRewarded(hooks: AdHooks): Promise<AdResult> {
    if (!this.adsEnabled || !this.sdk || this.adPending) return Promise.resolve('error');
    this.adPending = true;
    return new Promise<AdResult>((resolve) => {
      let settled = false;
      const settle = (r: AdResult) => {
        if (settled) return;
        settled = true;
        this.adPending = false;
        resolve(r);
      };
      try {
        this.sdk.ad.requestAd('rewarded', {
          adStarted: () => {
            if (!settled) hooks.started();
          },
          adFinished: () => settle('finished'),
          adError: () => settle('error'),
        });
      } catch {
        settle('error');
      }
    });
  }
}

export function createPlatform(kind: PlatformKind): Platform {
  if (kind === 'standalone') return new StandalonePlatform();
  return new CrazyGamesPlatform(kind);
}
