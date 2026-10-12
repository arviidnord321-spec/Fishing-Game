import { afterEach, describe, expect, it } from 'vitest';
import { CrazyGamesPlatform, StandalonePlatform } from '../src/platform/platform';

type Callbacks = { adStarted: () => void; adFinished: () => void; adError: (e?: unknown) => void };

function fakeSdk() {
  const calls: string[] = [];
  let settingsListener: ((s: { muteAudio: boolean }) => void) | null = null;
  let pendingAd: Callbacks | null = null;
  const store = new Map<string, string>();
  const sdk = {
    init: async () => {},
    game: {
      gameplayStart: () => calls.push('start'),
      gameplayStop: () => calls.push('stop'),
      loadingStart: () => calls.push('loadingStart'),
      loadingStop: () => calls.push('loadingStop'),
      happytime: () => calls.push('happy'),
      settings: { muteAudio: true },
      addSettingsChangeListener: (fn: (s: { muteAudio: boolean }) => void) => (settingsListener = fn),
    },
    data: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v) },
    ad: { requestAd: (_type: string, cb: Callbacks) => (pendingAd = cb) },
    user: { addAuthListener: () => {} },
  };
  return { sdk, calls, store, fireSettings: (m: boolean) => settingsListener?.({ muteAudio: m }), ad: () => pendingAd };
}

const g = globalThis as unknown as { window?: unknown };
afterEach(() => {
  delete g.window;
});

describe('platform adapter', () => {
  it('deduplicates gameplay start/stop', async () => {
    const f = fakeSdk();
    g.window = { CrazyGames: { SDK: f.sdk } };
    const p = new CrazyGamesPlatform('crazygames-basic');
    expect((await p.init()).ok).toBe(true);
    p.gameplayStart();
    p.gameplayStart();
    p.gameplayStop();
    p.gameplayStop();
    p.gameplayStart();
    expect(f.calls).toEqual(['start', 'stop', 'start']);
  });

  it('reads platform mute and forwards changes', async () => {
    const f = fakeSdk();
    g.window = { CrazyGames: { SDK: f.sdk } };
    const p = new CrazyGamesPlatform('crazygames-basic');
    await p.init();
    expect(p.isMuted()).toBe(true);
    let seen: boolean | null = null;
    p.onMuteChange((m) => (seen = m));
    f.fireSettings(false);
    expect(seen).toBe(false);
  });

  it('basic mode never requests ads', async () => {
    const f = fakeSdk();
    g.window = { CrazyGames: { SDK: f.sdk } };
    const p = new CrazyGamesPlatform('crazygames-basic');
    await p.init();
    expect(p.adsEnabled).toBe(false);
    expect(await p.requestRewarded({ started: () => {} })).toBe('error');
    expect(f.ad()).toBeNull();
  });

  it('rewarded ads settle exactly once and reject concurrent requests', async () => {
    const f = fakeSdk();
    g.window = { CrazyGames: { SDK: f.sdk } };
    const p = new CrazyGamesPlatform('crazygames-full');
    await p.init();
    let started = 0;
    const first = p.requestRewarded({ started: () => started++ });
    expect(await p.requestRewarded({ started: () => {} })).toBe('error'); // pending
    f.ad()!.adStarted();
    f.ad()!.adFinished();
    f.ad()!.adError(); // late callback is ignored
    expect(await first).toBe('finished');
    expect(started).toBe(1);
  });

  it('ad error (no fill / blocked) resolves as error', async () => {
    const f = fakeSdk();
    g.window = { CrazyGames: { SDK: f.sdk } };
    const p = new CrazyGamesPlatform('crazygames-full');
    await p.init();
    const r = p.requestRewarded({ started: () => {} });
    f.ad()!.adError('no fill');
    expect(await r).toBe('error');
  });

  it('a synchronously throwing SDK resolves as error', async () => {
    const f = fakeSdk();
    f.sdk.ad.requestAd = () => {
      throw new Error('adblock');
    };
    g.window = { CrazyGames: { SDK: f.sdk } };
    const p = new CrazyGamesPlatform('crazygames-full');
    await p.init();
    expect(await p.requestRewarded({ started: () => {} })).toBe('error');
  });

  it('missing SDK reports failure so the game can fall back to standalone', async () => {
    g.window = {};
    const p = new CrazyGamesPlatform('crazygames-basic');
    expect((await p.init()).ok).toBe(false);
    const s = new StandalonePlatform();
    expect((await s.init()).ok).toBe(true);
    expect(s.adsEnabled).toBe(false);
  });
});
