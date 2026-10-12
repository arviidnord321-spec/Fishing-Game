import { BAG_CAPACITY, BALANCE, BOBBERS, LURES, MODIFIERS_BY_ID, POOLS_BY_ID, RARITY_COLOR, RARITY_GLYPH, RARITY_LABEL, RODS, UPGRADES } from '../data/balance';
import { SPECIES, SPECIES_BY_ID } from '../data/species';
import type { CatchRecord, LureId, ModifierId, PoolId, Rarity, UpgradeTrack } from '../data/types';
import { RARITIES } from '../data/types';
import type { InputManager } from '../game/input';
import { DEFAULT_BINDINGS } from '../logic/saveSchema';
import type { GameStore } from '../logic/store';
import { esc, fmtCoins, fmtCompact, h, setHtml, setText, show } from './dom';

export interface WorldLabel {
  id: string;
  text: string;
  sub?: string;
  x: number;
  y: number;
  visible: boolean;
  cls?: string;
}

export interface ReelView {
  windowCenter: number;
  windowWidth: number;
  fishPos: number;
  progress: number;
  inside: boolean;
  flare: number;
  notches: number;
  name: string;
}

export interface HudView {
  coins: number;
  bagUsed: number;
  bagCap: number;
  goal: { text: string; sub?: string; event?: boolean };
  phase: { night: boolean; label: string };
  save: { text: string; bad: boolean };
  action: { label: string; mode: 'cast' | 'hook' | 'reel' | 'continue' | 'wait' | 'blocked'; visible: boolean };
  cancel: boolean;
  interact: string | null;
  lures: { selected: LureId; current: LureId } | null;
  cast: { x: number; y: number; marker: number } | null;
  reel: ReelView | null;
  labels: WorldLabel[];
  hint: string | null;
  fishOn: boolean;
  touch: boolean;
  joy: { active: boolean; cx: number; cy: number; px: number; py: number };
  debug: string | null;
  eventVignette: boolean;
}

export interface CatchCardInfo {
  speciesId: string;
  rarity: Rarity;
  weight: number;
  modifier: ModifierId;
  value: number;
  matchFactor: number;
  newSpecies: boolean;
  newRecord: boolean;
  bagUsed: number;
  bagCap: number;
}

export type PanelName = 'bag' | 'stand' | 'shop' | 'journal' | 'pause';

export interface UIDeps {
  store: GameStore;
  input: InputManager;
  thumb: (speciesId: string, modifier: ModifierId, silhouette: boolean) => string;
  adsEnabled: boolean;
  onPanelChange: (open: PanelName | null) => void;
  onAction: (down: boolean) => void;
  onInteract: () => void;
  onCancel: () => void;
  onLure: (l: LureId) => void;
  onContinue: () => void;
  onSettings: () => void;
  onReset: () => void;
  onRetrySave: () => void;
  onRewardedBobber: () => Promise<'granted' | 'unavailable' | 'busy'>;
  onSkipTutorial: () => void;
  click: () => void;
  debugActions?: Record<string, () => void>;
}

const FISH_SVG = `<svg viewBox="0 0 34 24" width="34" height="24" aria-hidden="true"><path d="M3 12 L10 5 L10 19 Z" fill="#ffd27a" stroke="#152b43" stroke-width="2" stroke-linejoin="round"/><ellipse cx="20" cy="12" rx="12" ry="8" fill="#ffd27a" stroke="#152b43" stroke-width="2.4"/><circle cx="26" cy="10" r="2.2" fill="#152b43"/><path d="M16 4 L20 1 L22 5" fill="#ff9a1f" stroke="#152b43" stroke-width="1.6"/></svg>`;

const ACTION_NAMES: Record<string, string> = {
  up: 'Move forward', down: 'Move back', left: 'Move left', right: 'Move right', action: 'Cast / hook / reel',
  interact: 'Interact', bag: 'Bag', journal: 'Journal', pause: 'Pause', cancel: 'Cancel cast',
};

const ARROWS: Record<string, string> = { ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→' };
function keyName(code: string): string {
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  return ARROWS[code] ?? code;
}

/** HTML/CSS user interface. Reads state and dispatches actions; never mutates coins or inventory itself. */
export class UI {
  readonly root: HTMLElement;
  private el: Record<string, HTMLElement> = {};
  private labelEls = new Map<string, HTMLElement>();
  private toastsEl!: HTMLElement;
  private panel: PanelName | null = null;
  private overlay: HTMLElement | null = null;
  private panelState = { tab: 'rods', sort: 'newest' as 'newest' | 'value' | 'weight' | 'rarity', selected: new Set<string>(), journalSel: '', journalPool: 'all', journalFilter: 'all', pauseTab: 'settings' };
  private catchCard: HTMLElement | null = null;
  private actionDown = false;
  private lastLures = '';
  private confirmEl: HTMLElement | null = null;

  constructor(parent: HTMLElement, private d: UIDeps) {
    this.root = h('div', { id: 'ui' });
    parent.append(this.root);
    this.build();
    d.store.subscribe((e) => {
      if (e.type === 'changed' && this.panel) this.renderPanel();
    });
  }

  get openPanel(): PanelName | null {
    return this.panel;
  }

  // ------------------------------------------------------------------ HUD
  private build(): void {
    const d = this.d;
    const E = this.el;
    E.labels = h('div');
    E.vignette = h('div', { class: 'vignette-event' });
    E.coins = h('span');
    E.bagCount = h('span');
    E.coinPill = h('div', { class: 'pill', 'aria-label': 'Coins' }, h('span', { class: 'ico coin-ico' }, '¢'), E.coins);
    E.bagPill = h('button', { class: 'pill interactive', 'aria-label': 'Open bag', onclick: () => this.toggle('bag') }, h('span', { class: 'ico bag-ico' }, '◧'), E.bagCount);
    E.bagPill.style.border = '2px solid rgba(255,255,255,0.12)';
    E.bagPill.style.color = 'inherit';
    E.bagPill.style.cursor = 'pointer';
    E.save = h('div', { class: 'pill save-chip' });
    const topLeft = h('div', { class: 'top-left' }, E.coinPill, E.bagPill, E.save);

    E.goal = h('div', { class: 'goal', role: 'status', 'aria-live': 'polite' });
    const topCenter = h('div', { class: 'top-center' }, E.goal);

    E.phaseLbl = h('span');
    E.phaseIco = h('span', { class: 'ico' }, '☀');
    E.phase = h('div', { class: 'pill phase' }, E.phaseIco, E.phaseLbl);
    E.pauseBtn = h('button', { class: 'icon-btn', 'aria-label': 'Pause and settings', title: 'Pause (P)', onclick: () => this.toggle('pause') }, 'II');
    const topRight = h('div', { class: 'top-right' }, E.phase, E.pauseBtn);

    E.bagBtn = h('button', { class: 'icon-btn', 'aria-label': 'Bag', title: 'Bag (B)', onclick: () => this.toggle('bag') }, '◧', h('span', { class: 'lbl' }, 'BAG'));
    E.journalBtn = h('button', { class: 'icon-btn', 'aria-label': 'Journal', title: 'Journal (J)', onclick: () => this.toggle('journal') }, '✎', h('span', { class: 'lbl' }, 'BOOK'));
    E.controlsHint = h('div', { class: 'controls-hint' });
    const bottomLeft = h('div', { class: 'bottom-left' }, E.bagBtn, E.journalBtn, E.controlsHint);

    E.action = h('button', { class: 'action-btn', 'data-game-action': '1', 'aria-label': 'Cast' }, 'CAST');
    const act = E.action;
    const down = (e: PointerEvent) => {
      e.preventDefault();
      act.setPointerCapture?.(e.pointerId);
      this.actionDown = true;
      act.classList.add('pressed');
      d.onAction(true);
    };
    const up = (e: PointerEvent) => {
      if (!this.actionDown) return;
      e.preventDefault();
      this.actionDown = false;
      act.classList.remove('pressed');
      d.onAction(false);
    };
    act.addEventListener('pointerdown', down);
    act.addEventListener('pointerup', up);
    act.addEventListener('pointercancel', up);
    act.addEventListener('lostpointercapture', up as EventListener);
    // Keyboard activation of the focused button is handled by InputManager (data-game-action).
    act.addEventListener('click', (e) => e.preventDefault());
    E.cancel = h('button', { class: 'btn small ghost', onclick: () => d.onCancel() }, 'Cancel');
    E.interact = h('button', { class: 'btn primary', onclick: () => d.onInteract() }, 'Sell');
    E.lures = h('div', { class: 'lures', role: 'group', 'aria-label': 'Choose lure' });
    const bottomRight = h('div', { class: 'bottom-right' }, E.lures, E.interact, h('div', { class: 'action-row' }, E.cancel, E.action));

    // cast meter
    E.castFill = h('div', { class: 'fill' });
    E.castMarker = h('div', { class: 'marker' });
    E.castLuck = h('div', { class: 'luck' });
    const ideal = h('div', { class: 'ideal' });
    ideal.style.bottom = `${BALANCE.cast.idealMin * 100}%`;
    ideal.style.height = `${(BALANCE.cast.idealMax - BALANCE.cast.idealMin) * 100}%`;
    const star = h('div', { class: 'star' }, '★ Perfect');
    star.style.bottom = `${((BALANCE.cast.idealMin + BALANCE.cast.idealMax) / 2) * 100}%`;
    E.cast = h('div', { class: 'cast-meter', role: 'meter', 'aria-label': 'Cast power' }, h('div', { class: 'track' }, E.castFill, ideal), star, E.castMarker, E.castLuck);

    // reel meter
    E.reelWindow = h('div', { class: 'window' });
    E.reelFish = h('div', { class: 'fish', html: FISH_SVG });
    E.reelProgress = h('div');
    E.reelNotches = h('div', { class: 'integrity', 'aria-label': 'Line integrity' }, h('i', { class: 'notch' }), h('i', { class: 'notch' }), h('i', { class: 'notch' }));
    E.reelTitle = h('span');
    E.reel = h(
      'div',
      { class: 'reel', role: 'group', 'aria-label': 'Reeling' },
      h('div', { class: 'title' }, E.reelTitle, E.reelNotches),
      h('div', { class: 'track' }, E.reelWindow, E.reelFish),
      h('div', { class: 'progress', role: 'progressbar', 'aria-label': 'Catch progress' }, E.reelProgress),
      h('div', { class: 'help' }, 'Hold to move right. Release to move left. Keep the fish inside the window.'),
    );

    this.toastsEl = h('div', { class: 'toasts', 'aria-live': 'polite' });
    E.fishOn = h('div', { class: 'fish-on' }, h('span', { class: 'ico' }, '❗'), 'FISH ON!  TAP!');
    E.hint = h('div', { class: 'hint-bubble interactive' });
    E.joyBase = h('div', { class: 'joy-base' });
    E.joyKnob = h('div', { class: 'joy-knob' });
    E.joyHint = h('div', { class: 'joy-hint' }, 'Drag left side to walk · right side to look');
    E.debugText = h('div');
    E.debug = h('div', { class: 'debug' }, E.debugText);

    this.root.append(E.vignette, E.labels, topLeft, topCenter, topRight, bottomLeft, bottomRight, E.cast, E.reel, this.toastsEl, E.fishOn, E.hint, E.joyBase, E.joyKnob, E.joyHint, E.debug);
    if (d.debugActions) {
      const box = h('div');
      for (const [k, fn] of Object.entries(d.debugActions)) box.append(h('button', { onclick: fn }, k));
      E.debugBtns = box;
    }
  }

  update(v: HudView): void {
    const E = this.el;
    setText(E.coins, fmtCompact(v.coins));
    E.coinPill.title = `${fmtCoins(v.coins)} coins`;
    setText(E.bagCount, `${v.bagUsed}/${v.bagCap}`);
    E.bagPill.style.borderColor = v.bagUsed >= v.bagCap ? '#ff7b7b' : 'rgba(255,255,255,0.12)';
    setHtml(E.goal, `${esc(v.goal.text)}${v.goal.sub ? `<small>${esc(v.goal.sub)}</small>` : ''}`);
    E.goal.classList.toggle('event', !!v.goal.event);
    setText(E.phaseLbl, v.phase.label);
    setText(E.phaseIco, v.phase.night ? '☾' : '☀');
    E.phase.classList.toggle('night', v.phase.night);
    setText(E.save, v.save.text);
    E.save.classList.toggle('bad', v.save.bad);
    show(E.save, !!v.save.text);
    show(E.vignette, v.eventVignette);

    // action button
    show(E.action, v.action.visible);
    setText(E.action, v.action.label);
    E.action.setAttribute('aria-label', v.action.label);
    E.action.classList.toggle('hook', v.action.mode === 'hook');
    E.action.classList.toggle('disabled', v.action.mode === 'blocked' || v.action.mode === 'wait');
    show(E.cancel, v.cancel);
    show(E.interact, !!v.interact);
    if (v.interact) setText(E.interact, v.interact);
    this.updateLures(v.lures);
    setText(E.controlsHint, v.touch ? '' : `${keyName(this.d.store.state.settings.bindings.up)}${keyName(this.d.store.state.settings.bindings.left)}${keyName(this.d.store.state.settings.bindings.down)}${keyName(this.d.store.state.settings.bindings.right)} move · Space cast · Right-drag look · E interact`);
    show(E.controlsHint, !v.touch && !this.d.store.state.tutorial.firstPurchase);

    // cast meter
    if (v.cast) {
      show(E.cast, true);
      E.cast.style.left = `${v.cast.x}px`;
      E.cast.style.top = `${v.cast.y}px`;
      E.castMarker.style.bottom = `${v.cast.marker * 100}%`;
      E.castFill.style.height = `${v.cast.marker * 100}%`;
      const d = v.cast.marker < BALANCE.cast.idealMin ? BALANCE.cast.idealMin - v.cast.marker : v.cast.marker > BALANCE.cast.idealMax ? v.cast.marker - BALANCE.cast.idealMax : 0;
      const luck = Math.round((1 + Math.max(0, 1 - d / 0.86)) * 100) / 100;
      setText(E.castLuck, `×${luck.toFixed(2)}`);
      E.castLuck.style.color = d === 0 ? '#ffd23f' : '#fff6e3';
    } else show(E.cast, false);

    // reel meter
    if (v.reel) {
      show(E.reel, true);
      const r = v.reel;
      E.reelWindow.style.left = `${(r.windowCenter - r.windowWidth / 2) * 100}%`;
      E.reelWindow.style.width = `${r.windowWidth * 100}%`;
      E.reelWindow.classList.toggle('out', !r.inside);
      E.reelFish.style.left = `${r.fishPos * 100}%`;
      E.reelFish.classList.toggle('flare', r.flare > 0.6);
      E.reelFish.style.transform = `translate(-50%, -50%) scale(${1 + r.flare * 0.25})`;
      E.reelProgress.style.width = `${r.progress * 100}%`;
      E.reelProgress.parentElement!.setAttribute('aria-valuenow', String(Math.round(r.progress * 100)));
      setText(E.reelTitle, r.inside ? `Reeling… ${Math.round(r.progress * 100)}%` : 'Line slack! Track the fish');
      const notches = E.reelNotches.children;
      for (let i = 0; i < 3; i++) {
        notches[i].className = `notch${i >= r.notches ? ' off' : r.notches === 1 ? ' warn' : ''}`;
      }
    } else show(E.reel, false);

    show(E.fishOn, v.fishOn);
    if (v.hint) {
      setHtml(E.hint, `${esc(v.hint)}<br><button class="btn small ghost" style="color:var(--ui);border-color:var(--ui)" data-skip="1">Skip tips</button>`);
      const btn = E.hint.querySelector('[data-skip]') as HTMLButtonElement | null;
      if (btn && !btn.onclick) btn.onclick = () => this.d.onSkipTutorial();
      show(E.hint, true);
      const r = E.action.getBoundingClientRect();
      const rootR = this.root.getBoundingClientRect();
      E.hint.style.right = `${Math.max(8, rootR.right - r.right - 10)}px`;
      E.hint.style.bottom = `${rootR.bottom - r.top + 14}px`;
    } else show(E.hint, false);

    // touch joystick
    show(E.joyBase, v.touch && v.joy.active);
    show(E.joyKnob, v.touch && v.joy.active);
    show(E.joyHint, v.touch && !v.joy.active && !this.d.store.state.tutorial.firstSale);
    if (v.joy.active) {
      const rr = this.root.getBoundingClientRect();
      E.joyBase.style.left = `${v.joy.cx - rr.left}px`;
      E.joyBase.style.top = `${v.joy.cy - rr.top}px`;
      E.joyKnob.style.left = `${v.joy.px - rr.left}px`;
      E.joyKnob.style.top = `${v.joy.py - rr.top}px`;
    }

    // world labels
    const seen = new Set<string>();
    for (const l of v.labels) {
      seen.add(l.id);
      let el = this.labelEls.get(l.id);
      if (!el) {
        el = h('div', { class: 'wlabel' });
        this.labelEls.set(l.id, el);
        E.labels.append(el);
      }
      el.className = `wlabel ${l.cls ?? ''}`;
      show(el, l.visible);
      if (l.visible) {
        setHtml(el, `${esc(l.text)}${l.sub ? `<small>${esc(l.sub)}</small>` : ''}`);
        el.style.transform = `translate(${Math.round(l.x)}px, ${Math.round(l.y)}px) translate(-50%, -100%)`;
      }
    }
    for (const [id, el] of this.labelEls) if (!seen.has(id)) show(el, false);

    if (v.debug !== null) {
      show(E.debug, true);
      setText(E.debugText, v.debug);
      if (E.debugBtns && E.debugBtns.parentElement !== E.debug) E.debug.append(E.debugBtns);
    } else show(E.debug, false);
  }

  private updateLures(l: HudView['lures']): void {
    const E = this.el;
    show(E.lures, !!l);
    if (!l) return;
    const key = `${l.selected}|${l.current}`;
    if (key === this.lastLures) return;
    this.lastLures = key;
    E.lures.innerHTML = '';
    for (const lure of LURES) {
      const b = h(
        'button',
        {
          class: `lure${lure.id === l.selected ? ' sel' : ''}${lure.id === l.current ? ' match' : ''}`,
          'aria-pressed': lure.id === l.selected ? 'true' : 'false',
          'aria-label': `${lure.name} lure${lure.id === l.current ? ' (matches current)' : ''}`,
          onclick: () => this.d.onLure(lure.id),
        },
        h('span', {}, lure.glyph),
        h('small', {}, lure.name),
      );
      b.style.color = lure.color;
      E.lures.append(b);
    }
  }

  // ------------------------------------------------------------------ feedback
  toast(text: string, cls = '', ms = 1800): void {
    const t = h('div', { class: `toast ${cls}` }, text);
    this.toastsEl.append(t);
    while (this.toastsEl.children.length > 3) this.toastsEl.firstElementChild!.remove();
    setTimeout(() => t.classList.add('fade'), ms);
    setTimeout(() => t.remove(), ms + 450);
  }

  showCatch(c: CatchCardInfo): void {
    this.hideCatch();
    const sp = SPECIES_BY_ID[c.speciesId];
    const mod = MODIFIERS_BY_ID[c.modifier];
    const card = h(
      'div',
      { class: 'catch-card interactive', role: 'dialog', 'aria-label': `Caught ${sp.name}` },
      h(
        'div',
        { class: 'tags' },
        h('span', { class: 'tag' }, `${RARITY_GLYPH[c.rarity]} ${RARITY_LABEL[c.rarity]}`),
        c.modifier !== 'normal' ? h('span', { class: 'tag', style: 'background:#ffd23f' }, `✦ ${mod.name}`) : null,
        c.matchFactor > 1 ? h('span', { class: 'tag', style: 'background:#7ee081' }, 'Current match +10%') : null,
      ),
      h('h2', {}, sp.name),
      h('div', { class: 'stat' }, 'Weight', h('b', {}, `${c.weight.toFixed(1)} kg`)),
      h('div', { class: 'stat' }, 'Est. sale value', h('b', {}, `¢ ${fmtCoins(c.value)}`)),
      h('div', { class: 'stat' }, 'Bag', h('b', {}, `${c.bagUsed}/${c.bagCap}`)),
      c.newSpecies ? h('div', { class: 'new' }, '★ New species! Added to your journal') : null,
      c.newRecord ? h('div', { class: 'new' }, '▲ New weight record!') : null,
      h('button', { class: 'btn cyan', onclick: () => this.d.onContinue() }, 'Continue'),
      h('div', { class: 'note' }, 'Sell catches at the Fish Stand to earn coins.'),
    );
    card.style.setProperty('--rc', RARITY_COLOR[c.rarity]);
    this.root.append(card);
    this.catchCard = card;
  }

  hideCatch(): void {
    this.catchCard?.remove();
    this.catchCard = null;
  }

  // ------------------------------------------------------------------ panels
  toggle(p: PanelName): void {
    this.d.click();
    if (this.panel === p) this.close();
    else this.open(p);
  }

  open(p: PanelName, tab?: string): void {
    if (this.confirmEl) return;
    this.panel = p;
    if (tab) {
      if (p === 'shop') this.panelState.tab = tab;
      if (p === 'pause') this.panelState.pauseTab = tab;
    }
    if (p === 'bag' || p === 'stand') this.panelState.selected.clear();
    if (!this.overlay) {
      this.overlay = h('div', { class: 'overlay', onclick: (e: Event) => { if (e.target === this.overlay) this.close(); } });
      this.root.append(this.overlay);
    }
    this.renderPanel();
    this.d.onPanelChange(p);
    (this.overlay.querySelector('.close') as HTMLElement | null)?.focus();
  }

  close(): void {
    if (!this.panel) return;
    this.panel = null;
    this.overlay?.remove();
    this.overlay = null;
    this.d.input.rebindCallback = null;
    (document.activeElement as HTMLElement | null)?.blur?.();
    this.d.onPanelChange(null);
  }

  /** Esc-free close for keyboard users: the same key that opened a panel closes it. */
  handleKey(action: 'bag' | 'journal' | 'pause'): void {
    if (this.confirmEl) return;
    if (action === 'pause' && this.panel && this.panel !== 'pause') this.close();
    else this.toggle(action);
  }

  private renderPanel(): void {
    if (!this.overlay || !this.panel) return;
    const scroll = this.overlay.querySelector('.body')?.scrollTop ?? 0;
    const rodScroll = this.overlay.querySelector('.rods')?.scrollLeft ?? 0;
    this.overlay.innerHTML = '';
    let panel: HTMLElement;
    switch (this.panel) {
      case 'bag':
      case 'stand':
        panel = this.bagPanel(this.panel === 'stand');
        break;
      case 'shop':
        panel = this.shopPanel();
        break;
      case 'journal':
        panel = this.journalPanel();
        break;
      case 'pause':
        panel = this.pausePanel();
        break;
    }
    this.overlay.append(panel);
    const body = panel.querySelector('.body');
    if (body) body.scrollTop = scroll;
    const rods = panel.querySelector('.rods');
    if (rods) rods.scrollLeft = rodScroll;
  }

  private shell(title: string, body: HTMLElement, footer?: HTMLElement, tabs?: HTMLElement): HTMLElement {
    return h(
      'div',
      { class: 'panel', role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
      h('header', {}, h('h2', {}, title), h('button', { class: 'close', 'aria-label': 'Close', onclick: () => this.close() }, '✕')),
      tabs ?? null,
      h('div', { class: 'body' }, body),
      footer ?? null,
    );
  }

  private sortedInventory(): CatchRecord[] {
    const s = this.d.store;
    const inv = [...s.state.inventory];
    const rIdx = (r: Rarity) => RARITIES.indexOf(r);
    switch (this.panelState.sort) {
      case 'newest': inv.sort((a, b) => b.ordinal - a.ordinal); break;
      case 'value': inv.sort((a, b) => s.valueOf(b) - s.valueOf(a)); break;
      case 'weight': inv.sort((a, b) => b.weight - a.weight); break;
      case 'rarity': inv.sort((a, b) => rIdx(b.rarity) - rIdx(a.rarity) || s.valueOf(b) - s.valueOf(a)); break;
    }
    return inv;
  }

  private bagPanel(atStand: boolean): HTMLElement {
    const s = this.d.store;
    const sel = this.panelState.selected;
    for (const id of [...sel]) if (!s.state.inventory.some((c) => c.id === id && !c.favorite)) sel.delete(id);
    const inv = this.sortedInventory();
    const sortSel = h('select', { 'aria-label': 'Sort by', onchange: (e: Event) => { this.panelState.sort = (e.target as HTMLSelectElement).value as never; this.renderPanel(); } });
    for (const [v, l] of [['newest', 'Newest'], ['value', 'Value'], ['weight', 'Weight'], ['rarity', 'Rarity']]) {
      const o = h('option', { value: v }, l);
      if (v === this.panelState.sort) o.selected = true;
      sortSel.append(o);
    }
    const toolbar = h('div', { class: 'toolbar' }, h('label', {}, 'Sort'), sortSel, h('span', { class: 'cmp' }, `${s.bagUsed}/${s.capacity} slots · ☆ protects a catch from Sell All`));
    const grid = h('div', { class: 'grid' });
    for (const c of inv) {
      const sp = SPECIES_BY_ID[c.speciesId];
      const val = s.valueOf(c);
      const card = h(
        'div',
        {
          class: `card${sel.has(c.id) ? ' sel' : ''}`,
          role: atStand ? 'checkbox' : undefined,
          'aria-checked': atStand ? String(sel.has(c.id)) : undefined,
          tabindex: atStand ? 0 : undefined,
          onclick: atStand && !c.favorite ? () => { if (sel.has(c.id)) sel.delete(c.id); else sel.add(c.id); this.renderPanel(); } : undefined,
        },
        atStand ? h('span', { class: 'check' }, c.favorite ? '☆' : sel.has(c.id) ? '✓' : '') : null,
        h('button', { class: `fav${c.favorite ? ' on' : ''}`, 'aria-label': c.favorite ? 'Unprotect' : 'Protect (favorite)', 'aria-pressed': String(c.favorite), onclick: (e: Event) => { e.stopPropagation(); s.toggleFavorite(c.id); } }, c.favorite ? '★' : '☆'),
        h('img', { src: this.d.thumb(c.speciesId, c.modifier, false), alt: '' }),
        h('div', { class: 'name' }, sp.name),
        h('div', { class: 'rarity', style: `color:${RARITY_COLOR[c.rarity]}` }, `${RARITY_GLYPH[c.rarity]} ${RARITY_LABEL[c.rarity]}${c.modifier !== 'normal' ? ` · ${MODIFIERS_BY_ID[c.modifier].name}` : ''}`),
        h('div', { class: 'meta' }, `${c.weight.toFixed(1)} kg${c.matchFactor > 1 ? ' · match +10%' : ''}`),
        h('div', { class: 'val' }, `¢ ${fmtCoins(val)}`),
      );
      grid.append(card);
    }
    const body = h('div', {}, toolbar, inv.length ? grid : h('div', { class: 'empty' }, 'Your bag is empty. Cast into a pool to catch something!'));
    let footer: HTMLElement;
    if (atStand) {
      const selQ = s.quoteSale([...sel]);
      const allIds = s.unlockedIds();
      const allQ = s.quoteSale(allIds);
      footer = h(
        'footer',
        {},
        h('span', { class: 'total' }, sel.size ? `Selected: ${selQ.count} for ¢ ${fmtCoins(selQ.coins)}` : 'Tap catches to select them'),
        h('button', { class: 'btn', disabled: sel.size === 0, onclick: () => this.doSell([...sel]) }, `Sell selected${sel.size ? ` (¢ ${fmtCoins(selQ.coins)})` : ''}`),
        h('button', { class: 'btn primary', disabled: allIds.length === 0, onclick: () => this.doSell(allIds) }, `Sell all unprotected (¢ ${fmtCoins(allQ.coins)})`),
      );
    } else {
      footer = h('footer', {}, h('span', { class: 'total' }, `Bag value ¢ ${fmtCoins(s.quoteSale(s.state.inventory.map((c) => c.id)).coins)}`), h('span', { class: 'cmp' }, 'Sell at the Fish Stand'));
    }
    return this.shell(atStand ? 'Fish Stand' : 'Bag', body, footer);
  }

  private doSell(ids: string[]): void {
    const r = this.d.store.sell(ids);
    this.panelState.selected.clear();
    if (r.ok) this.toast(`Sold ${r.count} catch${r.count === 1 ? '' : 'es'} for ¢ ${fmtCoins(r.coins)}`, 'big', 2200);
    else this.toast(r.reason ?? 'Nothing sold.', 'bad');
  }

  private shopPanel(): HTMLElement {
    const s = this.d.store;
    const tab = this.panelState.tab;
    const tabs = h(
      'div',
      { class: 'tabs', role: 'tablist' },
      ...[['rods', 'Rods'], ['upgrades', 'Upgrades']].map(([id, l]) =>
        h('button', { class: `tab${tab === id ? ' sel' : ''}`, role: 'tab', 'aria-selected': String(tab === id), onclick: () => { this.panelState.tab = id; this.renderPanel(); } }, l),
      ),
    );
    let body: HTMLElement;
    if (tab === 'rods') {
      const cur = s.rod;
      const list = h('div', { class: 'rods' });
      for (const rod of RODS) {
        const st = s.rodStatus(rod.id);
        const art = h('div', { class: 'art' }, h('div', { class: 'stick', style: `background:${rod.color}` }), h('div', { class: 'grip', style: `background:${rod.accent}` }));
        const cmp = st === 'equipped' ? 'Equipped' : `vs ${cur.name}: ${diff(rod.maxWeight, cur.maxWeight, ' kg')}, reel ${diff(rod.reelSpeed, cur.reelSpeed, '×', 2)}`;
        let btn: HTMLElement;
        if (st === 'equipped') btn = h('button', { class: 'btn', disabled: true }, 'Equipped');
        else if (st === 'owned') btn = h('button', { class: 'btn cyan', onclick: () => { s.equipRod(rod.id); this.d.click(); } }, 'Equip');
        else if (st === 'locked') btn = h('button', { class: 'btn', disabled: true }, `Buy ${RODS[RODS.indexOf(rod) - 1].name} first`);
        else if (st === 'poor') btn = h('button', { class: 'btn', disabled: true }, `Not enough coins (¢ ${fmtCoins(rod.cost)})`);
        else btn = h('button', { class: 'btn primary', onclick: (e: Event) => { (e.currentTarget as HTMLButtonElement).disabled = true; const r = s.buyRod(rod.id); if (!r.ok) this.toast(r.reason, 'bad'); } }, `Buy ¢ ${fmtCoins(rod.cost)}`);
        list.append(
          h(
            'div',
            { class: `rod${st === 'equipped' ? ' equipped' : ''}` },
            art,
            h('h3', {}, rod.name),
            h('div', { class: 'cmp' }, rod.blurb),
            h('div', { class: 'stats', html: `Max weight <b>${rod.maxWeight} kg</b><br>Reel speed <b>×${rod.reelSpeed.toFixed(2)}</b><br>Catch window <b>+${Math.round(rod.windowBonus * 100)}%</b>` }),
            h('div', { class: 'cmp', html: cmp }),
            btn,
          ),
        );
      }
      body = h('div', {}, h('p', { class: 'cmp' }, 'Heavier rods can land bigger species. Owned rods stay yours; equipping is free.'), list);
    } else {
      body = h('div', {});
      for (const u of UPGRADES) {
        const lvl = s.state.upgrades[u.id];
        const cost = s.upgradeCost(u.id);
        const max = u.costs.length;
        const btn =
          cost === null
            ? h('button', { class: 'btn', disabled: true }, 'Maxed')
            : s.state.coins < cost
              ? h('button', { class: 'btn', disabled: true }, `Not enough coins (¢ ${fmtCoins(cost)})`)
              : h('button', { class: 'btn primary', onclick: (e: Event) => { (e.currentTarget as HTMLButtonElement).disabled = true; const r = s.buyUpgrade(u.id as UpgradeTrack); if (!r.ok) this.toast(r.reason, 'bad'); } }, `Upgrade ¢ ${fmtCoins(cost)}`);
        const lvls = h('div', { class: 'lvl' });
        for (let i = 0; i < max; i++) lvls.append(h('i', { class: i < lvl ? 'on' : '' }));
        body.append(
          h(
            'div',
            { class: 'upg' },
            h('div', {}, h('h3', {}, `${u.name}  `, h('span', { class: 'cmp' }, `Lv ${lvl}/${max}`)), lvls, h('p', {}, `Now: ${u.describe(lvl)}`), lvl < max ? h('p', { class: 'cmp', html: `Next: <span class="up">${esc(u.describe(lvl + 1))}</span>` }) : null),
            btn,
          ),
        );
      }
    }
    return this.shell('Workshop', body, h('footer', {}, h('span', { class: 'total' }, `¢ ${fmtCoins(s.state.coins)}`)), tabs);
  }

  private journalPanel(): HTMLElement {
    const s = this.d.store;
    const ps = this.panelState;
    const pools: [string, string][] = [['all', 'All pools'], ['meadow', 'Meadow'], ['reed', 'Reed'], ['moon', 'Moon'], ['rift', 'Rift Bloom']];
    const poolSel = h('select', { 'aria-label': 'Filter by pool', onchange: (e: Event) => { ps.journalPool = (e.target as HTMLSelectElement).value; this.renderPanel(); } });
    for (const [v, l] of pools) {
      const o = h('option', { value: v }, l);
      if (v === ps.journalPool) o.selected = true;
      poolSel.append(o);
    }
    const discSel = h('select', { 'aria-label': 'Filter by discovery', onchange: (e: Event) => { ps.journalFilter = (e.target as HTMLSelectElement).value; this.renderPanel(); } });
    for (const [v, l] of [['all', 'All'], ['found', 'Discovered'], ['missing', 'Undiscovered']]) {
      const o = h('option', { value: v }, l);
      if (v === ps.journalFilter) o.selected = true;
      discSel.append(o);
    }
    const found = s.discoveredCount();
    const grid = h('div', { class: 'grid' });
    const list = SPECIES.filter((sp) => (ps.journalPool === 'all' || sp.pool === ps.journalPool) && (ps.journalFilter === 'all' || (ps.journalFilter === 'found') === !!s.state.journal[sp.id]));
    if (!ps.journalSel || !list.some((x) => x.id === ps.journalSel)) ps.journalSel = list[0]?.id ?? '';
    for (const sp of list) {
      const j = s.state.journal[sp.id];
      grid.append(
        h(
          'button',
          { class: `card${j ? '' : ' unknown'}${ps.journalSel === sp.id ? ' sel' : ''}`, 'aria-label': j ? sp.name : 'Undiscovered species', onclick: () => { ps.journalSel = sp.id; this.renderPanel(); } },
          h('img', { src: this.d.thumb(sp.id, 'normal', !j), alt: '' }),
          h('div', { class: 'name' }, j ? sp.name : '???'),
          h('div', { class: 'rarity', style: `color:${RARITY_COLOR[sp.rarity]}` }, `${RARITY_GLYPH[sp.rarity]} ${RARITY_LABEL[sp.rarity]}`),
        ),
      );
    }
    const sel = SPECIES_BY_ID[ps.journalSel];
    let detail: HTMLElement = h('div', { class: 'detail' });
    if (sel) {
      const j = s.state.journal[sel.id];
      detail = h(
        'div',
        { class: 'detail' },
        h('img', { src: this.d.thumb(sel.id, 'normal', !j), alt: j ? sel.name : 'Silhouette' }),
        h(
          'div',
          {},
          h('h3', {}, j ? sel.name : 'Undiscovered'),
          h('p', { style: `color:${RARITY_COLOR[sel.rarity]};font-weight:800` }, `${RARITY_GLYPH[sel.rarity]} ${RARITY_LABEL[sel.rarity]} · ${POOLS_BY_ID[sel.pool].name}`),
          h('p', {}, `Hint: ${sel.hint}`),
          h('p', {}, `Weight range ${sel.minWeight}–${sel.maxWeight} kg`),
          j ? h('p', {}, `Caught ${j.count}× · Record ${j.maxWeight.toFixed(1)} kg · Best ¢ ${fmtCoins(j.maxValue)}`) : null,
          j ? h('p', {}, `Modifiers found: ${j.modifiers.map((m) => MODIFIERS_BY_ID[m].name).join(', ')}`) : null,
        ),
      );
    }
    const body = h(
      'div',
      {},
      h('div', { class: 'cmp' }, `${found}/${SPECIES.length} species discovered`),
      h('div', { class: 'progress-bar' }, h('div', { style: `width:${(found / SPECIES.length) * 100}%` })),
      h('div', { class: 'toolbar' }, poolSel, discSel),
      h('div', { class: 'journal' }, grid, detail),
    );
    return this.shell('Journal', body);
  }

  private pausePanel(): HTMLElement {
    const s = this.d.store;
    const st = s.state.settings;
    const tab = this.panelState.pauseTab;
    const tabs = h(
      'div',
      { class: 'tabs', role: 'tablist' },
      ...[['settings', 'Settings'], ['controls', 'Controls'], ['wardrobe', 'Wardrobe'], ['help', 'How to play']].map(([id, l]) =>
        h('button', { class: `tab${tab === id ? ' sel' : ''}`, role: 'tab', 'aria-selected': String(tab === id), onclick: () => { this.panelState.pauseTab = id; this.renderPanel(); } }, l),
      ),
    );
    const body = h('div', { class: 'settings' });
    const slider = (label: string, key: 'master' | 'music' | 'sfx') => {
      const inp = h('input', { type: 'range', min: 0, max: 1, step: 0.05, value: st[key], 'aria-label': label }) as HTMLInputElement;
      inp.addEventListener('input', () => {
        s.state.settings[key] = Number(inp.value);
        this.d.onSettings();
      });
      inp.addEventListener('change', () => s.updateSettings({ [key]: Number(inp.value) }));
      return h('div', { class: 'row' }, h('span', {}, label), inp);
    };
    const toggle = (label: string, sub: string, key: 'reducedMotion' | 'assist') =>
      h('div', { class: 'row' }, h('span', {}, label, h('small', {}, sub)), h('button', { class: `btn small toggle${st[key] ? ' on' : ''}`, 'aria-pressed': String(st[key]), onclick: () => { s.updateSettings({ [key]: !st[key] }); this.d.onSettings(); } }, st[key] ? 'On' : 'Off'));
    if (tab === 'settings') {
      body.append(slider('Master volume', 'master'), slider('Music', 'music'), slider('Effects', 'sfx'));
      const q = h('select', { 'aria-label': 'Quality', onchange: (e: Event) => { s.updateSettings({ quality: (e.target as HTMLSelectElement).value as never }); this.d.onSettings(); } });
      for (const v of ['low', 'medium', 'high']) {
        const o = h('option', { value: v }, v[0].toUpperCase() + v.slice(1));
        if (v === st.quality) o.selected = true;
        q.append(o);
      }
      body.append(h('div', { class: 'row' }, h('span', {}, 'Quality', h('small', {}, 'Lower if the game feels slow')), q));
      body.append(toggle('Reduced motion', 'Softer camera and reveal animations', 'reducedMotion'));
      body.append(toggle('Assist mode', 'Wider catch window, longer hook time, more slack. Same rewards.', 'assist'));
      body.append(
        h('div', { class: 'row' }, h('span', {}, 'Save', h('small', {}, 'Progress saves automatically after every catch, sale and purchase.')), h('button', { class: 'btn small', onclick: () => this.d.onRetrySave() }, 'Retry save')),
        h('div', { class: 'row' }, h('span', {}, 'Reset progress', h('small', {}, 'Deletes coins, rods, catches and journal.')), h('button', { class: 'btn small danger', onclick: () => this.confirm('Reset all progress? This cannot be undone.', 'Reset everything', () => this.d.onReset()) }, 'Reset…')),
      );
    } else if (tab === 'controls') {
      for (const k of Object.keys(DEFAULT_BINDINGS)) {
        const code = st.bindings[k];
        const btn = h('button', { class: 'btn small' }, keyName(code));
        btn.addEventListener('click', () => {
          btn.textContent = 'Press a key…';
          this.d.input.rebindCallback = (newCode) => {
            if (newCode === 'Escape') { this.renderPanel(); return; }
            const b = { ...s.state.settings.bindings };
            for (const [kk, vv] of Object.entries(b)) if (vv === newCode && kk !== k) b[kk] = code; // swap duplicates
            b[k] = newCode;
            s.updateSettings({ bindings: b });
            this.d.onSettings();
          };
        });
        body.append(h('div', { class: 'row' }, h('span', {}, ACTION_NAMES[k]), btn));
      }
      body.append(
        h('div', { class: 'row' }, h('span', {}, 'Restore defaults'), h('button', { class: 'btn small', onclick: () => { s.updateSettings({ bindings: { ...DEFAULT_BINDINGS } }); this.d.onSettings(); } }, 'Reset keys')),
        h('ul', { class: 'help-list' }, h('li', {}, 'Arrow keys always move too. Enter also casts.'), h('li', {}, 'Mouse: left-click casts and reels, right-drag rotates the camera, wheel zooms.'), h('li', {}, 'Touch: left side joystick, right side drag to look, big button to cast and reel.')),
      );
    } else if (tab === 'wardrobe') {
      body.append(h('p', { class: 'cmp' }, 'Bobber styles are cosmetic only.'));
      for (const b of BOBBERS) {
        const owned = s.state.bobbers.includes(b.id);
        const eq = s.state.equippedBobber === b.id;
        const row = h('div', { class: 'row' }, h('span', { html: `<span style="display:inline-block;width:18px;height:18px;border-radius:50%;background:linear-gradient(${b.top} 50%, ${b.bottom} 50%);vertical-align:middle;margin-right:8px;border:2px solid #fff"></span>${b.name}` }));
        const btns = h('div', { style: 'display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end' });
        if (eq) btns.append(h('button', { class: 'btn small', disabled: true }, 'Equipped'));
        else if (owned) btns.append(h('button', { class: 'btn small cyan', onclick: () => s.equipBobber(b.id) }, 'Equip'));
        else {
          btns.append(h('button', { class: 'btn small primary', disabled: s.state.coins < b.cost, onclick: (e: Event) => { (e.currentTarget as HTMLButtonElement).disabled = true; const r = s.buyBobber(b.id); if (!r.ok) this.toast(r.reason, 'bad'); } }, s.state.coins < b.cost ? `Not enough coins (¢ ${b.cost})` : `Buy ¢ ${b.cost}`));
          if (this.d.adsEnabled) {
            btns.append(
              h('button', {
                class: 'btn small cyan',
                onclick: async (e: Event) => {
                  const el = e.currentTarget as HTMLButtonElement;
                  el.disabled = true;
                  el.textContent = 'Loading ad…';
                  const r = await this.d.onRewardedBobber();
                  if (r === 'granted') this.toast('Sunburst bobber unlocked!', 'big');
                  else if (r === 'unavailable') this.toast('No ad available right now. You can still buy it with coins.', 'bad', 2600);
                  this.renderPanel();
                },
              }, '▶ Watch an ad to unlock'),
            );
          }
        }
        row.append(btns);
        body.append(row);
      }
    } else {
      body.append(
        h(
          'ul',
          { class: 'help-list' },
          h('li', {}, 'Walk to the edge of a pool. Hold Cast, release when the marker is in the gold zone for up to ×2.00 luck.'),
          h('li', {}, 'Watch the bobber. When it dips and FISH ON! appears, press again to hook.'),
          h('li', {}, 'Hold to move the green window right, release to move it left. Keep the fish inside to reel it in.'),
          h('li', {}, 'Sell catches at the Fish Stand, then buy rods and upgrades at the Workshop.'),
          h('li', {}, 'Heavier rods land bigger species. Reed and Moon pools unlock as you progress.'),
          h('li', {}, 'Rift Bloom opens a giant portal pool every few minutes. Match your lure to the current symbol for +10% value.'),
          h('li', {}, 'Villagers around the island are computer-controlled characters. This game has no online multiplayer.'),
        ),
      );
    }
    return this.shell('Paused', body, h('footer', {}, h('button', { class: 'btn primary', onclick: () => this.close() }, 'Resume')), tabs);
  }

  confirm(text: string, yes: string, onYes: () => void): void {
    const box = h(
      'div',
      { class: 'overlay', style: 'z-index:5' },
      h(
        'div',
        { class: 'panel', role: 'alertdialog', 'aria-label': text, style: 'width:min(420px,100%)' },
        h('div', { class: 'body', style: 'padding:20px;font-size:17px;font-weight:700' }, text),
        h(
          'footer',
          {},
          h('button', { class: 'btn', onclick: () => { box.remove(); this.confirmEl = null; } }, 'Cancel'),
          h('button', { class: 'btn danger', onclick: () => { box.remove(); this.confirmEl = null; onYes(); } }, yes),
        ),
      ),
    );
    this.confirmEl = box;
    this.root.append(box);
    (box.querySelector('.btn') as HTMLElement).focus();
  }

  setReducedMotion(on: boolean): void {
    this.root.classList.toggle('reduced-motion', on);
  }

  bagLabel(): string {
    return `${this.d.store.bagUsed}/${BAG_CAPACITY[this.d.store.state.upgrades.bag]}`;
  }

  /** Lets world labels show pool names consistently. */
  poolName(id: PoolId): string {
    return POOLS_BY_ID[id].name;
  }
}

function diff(a: number, b: number, unit: string, digits = 0): string {
  const d = a - b;
  const s = d.toFixed(digits);
  if (Math.abs(d) < 1e-9) return `same`;
  return d > 0 ? `<span class="up">+${s}${unit}</span>` : `${s}${unit}`;
}
