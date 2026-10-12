import { newSave, parseSave, serializeSave, type SaveData } from '../logic/saveSchema';
import type { KeyValueBackend } from './platform';

const KEY = 'riftfishing.save';
const BACKUP_KEY = 'riftfishing.save.backup';
const QUARANTINE_KEY = 'riftfishing.save.corrupt';

export type SaveStatus =
  | { kind: 'saved' }
  | { kind: 'saving' }
  | { kind: 'degraded'; message: string }
  | { kind: 'readonly'; message: string };

export interface LoadResult {
  data: SaveData;
  notice: string | null;
  canSave: boolean;
}

/**
 * One repository over any key/value backend. Writes one complete snapshot per change (coalesced
 * to one write per microtask), keeps the previous good snapshot as a backup, and never writes
 * over a save it could not read.
 */
export class SaveRepository {
  private canSave = false;
  private pending: SaveData | null = null;
  private scheduled = false;
  private lastWritten = '';
  status: SaveStatus = { kind: 'saved' };
  onStatus: (s: SaveStatus) => void = () => {};

  constructor(private backend: KeyValueBackend) {}

  get backendName(): string {
    return this.backend.name;
  }

  async load(): Promise<LoadResult> {
    let raw: string | null;
    try {
      raw = await this.backend.getItem(KEY);
    } catch (e) {
      this.canSave = false;
      this.setStatus({ kind: 'degraded', message: 'Progress could not be loaded, so it will not be saved this session.' });
      return { data: newSave(), notice: `Could not read your save (${String(e)}). Playing without saving — your existing save is untouched.`, canSave: false };
    }
    const out = parseSave(raw);
    if (out.kind === 'none') {
      this.canSave = true;
      return { data: newSave(), notice: null, canSave: true };
    }
    if (out.kind === 'ok') {
      this.canSave = true;
      this.lastWritten = raw ?? '';
      return { data: out.data, notice: out.repairs.length ? 'Some invalid save entries were repaired.' : null, canSave: true };
    }
    if (out.kind === 'unsupported') {
      this.canSave = false;
      this.setStatus({ kind: 'readonly', message: 'Save is from a newer version; not overwriting it.' });
      return { data: newSave(), notice: `Your save was made by a newer version (v${out.version}). It is kept safe and this session will not save.`, canSave: false };
    }
    // Corrupt: try the backup, then quarantine the bad copy and start fresh.
    let backup: string | null = null;
    try {
      backup = await this.backend.getItem(BACKUP_KEY);
    } catch {
      backup = null;
    }
    const b = parseSave(backup);
    try {
      await this.backend.setItem(QUARANTINE_KEY, raw ?? '');
    } catch {
      /* best effort */
    }
    this.canSave = true;
    if (b.kind === 'ok') return { data: b.data, notice: 'Your save was damaged; restored the most recent backup.', canSave: true };
    return { data: newSave(), notice: `Your save was damaged (${out.reason}). A copy was kept and a new profile started.`, canSave: true };
  }

  /** Queue a full snapshot. Multiple calls in one task produce one write. */
  save(data: SaveData): void {
    if (!this.canSave) return;
    this.pending = data;
    if (this.scheduled) return;
    this.scheduled = true;
    this.setStatus({ kind: 'saving' });
    queueMicrotask(() => void this.flush());
  }

  async flush(): Promise<void> {
    this.scheduled = false;
    const data = this.pending;
    this.pending = null;
    if (!data || !this.canSave) return;
    const text = serializeSave(data);
    if (text === this.lastWritten) {
      this.setStatus({ kind: 'saved' });
      return;
    }
    try {
      if (this.lastWritten) await this.backend.setItem(BACKUP_KEY, this.lastWritten);
      await this.backend.setItem(KEY, text);
      this.lastWritten = text;
      this.setStatus({ kind: 'saved' });
    } catch (e) {
      this.setStatus({ kind: 'degraded', message: `Saving failed (${String(e)}). Will retry on the next change.` });
    }
  }

  /**
   * Stop writing immediately (drops any queued snapshot). Used on account changes so one
   * profile's state is never written into another profile's storage.
   */
  suspend(): void {
    this.canSave = false;
    this.pending = null;
  }

  /** Retry after a degraded load, e.g. from the settings panel. */
  async retryLoad(): Promise<LoadResult> {
    return this.load();
  }

  private setStatus(s: SaveStatus): void {
    this.status = s;
    this.onStatus(s);
  }
}
