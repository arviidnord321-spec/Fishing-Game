import { RARITY_COLOR, RARITY_GLYPH, RARITY_LABEL } from '../data/balance';
import { BONUS_ICON, BONUS_LABEL, BOOSTS, EGGS, EGGS_BY_ID, PET_MAX_LEVEL, PETS, PETS_BY_ID, PITY, petBonusAt, type EggId } from '../data/pets';
import type { Rarity } from '../data/types';
import { RARITIES } from '../data/types';
import { dailyReward, questLabel, type Reward } from '../logic/meta';
import type { GameStore, HatchResult } from '../logic/store';
import { fmtCoins, fmtTime, h } from './dom';

export interface MetaDeps {
  store: GameStore;
  petThumb: (id: string, silhouette: boolean) => string;
  hatch: (egg: EggId) => HatchResult;
  toast: (text: string, cls?: string, ms?: number) => void;
  rerender: () => void;
  click: () => void;
  reducedMotion: () => boolean;
}

export function rewardText(r: Reward): string {
  const parts: string[] = [];
  if (r.coins) parts.push(`¢ ${fmtCoins(r.coins)}`);
  if (r.meadowTickets) parts.push(`${r.meadowTickets} Meadow Egg ticket${r.meadowTickets > 1 ? 's' : ''}`);
  if (r.reefTickets) parts.push(`${r.reefTickets} Reef Egg ticket${r.reefTickets > 1 ? 's' : ''}`);
  if (r.xp) parts.push(`${r.xp} XP`);
  return parts.join(' + ');
}

function pct(v: number): string {
  return `+${Math.round(v * 100)}%`;
}

/** CSS egg with the egg's shell colors. */
export function eggArt(egg: EggId, cls = ''): HTMLElement {
  const def = EGGS_BY_ID[egg];
  const el = h('div', { class: `egg ${cls}`, 'aria-hidden': 'true' });
  el.style.setProperty('--shell', def.shell);
  el.style.setProperty('--spots', def.spots);
  return el;
}

// ------------------------------------------------------------------ shop: eggs
export function eggsTab(d: MetaDeps): HTMLElement {
  const s = d.store;
  const wrap = h('div', { class: 'eggs' });
  for (const egg of EGGS) {
    const st = s.eggStatus(egg.id);
    const pool = PETS.filter((p) => p.egg === egg.id);
    const odds = h('div', { class: 'odds' });
    for (const r of RARITIES) {
      const v = egg.odds[r];
      if (!v) continue;
      const names = pool.filter((p) => p.rarity === r).map((p) => p.name).join(', ');
      odds.append(h('div', { class: 'odds-row' }, h('span', { style: `color:${RARITY_COLOR[r]}` }, `${RARITY_GLYPH[r]} ${RARITY_LABEL[r]}`), h('b', {}, `${v}%`), h('small', {}, names)));
    }
    const tickets = egg.id === 'meadow' ? s.state.tickets.meadow : egg.id === 'reef' ? s.state.tickets.reef : 0;
    const pity = s.state.eggPity[egg.id];
    let btn: HTMLElement;
    if (!st.unlocked) btn = h('button', { class: 'btn', disabled: true }, `🔒 Reach level ${egg.level}`);
    else if (!st.canAfford) btn = h('button', { class: 'btn', disabled: true }, `Not enough coins (¢ ${fmtCoins(egg.cost)})`);
    else
      btn = h(
        'button',
        { class: 'btn primary hatch-btn', onclick: (e: Event) => { (e.currentTarget as HTMLButtonElement).disabled = true; showHatch(d, egg.id); } },
        st.ticket ? `Open with ticket (${tickets} left)` : `Open · ¢ ${fmtCoins(egg.cost)}`,
      );
    const owned = pool.filter((p) => s.state.pets[p.id]).length;
    wrap.append(
      h(
        'div',
        { class: `egg-card${st.unlocked ? '' : ' locked'}` },
        h('div', { class: 'egg-stage' }, eggArt(egg.id, st.unlocked ? 'idle' : '')),
        h('h3', {}, egg.name),
        h('p', { class: 'cmp' }, egg.blurb),
        h('div', { class: 'collect' }, `Collected ${owned}/${pool.length}`),
        odds,
        h('p', { class: 'cmp' }, `Guaranteed Rare or better within ${PITY} opens · ${Math.max(0, PITY - pity)} to go`),
        btn,
      ),
    );
  }
  return h('div', {}, h('p', { class: 'cmp' }, 'Pets follow you and boost every catch. Duplicates level a pet up (max Lv 5). The odds shown are the exact odds used.'), wrap);
}

// ------------------------------------------------------------------ shop: boosts
export function boostsTab(d: MetaDeps): HTMLElement {
  const s = d.store;
  const list = h('div', { class: 'boosts' });
  for (const b of BOOSTS) {
    const left = s.boostLeft(b.id);
    const cost = s.boostCost(b.id);
    list.append(
      h(
        'div',
        { class: `boost-card b-${b.id}${left > 0 ? ' active' : ''}` },
        h('div', { class: 'boost-ico', 'aria-hidden': 'true' }, b.id === 'coinRush' ? '¢' : b.id === 'luckyCharm' ? '☘' : '⟳'),
        h('div', { class: 'boost-txt' }, h('h3', {}, b.name), h('p', {}, `${b.describe} for ${b.seconds / 60} minutes of play`), left > 0 ? h('p', { class: 'up' }, `Active · ${fmtTime(left)} left (buying again adds time)`) : null),
        h('button', { class: 'btn primary', disabled: s.state.coins < cost, onclick: (e: Event) => { (e.currentTarget as HTMLButtonElement).disabled = true; const r = s.buyBoost(b.id); if (!r.ok) d.toast(r.reason, 'bad'); } }, s.state.coins < cost ? `¢ ${fmtCoins(cost)} needed` : `Buy ¢ ${fmtCoins(cost)}`),
      ),
    );
  }
  return h('div', {}, h('p', { class: 'cmp' }, 'Boosts count down only while you are playing, never while paused or away.'), list);
}

// ------------------------------------------------------------------ pets panel
export function petsBody(d: MetaDeps): HTMLElement {
  const s = d.store;
  const eq = s.state.equippedPets;
  const sum = (['coins', 'luck', 'reel', 'xp'] as const).map((t) => ({ t, v: s.petBonus(t) }));
  const summary = h(
    'div',
    { class: 'pet-summary' },
    h('div', { class: 'slots-row' }, ...Array.from({ length: 3 }, (_, i) => {
      const id = eq[i];
      const unlocked = i < s.state.petSlots;
      return h(
        'div',
        { class: `pet-slot${id ? ' filled' : ''}${unlocked ? '' : ' locked'}` },
        id ? h('img', { src: d.petThumb(id, false), alt: PETS_BY_ID[id].name }) : h('span', {}, unlocked ? 'Empty slot' : '🔒'),
      );
    })),
    h('div', { class: 'bonus-row' }, ...sum.map(({ t, v }) => h('span', { class: `bonus-chip${v > 0 ? ' on' : ''}` }, `${BONUS_ICON[t]} ${pct(v)} ${BONUS_LABEL[t]}`))),
    h(
      'div',
      { class: 'toolbar' },
      h('button', { class: 'btn small cyan', onclick: () => { s.equipBest(); d.click(); } }, 'Equip best'),
      (() => {
        const cost = s.petSlotCost();
        if (cost === null) return h('span', { class: 'cmp' }, 'All 3 slots unlocked');
        return h('button', { class: 'btn small primary', disabled: s.state.coins < cost, onclick: () => { const r = s.buyPetSlot(); if (!r.ok) d.toast(r.reason, 'bad'); } }, `Unlock slot ${s.state.petSlots + 1} · ¢ ${fmtCoins(cost)}`);
      })(),
    ),
  );
  const grid = h('div', { class: 'grid pet-grid' });
  for (const p of PETS) {
    const lvl = s.state.pets[p.id] ?? 0;
    const on = eq.includes(p.id);
    grid.append(
      h(
        'div',
        { class: `card pet-card r-${p.rarity}${lvl ? '' : ' unknown'}${on ? ' equipped' : ''}`, style: `--rc:${RARITY_COLOR[p.rarity]}` },
        h('img', { src: d.petThumb(p.id, !lvl), alt: '' }),
        h('div', { class: 'name' }, lvl ? p.name : '???'),
        h('div', { class: 'rarity', style: `color:${RARITY_COLOR[p.rarity]}` }, `${RARITY_GLYPH[p.rarity]} ${RARITY_LABEL[p.rarity]} · ${EGGS_BY_ID[p.egg].name}`),
        lvl ? h('div', { class: 'stars', 'aria-label': `Level ${lvl} of ${PET_MAX_LEVEL}` }, '★'.repeat(lvl) + '☆'.repeat(PET_MAX_LEVEL - lvl)) : null,
        h('div', { class: 'meta' }, `${BONUS_ICON[p.bonus]} ${pct(petBonusAt(p, Math.max(1, lvl)))} ${BONUS_LABEL[p.bonus]}${lvl && lvl < PET_MAX_LEVEL ? ` · next ${pct(petBonusAt(p, lvl + 1))}` : ''}`),
        lvl
          ? h('button', {
              class: `btn small ${on ? '' : 'cyan'}`,
              onclick: () => {
                if (on) s.unequipPet(p.id);
                else {
                  const r = s.equipPet(p.id);
                  if (!r.ok) d.toast(r.reason, 'bad', 2600);
                }
                d.click();
              },
            }, on ? 'Unequip' : 'Equip')
          : h('div', { class: 'cmp' }, 'Hatch to discover'),
      ),
    );
  }
  return h('div', {}, summary, grid);
}

// ------------------------------------------------------------------ daily
export function dailyBody(d: MetaDeps, today: string, claim: () => void): HTMLElement {
  const s = d.store;
  const info = s.dailyInfo(today);
  const cal = h('div', { class: 'calendar' });
  const curDay = info.day;
  for (let day = 1; day <= 7; day++) {
    // days before today's slot in the current run are done
    const done = info.available ? day < curDay : day <= curDay;
    const isToday = info.available && day === curDay;
    const reward = dailyReward(day, s.state.level);
    cal.append(
      h(
        'div',
        { class: `day${done ? ' done' : ''}${isToday ? ' today' : ''}${day === 7 ? ' big' : ''}` },
        h('small', {}, `Day ${day}`),
        h('div', { class: 'day-ico', 'aria-hidden': 'true' }, reward.reefTickets ? '🥚' : reward.meadowTickets ? '🥚' : '¢'),
        h('div', { class: 'day-txt' }, rewardText(reward)),
        done ? h('div', { class: 'check' }, '✓') : null,
      ),
    );
  }
  return h(
    'div',
    {},
    h('p', { class: 'cmp' }, info.available ? 'Your daily reward is ready! Come back every day to keep the streak. Missing a day restarts at Day 1.' : `Claimed today. Next reward: Day ${(curDay % 7) + 1} tomorrow.`),
    cal,
    h('div', { class: 'toolbar', style: 'justify-content:center;margin-top:12px' }, h('button', { class: 'btn primary big-btn', disabled: !info.available, onclick: claim }, info.available ? `Claim Day ${curDay}: ${rewardText(info.reward)}` : 'Come back tomorrow')),
  );
}

// ------------------------------------------------------------------ hatch reveal
let hatchEl: HTMLElement | null = null;

export function showHatch(d: MetaDeps, egg: EggId): void {
  const res = d.hatch(egg);
  if (!res.ok) {
    d.toast(res.reason ?? 'Could not open the egg.', 'bad');
    d.rerender();
    return;
  }
  const pet = PETS_BY_ID[res.petId!];
  hatchEl?.remove();
  const reduced = d.reducedMotion();
  const card = h(
    'div',
    { class: `hatch-card r-${pet.rarity}`, style: `--rc:${RARITY_COLOR[pet.rarity]}` },
    h('div', { class: 'rays', 'aria-hidden': 'true' }),
    h('img', { class: 'hatch-pet', src: d.petThumb(pet.id, false), alt: pet.name }),
    h('div', { class: 'ribbon' }, `${RARITY_GLYPH[pet.rarity]} ${RARITY_LABEL[pet.rarity]}${res.pityUsed ? ' · guaranteed' : ''}`),
    h('h2', {}, pet.name),
    h('p', { class: 'hatch-bonus' }, `${BONUS_ICON[pet.bonus]} ${pct(petBonusAt(pet, res.level ?? 1))} ${BONUS_LABEL[pet.bonus]}`),
    h('p', { class: 'hatch-state' }, res.isNew ? 'NEW PET!' : res.refund ? `Already max level · +¢ ${fmtCoins(res.refund)} refund` : `Level up! Now Lv ${res.level}`),
  );
  const again = d.store.eggStatus(egg);
  const def = EGGS_BY_ID[egg];
  const footer = h(
    'div',
    { class: 'toolbar', style: 'justify-content:center' },
    h('button', { class: 'btn', onclick: () => { hatchEl?.remove(); hatchEl = null; d.rerender(); } }, 'Close'),
    again.unlocked && again.canAfford
      ? h('button', { class: 'btn primary', onclick: () => showHatch(d, egg) }, again.ticket ? 'Open another (ticket)' : `Open another · ¢ ${fmtCoins(def.cost)}`)
      : null,
  );
  const stage = h('div', { class: 'hatch-stage' }, eggArt(egg, reduced ? 'crack' : 'shake'));
  const box = h('div', { class: 'hatch-overlay', role: 'dialog', 'aria-label': `Hatched ${pet.name}` }, stage);
  document.getElementById('ui')!.append(box);
  hatchEl = box;
  d.click();
  const reveal = () => {
    if (hatchEl !== box) return;
    stage.remove();
    box.append(card, footer);
    (footer.querySelector('.btn.primary') as HTMLElement | null)?.focus();
  };
  if (reduced) reveal();
  else setTimeout(reveal, 1100);
  d.rerender();
}

export function hatchOpen(): boolean {
  return !!hatchEl;
}

// ------------------------------------------------------------------ HUD pieces
export interface QuestView {
  id: string;
  label: string;
  progress: number;
  target: number;
  done: boolean;
  claimed: boolean;
}

export function questViews(s: GameStore): QuestView[] {
  return s.state.quests.list.map((q) => ({ id: q.id, label: questLabel(q), progress: q.progress, target: q.target, done: q.progress >= q.target, claimed: q.claimed }));
}

export function rarityRank(r: Rarity): number {
  return RARITIES.indexOf(r);
}
