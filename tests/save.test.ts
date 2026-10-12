import { describe, expect, it } from 'vitest';
import { newSave, serializeSave } from '../src/logic/saveSchema';
import type { KeyValueBackend } from '../src/platform/platform';
import { SaveRepository } from '../src/platform/saveRepository';

class MemBackend implements KeyValueBackend {
  name = 'mem';
  data = new Map<string, string>();
  failRead = false;
  failWrite = false;
  writes = 0;
  async getItem(k: string) {
    if (this.failRead) throw new Error('read blocked');
    return this.data.get(k) ?? null;
  }
  async setItem(k: string, v: string) {
    if (this.failWrite) throw new Error('quota');
    this.writes++;
    this.data.set(k, v);
  }
}

const KEY = 'riftfishing.save';
const tick = () => new Promise((r) => setTimeout(r, 0));

describe('SaveRepository', () => {
  it('starts fresh and saves when there is no save', async () => {
    const b = new MemBackend();
    const repo = new SaveRepository(b);
    const r = await repo.load();
    expect(r.canSave).toBe(true);
    expect(r.notice).toBeNull();
    const d = r.data;
    d.coins = 42;
    repo.save(d);
    await tick();
    expect(JSON.parse(b.data.get(KEY)!).coins).toBe(42);
  });

  it('never overwrites an existing save it failed to read', async () => {
    const b = new MemBackend();
    const existing = newSave();
    existing.coins = 999;
    b.data.set(KEY, serializeSave(existing));
    b.failRead = true;
    const repo = new SaveRepository(b);
    const r = await repo.load();
    expect(r.canSave).toBe(false);
    expect(r.notice).toMatch(/untouched/);
    repo.save(r.data);
    await tick();
    expect(JSON.parse(b.data.get(KEY)!).coins).toBe(999);
    expect(repo.status.kind).toBe('degraded');
  });

  it('restores the backup when the main save is corrupt and quarantines the bad copy', async () => {
    const b = new MemBackend();
    const good = newSave();
    good.coins = 77;
    b.data.set('riftfishing.save.backup', serializeSave(good));
    b.data.set(KEY, '{broken');
    const r = await new SaveRepository(b).load();
    expect(r.data.coins).toBe(77);
    expect(r.notice).toMatch(/backup/);
    expect(b.data.get('riftfishing.save.corrupt')).toBe('{broken');
  });

  it('keeps a newer-version save read-only', async () => {
    const b = new MemBackend();
    b.data.set(KEY, JSON.stringify({ version: 5, coins: 10 }));
    const repo = new SaveRepository(b);
    const r = await repo.load();
    expect(r.canSave).toBe(false);
    repo.save(r.data);
    await tick();
    expect(JSON.parse(b.data.get(KEY)!).version).toBe(5);
  });

  it('coalesces writes and stops writing after an account change (suspend)', async () => {
    const b = new MemBackend();
    const repo = new SaveRepository(b);
    const r = await repo.load();
    for (let i = 0; i < 10; i++) {
      r.data.coins = i;
      repo.save(r.data);
    }
    await tick();
    expect(b.writes).toBe(1);
    repo.suspend();
    r.data.coins = 500;
    repo.save(r.data);
    await tick();
    expect(JSON.parse(b.data.get(KEY)!).coins).toBe(9);
  });

  it('reports a failed write as degraded, not saved', async () => {
    const b = new MemBackend();
    const repo = new SaveRepository(b);
    const r = await repo.load();
    b.failWrite = true;
    r.data.coins = 3;
    repo.save(r.data);
    await tick();
    expect(repo.status.kind).toBe('degraded');
  });
});
