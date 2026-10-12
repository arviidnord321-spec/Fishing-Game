import { BAG_CAPACITY, BOBBERS, RODS, RODS_BY_ID, UPGRADES_BY_ID } from '../data/balance';
import { speciesIn } from '../data/species';
import { WORLD_POOL_UNLOCKS, poolName } from '../data/worlds';
import type { CatchRecord, LureId, PermanentPoolId, PoolId, RodDef, UpgradeTrack, WorldId } from '../data/types';
import { BOOSTS_BY_ID, EGGS_BY_ID, PET_MAX_LEVEL, PET_SLOT_COSTS, PETS, PETS_BY_ID, PITY, DUPLICATE_REFUND, petBonusAt, type BoostId, type EggId, type PetBonus } from '../data/pets';
import { saleValue } from './catchResolver';
import { dailyReward, dailyStatus, generateQuests, isRarePlus, levelReward, rollEgg, streakFactor, xpForCatch, xpToNext, type Quest, type QuestKind, type Reward } from './meta';
import type { Rng } from './rng';
import { newSave, type SaveData, type Settings } from './saveSchema';

export type StoreEvent =
  | { type: 'changed' }
  | { type: 'poolUnlocked'; pool: PoolId }
  | { type: 'worldUnlocked'; world: WorldId }
  | { type: 'purchase'; what: string }
  | { type: 'sale'; coins: number; count: number }
  | { type: 'levelUp'; level: number; reward: Reward }
  | { type: 'questComplete'; quest: Quest }
  | { type: 'reward'; reward: Reward; source: string }
  | { type: 'streak'; streak: number; factor: number };

export interface HatchResult {
  ok: boolean;
  reason?: string;
  petId?: string;
  isNew?: boolean;
  level?: number;
  refund?: number;
  pityUsed?: boolean;
}

export type ActionResult = { ok: true } | { ok: false; reason: string };

export interface SaleReceipt {
  ok: boolean;
  coins: number;
  count: number;
  ids: string[];
  reason?: string;
}


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
  /** Species discovered in a pool of the current world. */
  discoveredIn(pool: PoolId, world: WorldId = this.state.world): number {
    return speciesIn(world).filter((s) => s.pool === pool && this.state.journal[s.id]).length;
  }
  /** Species discovered in a world (default: the current one). */
  discoveredCount(world: WorldId = this.state.world): number {
    return speciesIn(world).filter((s) => this.state.journal[s.id]).length;
  }
  /** Starlight Atoll opens once every Sunny Isle species is in the journal. */
  isWorldUnlocked(world: WorldId): boolean {
    return world === 1 || this.discoveredCount(1) >= speciesIn(1).length;
  }
  /** Travel to another unlocked island (the scene reloads around the new world). */
  travel(world: WorldId): ActionResult {
    if (!this.isWorldUnlocked(world)) return { ok: false, reason: 'Catch every Sunny Isle fish to unlock Starlight Atoll.' };
    if (this.state.world === world) return { ok: false, reason: 'You are already there.' };
    this.state.world = world;
    this.state.nextTx++;
    this.commit();
    return { ok: true };
  }

  isPoolUnlocked(pool: PoolId): boolean {
    if (pool === 'meadow' || pool === 'rift') return true;
    const req = WORLD_POOL_UNLOCKS[this.state.world][pool];
    return this.state.ownedRods.includes(req.rod) && this.discoveredIn(req.pool) >= req.species;
  }
  unlockProgress(pool: 'reed' | 'moon'): { rodOwned: boolean; rodName: string; found: number; need: number; fromPool: string } {
    const req = WORLD_POOL_UNLOCKS[this.state.world][pool];
    return {
      rodOwned: this.state.ownedRods.includes(req.rod),
      rodName: RODS_BY_ID[req.rod].name,
      found: this.discoveredIn(req.pool),
      need: req.species,
      fromPool: poolName(this.state.world, req.pool).replace(/ Pool$/, ''),
    };
  }
  unlockedPermanentPools(): PermanentPoolId[] {
    return (['meadow', 'reed', 'moon'] as PermanentPoolId[]).filter((p) => this.isPoolUnlocked(p));
  }

  private checkUnlocks(): void {
    const announced = this.state.world === 1 ? this.state.announcedPools : this.state.world2Pools;
    for (const p of ['reed', 'moon'] as const) {
      if (this.isPoolUnlocked(p) && !announced.includes(p)) {
        announced.push(p);
        this.emit({ type: 'poolUnlocked', pool: p });
      }
    }
    if (!this.state.world2Announced && this.isWorldUnlocked(2)) {
      this.state.world2Announced = true;
      this.emit({ type: 'worldUnlocked', world: 2 });
    }
  }

  valueOf(c: CatchRecord): number {
    return saleValue(c.speciesId, c.weight, c.modifier, this.state.upgrades.sellValue, c.matchFactor, c.bonus ?? 1);
  }

  // ---------- multipliers (pets + boosts + streak) ----------
  /** Sum of equipped pets' bonus of one type, e.g. 0.35 = +35%. */
  petBonus(type: PetBonus): number {
    let sum = 0;
    for (const id of this.state.equippedPets) {
      const pet = PETS_BY_ID[id];
      if (pet && pet.bonus === type) sum += petBonusAt(pet, this.state.pets[id] ?? 1);
    }
    return sum;
  }
  boostLeft(id: BoostId): number {
    return Math.max(0, this.state.boosts[id] - this.state.playtime);
  }
  /** Multiplier locked into a catch at the moment it is landed. */
  catchBonus(streak = this.state.streak): number {
    const rush = this.boostLeft('coinRush') > 0 ? 2 : 1;
    return Math.round((1 + this.petBonus('coins')) * rush * streakFactor(streak) * 1000) / 1000;
  }
  luckMultiplier(): number {
    return (1 + this.petBonus('luck')) * (this.boostLeft('luckyCharm') > 0 ? 2 : 1);
  }
  reelMultiplier(): number {
    return (1 + this.petBonus('reel')) * (this.boostLeft('quickReel') > 0 ? 1.4 : 1);
  }

  // ---------- xp, levels, rewards ----------
  get xpNeeded(): number {
    return xpToNext(this.state.level);
  }
  private addXp(n: number): void {
    this.state.xp += Math.max(0, Math.round(n));
    while (this.state.xp >= xpToNext(this.state.level)) {
      this.state.xp -= xpToNext(this.state.level);
      this.state.level++;
      const reward = levelReward(this.state.level);
      this.applyReward(reward, false);
      this.emit({ type: 'levelUp', level: this.state.level, reward });
    }
  }
  private applyReward(r: Reward, withXp = true): void {
    if (r.coins) {
      this.state.coins += r.coins;
      this.state.totalCoinsEarned += r.coins;
    }
    if (r.meadowTickets) this.state.tickets.meadow += r.meadowTickets;
    if (r.reefTickets) this.state.tickets.reef += r.reefTickets;
    if (withXp && r.xp) this.addXp(r.xp);
  }

  // ---------- quests ----------
  /** Make sure today's quests exist (new set each local day). */
  ensureQuests(today: string): void {
    if (this.state.quests.day === today && this.state.quests.list.length) return;
    this.state.quests = { day: today, list: generateQuests(today, this.state.level) };
    this.commit();
  }
  private progressQuest(kind: QuestKind, amount: number, absolute = false): void {
    for (const q of this.state.quests.list) {
      if (q.kind !== kind || q.claimed || q.progress >= q.target) continue;
      q.progress = Math.min(q.target, absolute ? Math.max(q.progress, amount) : q.progress + amount);
      if (q.progress >= q.target) this.emit({ type: 'questComplete', quest: q });
    }
  }
  claimQuest(id: string): ActionResult {
    const q = this.state.quests.list.find((x) => x.id === id);
    if (!q) return { ok: false, reason: 'Quest not found.' };
    if (q.claimed) return { ok: false, reason: 'Already claimed.' };
    if (q.progress < q.target) return { ok: false, reason: 'Not finished yet.' };
    q.claimed = true;
    this.applyReward(q.reward);
    this.state.nextTx++;
    this.commit();
    this.emit({ type: 'reward', reward: q.reward, source: 'Quest complete' });
    return { ok: true };
  }
  /** Perfect cast counter for quests (called by the fishing controller). */
  recordPerfectCast(): void {
    this.progressQuest('perfect', 1);
  }
  /** An escaped fish ends the hot streak. */
  breakStreak(): void {
    if (this.state.streak === 0) return;
    this.state.streak = 0;
    this.commit();
  }

  // ---------- daily reward ----------
  dailyInfo(today: string): { available: boolean; day: number; reward: Reward } {
    const st = dailyStatus(this.state.daily, today);
    return { ...st, reward: dailyReward(st.day, this.state.level) };
  }
  claimDaily(today: string): ActionResult & { reward?: Reward; day?: number } {
    const info = this.dailyInfo(today);
    if (!info.available) return { ok: false, reason: 'Come back tomorrow for the next reward.' };
    this.state.daily = { lastClaim: today, streak: info.day === 1 ? 1 : this.state.daily.streak + 1 };
    this.applyReward(info.reward);
    this.state.nextTx++;
    this.commit();
    return { ok: true, reward: info.reward, day: info.day };
  }

  // ---------- pets & eggs ----------
  eggStatus(egg: EggId): { unlocked: boolean; canAfford: boolean; ticket: boolean; level: number } {
    const def = EGGS_BY_ID[egg];
    const ticket = (egg === 'meadow' && this.state.tickets.meadow > 0) || (egg === 'reef' && this.state.tickets.reef > 0);
    return { unlocked: this.state.level >= def.level, canAfford: ticket || this.state.coins >= def.cost, ticket, level: def.level };
  }
  /** Open one egg (a ticket is used first when available). One transaction, saved once. */
  hatch(egg: EggId, rng: Rng): HatchResult {
    const def = EGGS_BY_ID[egg];
    if (!def) return { ok: false, reason: 'Unknown egg.' };
    const st = this.eggStatus(egg);
    if (!st.unlocked) return { ok: false, reason: `Reach level ${def.level} to open the ${def.name}.` };
    if (!st.canAfford) return { ok: false, reason: 'Not enough coins.' };
    if (st.ticket) {
      if (egg === 'meadow') this.state.tickets.meadow--;
      else this.state.tickets.reef--;
    } else this.state.coins -= def.cost;
    const roll = rollEgg(egg, this.state.eggPity[egg], PITY, rng);
    const pet = PETS_BY_ID[roll.petId];
    this.state.eggPity[egg] = isRarePlus(pet.rarity) ? 0 : this.state.eggPity[egg] + 1;
    const had = this.state.pets[pet.id] ?? 0;
    let refund = 0;
    if (had >= PET_MAX_LEVEL) {
      refund = Math.round(def.cost * DUPLICATE_REFUND);
      this.state.coins += refund;
    } else this.state.pets[pet.id] = had + 1;
    // fill a free slot automatically so new players see the effect at once
    if (!had && this.state.equippedPets.length < this.state.petSlots) this.state.equippedPets.push(pet.id);
    this.state.eggsOpened++;
    this.state.nextTx++;
    this.progressQuest('hatch', 1);
    this.commit();
    return { ok: true, petId: pet.id, isNew: !had, level: this.state.pets[pet.id], refund, pityUsed: roll.pityUsed };
  }
  equipPet(id: string): ActionResult {
    if (!this.state.pets[id]) return { ok: false, reason: 'Not owned.' };
    if (this.state.equippedPets.includes(id)) return { ok: true };
    if (this.state.equippedPets.length >= this.state.petSlots) return { ok: false, reason: 'All pet slots are full. Unequip one first or buy another slot.' };
    this.state.equippedPets.push(id);
    this.commit();
    return { ok: true };
  }
  unequipPet(id: string): void {
    this.state.equippedPets = this.state.equippedPets.filter((p) => p !== id);
    this.commit();
  }
  /** Equip the strongest pets by total bonus (simple, explainable). */
  equipBest(): void {
    const owned = PETS.filter((p) => this.state.pets[p.id]).sort((a, b) => petBonusAt(b, this.state.pets[b.id]) - petBonusAt(a, this.state.pets[a.id]));
    this.state.equippedPets = owned.slice(0, this.state.petSlots).map((p) => p.id);
    this.commit();
  }
  petSlotCost(): number | null {
    const i = this.state.petSlots - 1;
    return i < PET_SLOT_COSTS.length ? PET_SLOT_COSTS[i] : null;
  }
  buyPetSlot(): ActionResult {
    const cost = this.petSlotCost();
    if (cost === null) return { ok: false, reason: 'All slots unlocked.' };
    if (this.state.coins < cost) return { ok: false, reason: 'Not enough coins.' };
    this.state.coins -= cost;
    this.state.petSlots++;
    this.state.nextTx++;
    this.commit();
    this.emit({ type: 'purchase', what: 'Pet slot' });
    return { ok: true };
  }

  // ---------- boosts ----------
  boostCost(id: BoostId): number {
    const b = BOOSTS_BY_ID[id];
    return b.baseCost + b.perLevel * (this.state.level - 1);
  }
  buyBoost(id: BoostId): ActionResult {
    const b = BOOSTS_BY_ID[id];
    if (!b) return { ok: false, reason: 'Unknown boost.' };
    const cost = this.boostCost(id);
    if (this.state.coins < cost) return { ok: false, reason: 'Not enough coins.' };
    this.state.coins -= cost;
    // stacking extends the timer
    this.state.boosts[id] = Math.max(this.state.boosts[id], this.state.playtime) + b.seconds;
    this.state.nextTx++;
    this.commit();
    this.emit({ type: 'purchase', what: b.name });
    return { ok: true };
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
  commitCatch(rec: Omit<CatchRecord, 'ordinal' | 'favorite' | 'bonus'>): { newSpecies: boolean; newRecord: boolean; xp: number; bonus: number } | null {
    if (this.state.inventory.some((c) => c.id === rec.id) || this.committedIds.has(rec.id)) return null;
    this.committedIds.add(rec.id);
    this.releaseSlot();
    // hot streak counts this fish; pets, boosts and streak are locked into the record now
    this.state.streak++;
    this.state.bestStreak = Math.max(this.state.bestStreak, this.state.streak);
    const bonus = this.catchBonus(this.state.streak);
    const full: CatchRecord = { ...rec, bonus, ordinal: this.state.nextOrdinal++, favorite: false };
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
    this.state.totalCaught++;
    const xp = xpForCatch(rec.rarity, newSpecies, this.petBonus('xp'));
    this.progressQuest('catch', 1);
    if (isRarePlus(rec.rarity)) this.progressQuest('catchRare', 1);
    this.progressQuest('streak', this.state.streak, true);
    this.addXp(xp);
    this.commit();
    const f = streakFactor(this.state.streak);
    if (f > streakFactor(this.state.streak - 1)) this.emit({ type: 'streak', streak: this.state.streak, factor: f });
    return { newSpecies, newRecord, xp, bonus };
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
    this.progressQuest('sell', coins);
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
    if (RODS[idx].world === 2 && !this.isWorldUnlocked(2)) return 'locked';
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
