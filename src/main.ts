import './ui/styles.css';
import { GameApp } from './game/app';
import { GameStore } from './logic/store';
import { createPlatform } from './platform/platform';
import { SaveRepository } from './platform/saveRepository';

function bootError(title: string, message: string): void {
  const boot = document.getElementById('boot')!;
  boot.className = 'error';
  boot.innerHTML = `<div><h2>${title}</h2><p>${message}</p></div>`;
}

function webglAvailable(): boolean {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}

async function boot(): Promise<void> {
  if (!webglAvailable()) {
    bootError('3D graphics unavailable', 'Rift Fishing needs WebGL. Please enable hardware acceleration in your browser settings or try another browser.');
    return;
  }
  if ((import.meta.env.DEV || import.meta.env.MODE === 'qa') && new URLSearchParams(location.search).has('gallery')) {
    (await import('./game/gallery')).startGallery();
    return;
  }
  let platform = createPlatform(__PLATFORM__);
  const init = await platform.init();
  if (!init.ok) {
    // Never block play on SDK problems; fall back to local behavior.
    console.warn(init.message);
    platform = createPlatform('standalone');
  }
  platform.loadingStart();
  const repo = new SaveRepository(platform.storage());
  const loaded = await repo.load();
  const store = new GameStore(loaded.data);
  store.onPersist = (s) => repo.save(s);

  const container = document.getElementById('app')!;
  const canvas = document.getElementById('game') as HTMLCanvasElement;
  let app: GameApp;
  try {
    app = new GameApp(container, canvas, store, platform, repo);
  } catch (e) {
    console.error(e);
    bootError('Could not start the game', 'The graphics device failed to initialise. Reloading the page usually fixes this.');
    return;
  }
  platform.loadingStop();
  document.getElementById('boot')?.remove();
  app.start();
  if (loaded.notice) setTimeout(() => app.notify(loaded.notice!), 400);
  if (new URLSearchParams(location.search).has('qa')) (window as unknown as { __riftQA: () => unknown }).__riftQA = () => app.qaSnapshot();
}

void boot();
