# QA report

## Round 2: visual upgrade and performance (latest)

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
