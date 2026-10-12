# Rift Fishing

An original third-person 3D fishing progression game for the browser. Walk around a small island,
cast into magical portal pools, time the cast, fight the fish in a hold/release reeling meter,
reveal a surprisingly large original creature, sell it, and upgrade your rods and pools. Every few
minutes a **Rift Bloom** opens a giant portal pool in the south clearing.

*Rift Fishing* is a working title; check that the name is available before release.

- **Engine:** TypeScript + Three.js (WebGL), HTML/CSS UI, no physics engine.
- **Assets:** everything is generated at runtime. Models are procedural primitives, textures are
  canvas-drawn, sounds are synthesized with Web Audio, and text uses system fonts. No asset
  files are shipped (see `ASSET_LICENSES.md`).
- **Platforms:** standalone static hosting, plus CrazyGames *Basic* and *Full* build modes behind a
  typed platform adapter (see `PLATFORM_NOTES.md`).

## Quick start

```bash
npm install
npm run dev            # http://localhost:5173 (debug overlay on)
npm test               # 64 deterministic logic/save/platform/quality/meta tests
npm run build          # standalone release build  -> dist/
npm run preview        # serve dist/ locally
```

Other commands:

| Command | Output | Notes |
| --- | --- | --- |
| `npm run build:basic` | `dist-crazygames-basic/` | CrazyGames SDK v3 for gameplay events and Data-module saves. **Monetization off.** The default submission build. |
| `npm run build:full` | `dist-crazygames-full/` | Adds the optional rewarded cosmetic. Use **only** after CrazyGames invites the game to Full Launch. |
| `npm run build:qa` | `dist-qa/` | Release code plus the debug overlay and cheat buttons (coins, trigger Rift Bloom, skip time). For testing only; never ship it. |
| `npm run simulate` | console | Seeded economy simulation (see `BALANCING.md`). |
| `npm run package:basic` | `rift-fishing-crazygames-basic.zip` | Basic build zipped for upload (root `index.html`, relative assets). |
| `npm run typecheck` | — | `tsc --noEmit` |

All builds use relative asset paths (`base: './'`), so they work from any subdirectory.

### Browser QA scripts

Each script drives a real Chromium page (`playwright-core`, pre-installed Chromium) with real
keyboard and pointer input. The bot reads only the meters a player can see.

```bash
npm run build && npx vite preview --port 4173 &
node scripts/qa-play.mjs http://localhost:4173/ qa-output/desktop 1280 720
node scripts/qa-play.mjs http://localhost:4173/ qa-output/touch 800 450 --touch
npm run build:qa && npx vite preview --outDir dist-qa --port 4174 &
node scripts/qa-event.mjs http://localhost:4174/ qa-output/event
```

## Controls

| Action | Keyboard / mouse | Touch |
| --- | --- | --- |
| Walk | WASD or arrow keys (rebindable) | Drag on the left side (virtual joystick) |
| Look around | Right-drag (or middle-drag) | Drag on the right side |
| Zoom | Mouse wheel | Pinch |
| Cast / hook / reel | Hold and release Space, Enter, or left-click | The big action button |
| Interact (stand, workshop) | E, or the on-screen button | On-screen button |
| Bag / Journal | B / J, or HUD buttons | HUD buttons |
| Pause & settings | P, or the pause button | Pause button |
| Cancel a cast before the bite | X, or the Cancel button | Cancel button |

The game never uses Escape, Ctrl/Cmd shortcuts or pointer lock. It suppresses page scrolling only
for keys it handles. Held inputs are released on blur, on a hidden tab, and when a menu opens, so
the next action always needs a fresh press.

## How it plays

1. Stand at the edge of a pool, between 0.35 m and 2 m from the water. Hold **Cast**; the marker
   ping-pongs, and releasing in the gold band gives **Perfect ×2.00** luck. Luck changes the odds,
   never whether the cast lands.
2. The bobber twitches twice, then dips (with a splash, a ring, a sound and **FISH ON!**). Press
   again to hook. A button you were already holding does not count.
3. **Reeling:** hold to move the green window right, release to move it left, and keep the fish
   marker inside. Progress fills while it is inside. Line slack builds while it is outside; too
   much slack, or 18 seconds of fighting, and the fish escapes. Telegraphed fin-flares warn
   before rare fish burst.
4. The catch is saved to your bag first; then the 3D reveal plays. Sell at the **Fish Stand**,
   then buy rods and upgrades at the **Workshop**.
5. **Reed Pool** unlocks once you own Coppercoil and have discovered 4 Meadow species. **Moon Pool**
   unlocks once you own Stormline and have discovered 4 Reed species. Moon Pool's epic and
   legendary fish only appear at night.
6. **Rift Bloom:** the first one starts after 4 active minutes, then every 5 minutes. It gives
   15 s notice, then stays open for 90 s, with ×1.5 luck, Giant and Prismatic modifiers, and the
   Rift Leviathan. Match your lure (Sun ●, Leaf ▲, Moon ☾) to the current symbol for +10% value.

Failing a cast costs nothing. There is no energy, no lives, and nothing to pay for. Assist mode
(pause → Settings) widens the window, extends hook time and allows more slack, with the same
rewards.

## Project layout

```
src/data/        balance.ts (all tuning), species.ts, types.ts
src/logic/       pure, deterministic, tested: castQuality, catchResolver, reelSim, fishing (state
                 machine), store (economy/inventory/progression), saveSchema, dayNight,
                 eventDirector, pause, rng
src/platform/    platform.ts (standalone / CrazyGames adapter), saveRepository.ts
src/game/        app.ts (fixed-step loop + wiring), world, character, fishModels, camera, player,
                 input, effects, audio, npcs, thumbs, bake (draw-call merging), water shaders
src/ui/          ui.ts (HUD + panels), dom.ts, styles.css
tests/           vitest suites
scripts/         economy simulation, Playwright QA scripts
```

Gameplay advances on a fixed 1/60 s step with interpolated rendering. Time spent in the background
is discarded, so a fight never fast-forwards. Gameplay randomness uses an injected seeded RNG;
cosmetic randomness (particles, bobber jitter) is separate.

## Pets, levels, daily rewards and quests

All of these use **earned coins only**. Nothing can be bought with real money.

- **Pets.** Open eggs at the **Pet Eggs** hut or in the 🛒 Shop:
  - **Meadow Egg:** ¢300.
  - **Reef Egg:** ¢2,500, from level 5.
  - **Star Egg:** ¢15,000, from level 12.

  Each egg's exact odds are printed on it. You are guaranteed a Rare or better within 10
  opens. There are 18 original pets, and each boosts catch value, luck, reel speed or XP.
  Duplicates level a pet up (max Lv 5, +25% of its base bonus per level). A duplicate of a
  maxed pet refunds 40% of the egg price. Pets follow you around the island, flying or
  hopping, and epic and legendary pets sparkle. Each pet is its own animated model built in code
  (`src/game/petModels.ts`); dev and QA builds have a pet gallery at `?gallery`. You start with 1 pet slot; slots 2 and 3 cost
  ¢1,500 and ¢8,000.
- **Boosts** (Shop → Boosts):
  - Coin Rush: ×2 catch value.
  - Lucky Charm: ×2 luck.
  - Quick Reel: +40% reel speed.

  Each lasts 5 minutes of *active* play, buying again adds time, and the price scales with
  level.
- **Hot streak.** Land fish in a row without losing one: ×1.1 at 3, ×1.2 at 5, ×1.3 at 10.
- **Catch bonus.** Pets, boosts and streak are locked into each catch when it's landed. The
  reveal card shows the total ("Bonus ×1.27").
- **Levels and XP.** XP comes from catches; rarer fish and new species give more. Every level
  pays coins, every 3rd level gives a Meadow Egg ticket, and every 10th a Reef Egg ticket.
- **Daily reward.** A 7-day calendar (coins, egg tickets, a big day 7) opens automatically
  between casts on your first visit each day. Missing a day restarts at Day 1.
- **Daily quests.** Three new quests every local day, for example "Catch 12 fish", "Land 4
  perfect casts" or "Hatch 1 pet". They pay coins, XP and a ticket.
- **Popups.** Level-ups, quest completions, streaks and rewards appear as short banners that
  never pause the game. Modal panels (daily reward, hatching) only open between casts, never
  during a fight.

## Graphics quality and performance

Pause → Settings → **Graphics quality** offers Auto (default), Low, Medium and High. **Show FPS**
puts a frame-rate chip with the active level in the corner.

| Preset | Max pixel ratio | Grass tufts | Water | Terrain | Wind | Particles | Extras |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Low | 1.0 | 700 | flat gradient, no waves | plain color | off | ×0.45 | no stars or lamp halos; villagers animated every 3rd frame |
| Medium | 1.25 | 1,800 | waves + caustics | painted patches | on | ×0.75 | all |
| High | 1.75 | 5,200 | waves + caustics | painted patches | on | ×1 | all |

**Auto** chooses a starting level from device hints:
- Software renderers (SwiftShader/llvmpipe, which blocklisted GPUs and some Chromebooks fall back
  to) start on Low.
- Touch devices start on Low, or Medium when they have 8+ cores and 6 GB+ memory.
- Desktops start on Medium, or High with 8+ cores.

While you play, Auto then measures real frame times in 2-second windows and moves along a
seven-rung ladder (low 60% → … → high 100% resolution). It steps down after about 4 s below
47 fps, and steps up after about 16 s at 57 fps or more. It never climbs back onto a rung that
already proved too slow, so a 60 Hz display can't make it oscillate. Paused or hidden time is
never measured.

Antialiasing is chosen when the GL context is created:
- on for Medium and High,
- off for Low,
- in Auto, off on touch devices and high-DPI screens.

Changing it needs a reload.

Other performance work in the code:
- Static props and character limbs are baked into a few merged meshes.
- Grass is instanced in spatial chunks that are frustum-culled and hidden beyond 42 m.
- The render loop allocates no new vectors.
- HUD code never reads layout every frame.
- Particles skip GPU uploads when none are alive.
- The world redraws at ⅓ rate behind menus.

Measure with `node scripts/bench.mjs <url> <label> [w] [h] [quality]` (see `QA_REPORT.md`
for results).

## Tested environments

See `QA_REPORT.md` for exactly what was run and what still needs a real device. In short: the
automated checks ran in headless Chromium 141 (SwiftShader software WebGL) on Linux. **Safari, iOS,
Android, Chromebook and real touch hardware have not been tested.**
