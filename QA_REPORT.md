# QA report

## Round 7: pool ambience, Starlight Atoll, pet portraits, funk music (latest)

**Pools** (`src/game/poolFx.ts`, `src/game/water.ts`)
- Every 45–95 s, each pool slowly shifts teal → deep blue (hold) → violet (hold) → back. The pools
  are staggered so they never all change at once.
- 34 glowing motes drift over each pool. They are drawn in one call, animated in the vertex
  shader, and their colour follows the mood.
- Every 5–14 s a fish leaps out of a pool you're not fishing in, with splashes, rings and
  ripples.
- Lily pads with flowers float near the rims.
- The QA build has a "Pool mood" debug button.

**Starlight Atoll** (`src/data/worlds.ts`, `src/game/worldTheme.ts`)
- Unlocks once all 18 Sunny Isle species are in the journal. There is a one-time
  "NEW WORLD UNLOCKED!" banner, and the World button wiggles.
- It has 18 new species, 4 new rods, renamed pools with their own unlock rules, and its own event
  legendary.
- The island is themed in pastel twilight colours.
- Travel is gated: saves load back into world 2 only if the journal really unlocked it.
- The journal has island tabs.
- The QA build has a "Finish journal" debug button.

**Pets.** Your painted portraits (and silhouettes) from the redesign sheet replace the 3D renders
in pet cards, slots and the hatch reveal.

**Music.** The old pentatonic tune is replaced by a funk groove:
- a 104 BPM lookahead sequencer;
- kick, snare with ghost notes, and swung hats;
- a popping synth bass;
- wah "chicken-scratch" stabs and an electric-piano pad over a Dm9–G9–Fmaj9–Em11 loop;
- melody licks.

At night it plays laid back at 92 BPM. An offline render (`window.__riftMusic` in QA builds) peaks
at 0.46 by day and 0.27 at night, with no clipping.

**Verification**
- 93/93 unit tests pass. New ones cover:
  - world separation in the catch resolver;
  - each world-2 pool being landable with the rod that unlocks it;
  - unlock and travel rules, announcing the unlock once, and world-2 rod gating;
  - per-world pool unlocks;
  - save round-trip, and the forged-save fallback.
- Browser runs with no console errors:
  - the full world flow: locked panel → Finish journal → banner → travel card → atoll → new
    rods → 3 catches of new species → journal tabs;
  - `qa-pets`, `qa-play`, `qa-event` and `ui-tour`.
- Start view: 125 → 130 draw calls.
- FPS on CPU SwiftShader, interleaved runs: 10.9 vs 11.5 average, about 5% lower, which is
  borderline noise. Not measured on a real GPU.

---

## Round 6: 12 eggs

The egg lineup went from 3 to 12, drawn after the owner's egg sheet as SVG (`src/ui/eggArt.ts`).

**Art.** Each egg has a gradient shell with clipped patterns, an ink outline, a shine, and its own
decorations:
- Meadow: leaves.
- Reef: coral and a shell.
- Star: stars and a gold band.
- Blossom: lotus petals.
- Ember: lava cracks and a flame.
- Frost: ice shards and a snowflake.
- Storm: lightning and clouds.
- Crystal: facets and a gem.
- Sunken: a spiral, kelp and pearls.
- Lunar: crescent moons.
- Solar: a sun with rays and a crown.
- Rift: horns and glowing cracks.

**Gameplay.**
- Every egg is in the shop on its own themed card, with a price tag, level lock, exact odds,
  pet names per tier, a pity counter and a collection count.
- Every egg works in the hatch animation and reveal.
- Prices span ¢120 to ¢150,000, with level gates from 1 to 20.
- New cheaper eggs: Blossom (¢120), Ember (¢900), Frost (¢1,600).
- New pricier eggs: Sunken, Storm, Crystal, Lunar, Solar and Rift.
- The late eggs drop low tiers: Storm has no commons, Lunar is Rare+, and Rift is Epic or
  Legendary only.
- Each egg hatches from an explicit themed pool of the existing 18 pets. Pet cards list the eggs a
  pet comes from.
- Old saves keep their Meadow, Reef and Star pity counters, and new eggs start at 0.

**Verification.**
- 3 new unit tests (88/88 pass):
  - 12 eggs, priced in ascending order;
  - odds sum to 100, and every listed tier has a pet in the pool;
  - every pet is hatchable from some egg;
  - every egg opens at its level and hatches only from its own pool;
  - old 3-egg saves load.
- The existing ±1.5% odds test covers all 12 eggs.
- Browser checks with no console errors:
  - shop at 1280×720 and 844×390 touch;
  - Storm and Blossom hatches;
  - `qa-pets` and `qa-play`.

---

## Round 5: UI overhaul and world look

**UI.** Every screen was restyled in a chunky, toy-like style common to popular Roblox simulator games. No Roblox
assets or branding are used.
- **Font and icons.**
  - Bundled the Fredoka font (SIL OFL), with dark-outlined text.
  - New SVG icon set (`src/ui/icons.ts`) replaces emoji, which looked different on every OS.
- **Buttons.**
  - Glossy 3D buttons (green buy, blue, red, yellow).
  - Big colour-coded menu buttons (Bag, Book, Shop, Pets).
  - Square icon buttons (gift, settings).
  - A big round CAST button that turns red and pulses for HOOK!.
- **HUD.**
  - Currency capsules with a "+" to the shop.
  - A star level badge with an XP bar.
  - Icon chips for streak and boosts.
  - An orange quest board.
  - A day/night pill with sun and moon icons.
- **Panels.**
  - Blue framed panels with a title icon and a red ✕, icon tabs, and rarity-coloured item cards.
  - Egg cards with per-egg colours.
  - An EQUIPPED tag on pet cards.
  - Daily calendar tiles.
  - A rarity-coloured catch card with a big green Continue button.
  - Celebration banners with icons.
- **Minigames and feedback.**
  - Heart line-integrity indicators and a labelled progress bar.
  - Big outlined "FISH ON!".
  - Outlined world labels, and green interaction prompts.
- **Small screens.**
  - Short screens (≤560 px tall) compact everything. The menu row, quests and chips hide while
    casting or reeling.
  - Portrait phones get a compact top bar, and the goal banner moves to the right side.
  - Shop tabs become icon-only under 760 px.
- **Stacking.** Panels now sit above the HUD and toasts above panels.

**World.**
- 16 drifting low-poly clouds (one merged mesh, one draw call), tinted at night.
- An animated shore-foam band on medium/high quality.
- Paths merged into one mesh plus thin darker edging (21 → 2 draw calls).
- Slightly richer ground-texture variation.

**Verification.**
- `scripts/ui-tour.mjs` screenshots every screen with a mid-game save:
  - HUD, daily, bag, the five shop tabs, hatch, pets, journal and pause;
  - cast, bite, reel, catch and stand.
- It was run at 1280×720, 844×390 touch and 390×844 touch, and iterated until there were no
  overlaps or clipping. Fixes found that way:
  - the sun icon was invisible on the dark pill;
  - the level star drew above panels;
  - the goal banner and top-right buttons collided on phones;
  - the reel meter covered the menu on short screens;
  - shop tab icons were hidden on narrow screens;
  - the hatch reveal overflowed short screens;
  - the path strips faced downwards and rendered dark.
- 85/85 unit tests pass. These all pass with no console errors:
  - `qa-pets`;
  - `qa-play` (desktop and 800×450 touch);
  - `qa-event` (Rift Bloom);
  - `qa-misc` (hidden tab, panel churn, night).

**Performance.** `scripts/fps-probe.mjs`, start view, previous commit vs this one, interleaved runs, headless
Chromium on **CPU SwiftShader** (so the auto preset is low):
- The first version cost about 8–12%. Hiding the UI isolated it to the 3D additions, and per-feature
  switches (`?exp=noclouds,nofoam`) found:
  - the shore foam: a wide transparent band;
  - the path border: drawn as a full underlay.
- Fixes: the foam is now medium/high only and narrower, and the border is only thin edge strips.
- After: 9.7–12.2 fps vs 10.9–12.4 fps before, which is within run-to-run noise.
- Start view: 142 → 125 draw calls; 31.7k → 41k triangles (the clouds).
- Real-GPU frame rates were **not** measured.

---

## Round 4: pet redesign from the reference sheet

All 18 pets were rebuilt from the supplied redesign sheet (`src/game/petKit.ts`, `src/game/petModels.ts`).
The ids, names, rarities, bonuses, eggs and save format are unchanged.

**Models**
- Each pet has its own anatomy, built from ellipsoids, tapered tubes, extruded plates and cones:
  - quadruped dogs, foxes and dragons with diagonal leg pairs;
  - a crab with jointed pincers and six legs;
  - a jelly bell with a scalloped rim and two tentacle sets;
  - a flat manta with wide fins;
  - an upright otter with a paddle tail;
  - an owl, a phoenix and a seraph with wings, and a whale with a fluke.
- Animated parts (body, head, eyes, ears, tail, wings, leg pairs, claws, tentacles, arms, flame,
  halo) are each baked into one vertex-coloured mesh with shared materials. There are no per-pet
  lights, textures or particles.

**Budget** (`npx vite-node scripts/pet-tris.ts`)
- 2,028–4,058 triangles per pet, averaging about 3,100.
- 5–9 draw calls per pet.
- The heaviest are the three dragons, at about 3.7–4.1k.

**Animation**
- Breathing, blinking, head sway and ear twitches on every pet.
- Tails swish; the whale's tail moves up and down.
- Wings: flyers flap, the ray's fins undulate, the whale's flippers paddle slowly, and grounded
  dragons and the owl give an occasional flutter.
- Diagonal leg pairs step from the pet's own moved distance, with a hop bounce when moving.
- The crab's pincers open and close, and its legs shuffle.
- The jelly bell pulses, and its two tentacle sets sway out of phase.
- Halos bob without spinning.
- Each pet gets a random phase offset.

**Dev gallery** (dev and `--mode qa` builds only; not in the release bundle):
- Open with `?gallery`.
- All 18 pets with name and triangle labels.
- Drag to orbit, wheel to zoom, click a name to focus.
- Front, 3/4, side, back, top and gameplay-distance presets, plus solo, idle/walk and pause.
- Live draw-call and triangle stats.

**Verification**
- New `tests/petModels.test.ts` (21 tests) checks:
  - the 18 ids are unchanged and each has its own model;
  - triangle (≤4,200) and mesh (≤10) budgets;
  - the rig parts exist;
  - 300 frames of walk and idle animation stay finite, and the body returns to rest;
  - baked geometry is disposed.
- **85/85 unit tests pass.**
- Contact sheets from front, 3/4, side and back, plus walk and animation time-strips, were
  compared against the sheet over several passes.
- Fixes found that way:
  - Wings and fins were attached one body-height too low.
  - Noses sat above the eyes.
  - Ray fins z-fought.
  - Legs were too long and thin.
  - Moth and phoenix wings were too small.
  - Faceted wing outlines.
  - Thumbnail pets and halo geometry were never disposed.
- `scripts/qa-pets.mjs` passes (hatch reveal, collection cards, slots, followers in the world),
  with no console errors.
- `scripts/qa-play.mjs` passes the 1280×720 full loop with no errors.

**Performance**, measured with `scripts/pet-perf.mjs`: the QA build at 1280×720, start view, 3 runs
each, with the three heaviest pets equipped. This is headless Chromium on **CPU SwiftShader**, so
the absolute FPS says nothing about real GPUs.

| | 0 pets | 3 pets |
| --- | --- | --- |
| Old pet models | 11.6–12.6 fps · 142 calls · 31.7k tris | 10.8–10.9 fps · 166 calls · 38.6k tris |
| New pet models | 10.9–11.7 fps · 142 calls · 31.7k tris | 10.9–12.1 fps · 171 calls · 43.5k tris |

FPS differences are within run-to-run noise. Three new pets cost +5 draw calls and +4.9k
triangles more than three old ones.

**Limitations**
- The pets are modelled from simple primitives with vertex colours. They match the sheet's
  shapes, colours and features, not its painted shading or fur detail.
- At full running speed, pets bound and hop. Leg phase follows the distance moved, but short legs
  cannot plant for a whole stride, so a little foot slip remains at sprint speed.
- Not checked on real devices.

---

## Round 3: pets, eggs, shop, levels, daily rewards, quests, popups

Unit tests: **64/64 pass**. 14 are new in `tests/meta.test.ts`:
- **Eggs:** published odds hold within ±1.5 points over 40,000 rolls per egg; pity guarantees
  a rare-or-better on the 10th open.
- **Hatch transaction:** charges once, level gates hold, tickets are used first, and new pets
  auto-equip.
- **Duplicates:** level a pet up, then refund once it's maxed.
- **Slots and bonuses:** slot limits hold; bonuses add up.
- **Catch bonus:** locked at landing.
- **Boosts:** Coin Rush ×2 expires with active play time; buying again extends it.
- **Hot streak:** steps at 3/5/10 and breaks on an escape.
- **Levels:** XP level-ups pay rewards.
- **Daily streak:** once per day, continues on consecutive days, resets after a gap, wraps
  after day 7, and handles the year boundary.
- **Quests:** deterministic per day; progress and claiming work, and a quest pays only once.
- **Saves:** v1 → v2 migration keeps coins and catches; meta progression round-trips; invalid
  pets are dropped.

Browser runs (headless Chromium, SwiftShader):

| Run | Result |
| --- | --- |
| `scripts/qa-pets.mjs` (QA build) | ✅ first catch, then the daily reward panel auto-opened between casts and claimed ¢100. Shop opened from the HUD on the Eggs tab. 5 Meadow eggs cost exactly ¢1,500, with NEW and level-up reveals. Boost bought, pet slot 2 bought, "Equip best" filled 2 slots. Next catch showed `Bonus ×2.00`/`×2.42` and the +XP tag. No console errors. |
| 1280×720 keyboard/mouse full loop (release build) | ✅ 3/3 caught, sold, upgrade bought, persisted after reload, no errors |
| 800×450 touch full loop (release build) | ✅ joystick, 3/3 caught, sold, persisted, no errors |

Bugs found and fixed in this round:
- The Pet Eggs hut and the Fish Stand overlapped in reach, and the hut always won, so a
  player at the stand opened the egg shop. Now the nearest interactable wins, and the hut was
  moved 1 m farther away.
- The HUD Shop button opened the Rods tab; it now opens Eggs.
- Pet belly patches showed jagged seams, and the belly hid the smile.
- Followers were too small, and faced away from the camera at rest.

Not verified: how engaging it feels with real players (needs playtesting), and emoji rendering
of some HUD icons (🛒 🐾 🎁 🥚). Those rely on the player's system emoji font, and headless
Linux renders them in grey.

---

## Round 2

## Round 2 details: visual upgrade and performance

**What changed:**
- Painted terrain patches; about 1,800 clustered, wind-swayed grass tufts at Medium.
- Teal depth-gradient water with vertex waves, caustics and four ripple slots.
- Splash mist.
- Re-rigged angler with elbows, knees and torso twist, and new cast, reel-crank, celebrate and
  idle animations.
- Cleaner HUD: status card, rarity-ribboned reveal card with a value count-up, rarity-striped
  inventory with sort chips, and shop stat bars.
- Quality presets with Auto adjustment and an FPS readout.

**Before/after frame rate.** Same machine and same headless Chromium, 1280×720, `scripts/bench.mjs`.
This renderer is **SwiftShader (CPU)**, so treat absolute numbers as a worst-case slow device,
not a gaming PC. "Before" is the previous commit's build.

| Build / setting | Idle view | Camera orbit | Walking | Worst frame (idle) |
| --- | --- | --- | --- | --- |
| Before (old default) | 7.5 fps | 17.8 fps | 27.8 fps | 383 ms |
| **After, Auto (new default)** | **11.1 fps** | **29.1 fps** | **50.2 fps** | **183 ms** |
| After, fixed Low | 9.7 | 19.8 | 30.4 | 267 ms |
| After, fixed Medium | 6.0 | 12.2 | 17.2 | 333 ms |
| After, fixed High | 4.3 | 9.9 | 15.0 | 409 ms |

How to read this:
- Auto detected the software renderer, started on Low, and lowered resolution to 80% and then
  60%. On this worst-case device the default experience got **+48% to +80% fps** with shorter
  worst frames.
- Fixed Medium/High are *heavier* than the old build here. That is expected: more grass
  triangles and antialiasing are costly on a CPU rasterizer.
- Measured with feature switches (`?exp=` in the QA build) at Medium on this renderer:
  - Antialiasing costs about 30% (fps 4.4 → 6.0 with it off).
  - Grass costs about 30% without antialiasing (7.2 → 10.1 with it removed).
  - Water detail, villagers and the character are within noise.
- **Real-GPU frame rates were not measured**, because no GPU is available in this environment.
  On a real device, Auto keeps adjusting if it can't hold about 47 fps.

Main-thread JavaScript stays at roughly 1–4 ms per frame in normal scenes, so CPU-side game
logic is not the limit.

**Regression runs on the round-2 build:**

| Run | Result |
| --- | --- |
| 1280×720 keyboard/mouse full loop | ✅ 3/3 caught, sold ¢89, persisted after reload, no errors |
| 800×450 touch full loop (joystick + action button) | ✅ joystick x 0 → 3.04; 3/3 caught; sold; persisted; no errors |
| Hidden tab mid-fight | ✅ progress frozen (21.67% → 21.67%), still Reeling on return |
| Menus opened/closed 100× | ✅ DOM nodes 100 → 99; no stuck pause reasons |
| Night | ✅ readable |
| Unit tests | ✅ 50/50, including 6 new auto-quality tests (stays put in band, steps down resolution-first, never retries a failed rung, ignores pauses) |
| CrazyGames compliance sweep | ✅ see `PLATFORM_NOTES.md` checklist |

Not re-run in round 2:
- The Rift Bloom event script (event logic is unchanged and covered by unit tests).
- The 907×510 and 821×462 sizes.

---

## Round 1

**Date:** 12 Oct 2026

**Environment:**
- Linux container, Node 22.22.
- Chromium 141.0.7390.37 headless via `playwright-core` 1.56.1, using SwiftShader *software*
  WebGL. That renderer is far slower than a real GPU, so fps figures below are not
  representative of real hardware.

Status legend:
- ✅ passed in a real run
- ⚠️ partially verified (details given)
- ❌ failed
- ⏳ not performed (requires a device, the Portal, or a human)

## How to reproduce

```bash
npm test                                                       # 44 unit tests
npm run simulate                                               # economy simulation
npm run build && npx vite preview --port 4173 &
node scripts/qa-play.mjs http://localhost:4173/ out 1280 720   # full loop, keyboard + mouse
node scripts/qa-play.mjs http://localhost:4173/ out 800 450 --touch
npm run build:qa && npx vite preview --outDir dist-qa --port 4174 &
node scripts/qa-event.mjs http://localhost:4174/ out-event     # Rift Bloom, lures, relocation
node scripts/qa-misc.mjs  http://localhost:4174/ out-misc      # hidden tab, panel churn, night, journal
```

The browser bot uses real `keydown`/`keyup`, pointer events and clicks. It reads only on-screen
meters, plus a read-only state snapshot (`?qa`) for assertions.

## Automated unit tests (vitest): 44/44 pass

`tests/logic.test.ts`, `tests/save.test.ts`, `tests/platform.test.ts` cover these acceptance
checks:

| # | Check | Result |
| --- | --- | --- |
| 2 | Cast quality is deterministic and always ×1–×2 | ✅ |
| 3 | A button held from before the bite does not hook; the bot shows "Tap when the bobber dips" | ✅ |
| 4 | Fish can be caught (tracking policy) and lost (bad policy) by the reel rules | ✅ |
| 5 | The same input trace at 30 Hz and 144 Hz render rates gives the same catch and money | ✅ (fixed-step sim; the trace is defined in sim time) |
| 6 | `commitCatch` twice with the same ID adds one item | ✅ |
| 8 | Sell All excludes favorites, removes the right IDs, and pays the quoted amount once; a repeat sell pays nothing | ✅ |
| 9 | Double purchase charges once; coins never go negative; a locked rod can't be bought | ✅ |
| 10 | Full bag blocks casting with the "Bag full" reason | ✅ |
| 11 | Each permanent pool has eligible fish with the rod that unlocks it | ✅ |
| 12 | Weight and modifier never exceed rod capacity (400 rolls × 6 rods × 4 pools) | ✅ |
| 13 | Tier probabilities normalize after filtering; extra species in a tier don't change tier odds | ✅ |
| 14 | A hooked night-only fish stays valid after dawn | ✅ |
| 15 | Rift attempts continue in grace; new casts are rejected; the attempt is cancelled with no penalty at close | ✅ |
| 16 | Lure bonus is locked at release and applied once | ✅ |
| 17 | All 18 species are reachable with some rod/condition, with no ads or payments | ✅ (logic); ✅ simulation reached all 18 in 39/40 runs within 3 h |
| 19 | Missing / corrupt (backup restore + quarantine) / unsupported (read-only) / read-error (no overwrite) saves behave differently | ✅ |
| 21 | Missing SDK reports failure → standalone fallback; Basic mode never requests ads | ✅ |
| 22 | Gameplay start/stop are deduplicated | ✅ |
| 24 | Rewarded ad: success settles once, late callbacks ignored, error / no-fill / synchronous throw grant nothing, concurrent requests rejected | ✅ |
| 25 | Closing one of two pause reasons does not resume | ✅ |
| — | Save round-trip; repairs keep valid data; capacity raised so no restored catch is lost; writes coalesce; `suspend()` stops writes after an account change | ✅ |

## Browser runs (real Chromium, real input)

| Run | Result |
| --- | --- |
| **1280×720 desktop**, keyboard + mouse: 3 catches → walk to stand → E → Sell All → workshop → buy upgrade (double-clicked) → reload | ✅ 3/3 caught; sold for ¢160; upgrade charged once (160 → 10); coins and inventory identical after reload; no console errors |
| **907×510** desktop iframe size, same loop | ✅ 3/3 caught; ¢138 sold; upgrade bought (138 → 18); persisted; no errors |
| **821×462** desktop iframe size, same loop | ✅ 3/3 caught; ¢84 sold (below the cheapest ¢120 item, so correctly nothing bought); persisted; no errors |
| **800×450 touch** (hasTouch / isMobile, synthetic touch pointers): joystick drag, action-button cast/hook/reel, stand, sell | ✅ joystick moved the player (x 0 → 3.6); 3/3 caught using only the touch action button; sold ¢96; no errors. The first attempt found a bug: `setPointerCapture` threw and dropped the press. **Fixed**, re-run passed. |
| **Rift Bloom** (QA build, triggered early): notice → opening → open; lure picker; 2 catches at the rift | ✅ the player standing inside the boundary was relocated to 8.7 m from the center (outside the 7.8 m collider); the matching lure was selectable; both catches showed "Current match +10%"; no errors. The first attempt found a bug: the tutorial bubble covered the lure picker. **Fixed.** |
| **Hidden tab during a fight** (visibility forced hidden for 3 s while reeling) | ✅ pause = `[DOCUMENT_HIDDEN]`; progress 21.67% → 21.67% (frozen); still Reeling after return; held Space was released |
| **Panels opened/closed 100×** (bag/journal by keyboard) | ✅ DOM node count 94 → 93; no leftover pause reasons. (Heap 11.1 → 14.3 MB without a forced GC; not a leak measurement.) |
| **Night** (clock skipped to night) | ✅ screenshot shows readable ground, paths, labels and lamps |
| **Largest catch framing** (QA-only "Giant reveal": Giant Rift Leviathan, ~7 m) at 1280×720 and 821×462 | ✅ the whole creature is in frame and the camera stays out of scenery. The first look put it under the result card on narrow screens; the reveal framing was **re-biased to the left** and rechecked. |
| **Subdirectory hosting**: `dist/` copied to `/games/rift-fishing/` on a plain static server | ✅ loads and renders; no 404s or errors |
| **Portrait 390×844** | ⚠️ renders with the adapted layout (stacked HUD, readable labels, action button reachable); a full loop was **not** run in portrait |
| **Basic build** | ✅ SDK `<script>` injected only into the CrazyGames builds; "Watch an ad" code is compiled out of standalone/Basic (0 occurrences) and present only in Full. ⏳ Not run against the real SDK: the network policy blocks `sdk.crazygames.com`. |

Visual issues found in screenshots and fixed during QA:
- Sand paths had culled faces.
- Lamps blocked the opening camera.
- The reveal camera oscillated, then sat on the player's head.
- World labels overlapped the top HUD.
- Water sparkles rendered as squares.
- The particle shader used reversed `smoothstep` edges.
- The touch hint overlapped the reel meter.

## Measurements (release build `dist/`)

| Metric | Value | Budget |
| --- | --- | --- |
| Files | 3 (`index.html`, 1 JS, 1 CSS) | ≤ 1,500 (platform) |
| Total / initial download | 743 KB (JS 723 KB raw / **195 KB gzip**) | ≤ 10 MB project, ≤ 20 MB mobile homepage, ≤ 50 MB platform |
| Draw calls, start view | 118 (190 before merging static props and baking character parts) | < 120 |
| Draw calls, Rift Bloom open | 106–175 depending on view (example screenshots: 109, 175) | < 180 |
| Triangles | 13k–26k | < 150k |
| FPS | 40–50 at 1280×720 in **software** WebGL with one browser running | Real-GPU fps **not measured** |

## Not performed — needs a device, the Portal, or a human

- ⏳ Real-GPU fps on typical desktop, low-end laptop or Chromebook.
- ⏳ Safari (macOS/iOS), Firefox, Edge, and real Android/iOS touch devices. Touch was only
  emulated with synthetic pointer events. Not tested: iOS audio interruption and resume,
  safe-area insets on a notched device, and pinch zoom on hardware.
- ⏳ Audio listening test. Sounds are synthesized; their mix, loudness and the muted-start
  behavior were not checked by ear. Mute flags are code-reviewed and partly unit-tested at
  the adapter level.
- ⏳ Reduced-motion and Assist mode **visual** checks. The logic for both is in place (Assist
  values are used by `ReelSim` and covered by the rules), but no screenshot pass was done.
- ⏳ WebGL context-loss recovery (handler implemented, not triggered).
- ⏳ CrazyGames SDK: real `init`, Data-module saves for guest and signed-in users, account
  switch, `muteAudio` settings, ads, and the Developer Portal QA tool. **Requires Developer
  Portal validation.**
- ⏳ Human playtest of reel difficulty with mouse, keyboard and one thumb.
- ⏳ Cover art and preview videos (must be captured from the final build on real hardware).
- ⏳ Trademark/name clearance for "Rift Fishing" and species names.

## Known limitations / open items

- Villagers are static decorations with simple celebrate loops. They don't walk.
- The island has no jumping, swimming or extra islands, by design.
- The economy simulation is optimistic (see `BALANCING.md`). Human pacing will be slower.
