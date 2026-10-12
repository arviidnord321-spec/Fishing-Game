import { DEFAULT_BINDINGS } from '../logic/saveSchema';

export type ButtonAction = 'action' | 'interact' | 'bag' | 'journal' | 'pause' | 'cancel';

interface ButtonState {
  held: boolean;
  pressed: number;
  released: number;
}

const ALT_KEYS: Record<string, string> = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' };

/**
 * Keyboard / mouse / touch input. Presses and releases are buffered as edges and consumed by
 * the fixed-step simulation, so a quick tap between two steps is never lost.
 */
export class InputManager {
  bindings: Record<string, string> = { ...DEFAULT_BINDINGS };
  private keys = new Set<string>();
  private buttons: Record<ButtonAction, ButtonState> = {
    action: { held: false, pressed: 0, released: 0 },
    interact: { held: false, pressed: 0, released: 0 },
    bag: { held: false, pressed: 0, released: 0 },
    journal: { held: false, pressed: 0, released: 0 },
    pause: { held: false, pressed: 0, released: 0 },
    cancel: { held: false, pressed: 0, released: 0 },
  };
  /** Touch joystick vector, -1..1 each axis (y = forward). */
  joy = { x: 0, y: 0, active: false, cx: 0, cy: 0, px: 0, py: 0 };
  orbitDX = 0;
  orbitDY = 0;
  zoomDelta = 0;
  enabled = true;
  /** Set while waiting for a rebind key. */
  rebindCallback: ((code: string) => void) | null = null;
  private pointerAction: number | null = null;
  private orbitPointer: number | null = null;
  private joyPointer: number | null = null;
  private lastOrbit = { x: 0, y: 0 };
  private touches = new Map<number, { x: number; y: number }>();
  private pinchDist = 0;
  private cleanup: (() => void)[] = [];
  isTouch = false;

  constructor(private canvas: HTMLCanvasElement) {
    this.isTouch = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
    const on = <K extends keyof WindowEventMap>(t: EventTarget, type: K | string, fn: (e: never) => void, opts?: AddEventListenerOptions) => {
      t.addEventListener(type, fn as EventListener, opts);
      this.cleanup.push(() => t.removeEventListener(type, fn as EventListener, opts));
    };
    on(window, 'keydown', (e: KeyboardEvent) => this.onKey(e, true));
    on(window, 'keyup', (e: KeyboardEvent) => this.onKey(e, false));
    on(window, 'blur', () => this.clear());
    on(document, 'visibilitychange', () => {
      if (document.hidden) this.clear();
    });
    on(canvas, 'pointerdown', (e: PointerEvent) => this.onPointerDown(e));
    on(window, 'pointermove', (e: PointerEvent) => this.onPointerMove(e));
    on(window, 'pointerup', (e: PointerEvent) => this.onPointerUp(e));
    on(window, 'pointercancel', (e: PointerEvent) => this.onPointerUp(e));
    on(canvas, 'contextmenu', (e: Event) => e.preventDefault());
    on(canvas, 'wheel', (e: WheelEvent) => {
      e.preventDefault();
      this.zoomDelta += Math.sign(e.deltaY) * 0.8;
    }, { passive: false });
  }

  private actionForCode(code: string): string | null {
    if (ALT_KEYS[code]) return ALT_KEYS[code];
    for (const [k, v] of Object.entries(this.bindings)) if (v === code) return k;
    if (code === 'Enter' || code === 'NumpadEnter') return 'action';
    return null;
  }

  private onKey(e: KeyboardEvent, down: boolean): void {
    if (this.rebindCallback && down) {
      e.preventDefault();
      const cb = this.rebindCallback;
      this.rebindCallback = null;
      cb(e.code);
      return;
    }
    // Leave typing in form fields and browser shortcuts alone.
    const target = e.target as HTMLElement | null;
    if (target && (target.tagName === 'INPUT' || target.tagName === 'SELECT' || target.tagName === 'TEXTAREA')) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const act = this.actionForCode(e.code);
    if (!act) return;
    if (act === 'action' && target?.tagName === 'BUTTON' && !target.dataset.gameAction) return;
    // Space/arrows would scroll the host page; suppress only while the game handles them.
    e.preventDefault();
    if (e.repeat) return;
    if (['up', 'down', 'left', 'right'].includes(act)) {
      if (down) this.keys.add(act);
      else this.keys.delete(act);
      return;
    }
    // A focused UI button handles Space/Enter itself; don't also cast.
    if (act === 'action' && target?.tagName === 'BUTTON' && !target.dataset.gameAction) return;
    if (!this.enabled && act === 'action') return;
    this.setButton(act as ButtonAction, down);
  }

  setButton(b: ButtonAction, down: boolean): void {
    const s = this.buttons[b];
    if (down && !s.held) {
      s.held = true;
      s.pressed++;
    } else if (!down && s.held) {
      s.held = false;
      s.released++;
    }
  }

  private onPointerDown(e: PointerEvent): void {
    this.canvas.focus?.();
    if (e.pointerType === 'touch') {
      this.isTouch = true;
      this.touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (this.touches.size === 2) {
        const [a, b] = [...this.touches.values()];
        this.pinchDist = Math.hypot(a.x - b.x, a.y - b.y);
      }
      const rect = this.canvas.getBoundingClientRect();
      if (e.clientX - rect.left < rect.width * 0.45 && this.joyPointer === null) {
        this.joyPointer = e.pointerId;
        this.joy = { x: 0, y: 0, active: true, cx: e.clientX, cy: e.clientY, px: e.clientX, py: e.clientY };
      } else if (this.orbitPointer === null) {
        this.orbitPointer = e.pointerId;
        this.lastOrbit = { x: e.clientX, y: e.clientY };
      }
      return;
    }
    this.isTouch = false;
    if (e.button === 2 || e.button === 1) {
      this.orbitPointer = e.pointerId;
      this.lastOrbit = { x: e.clientX, y: e.clientY };
      this.canvas.setPointerCapture?.(e.pointerId);
    } else if (e.button === 0 && this.enabled) {
      this.pointerAction = e.pointerId;
      this.setButton('action', true);
    }
  }

  private onPointerMove(e: PointerEvent): void {
    if (this.touches.has(e.pointerId)) this.touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (this.touches.size === 2 && e.pointerType === 'touch' && this.joyPointer === null) {
      const [a, b] = [...this.touches.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      this.zoomDelta += (this.pinchDist - d) * 0.02;
      this.pinchDist = d;
      return;
    }
    if (e.pointerId === this.joyPointer) {
      const max = 55;
      let dx = e.clientX - this.joy.cx;
      let dy = e.clientY - this.joy.cy;
      const len = Math.hypot(dx, dy);
      if (len > max) {
        dx = (dx / len) * max;
        dy = (dy / len) * max;
      }
      this.joy.px = this.joy.cx + dx;
      this.joy.py = this.joy.cy + dy;
      const dead = 0.12;
      const nx = dx / max;
      const ny = -dy / max;
      const m = Math.hypot(nx, ny);
      this.joy.x = m < dead ? 0 : nx;
      this.joy.y = m < dead ? 0 : ny;
    } else if (e.pointerId === this.orbitPointer) {
      this.orbitDX += e.clientX - this.lastOrbit.x;
      this.orbitDY += e.clientY - this.lastOrbit.y;
      this.lastOrbit = { x: e.clientX, y: e.clientY };
    }
  }

  private onPointerUp(e: PointerEvent): void {
    this.touches.delete(e.pointerId);
    if (e.pointerId === this.joyPointer) {
      this.joyPointer = null;
      this.joy = { ...this.joy, x: 0, y: 0, active: false };
    }
    if (e.pointerId === this.orbitPointer) this.orbitPointer = null;
    if (e.pointerId === this.pointerAction) {
      this.pointerAction = null;
      this.setButton('action', false);
    }
  }

  /** Releases everything (blur, hidden page, menus). A fresh press is required afterwards. */
  clear(): void {
    this.keys.clear();
    for (const b of Object.values(this.buttons)) {
      if (b.held) b.released++;
      b.held = false;
    }
    this.pointerAction = null;
    this.orbitPointer = null;
    this.joyPointer = null;
    this.joy = { ...this.joy, x: 0, y: 0, active: false };
    this.touches.clear();
  }

  /** Drops queued edges (e.g., the click that closed a menu must not cast). */
  flushEdges(): void {
    for (const b of Object.values(this.buttons)) {
      b.pressed = 0;
      b.released = 0;
    }
  }

  moveVector(): { x: number; y: number } {
    let x = 0;
    let y = 0;
    if (this.keys.has('left')) x -= 1;
    if (this.keys.has('right')) x += 1;
    if (this.keys.has('up')) y += 1;
    if (this.keys.has('down')) y -= 1;
    if (this.joy.active) {
      x += this.joy.x;
      y += this.joy.y;
    }
    const len = Math.hypot(x, y);
    if (len > 1) {
      x /= len;
      y /= len;
    }
    return { x, y };
  }

  /** Consume one press edge, if any. */
  takePressed(b: ButtonAction): boolean {
    const s = this.buttons[b];
    if (s.pressed > 0) {
      s.pressed--;
      return true;
    }
    return false;
  }
  takeReleased(b: ButtonAction): boolean {
    const s = this.buttons[b];
    if (s.released > 0) {
      s.released--;
      return true;
    }
    return false;
  }
  held(b: ButtonAction): boolean {
    return this.buttons[b].held;
  }

  takeOrbit(): { dx: number; dy: number; zoom: number } {
    const r = { dx: this.orbitDX, dy: this.orbitDY, zoom: this.zoomDelta };
    this.orbitDX = this.orbitDY = this.zoomDelta = 0;
    return r;
  }

  dispose(): void {
    for (const c of this.cleanup) c();
    this.cleanup = [];
  }
}
