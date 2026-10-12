import { BAG_CAPACITY, BOBBERS, RODS, RODS_BY_ID, UPGRADES_BY_ID } from '../data/balance';
import { SPECIES } from '../data/species';
import type { CatchRecord, LureId, PermanentPoolId, PoolId, RodDef, UpgradeTrack } from '../data/types';
import { saleValue } from './catchResolver';
import { newSave, type SaveData, type Settings } from './saveSchema';

export type StoreEvent =
  | { type: 'changed' }
  | { type: 'poolUnlocked'; pool: PoolId }
  | { type: 'purchase'; what: string }
  | { type: 'sale'; coins: number; count: number };

export type ActionResult = { ok: true } | { ok: false; reason: string };

export interface SaleReceipt {
  ok: boolean;
  coins: number;
  count: number;
  ids: string[];
  reason?: string;
}

const POOL_UNLOCKS: Record<'reed' | 'moon', { rod: string; pool: PermanentPoolId; species: number }> = {
  reed: { rod: 'coppercoil', pool: 'meadow', species: 4 },
  moon: { rod: 'stormline', pool: 'reed', species: 4 },
};

/**
 * Authoritative durable game state. UI dispatches actions here; it never mutates money or
 * inventory directly. Every action is synchronous, so a second rapid click sees the result of
 * the first. `onPersist` receives one complete snapshot per durable change.
 */
export class GameStore {
  state: SaveData;
  private reservations = 0;
  private listeners = new Set<(e: StoreEvent) => void>();
  onPersist: (s: SaveData) => void = () => {};

  constructor(initial?: SaveData) {
    this.state = initial ?? newSave();
  }

  subscribe(fn: (e: StoreEvent) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit(e: StoreEvent): void {
    for (const l of this.listeners) l(e);
  }

  private commit(): void {
    this.checkUnlocks();
    this.onPersist(this.state);
    this.emit({ type: 'changed' });
  }

  // ---------- derived ----------
  get rod(): RodDef {
    return RODS_BY_ID[this.state.equippedRod] ?? RODS[0];
  }
  get capacity(): number {
    return BAG_CAPACITY[this.state.upgrades.bag];
  }
  get bagUsed(): number {
    return this.state.inventory.length;
  }
  get reserved(): number {
    return this.reservations;
  }
  bagFull(): boolean {
    return this.state.inventory.length + this.reservations >= this.capacity;
  }
  meadowRadius(): number {
    return 3.2 + 0.35 * this.state.upgrades.poolGrowth;
  }
  discoveredIn(pool: PoolId): number {
    return SPECIES.filter((s) => s.pool === pool && this.state.journal[s.id]).length;
  }
  discoveredCount(): number {
    return SPECIES.filter((s) => this.state.journal[s.id]).length;
  }

  isPoolUnlocked(pool: PoolId): boolean {
    if (pool === 'meadow' || pool === 'rift') return true;
    const req = POOL_UNLOCKS[pool];
    return this.state.ownedRods.includes(req.rod) && this.discoveredIn(req.pool) >= req.species;
  }
  unlockProgress(pool: 'reed' | 'moon'): { rodOwned: boolean; rodName: string; found: number; need: number; fromPool: string } {
    const req = POOL_UNLOCKS[pool];
    return {
      rodOwned: this.state.ownedRods.includes(req.rod),
      rodName: RODS_BY_ID[req.rod].name,
      found: this.discoveredIn(req.pool),
      need: req.species,
      fromPool: req.pool === 'meadow' ? 'Meadow' : 'Reed',
    };
  }
  unlockedPermanentPools(): PermanentPoolId[] {
    return (['meadow', 'reed', 'moon'] as PermanentPoolId[]).filter((p) => this.isPoolUnlocked(p));
  }

  private checkUnlocks(): void {
    for (const p of ['reed', 'moon'] as const) {
      if (this.isPoolUnlocked(p) && !this.state.announcedPools.includes(p)) {
        this.state.announcedPools.push(p);
        this.emit({ type: 'poolUnlocked', pool: p });
      }
    }
  }

  valueOf(c: CatchRecord): number {
    return saleValue(c.speciesId, c.weight, c.modifier, this.state.upgrades.sellValue, c.matchFactor);
  }

  // ---------- fishing ----------
  /** Reserve one bag slot for a fishing attempt. */
  reserveSlot(): boolean {
    if (this.bagFull()) return false;
    this.reservations++;
    return true;
  }
  releaseSlot(): void {
    if (this.reservations > 0) this.reservations--;
  }

  newCatchId(): string {
    const id = `c${this.state.nextTx}`;
    this.state.nextTx++;
    return id;
  }

  /**
   * Commits a won catch exactly once. Consumes the attempt's reservation.
   * Returns flags for the reveal; returns null if this catch ID was already committed.
   */
  commitCatch(rec: Omit<CatchRecord, 'ordinal' | 'favorite'>): { newSpecies: boolean; newRecord: boolean } | null {
    if (this.state.inventory.some((c) => c.id === rec.id) || this.committedIds.has(rec.id)) return null;
    this.committedIds.add(rec.id);
    this.releaseSlot();
    const full: CatchRecord = { ...rec, ordinal: this.state.nextOrdinal++, favorite: false };
    this.state.inventory.push(full);
    const value = this.valueOf(full);
    const j = this.state.journal[rec.speciesId];
    const newSpecies = !j;
    const newRecord = !!j && rec.weight > j.maxWeight;
    if (!j) {
      this.state.journal[rec.speciesId] = { count: 1, maxWeight: rec.weight, maxValue: value, modifiers: [rec.modifier] };
    } else {
      j.count++;
      j.maxWeight = Math.max(j.maxWeight, rec.weight);
      j.maxValue = Math.max(j.maxValue, value);
      if (!j.modifiers.includes(rec.modifier)) j.modifiers.push(rec.modifier);
    }
    if (!this.state.bestCatch || rec.weight > this.state.bestCatch.weight) {
      this.state.bestCatch = { speciesId: rec.speciesId, weight: rec.weight, modifier: rec.modifier };
    }
    this.state.tutorial.firstCatch = true;
    this.commit();
    return { newSpecies, newRecord };
  }
  private committedIds = new Set<string>();

  // ---------- selling ----------
  quoteSale(ids: string[]): { coins: number; count: number } {
    const set = new Set(ids);
    let coins = 0;
    let count = 0;
    for (const c of this.state.inventory) {
      if (set.has(c.id)) {
        coins += this.valueOf(c);
        count++;
      }
    }
    return { coins, count };
  }
  unlockedIds(): string[] {
    return this.state.inventory.filter((c) => !c.favorite).map((c) => c.id);
  }
  /** Removes the given catches and pays for them in one transaction. */
  sell(ids: string[]): SaleReceipt {
    const set = new Set(ids);
    const sold = this.state.inventory.filter((c) => set.has(c.id));
    if (sold.length === 0) return { ok: false, coins: 0, count: 0, ids: [], reason: 'Nothing selected to sell.' };
    const coins = sold.reduce((sum, c) => sum + this.valueOf(c), 0);
    this.state.inventory = this.state.inventory.filter((c) => !set.has(c.id));
    this.state.coins += coins;
    this.state.totalCoinsEarned += coins;
    this.state.tutorial.firstSale = true;
    this.state.nextTx++;
    this.commit();
    this.emit({ type: 'sale', coins, count: sold.length });
    return { ok: true, coins, count: sold.length, ids: sold.map((c) => c.id) };
  }
  toggleFavorite(id: string): void {
    const c = this.state.inventory.find((x) => x.id === id);
    if (!c) return;
    c.favorite = !c.favorite;
    this.commit();
  }

  // ---------- shop ----------
  rodStatus(id: string): 'equipped' | 'owned' | 'buy' | 'poor' | 'locked' {
    const s = this.state;
    if (s.equippedRod === id) return 'equipped';
    if (s.ownedRods.includes(id)) return 'owned';
    const idx = RODS.findIndex((r) => r.id === id);
    if (idx > 0 && !s.ownedRods.includes(RODS[idx - 1].id)) return 'locked';
    return s.coins >= RODS[idx].cost ? 'buy' : 'poor';
  }
  buyRod(id: string): ActionResult {
    const rod = RODS_BY_ID[id];
    if (!rod) return { ok: false, reason: 'Unknown rod.' };
    const st = this.rodStatus(id);
    if (st === 'owned' || st === 'equipped') return { ok: false, reason: 'Already owned.' };
    if (st === 'locked') return { ok: false, reason: 'Buy the previous rod first.' };
    if (st === 'poor') return { ok: false, reason: 'Not enough coins.' };
    this.state.coins -= rod.cost;
    this.state.ownedRods.push(id);
    this.state.equippedRod = id;
    this.state.tutorial.firstPurchase = true;
    this.state.nextTx++;
    this.commit();
    this.emit({ type: 'purchase', what: rod.name });
    return { ok: true };
  }
  equipRod(id: string): ActionResult {
    if (!this.state.ownedRods.includes(id)) return { ok: false, reason: 'Not owned.' };
    if (this.state.equippedRod === id) return { ok: true };
    this.state.equippedRod = id;
    this.commit();
    return { ok: true };
  }
  upgradeCost(track: UpgradeTrack): number | null {
    const lvl = this.state.upgrades[track];
    const costs = UPGRADES_BY_ID[track].costs;
    return lvl < costs.length ? costs[lvl] : null;
  }
  buyUpgrade(track: UpgradeTrack): ActionResult {
    const cost = this.upgradeCost(track);
    if (cost === null) return { ok: false, reason: 'Maxed out.' };
    if (this.state.coins < cost) return { ok: false, reason: 'Not enough coins.' };
    this.state.coins -= cost;
    this.state.upgrades[track]++;
    this.state.tutorial.firstPurchase = true;
    this.state.nextTx++;
    this.commit();
    this.emit({ type: 'purchase', what: UPGRADES_BY_ID[track].name });
    return { ok: true };
  }
  buyBobber(id: string): ActionResult {
    const b = BOBBERS.find((x) => x.id === id);
    if (!b) return { ok: false, reason: 'Unknown style.' };
    if (this.state.bobbers.includes(id)) return { ok: false, reason: 'Already owned.' };
    if (this.state.coins < b.cost) return { ok: false, reason: 'Not enough coins.' };
    this.state.coins -= b.cost;
    this.state.bobbers.push(id);
    this.state.equippedBobber = id;
    this.state.nextTx++;
    this.commit();
    return { ok: true };
  }
  /** Grants a cosmetic earned via a completed rewarded ad. Idempotent. */
  grantBobber(id: string): void {
    if (this.state.bobbers.includes(id)) return;
    this.state.bobbers.push(id);
    this.state.equippedBobber = id;
    this.commit();
  }
  equipBobber(id: string): void {
    if (!this.state.bobbers.includes(id)) return;
    this.state.equippedBobber = id;
    this.commit();
  }

  // ---------- misc ----------
  setLure(l: LureId): void {
    this.state.lure = l;
    this.commit();
  }
  unlockLures(): void {
    if (this.state.luresUnlocked) return;
    this.state.luresUnlocked = true;
    this.commit();
  }
  updateSettings(patch: Partial<Settings>): void {
    this.state.settings = { ...this.state.settings, ...patch };
    this.commit();
  }
  markTutorial(k: keyof SaveData['tutorial']): void {
    if (this.state.tutorial[k]) return;
    this.state.tutorial[k] = true;
    this.commit();
  }
  /** Clock fields change continuously; they are saved with the next snapshot or a periodic save. */
  tickClock(dt: number): void {
    this.state.playtime += dt;
    this.state.worldClock += dt;
  }
  flush(): void {
    this.onPersist(this.state);
  }
  reset(): void {
    const settings = this.state.settings;
    this.state = newSave();
    this.state.settings = settings;
    this.reservations = 0;
    this.committedIds.clear();
    this.commit();
  }
  /** Debug-only helper (dev builds). */
  debugAddCoins(n: number): void {
    this.state.coins += n;
    this.commit();
  }
}
