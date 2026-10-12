export type PauseReason = 'USER_MENU' | 'DOCUMENT_HIDDEN' | 'AD_REQUEST' | 'AD_PLAYING' | 'RECOVERABLE_RENDER_ERROR' | 'BOOT';

/** Stacked pause reasons. Simulation advances only while the set is empty. */
export class PauseManager {
  private reasons = new Set<PauseReason>();
  private listeners = new Set<(paused: boolean) => void>();

  add(r: PauseReason): void {
    const was = this.paused;
    this.reasons.add(r);
    if (!was) this.notify();
  }
  remove(r: PauseReason): void {
    if (!this.reasons.delete(r)) return;
    if (!this.paused) this.notify();
  }
  has(r: PauseReason): boolean {
    return this.reasons.has(r);
  }
  get paused(): boolean {
    return this.reasons.size > 0;
  }
  list(): PauseReason[] {
    return [...this.reasons];
  }
  onChange(fn: (paused: boolean) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
  private notify(): void {
    for (const l of this.listeners) l(this.paused);
  }
}
