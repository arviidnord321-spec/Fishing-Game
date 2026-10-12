# Balancing notes

All numbers live in `src/data/balance.ts` and `src/data/species.ts`. They are designed values,
not measurements of the reference recording. Reference odds and economy are unknown.

## Formulas (as implemented)

**Cast quality** (`src/logic/castQuality.ts`)
- The marker ping-pongs 0→1→0 over 1.8 s. The ideal band is [0.86, 0.96].
- `d` = distance from the marker to the band (0 inside). `q = clamp(1 − d/0.86, 0, 1)`,
  `castLuck = 1 + q` (shown with two decimals; this is the exact value used).
- Holding the cast for more than 6 s auto-releases at the current quality.

**Rarity selection** (`src/logic/catchResolver.ts`)
1. Eligible species: matches the pool, the time of day, the event state, and
   `minWeight ≤ rod.maxWeight`.
   During Rift Bloom, the rift pool offers the species of every unlocked permanent pool plus the
   Rift Leviathan.
2. Base tier weights: **Common 65, Uncommon 24, Rare 9, Epic 4, Legendary 2.5**.
3. `L = castLuck × (1 + 0.08 × poolGrowthLevel) × (rift ? 1.5 : 1)`.
   Weights are scaled by Uncommon `L^0.35`, Rare `L^0.65`, Epic/Legendary `L^1`; Common is
   unchanged.
4. Tiers with no eligible species are dropped, then the rest are normalized. A tier is picked
   first, then a species uniformly within it. Adding species to a tier does not change the
   tier's odds (tested).
5. One modifier is drawn from a weighted list. Normal 90 and Gilded 5 are always available,
   Moonlit 5 at night, and Giant 15 and Prismatic 4 only in the open rift. Any modifier whose
   minimum weight would exceed the rod cap is removed first.
6. Base weight is uniform in `[min, min(max, rodCap / weightMultiplier)]`, then the modifier
   multiplier is applied and the result rounded to 0.1 kg without exceeding the cap (tested
   across all rods and pools).

**Sale value** (computed at sale time, so later Sale Value upgrades also apply to fish already in
the bag):
`floor(baseValue × √(weight / minWeight) × modifier.value × (1 + 0.10 × sellLevel) × matchFactor)`
where `matchFactor` is 1.1 if the lure matched the rift current *at cast release*, otherwise 1.

**Reeling** (`src/logic/reelSim.ts`, fixed 1/60 s steps)
- Window width is 0.28, plus the rod bonus, plus 0.10 in Assist mode. Holding moves it right at
  0.62/s; releasing moves it left at 0.48/s.
- Inside the window, progress grows at `rod.reelSpeed / fightSeconds` per second. Outside, it
  drains at 0.07/s. Progress starts at 0.20.
- Slack grows by 1/s outside the window and recovers at 1.8/s inside. The fish escapes at
  2.5 s of slack (3.5 s in Assist) or after 18 s of fighting.
- Fish motion is seeded per catch. Max target speeds:
  - Common: 0.22, changing direction every 1.5–2.5 s.
  - Uncommon: 0.30, every 1–2 s.
  - Rare: 0.38, plus telegraphed bursts of 0.46 for 0.45 s.
  - Epic/Legendary: bursts of 0.55 for 0.6 s, then at least 0.7 s of rest.
  - Every burst is preceded by a 0.25 s fin-flare. Velocity is smoothed with a 0.14 s time
    constant, and bursts aim toward the side with more room.
- The guided first catch uses a gentler profile (0.12/s), a 1 s wait and a 2.5 s hook window,
  and always rolls a common, Normal-modifier fish. This is labeled as tutorial assistance in
  the code.

## Changes from the guide's starting values, and why

The guide's defaults (Epic 1.8, Legendary 0.2, bloom every 6 min / open 75 s, Coppercoil 900,
Stormline 3200) were measured with the simulation below:

| Milestone (median) | Guide defaults | Target | Shipped values |
| --- | --- | --- | --- |
| First purchase | 2.6 min | 2–4 min | 2.6 min |
| Reed Pool | 5.8 min | 8–15 min | 8.1 min |
| Moon Pool | 15.8 min | 20–35 min | 20.2 min |
| All 18 species | **only 1 of 40 runs finished within 3 h** | 45–90 min | **65 min** (p90 105 min, 39/40 within 3 h) |

The bottleneck was the legendary tier. At weight 0.2, the night-only Observatory Whale and the
event-only Rift Leviathan took hours. Following the guide ("adjust requirements or weights rather
than secretly changing advertised odds"), I changed these values:

- Epic 1.8 → **4**, Legendary 0.2 → **2.5**.
- Rift Bloom gives an explicit, displayed **×1.5 luck**, shown in the event banner and in the
  journal odds.
- Rift Bloom runs **every 5 active minutes** (first at 4:00) and stays **open for 90 s**.
- Coppercoil 900 → **1,100**, Stormline 3,200 → **4,000**, so the pool unlocks land inside the
  target ranges.

The journal shows the real per-cast chance for each species. It is computed by the same resolver
the game uses, at ×1.00 and at a perfect cast. There are no hidden pity timers.

## Simulation (`npm run simulate`)

`scripts/simulate-economy.ts` runs 40 seeded players through the real resolver, store, sale
formula, day/night clock and event schedule. Player model:
- Cast quality is about ×1.55 ± 0.35.
- Waits and fights use the real timings, assuming 80% time-in-window.
- Catch success is 92 / 85 / 75 / 62 / 50% by rarity (Common → Legendary).
- Each trip to sell takes 14 s.
- Spending is greedy: the next rod first, then the cheapest upgrade.
- The player fishes where undiscovered species remain, and at the rift whenever it is open.

It is **optimistic**: it ignores exploring, menus, walking between pools and idle time. Real
players will be slower. Treat these numbers as lower bounds.

Latest output (shipped values):

```
milestone        p10        median     p90        reached
firstCatch       0.4 min    0.4 min    0.4 min    40/40
firstSale        0.8 min    0.8 min    0.9 min    40/40
firstPurchase    2.5 min    2.6 min    2.8 min    40/40
reed             5.5 min    8.1 min    8.5 min    40/40
moon             17.0 min   20.2 min   23.7 min   40/40
starweaver       27.3 min   30.8 min   35.0 min   40/40
leviathan        35.6 min   45.3 min   85.2 min   40/40
all              44.9 min   65.4 min   104.8 min  39/40
still missing at cutoff: observatory-whale×1
```

## Tuning knobs worth playtesting next

- `BALANCE.reel.*`: whether the meter feels fair with a mouse, a keyboard and one thumb. The
  bot clears commons easily, but human feel has not been measured yet.
- `rarityWeights.legendary` and `event.riftLuck`: they control how long the collection tail is.
- `UPGRADES[*].costs` and `RODS[*].cost`: how fast the mid-game moves.
- `bite.window`: 1.8 s by default, 2.5 s in Assist mode and the tutorial.

Do not tune progression around ads. The only ad hook (Full Launch build) is an optional cosmetic
bobber that can also be bought for 300 earned coins.
