import * as THREE from 'three';
import { BAG_CAPACITY, BALANCE, BOBBERS, LANDMARKS, LURES, POOLS_BY_ID, RODS, RODS_BY_ID, UPGRADES } from '../data/balance';
import { SPECIES, SPECIES_BY_ID } from '../data/species';
import type { LureId, PoolId } from '../data/types';
import { dayNightAt } from '../logic/dayNight';
import { EventDirector, type EventInfo, type EventPhase } from '../logic/eventDirector';
import { FishingController, type FishEvent } from '../logic/fishing';
import { PauseManager } from '../logic/pause';
import { createRng } from '../logic/rng';
import type { GameStore } from '../logic/store';
import type { Platform } from '../platform/platform';
import type { SaveRepository } from '../platform/saveRepository';
import { fmtCoins, fmtTime } from '../ui/dom';
import { UI, type HudView, type PanelName, type WorldLabel } from '../ui/ui';
import { AudioManager } from './audio';
import { CameraRig } from './camera';
import { Character } from './character';
import { Particles, Rings } from './effects';
import { animateFish, buildFish, displayScale } from './fishModels';
import { InputManager } from './input';
import { Npcs } from './npcs';
import { PlayerController } from './player';
import { AutoQuality, gpuName, initialPreset, QUALITY, type QualityPreset } from './quality';
import { ThumbnailRenderer } from './thumbs';
import { World } from './world';

const STEP = BALANCE.sim.step;

/** Read the GPU name from a throwaway context before the real renderer is created. */
function probeGpu(): string {
  try {
    const c = document.createElement('canvas');
    const gl = (c.getContext('webgl2') || c.getContext('webgl')) as WebGLRenderingContext | null;
    if (!gl) return '';
    const name = gpuName(gl);
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return name;
  } catch {
    return '';
  }
}
// Debug overlay and cheats exist only in dev and the separate QA build, never in release builds.
const DEBUG = import.meta.env.DEV || import.meta.env.MODE === 'qa';

interface RevealAnim {
  fish: THREE.Group;
  start: THREE.Vector3;
  end: THREE.Vector3;
  scale: number;
  t: number;
  leaving: number;
}

/** Wires simulation, rendering, UI and platform together. */
export class GameApp {
  private renderer: THREE.WebGLRenderer;
  private world: World;
  private player: PlayerController;
  private character: Character;
  private cam: CameraRig;
  private input: InputManager;
  private audio = new AudioManager();
  private pause = new PauseManager();
  private fishing: FishingController;
  private events = new EventDirector();
  private ui: UI;
  private particles: Particles;
  private rings: Rings;
  private npcs: Npcs;
  private thumbs: ThumbnailRenderer;
  private bobber: THREE.Group;
  private line: THREE.Line;
  private linePts = new Float32Array(14 * 3);
  private cosmetic = createRng(Date.now() >>> 0);
  private acc = 0;
  private last = 0;
  private raf = 0;
  private fps = 60;
  private pixelRatio = 1;
  private auto: AutoQuality;
  private preset: QualityPreset = 'medium';
  private renderScale = 1;
  private qualityLog = '';
  private menuFrame = 0;
  private lastHud: HudView | null = null;
  /** QA-build-only feature switches for performance experiments (?exp=nograss,nowater,...). */
  private exp = '';
  private gpu = '';
  private fpsWindow = { frames: 0, time: 0, value: 60 };
  private bobberLanding = new THREE.Vector3();
  private bobberFrom = new THREE.Vector3();
  private bobberPos = new THREE.Vector3();
  private bobberPhase: 'hang' | 'flight' | 'float' | 'reel' | 'gone' = 'hang';
  private dipT = 0;
  private reveal: RevealAnim | null = null;
  private fishOnUntil = 0;
  private simTime = 0;
  private lastEventPhase: EventPhase = 'idle';
  private lastEventIndex = -1;
  private eventInfo!: EventInfo;
  private plinthKey = '';
  private lastSave = 0;
  private hookHintCooldown = 0;
  private tensionBeep = 0;
  private disposed = false;
  private renderError: HTMLElement | null = null;
  private tmpV = new THREE.Vector3();
  // scratch vectors for per-frame math (no allocations in the render loop)
  private sTip = new THREE.Vector3();
  private sA = new THREE.Vector3();
  private sB = new THREE.Vector3();
  private sC = new THREE.Vector3();
  private sProj = new THREE.Vector3();
  private sBeacon = new THREE.Vector3();
  private lastBlockedToast = 0;
  private pendingAd = false;

  constructor(
    private container: HTMLElement,
    private canvas: HTMLCanvasElement,
    private store: GameStore,
    private platform: Platform,
    private repo: SaveRepository,
  ) {
    // Antialiasing is fixed when the GL context is created: off for the low preset and for
    // touch devices on auto (it is the costliest per-pixel feature on weak GPUs).
    const coarse = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
    const qs = store.state.settings.quality;
    const gpu = probeGpu();
    this.gpu = gpu;
    this.preset = qs === 'auto' ? initialPreset(coarse, gpu) : qs;
    this.auto = new AutoQuality(this.preset);
    const exp = DEBUG ? new URLSearchParams(location.search).get('exp') ?? '' : '';
    this.exp = exp;
    // High-DPI screens are already smooth; MSAA there mostly costs fill rate.
    const antialias = exp.includes('noaa') ? false : qs === 'auto' ? !coarse && this.preset !== 'low' && (window.devicePixelRatio || 1) < 1.5 : qs !== 'low';
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias, powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.world = new World();
    this.player = new PlayerController(this.world);
    this.character = new Character();
    this.world.scene.add(this.character.root);
    this.cam = new CameraRig(1);
    this.input = new InputManager(canvas);
    this.input.bindings = { ...store.state.settings.bindings };
    this.fishing = new FishingController(store, createRng((Date.now() ^ 0x9e3779b9) >>> 0));
    this.particles = new Particles(this.world.scene);
    this.rings = new Rings(this.world.scene);
    this.npcs = new Npcs(this.world, this.particles);
    this.thumbs = new ThumbnailRenderer(this.renderer);

    // bobber + line
    this.bobber = new THREE.Group();
    const top = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshLambertMaterial({ color: '#ff4d4d' }));
    const bot = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 6, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), new THREE.MeshLambertMaterial({ color: '#ffffff' }));
    const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.14, 4), new THREE.MeshLambertMaterial({ color: '#ffffff' }));
    ant.position.y = 0.14;
    this.bobber.add(top, bot, ant);
    this.world.scene.add(this.bobber);
    const lg = new THREE.BufferGeometry();
    lg.setAttribute('position', new THREE.BufferAttribute(this.linePts, 3));
    this.line = new THREE.Line(lg, new THREE.LineBasicMaterial({ color: '#ffffff' }));
    this.line.frustumCulled = false;
    this.world.scene.add(this.line);

    this.ui = new UI(container, {
      store,
      input: this.input,
      thumb: (id, m, s) => this.thumbs.get(id, m, s),
      adsEnabled: platform.adsEnabled,
      onPanelChange: (p) => this.onPanelChange(p),
      onAction: (down) => {
        this.audio.unlock();
        this.input.setButton('action', down);
      },
      onInteract: () => this.interact(),
      onCancel: () => this.input.setButton('cancel', true),
      onLure: (l) => this.setLure(l),
      onContinue: () => {
        this.fishing.continueReveal();
      },
      onSettings: () => this.applySettings(),
      onReset: () => this.resetSave(),
      onRetrySave: () => {
        this.store.flush();
        this.ui.toast(this.repo.status.kind === 'degraded' || this.repo.status.kind === 'readonly' ? this.repo.status.message : 'Saved.', '', 2200);
      },
      onRewardedBobber: () => this.rewardedBobber(),
      onSkipTutorial: () => {
        this.store.markTutorial('skipped');
      },
      click: () => this.audio.play('click'),
      debugActions: DEBUG
        ? {
            '+1000¢': () => this.store.debugAddCoins(1000),
            '+20000¢': () => this.store.debugAddCoins(20000),
            'Rift soon': () => this.events.debugTriggerSoon(this.store.state.worldClock),
            'Skip 60s': () => this.store.tickClock(60),
            'Giant reveal': () => {
              this.fishing.pool = 'meadow';
              this.bobberPos.set(0, -0.2, 5.5);
              this.startReveal('rift-leviathan', 'giant', 850, 'legendary');
            },
            'End reveal': () => {
              this.cam.revealTarget = null;
              if (this.reveal) this.reveal.leaving = 0.001;
            },
          }
        : undefined,
    });

    this.wireEvents();
    this.applySettings();
    this.spawnPlayer();
    this.syncWorldFromState();
    this.eventInfo = this.events.info(store.state.worldClock);
    this.lastEventPhase = this.eventInfo.phase;
    this.lastEventIndex = this.eventInfo.index;

    const ro = new ResizeObserver(() => this.resize());
    ro.observe(container);
    this.resize();
  }

  // ------------------------------------------------------------------ setup
  private wireEvents(): void {
    this.fishing.on((e) => this.onFishEvent(e));
    this.store.subscribe((e) => {
      if (e.type === 'changed') this.syncWorldFromState();
      if (e.type === 'poolUnlocked') {
        this.ui.toast(`${POOLS_BY_ID[e.pool].name} unlocked!`, 'big', 2600);
        this.audio.play('upgrade');
      }
      if (e.type === 'purchase') {
        this.ui.toast(`${e.what} purchased!`, 'cyan', 1800);
        this.audio.play('upgrade');
      }
      if (e.type === 'sale') this.audio.play('coin');
    });
    this.repo.onStatus = () => {};

    const onVis = () => {
      if (document.hidden) {
        this.pause.add('DOCUMENT_HIDDEN');
        this.audio.flags.hidden = true;
        this.store.flush();
      } else {
        this.pause.remove('DOCUMENT_HIDDEN');
        this.audio.flags.hidden = false;
        this.audio.unlock();
      }
      this.audio.applyVolumes();
      // Never fast-forward a fight with background time.
      this.last = performance.now();
      this.acc = 0;
    };
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('pagehide', () => this.store.flush());
    const unlock = () => this.audio.unlock();
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);

    this.platform.onMuteChange((m) => {
      this.audio.flags.platformMuted = m;
      this.audio.applyVolumes();
    });
    this.audio.flags.platformMuted = this.platform.isMuted();
    this.platform.onAccountChange(() => {
      // Never write this profile into another account's storage.
      this.repo.suspend();
      this.ui.toast('Account changed — reloading your progress…', 'cyan', 2000);
      setTimeout(() => location.reload(), 1200);
    });

    this.pause.onChange(() => this.syncGameplayEvent());

    this.canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      this.pause.add('RECOVERABLE_RENDER_ERROR');
      this.store.flush();
      this.showRenderError();
    });
    this.canvas.addEventListener('webglcontextrestored', () => {
      this.pause.remove('RECOVERABLE_RENDER_ERROR');
      this.renderError?.remove();
      this.renderError = null;
    });
  }

  private showRenderError(): void {
    if (this.renderError) return;
    const el = document.createElement('div');
    el.className = 'overlay';
    el.style.zIndex = '20';
    el.innerHTML = `<div class="panel" style="width:min(420px,100%)"><div class="body" style="padding:20px"><h2 style="margin-top:0">Graphics interrupted</h2><p>Your progress is saved. The game will resume if the graphics device recovers, or you can reload safely.</p></div><footer><button class="btn primary">Reload</button></footer></div>`;
    el.querySelector('button')!.addEventListener('click', () => location.reload());
    this.ui.root.append(el);
    this.renderError = el;
  }

  /** Gameplay events map to real playable/menu transitions only (not focus or casts). */
  private syncGameplayEvent(): void {
    const breakReasons = this.pause.has('USER_MENU') || this.pause.has('AD_REQUEST') || this.pause.has('AD_PLAYING') || this.pause.has('BOOT');
    if (breakReasons) this.platform.gameplayStop();
    else this.platform.gameplayStart();
  }

  private spawnPlayer(): void {
    const m = this.world.pools.get('meadow')!;
    this.player.teleport(m.x, m.z + m.radius + 1.05, Math.PI);
    this.cam.snapBehind(0);
  }

  private applySettings(): void {
    const s = this.store.state.settings;
    this.audio.setVolumes(s.master, s.music, s.sfx);
    this.input.bindings = { ...s.bindings };
    this.cam.reducedMotion = s.reducedMotion;
    this.ui.setReducedMotion(s.reducedMotion);
    if (s.quality !== 'auto') {
      this.preset = s.quality;
      this.renderScale = 1;
    } else {
      this.preset = this.auto.preset;
      this.renderScale = this.auto.renderScale;
    }
    this.applyQuality();
  }

  private syncWorldFromState(): void {
    const s = this.store;
    this.world.setMeadowRadius(s.meadowRadius());
    this.world.setPoolLocked('reed', !s.isPoolUnlocked('reed'));
    this.world.setPoolLocked('moon', !s.isPoolUnlocked('moon'));
    const rod = s.rod;
    this.character.setRodColors(rod.color, rod.accent);
    const bob = BOBBERS.find((b) => b.id === s.state.equippedBobber) ?? BOBBERS[0];
    ((this.bobber.children[0] as THREE.Mesh).material as THREE.MeshLambertMaterial).color.set(bob.top);
    ((this.bobber.children[1] as THREE.Mesh).material as THREE.MeshLambertMaterial).color.set(bob.bottom);
    // Best-catch plinth
    const best = s.state.bestCatch;
    const key = best ? `${best.speciesId}|${best.modifier}` : '';
    if (key !== this.plinthKey) {
      this.plinthKey = key;
      this.world.plinthDisplay.clear();
      if (best) {
        const f = buildFish(best.speciesId, best.modifier);
        f.scale.setScalar(Math.min(1.8, 0.9 + displayScale(best.speciesId, best.weight, best.modifier) * 0.25));
        this.world.plinthDisplay.add(f);
      }
    }
    // Pool growth may have engulfed the player: push them out safely.
    this.world.resolve(this.player.pos, BALANCE.movement.radius);
  }

  /** Push the current preset + render scale into every system that cares. */
  private applyQuality(): void {
    let level = QUALITY[this.preset];
    if (this.exp) {
      level = { ...level };
      if (this.exp.includes('nograss')) level.grass = 0;
      if (this.exp.includes('nowater')) level.waterDetail = false;
      if (this.exp.includes('nowind')) level.wind = false;
    }
    this.world.setQuality(level);
    if (this.exp.includes('nonpc')) this.npcs.hideAll();
    if (this.exp.includes('nochar')) this.character.root.visible = false;
    if (this.exp.includes('noterrain')) this.world.debugPlainTerrain();
    if (this.exp.includes('nolabels')) this.ui.root.style.display = 'none';
    this.particles.budget = level.particles;
    this.npcs.stride = level.npcStride;
    this.resize();
  }

  private resize(): void {
    const w = Math.max(1, this.container.clientWidth);
    const h = Math.max(1, this.container.clientHeight);
    const dpr = window.devicePixelRatio || 1;
    this.pixelRatio = Math.max(0.5, Math.min(dpr, QUALITY[this.preset].maxPixelRatio) * this.renderScale);
    this.renderer.setPixelRatio(this.pixelRatio);
    this.ui.setViewport();
    this.auto.reset();
    this.renderer.setSize(w, h, false);
    this.cam.camera.aspect = w / h;
    this.cam.camera.updateProjectionMatrix();
  }

  // ------------------------------------------------------------------ loop
  start(): void {
    this.last = performance.now();
    this.syncGameplayEvent();
    const frame = (now: number) => {
      if (this.disposed) return;
      this.raf = requestAnimationFrame(frame);
      try {
        this.frame(now);
      } catch (err) {
        console.error(err);
      }
    };
    this.raf = requestAnimationFrame(frame);
  }

  private frame(now: number): void {
    let dt = (now - this.last) / 1000;
    this.last = now;
    if (dt > BALANCE.sim.backgroundGapSeconds) dt = 0; // returning from background: discard
    this.fps = this.fps * 0.95 + (dt > 0 ? 1 / dt : 60) * 0.05;
    this.fpsWindow.frames++;
    this.fpsWindow.time += dt;
    if (this.fpsWindow.time >= 0.5) {
      this.fpsWindow.value = this.fpsWindow.frames / this.fpsWindow.time;
      this.fpsWindow.frames = 0;
      this.fpsWindow.time = 0;
    }
    // Automatic quality only learns from frames of real play.
    if (this.store.state.settings.quality === 'auto' && !this.pause.paused && dt > 0) {
      const change = this.auto.frame(dt);
      if (change) {
        this.preset = change.preset;
        this.renderScale = change.renderScale;
        this.qualityLog = change.reason;
        this.applyQuality();
      }
    }

    this.handleMenuKeys();
    if (!this.pause.paused) {
      this.acc += dt;
      let steps = 0;
      while (this.acc >= STEP && steps < BALANCE.sim.maxStepsPerFrame) {
        this.step(STEP);
        this.acc -= STEP;
        steps++;
      }
      if (steps === BALANCE.sim.maxStepsPerFrame) this.acc = 0; // avoid a death spiral
    }
    const alpha = this.pause.paused ? 1 : this.acc / STEP;
    // Behind a menu the world is frozen and mostly covered: redraw it at a third of the rate
    // to save battery and keep the menu itself smooth.
    if (this.pause.has('USER_MENU') && this.menuFrame++ % 3 !== 0) {
      this.ui.update(this.lastHud!);
      return;
    }
    this.render(this.pause.paused ? 0 : dt, alpha);
  }

  private handleMenuKeys(): void {
    if (this.input.takePressed('pause')) this.ui.handleKey('pause');
    if (this.input.takePressed('bag')) this.ui.handleKey('bag');
    if (this.input.takePressed('journal')) this.ui.handleKey('journal');
    if (!this.pause.paused && this.input.takePressed('interact')) this.interact();
  }

  private step(dt: number): void {
    this.simTime += dt;
    this.store.tickClock(dt);
    const clock = this.store.state.worldClock;
    const dn = dayNightAt(clock);
    this.eventInfo = this.events.info(clock);
    this.handleEventTransitions(this.eventInfo);

    const riftLive = this.eventInfo.openness > 0.5;
    const pool = this.player.fishingPool(riftLive);
    const fishingBusy = this.fishing.busy;
    const input = {
      pressed: this.input.takePressed('action'),
      released: this.input.takeReleased('action'),
      held: this.input.held('action'),
      cancel: this.input.takePressed('cancel'),
    };
    // Cancel button press edges need a release to clear "held" for cancel.
    this.input.setButton('cancel', false);
    this.input.takeReleased('cancel');

    // Face the pool when starting a cast.
    if (!fishingBusy && input.pressed && pool) {
      const p = this.world.pools.get(pool)!;
      this.player.facing = Math.atan2(p.x - this.player.pos.x, p.z - this.player.pos.z);
    }
    // Moving dismisses the reveal card once it is allowed.
    const mv = this.input.moveVector();
    if (this.fishing.state === 'Reveal' && (mv.x !== 0 || mv.y !== 0)) this.fishing.continueReveal();

    this.fishing.tick(dt, input, { pool, isNight: dn.isNight, event: this.eventInfo });

    const locked = this.fishing.busy && this.fishing.state !== 'Escape';
    this.player.step(dt, mv, this.cam.forward(this.tmpV), locked);
    if (this.fishing.busy && this.fishing.pool) {
      const p = this.world.pools.get(this.fishing.pool)!;
      this.player.turnToward(Math.atan2(p.x - this.player.pos.x, p.z - this.player.pos.z), dt);
    }

    // Rift grace: close early if nobody is fishing there.
    if (this.eventInfo.phase === 'grace' && !(this.fishing.busy && this.fishing.pool === 'rift')) this.events.endGraceEarly(clock);

    // Periodic save of clock fields.
    if (this.simTime - this.lastSave > 20) {
      this.lastSave = this.simTime;
      this.store.flush();
    }
  }

  private handleEventTransitions(info: EventInfo): void {
    const ph = info.phase;
    if (ph === this.lastEventPhase && info.index === this.lastEventIndex) return;
    const prev = this.lastEventPhase;
    this.lastEventPhase = ph;
    this.lastEventIndex = info.index;
    const rift = this.world.pools.get('rift')!;
    if (ph === 'notice') {
      this.ui.toast('A Rift Bloom is gathering in the south clearing!', 'cyan', 3000);
      this.audio.play('chime');
    }
    if (ph === 'opening') {
      // Move anyone standing inside the announced boundary to a safe point first.
      const d = Math.hypot(this.player.pos.x - rift.x, this.player.pos.z - rift.z);
      if (d < rift.radius + 0.75) {
        const dir = d > 0.01 ? new THREE.Vector3(this.player.pos.x - rift.x, 0, this.player.pos.z - rift.z).normalize() : new THREE.Vector3(0, 0, 1);
        this.player.relocate(new THREE.Vector3(rift.x, 0, rift.z).addScaledVector(dir, rift.radius + 1.2));
      }
      rift.collider.active = true;
      if (!this.store.state.luresUnlocked) {
        this.store.unlockLures();
        this.ui.toast('New: Sun, Leaf and Moon lures! Match the current for +10%.', 'cyan', 3200);
      }
    }
    if (ph === 'open') {
      this.ui.toast('RIFT BLOOM IS OPEN!', 'big', 2400);
      this.audio.play('chime');
      this.particles.sparkle(rift.x, 1, rift.z, 120, rift.radius * 1.6, ['#ff8be0', '#ffd23f', '#7ff3ff']);
    }
    if (ph === 'grace' && prev === 'open') this.ui.toast('The rift is closing — finish your catch!', '', 2400);
    if (ph === 'idle' && prev !== 'idle') rift.collider.active = false;
  }

  // ------------------------------------------------------------------ fishing events
  private onFishEvent(e: FishEvent): void {
    const pool = this.fishing.pool ? this.world.pools.get(this.fishing.pool) : null;
    switch (e.type) {
      case 'blocked': {
        if (this.simTime - this.lastBlockedToast > 1.2) {
          this.lastBlockedToast = this.simTime;
          this.ui.toast(e.reason, 'bad', 2200);
        }
        break;
      }
      case 'chargeStart':
        this.character.pose = 'charge';
        break;
      case 'castRelease': {
        this.character.triggerCast();
        this.audio.play('whoosh');
        const c = e.cast;
        this.ui.toast(c.perfect ? 'Perfect cast! ×2.00' : `Cast ×${c.luck.toFixed(2)}`, c.perfect ? 'big' : '', 1300);
        const p = this.world.pools.get(e.pool)!;
        const dir = new THREE.Vector3(this.player.pos.x - p.x, 0, this.player.pos.z - p.z).normalize();
        const dist = Math.min(p.radius - 0.5, Math.max(0.6, p.radius * (0.65 - 0.3 * c.marker)));
        const side = new THREE.Vector3(-dir.z, 0, dir.x).multiplyScalar((this.cosmetic.next() - 0.5) * p.radius * 0.4);
        this.bobberLanding.set(p.x, p.surfaceY, p.z).addScaledVector(dir, dist).add(side);
        // keep it inside the rim
        const off = new THREE.Vector3(this.bobberLanding.x - p.x, 0, this.bobberLanding.z - p.z);
        if (off.length() > p.radius - 0.5) off.setLength(p.radius - 0.5);
        this.bobberLanding.set(p.x + off.x, p.surfaceY, p.z + off.z);
        this.character.root.updateMatrixWorld(true);
        this.character.rodTip.getWorldPosition(this.bobberFrom);
        this.bobberPhase = 'flight';
        this.cam.castFocus = this.bobberLanding.clone();
        break;
      }
      case 'landed':
        this.bobberPhase = 'float';
        this.audio.play('plop');
        if (pool) this.world.ripple(pool.id, this.bobberLanding.x, this.bobberLanding.z, 0.8);
        this.rings.spawn(this.bobberLanding.x, this.bobberLanding.y, this.bobberLanding.z, 0.6);
        this.particles.splash(this.bobberLanding.x, this.bobberLanding.y, this.bobberLanding.z, 12, 0.1);
        break;
      case 'nibble':
        this.dipT = 0.25;
        this.audio.play('nibble');
        this.rings.spawn(this.bobberLanding.x, this.bobberLanding.y, this.bobberLanding.z, 0.4, 0.5);
        break;
      case 'bite':
        this.dipT = 0.6;
        this.fishOnUntil = this.simTime + BALANCE.bite.window;
        this.audio.play('bite');
        if (pool) this.world.ripple(pool.id, this.bobberLanding.x, this.bobberLanding.z, 1.2);
        this.rings.spawn(this.bobberLanding.x, this.bobberLanding.y, this.bobberLanding.z, 1.2, 0.7);
        this.particles.splash(this.bobberLanding.x, this.bobberLanding.y, this.bobberLanding.z, 24, 0.2);
        break;
      case 'hint':
        if (this.simTime - this.hookHintCooldown > 1) {
          this.hookHintCooldown = this.simTime;
          this.ui.toast(e.text, '', 1400);
        }
        break;
      case 'hooked':
        this.fishOnUntil = 0;
        this.character.pose = 'reel';
        this.bobberPhase = 'reel';
        this.audio.play('hook');
        break;
      case 'caught':
        this.fishOnUntil = 0;
        this.startReveal(e.record.speciesId, e.record.modifier, e.record.weight, e.record.rarity);
        this.ui.showCatch({ ...e.record, value: e.value, newSpecies: e.newSpecies, newRecord: e.newRecord, bagUsed: this.store.bagUsed, bagCap: this.store.capacity });
        if (e.newSpecies && (e.record.speciesId === 'rift-leviathan' || this.store.discoveredCount() === SPECIES.length)) this.platform.happytime();
        break;
      case 'escaped': {
        this.fishOnUntil = 0;
        this.character.pose = 'shrug';
        this.bobberPhase = 'hang';
        this.cam.castFocus = null;
        this.audio.play('miss');
        const msg = e.reason === 'missed' ? 'Missed the bite — press when the bobber dips.' : e.reason === 'time' ? 'The fish tired you out. Try again!' : 'The line went slack and it got away!';
        this.ui.toast(msg, 'bad', 2200);
        this.particles.splash(this.bobberPos.x, this.bobberPos.y, this.bobberPos.z, 20, 0.2);
        setTimeout(() => { if (this.character.pose === 'shrug') this.character.pose = 'idle'; }, 900);
        break;
      }
      case 'cancelled':
        this.fishOnUntil = 0;
        this.character.pose = 'idle';
        this.bobberPhase = 'hang';
        this.cam.castFocus = null;
        if (e.reason !== 'Cast cancelled.') this.ui.toast(e.reason, '', 2400);
        break;
      case 'revealDone':
        this.ui.hideCatch();
        this.character.pose = 'idle';
        this.cam.revealTarget = null;
        this.cam.castFocus = null;
        this.bobberPhase = 'hang';
        if (this.reveal) this.reveal.leaving = 0.001;
        if (!this.store.state.tutorial.firstSale && !this.store.state.tutorial.skipped) this.ui.toast('Head to the Fish Stand to sell!', 'cyan', 2200);
        break;
    }
  }

  private startReveal(speciesId: string, modifier: string, weight: number, rarity: string): void {
    if (this.reveal) this.world.scene.remove(this.reveal.fish);
    const p = this.world.pools.get(this.fishing.pool ?? 'meadow')!;
    const fish = buildFish(speciesId, modifier as never);
    const scale = displayScale(speciesId, weight, modifier as never);
    const radius = (fish.userData.radius as number) * scale;
    const toPlayer = new THREE.Vector3(this.player.pos.x - p.x, 0, this.player.pos.z - p.z).normalize();
    // Display point: over the water between bobber and player, high enough to clear the rim.
    const end = new THREE.Vector3(p.x, 0, p.z).addScaledVector(toPlayer, Math.max(0, p.radius - 1.2 - radius * 0.6));
    end.y = p.surfaceY + radius + 0.9;
    const start = this.bobberPos.clone();
    start.y = p.surfaceY - 0.3;
    fish.position.copy(start);
    fish.scale.setScalar(0.01);
    fish.rotation.y = Math.atan2(-toPlayer.x, -toPlayer.z) + Math.PI / 2 + 0.5;
    this.world.scene.add(fish);
    this.reveal = { fish, start, end, scale, t: 0, leaving: 0 };
    this.cam.castFocus = null;
    this.cam.revealTarget = { center: end.clone(), radius, from: this.player.pos.clone() };
    this.character.pose = 'celebrate';
    this.bobberPhase = 'gone';
    const big = rarity === 'rare' || rarity === 'epic' || rarity === 'legendary' || modifier === 'giant' || modifier === 'prismatic';
    this.particles.splash(start.x, p.surfaceY + 0.05, start.z, big ? 150 : 50, Math.min(2, radius * 0.6));
    this.world.ripple(p.id, start.x, start.z, 1.5);
    this.rings.spawn(start.x, p.surfaceY, start.z, 1.6 + radius, 0.9);
    this.audio.play(modifier === 'giant' ? 'giant' : 'pop');
    if (big) this.audio.play('rare');
    if (modifier === 'prismatic') this.particles.sparkle(end.x, end.y, end.z, 60, radius * 2, ['#ff7ad9', '#6ff3ff', '#fff27a']);
    if (modifier === 'gilded') this.particles.sparkle(end.x, end.y, end.z, 30, radius * 2, ['#ffd23f', '#fff3c4']);
  }

  private updateReveal(dt: number): void {
    const r = this.reveal;
    if (!r) return;
    r.t += dt;
    const reduced = this.store.state.settings.reducedMotion;
    if (r.leaving > 0) {
      r.leaving += dt;
      const k = Math.min(1, r.leaving / 0.35);
      r.fish.scale.setScalar(r.scale * (1 - k));
      r.fish.position.y += dt * 2;
      if (k >= 1) {
        this.world.scene.remove(r.fish);
        this.reveal = null;
      }
      return;
    }
    const t = r.t;
    if (reduced) {
      // fade/turntable variant without bounce
      const k = Math.min(1, t / 0.4);
      r.fish.position.copy(r.end);
      r.fish.scale.setScalar(r.scale * k);
    } else if (t < 0.15) {
      r.fish.position.copy(r.start);
      r.fish.scale.setScalar(r.scale * 0.3);
    } else if (t < 0.6) {
      const k = (t - 0.15) / 0.45;
      r.fish.position.lerpVectors(r.start, r.end, k);
      r.fish.position.y += Math.sin(k * Math.PI) * 1.2;
      r.fish.scale.setScalar(r.scale * (0.3 + 0.7 * k));
    } else {
      const k = Math.min(1, (t - 0.6) / 0.25);
      r.fish.position.copy(r.end);
      r.fish.position.y += Math.sin(k * Math.PI) * 0.15 * (1 - k) + Math.sin(t * 2) * 0.05;
      r.fish.scale.setScalar(r.scale * (1 + Math.sin(k * Math.PI) * 0.06));
    }
    r.fish.rotation.y += dt * 0.5;
    animateFish(r.fish, t, reduced ? 0.4 : 1);
  }

  // ------------------------------------------------------------------ interactions
  private nearInteractable(): 'stand' | 'workshop' | null {
    const p = this.player.pos;
    if (Math.hypot(p.x - LANDMARKS.stand.x, p.z - LANDMARKS.stand.z) < 3.9) return 'stand';
    if (Math.hypot(p.x - (LANDMARKS.workshop.x + 0.6), p.z - (LANDMARKS.workshop.z + 0.4)) < 4.0) return 'workshop';
    return null;
  }

  private interact(): void {
    if (this.fishing.busy || this.ui.openPanel) return;
    const n = this.nearInteractable();
    if (n === 'stand') this.ui.open('stand');
    else if (n === 'workshop') this.ui.open('shop', 'rods');
  }

  private onPanelChange(p: PanelName | null): void {
    this.input.clear();
    this.input.flushEdges();
    if (p) this.pause.add('USER_MENU');
    else {
      this.pause.remove('USER_MENU');
      this.last = performance.now();
    }
  }

  private setLure(l: LureId): void {
    this.store.setLure(l);
    this.audio.play('click');
  }

  private resetSave(): void {
    this.fishing.cancel('Progress reset.');
    this.store.reset();
    this.spawnPlayer();
    this.ui.close();
    this.ui.toast('Progress reset. Welcome back to the island!', 'cyan', 2400);
  }

  private async rewardedBobber(): Promise<'granted' | 'unavailable' | 'busy'> {
    if (this.pendingAd) return 'busy';
    if (!this.platform.adsEnabled) return 'unavailable';
    this.pendingAd = true;
    this.pause.add('AD_REQUEST');
    let result: 'finished' | 'error' = 'error';
    try {
      result = await this.platform.requestRewarded({
        started: () => {
          this.pause.add('AD_PLAYING');
          this.audio.flags.adMuted = true;
          this.audio.applyVolumes();
        },
      });
    } catch {
      result = 'error';
    } finally {
      this.pendingAd = false;
      this.pause.remove('AD_PLAYING');
      this.pause.remove('AD_REQUEST');
      this.audio.flags.adMuted = false;
      this.audio.applyVolumes();
      this.input.clear();
      this.input.flushEdges();
    }
    if (result === 'finished') {
      this.store.grantBobber('sunburst');
      return 'granted';
    }
    return 'unavailable';
  }

  // ------------------------------------------------------------------ render
  private render(dt: number, alpha: number): void {
    const s = this.store.state;
    const dn = dayNightAt(s.worldClock);
    const ev = this.eventInfo;
    const orbit = this.input.takeOrbit();
    if (!this.ui.openPanel) this.cam.orbit(orbit.dx, orbit.dy, orbit.zoom);

    // player visual
    const pp = this.tmpV.lerpVectors(this.player.prevPos, this.player.pos, alpha);
    const ch = this.character;
    ch.root.position.copy(pp);
    ch.root.rotation.y = this.player.facing;
    const st = this.fishing.state;
    if (st === 'FreeRoam' && ch.pose !== 'celebrate' && ch.pose !== 'shrug') ch.pose = this.player.speed > 0.3 ? 'walk' : 'idle';
    if (st === 'FreeRoam' && ch.pose === 'celebrate' && !this.reveal) ch.pose = 'idle';
    ch.speed = this.player.speed;
    ch.charge = this.fishing.chargeMarker;
    const reel = this.fishing.reel?.state;
    ch.tension = reel ? (reel.inside ? 0.45 : 1) : st === 'BiteWindow' ? 0.6 : 0.1;
    ch.update(dt, s.settings.reducedMotion);
    ch.root.updateMatrixWorld(true);

    this.world.update(dt, dn.nightBlend, ev.openness, ev.phase === 'notice');
    this.world.cullGrass(this.cam.camera.position);
    this.npcs.update(dt, ev.openness, s.settings.reducedMotion);
    this.updateBobberAndLine(dt);
    this.updateReveal(dt);
    this.particles.update(dt);
    this.rings.update(dt);
    this.updateBeacon();
    this.cam.update(Math.max(dt, 0.0001), pp, this.world);
    this.audio.update(dt, dn.nightBlend);
    this.audio.setReel(st === 'Reeling', reel ? (reel.inside ? 0.3 : 1) : 0);
    if (reel && !reel.inside && dt > 0) {
      this.tensionBeep -= dt;
      if (this.tensionBeep <= 0) {
        this.tensionBeep = 0.45;
        this.audio.play('tension');
      }
    }
    if (!this.renderError) this.renderer.render(this.world.scene, this.cam.camera);
    this.lastHud = this.hudView(dn, ev);
    this.ui.update(this.lastHud);
  }

  private updateBobberAndLine(dt: number): void {
    const tip = this.sTip;
    this.character.rodTip.getWorldPosition(tip);
    const st = this.fishing.state;
    const p = this.fishing.pool ? this.world.pools.get(this.fishing.pool) : null;
    const t = performance.now() / 1000;
    let sag = 0.25;
    switch (this.bobberPhase) {
      case 'hang':
        this.bobberPos.copy(tip).setY(tip.y - 0.55);
        sag = 0;
        break;
      case 'flight': {
        const k = Math.min(1, this.fishing.t / BALANCE.cast.flightSeconds);
        this.bobberPos.lerpVectors(this.bobberFrom, this.bobberLanding, k);
        this.bobberPos.y += Math.sin(k * Math.PI) * 1.8;
        sag = 0.1;
        break;
      }
      case 'float': {
        this.dipT = Math.max(0, this.dipT - dt);
        const dip = st === 'BiteWindow' ? 0.13 + Math.sin(t * 18) * 0.03 : this.dipT > 0 ? Math.sin((this.dipT / 0.25) * Math.PI) * 0.06 : 0;
        this.bobberPos.copy(this.bobberLanding);
        this.bobberPos.y = (p?.surfaceY ?? 0) + 0.03 + Math.sin(t * 2.2) * 0.02 - dip;
        sag = st === 'BiteWindow' ? 0.05 : 0.35;
        break;
      }
      case 'reel': {
        const r = this.fishing.reel?.state;
        if (r && p) {
          const toPlayer = this.sA.set(this.player.pos.x - this.bobberLanding.x, 0, this.player.pos.z - this.bobberLanding.z);
          const len = toPlayer.length();
          toPlayer.normalize();
          const side = this.sB.set(-toPlayer.z, 0, toPlayer.x);
          const lateral = (r.fishPos - 0.5) * Math.min(p.radius * 0.9, 3);
          const pull = Math.min(len - 0.9, r.progress * Math.max(0, p.radius * 0.6));
          this.bobberPos.copy(this.bobberLanding).addScaledVector(side, lateral).addScaledVector(toPlayer, Math.max(0, pull));
          // keep inside the water
          const off = this.sC.set(this.bobberPos.x - p.x, 0, this.bobberPos.z - p.z);
          if (off.length() > p.radius - 0.35) off.setLength(p.radius - 0.35);
          this.bobberPos.set(p.x + off.x, p.surfaceY - 0.03 + Math.sin(t * 20) * 0.02, p.z + off.z);
          if (dt > 0 && Math.random() < (r.inside ? 0.25 : 0.6)) this.particles.splash(this.bobberPos.x, p.surfaceY + 0.02, this.bobberPos.z, 2, 0.15);
          if (dt > 0 && Math.random() < 0.05) this.rings.spawn(this.bobberPos.x, p.surfaceY, this.bobberPos.z, 0.5, 0.5);
        }
        sag = 0.02;
        break;
      }
      case 'gone':
        this.bobberPos.copy(tip).setY(tip.y - 0.55);
        sag = 0;
        break;
    }
    this.bobber.position.copy(this.bobberPos);
    this.bobber.visible = this.bobberPhase !== 'gone';
    // line with sag
    const n = this.linePts.length / 3;
    for (let i = 0; i < n; i++) {
      const k = i / (n - 1);
      const x = tip.x + (this.bobberPos.x - tip.x) * k;
      const z = tip.z + (this.bobberPos.z - tip.z) * k;
      const y = tip.y + (this.bobberPos.y + 0.08 - tip.y) * k - Math.sin(k * Math.PI) * sag * Math.min(2, tip.distanceTo(this.bobberPos) * 0.4);
      this.linePts[i * 3] = x;
      this.linePts[i * 3 + 1] = y;
      this.linePts[i * 3 + 2] = z;
    }
    this.line.geometry.attributes.position.needsUpdate = true;
  }

  private beaconTarget(): THREE.Vector3 | null {
    const s = this.store;
    const ev = this.eventInfo;
    const rift = POOLS_BY_ID.rift;
    if ((ev.phase === 'notice' || ev.phase === 'opening' || ev.phase === 'open') && Math.hypot(this.player.pos.x - rift.x, this.player.pos.z - rift.z) > rift.radius + 3)
      return this.sBeacon.set(rift.x, 0, rift.z + rift.radius + 1.2);
    const needSell = (s.bagFull() && s.bagUsed > 0) || (s.state.tutorial.firstCatch && !s.state.tutorial.firstSale && !s.state.tutorial.skipped && s.bagUsed > 0);
    if (needSell) return this.sBeacon.set(LANDMARKS.stand.x + 1.3, 0, LANDMARKS.stand.z + 2.2);
    if (s.state.tutorial.firstSale && !s.state.tutorial.firstPurchase && !s.state.tutorial.skipped && s.state.coins >= Math.min(UPGRADES[2].costs[0], RODS[1].cost))
      return this.sBeacon.set(LANDMARKS.workshop.x - 0.6, 0, LANDMARKS.workshop.z + 2.6);
    return null;
  }

  private updateBeacon(): void {
    const tgt = this.fishing.busy ? null : this.beaconTarget();
    this.world.beacon.visible = !!tgt;
    if (tgt) this.world.beacon.position.copy(tgt);
  }

  // ------------------------------------------------------------------ HUD view
  private project(v: THREE.Vector3): { x: number; y: number; visible: boolean } {
    const p = this.sProj.copy(v).project(this.cam.camera);
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    return { x: (p.x * 0.5 + 0.5) * w, y: (-p.y * 0.5 + 0.5) * h, visible: p.z < 1 && p.z > -1 && Math.abs(p.x) < 1.1 && Math.abs(p.y) < 1.1 };
  }

  private goal(ev: EventInfo): HudView['goal'] {
    const s = this.store;
    const t = s.state.tutorial;
    const lureName = (l: LureId) => LURES.find((x) => x.id === l)!;
    if (ev.phase === 'notice') return { text: `Rift Bloom opens in ${fmtTime(ev.remaining)}!`, sub: 'Follow the beacon to the south clearing', event: true };
    if (ev.phase === 'opening') return { text: 'The Rift Bloom is opening…', event: true };
    if (ev.phase === 'open') {
      const c = lureName(ev.current);
      return { text: `RIFT BLOOM · ${fmtTime(ev.remaining)} left · luck ×${BALANCE.event.riftLuck}`, sub: `Current: ${c.glyph} ${c.name} — match your lure for +10% value`, event: true };
    }
    if (ev.phase === 'grace') return { text: 'Rift closing — finish your catch!', event: true };
    if (s.bagFull()) return { text: 'Bag full — sell your catches', sub: 'Follow the beacon to the Fish Stand' };
    if (!t.skipped) {
      if (!t.firstCast) return { text: 'Hold CAST, release in the gold zone', sub: 'A better cast means rarer fish' };
      if (!t.firstCatch) return { text: 'Catch your first fish!', sub: 'Press again when the bobber dips' };
      if (!t.firstSale) return { text: 'Sell your catch at the Fish Stand', sub: 'Follow the beacon' };
      if (!t.firstPurchase) {
        const cheapest = Math.min(UPGRADES[2].costs[0], RODS[1].cost);
        return s.state.coins >= cheapest
          ? { text: 'Buy an upgrade at the Workshop', sub: 'Rods land bigger fish; upgrades boost luck, value and bag' }
          : { text: `Catch & sell more — first upgrade costs ¢ ${cheapest}`, sub: `You have ¢ ${fmtCoins(s.state.coins)}` };
      }
    }
    for (const pool of ['reed', 'moon'] as const) {
      if (!s.isPoolUnlocked(pool)) {
        const u = s.unlockProgress(pool);
        return { text: `Unlock ${POOLS_BY_ID[pool].name}`, sub: `${u.rodOwned ? '✓' : '○'} Own ${u.rodName} · ${u.found}/${u.need} ${u.fromPool} species` };
      }
    }
    const found = s.discoveredCount();
    if (found < SPECIES.length) {
      const next = SPECIES.find((x) => !s.state.journal[x.id] && x.minWeight <= s.rod.maxWeight && s.isPoolUnlocked(x.pool)) ?? SPECIES.find((x) => !s.state.journal[x.id])!;
      const nextRod = RODS.find((r) => r.maxWeight >= next.minWeight)!;
      return { text: `Journal ${found}/${SPECIES.length}`, sub: next.minWeight > s.rod.maxWeight ? `Next: a ${nextRod.name} rod for heavier fish` : `Hint: ${next.hint}` };
    }
    return { text: 'Journal complete!', sub: 'Chase weight records and rare modifiers' };
  }

  private hudView(dn: ReturnType<typeof dayNightAt>, ev: EventInfo): HudView {
    const s = this.store;
    const st = this.fishing.state;
    const riftLive = ev.openness > 0.5;
    const pool = this.player.fishingPool(riftLive);
    const blocker = st === 'FreeRoam' ? this.fishing.castBlocker({ pool, isNight: dn.isNight, event: ev }) : null;

    let action: HudView['action'] = { label: 'CAST', mode: 'cast', visible: true };
    switch (st) {
      case 'FreeRoam':
      case 'Escape':
        action = { label: s.bagFull() ? 'BAG FULL' : 'CAST', mode: blocker ? 'blocked' : 'cast', visible: true };
        break;
      case 'ChargeCast':
        action = { label: 'RELEASE', mode: 'cast', visible: true };
        break;
      case 'CastFlight':
      case 'WaitingForBite':
        action = { label: 'WAIT…', mode: 'wait', visible: true };
        break;
      case 'BiteWindow':
        action = { label: 'HOOK!', mode: 'hook', visible: true };
        break;
      case 'Reeling':
        action = { label: 'REEL', mode: 'reel', visible: true };
        break;
      case 'Reveal':
      case 'ResolveSuccess':
        action = { label: 'OK', mode: 'continue', visible: true };
        break;
    }

    const labels: WorldLabel[] = [];
    const camPos = this.cam.camera.position;
    const addLabel = (id: string, pos: THREE.Vector3, text: string, sub?: string, cls?: string, maxDist = 34) => {
      const pr = this.project(pos);
      // Keep labels out of the top HUD strip so they never cover coins, goal or pause.
      const clearOfHud = pr.y > 92;
      labels.push({ id, text, sub, x: pr.x, y: pr.y, visible: pr.visible && clearOfHud && pos.distanceTo(camPos) < maxDist, cls });
    };
    const near = this.nearInteractable();
    const busy = this.fishing.busy;
    for (const a of this.world.anchors) {
      if (busy && a.id !== 'stand') continue;
      if (a.id.startsWith('sign:')) {
        const id = a.id.slice(5) as PoolId;
        const unlocked = s.isPoolUnlocked(id);
        if (id === 'meadow') addLabel(a.id, a.pos, 'Meadow Pool', `Growth Lv ${s.state.upgrades.poolGrowth}`, '', 22);
        else if (unlocked) addLabel(a.id, a.pos, POOLS_BY_ID[id].name, id === 'moon' ? 'Night brings rare giants' : 'Open', '', 30);
        else {
          const u = s.unlockProgress(id as 'reed' | 'moon');
          addLabel(a.id, a.pos, `🔒 ${POOLS_BY_ID[id].name}`, `${u.rodOwned ? '✓' : '○'} ${u.rodName} · ${u.found}/${u.need} ${u.fromPool} species`, 'lock', 30);
        }
      } else if (a.id === 'stand' && !busy) addLabel(a.id, a.pos, near === 'stand' ? 'Fish Stand — press E / Sell' : 'Fish Stand', near === 'stand' ? undefined : 'Sell catches', near === 'stand' ? 'prompt' : '');
      else if (a.id === 'workshop') addLabel(a.id, a.pos, near === 'workshop' ? 'Workshop — press E / Open' : 'Workshop', near === 'workshop' ? undefined : 'Rods & upgrades', near === 'workshop' ? 'prompt' : '');
      else if (a.id === 'plinth' && s.state.bestCatch) {
        const b = s.state.bestCatch;
        addLabel(a.id, a.pos, `Best catch: ${SPECIES_BY_ID[b.speciesId].name}`, `${b.weight.toFixed(1)} kg${b.modifier !== 'normal' ? ` · ${b.modifier}` : ''}`, '', 26);
      } else if (a.id === 'pool:rift' && ev.openness > 0.5) addLabel(a.id, a.pos, 'Rift Bloom', `Current: ${LURES.find((l) => l.id === ev.current)!.glyph} ${LURES.find((l) => l.id === ev.current)!.name}`, 'lock', 40);
    }
    if (!busy) for (const n of this.npcs.labelAnchors()) if (n.visible) addLabel(n.id, n.pos, n.name, 'NPC', 'npc', 18);

    let cast: HudView['cast'] = null;
    if (st === 'ChargeCast') {
      const head = this.project(this.sA.copy(this.character.root.position).setY(this.character.root.position.y + 1.1));
      const w = this.container.clientWidth;
      cast = { x: Math.min(w - 120, head.x + 70), y: head.y, marker: this.fishing.chargeMarker };
    }
    const r = this.fishing.reel;
    const reelView = r
      ? { ...r.state, notches: r.integrityNotches(), name: this.fishing.roll ? SPECIES_BY_ID[this.fishing.roll.speciesId].name : '' }
      : null;

    const t = s.state.tutorial;
    let hint: string | null = null;
    if (!t.skipped && !this.ui.openPanel) {
      if (!t.firstCast && st === 'FreeRoam' && pool) hint = this.input.isTouch ? 'Hold this button, release in the gold zone!' : 'Hold Space (or this button), release in the gold zone!';
      else if (!t.firstCatch && st === 'BiteWindow') hint = 'It dipped! Tap now to hook!';
      else if (!t.firstCatch && st === 'Reeling') hint = 'Hold to move the window right, release to go left. Keep the fish inside!';
    }

    const phaseLabel = dn.isNight ? `Night · day in ${fmtTime(dn.untilNext + (dn.phase === 'night' ? 30 : 0))}` : dn.phase === 'dusk' ? `Dusk · night in ${fmtTime(dn.untilNext)}` : `Day · night in ${fmtTime(dn.phase === 'day' ? dn.untilNext + 30 : dn.phase === 'dawn' ? dn.untilNext + 240 : dn.untilNext)}`;
    const rs = this.repo.status;
    const save = rs.kind === 'degraded' || rs.kind === 'readonly' ? { text: '⚠ Not saving', bad: true } : { text: '', bad: false };

    const lures = s.state.luresUnlocked && ev.phase === 'open' && pool === 'rift' && st === 'FreeRoam' ? { selected: s.state.lure, current: ev.current } : null;

    return {
      coins: s.state.coins,
      bagUsed: s.bagUsed,
      bagCap: BAG_CAPACITY[s.state.upgrades.bag],
      goal: this.goal(ev),
      phase: { night: dn.isNight || dn.phase === 'dusk', label: phaseLabel },
      save,
      action,
      cancel: this.fishing.canCancel,
      interact: !busy && near ? (near === 'stand' ? 'Sell fish (E)' : 'Workshop (E)') : null,
      lures,
      cast,
      reel: reelView,
      labels,
      hint,
      fishOn: this.simTime < this.fishOnUntil && st === 'BiteWindow',
      touch: this.input.isTouch,
      joy: this.input.joy,
      debug: DEBUG
        ? `fps ${this.fps.toFixed(0)} · ${st}\npause [${this.pause.list().join(',')}]\npool ${pool ?? '-'} rod ${s.rod.id} (${s.rod.maxWeight}kg)\nroll ${this.fishing.roll ? `${this.fishing.roll.speciesId} ${this.fishing.roll.weight}kg ${this.fishing.roll.modifier} seed ${this.fishing.roll.motionSeed}` : '-'}\nclock ${s.state.worldClock.toFixed(0)} ${dn.phase} event ${ev.phase} ${ev.remaining.toFixed(0)}s\ncalls ${this.renderer.info.render.calls} tris ${this.renderer.info.render.triangles}\nquality ${this.preset} x${this.renderScale} pr ${this.pixelRatio.toFixed(2)} ${this.qualityLog}\ngpu ${this.gpu.slice(0, 40)}\nsave ${this.repo.backendName} ${rs.kind} · ${this.platform.kind}`
        : null,
      eventVignette: ev.phase === 'open' && pool === 'rift',
      fps: s.state.settings.showFps ? { fps: this.fpsWindow.value, label: `${this.preset}${this.renderScale < 1 ? ` ${Math.round(this.renderScale * 100)}%` : ''}${s.state.settings.quality === 'auto' ? ' · auto' : ''}` } : null,
    };
  }

  notify(text: string): void {
    this.ui.toast(text, 'bad', 5000);
  }

  dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.input.dispose();
    this.audio.dispose();
    this.thumbs.dispose();
    this.renderer.dispose();
  }

  /** Read-only snapshot for automated QA (exposed only with ?qa). */
  qaSnapshot() {
    return {
      state: this.fishing.state,
      coins: this.store.state.coins,
      inventory: this.store.state.inventory.length,
      reserved: this.store.reserved,
      pause: this.pause.list(),
      pos: { x: this.player.pos.x, z: this.player.pos.z },
      event: this.eventInfo.phase,
      calls: this.renderer.info.render.calls,
      triangles: this.renderer.info.render.triangles,
      fps: this.fps,
      rod: RODS_BY_ID[this.store.state.equippedRod].id,
      quality: `${this.preset}@${this.renderScale}`,
      gpu: this.gpu,
      revealW: this.cam.revealWeight,
      cam: this.cam.camera.position.toArray().map((v) => +v.toFixed(2)),
      fish: this.reveal ? this.reveal.fish.position.toArray().map((v) => +v.toFixed(2)) : null,
    };
  }
}
