# Platform integration notes (CrazyGames)

This document records what is implemented and what the owner still has to do in the
Developer Portal. **Nothing here means the game has been reviewed or approved by CrazyGames.**

## Important: SDK docs could not be re-verified from this build environment

This environment's network policy blocked `docs.crazygames.com` and `sdk.crazygames.com`
(proxy 403). The adapter was written against the guide's checked summary and official
documentation snippets found through web search:
- `SDK.init()`
- `game.gameplayStart/Stop`
- `data.getItem/setItem` (1 MB limit; synced for signed-in users, localStorage for guests)
- `ad.requestAd('rewarded', { adStarted, adFinished, adError })`

These members are **assumed** and must be checked against the live v3 docs before submission:
- `game.settings.muteAudio`
- `game.addSettingsChangeListener`
- `game.loadingStart/Stop`
- `game.happytime`
- `user.addAuthListener`

Every SDK call is wrapped so that a missing member degrades gracefully instead of breaking play.

## Build modes

| Mode | Command | SDK script | Save backend | Ads |
| --- | --- | --- | --- | --- |
| standalone | `npm run build` | none | `localStorage` | none |
| crazygames-basic | `npm run build:basic` | injected into `<head>` | SDK Data module | **none (no ad UI at all)** |
| crazygames-full | `npm run build:full` | injected | SDK Data module | one optional rewarded cosmetic |

Submit **Basic** first. Only switch to the Full build after CrazyGames invites the game to Full
Launch. The flag alone does not grant permission to monetize.

If the SDK script is missing or `init()` fails, the game falls back to standalone behavior
(local save, no events, no ads) and logs a console warning. It never blocks play.

## Gameplay events

- `gameplayStart()` fires when the world becomes playable, and again when the player leaves a
  real break (closing the pause/bag/journal/shop/stand panel, or after an ad request settles).
- `gameplayStop()` fires when one of those breaks begins.
- Both are deduplicated in the adapter. Casts, catches and focus changes never send events.
  Tab visibility pauses the simulation locally only; the platform handles focus itself.
- `loadingStart()`/`loadingStop()` wrap the save load and scene construction at boot.
- `happytime()` fires only on rare milestones: the first Rift Leviathan, and completing the
  18-species journal.

## Saves

- On CrazyGames the SDK Data module is the **only** save backend. There is no parallel
  localStorage save.
- Keys:
  - `riftfishing.save` — current snapshot.
  - `riftfishing.save.backup` — the previous good snapshot.
  - `riftfishing.save.corrupt` — quarantined bad data.
- A snapshot is about 2–8 KB, far below the 1 MB limit.
- Behaviors:
  - **Read failure:** the session continues in memory, and the HUD shows "⚠ Not saving".
    Nothing is written, so an unread save is never overwritten.
  - **Corrupt save:** the backup is restored; if there is no usable backup, a new profile
    starts and the bad copy is kept.
  - **Newer version:** the save is treated as read-only for the session.
- **Account change** (`user.addAuthListener`): writes stop immediately (pending snapshot
  dropped), a short notice is shown, and the page reloads to load the new profile's data. This
  is the conservative choice; confirm it matches current SDK guidance on guest → account
  transitions.
- **Portal setting:** enable *Progress Save* in the submission form.

## Audio

Effective mute = master volume 0 **OR** platform `muteAudio` **OR** ad playing **OR** page
hidden. Each flag is tracked separately. When an ad ends, only the ad flag is cleared, so the
player's own mute preference and the platform mute are respected. Audio unlocks on the first
user gesture and resumes on later gestures (for iOS interruptions).

## Ads (Full build only)

- The only ad placement is in **Pause → Wardrobe**: the "Sunburst" bobber. It is cosmetic and
  can be unlocked by either:
  - buying it for 300 earned coins, or
  - watching one rewarded video.
- Both options are equally prominent. No ad ever runs during casting or reeling, or when menus,
  shops or settings open.
- Flow:
  - The request adds the `AD_REQUEST` pause reason.
  - `adStarted` adds `AD_PLAYING` and mutes audio.
  - `adFinished` grants the bobber exactly once.
  - `adError` (including no-fill and ad blockers) grants nothing and shows "No ad available
    right now".
  - Both pause reasons and the ad mute flag are then cleared without touching other pause or
    mute reasons.
  - Repeated taps while a request is pending are rejected, and late callbacks are ignored
    (tested).
- There are no banners, no midgame ads, and no currency multipliers.

## Content and flow checklist (implemented)

- English UI, mild content, no chat, no accounts, no external links, no cross-promotion, no
  in-game fullscreen button, no tracking or analytics scripts, no real-money purchases.
- Gameplay starts immediately: the player loads beside Meadow Pool, already facing it, with no
  title screen.
- Physics and timers run on a fixed simulation step, independent of the display refresh rate.
- Relative asset paths (`base: './'`), so the build works from a subdirectory.
- Villagers are labeled "Villager … · NPC". The help text states there is no online
  multiplayer.

## CrazyGames requirements checklist

Statuses are what the code does and what the automated checks verified. **None of this is a
platform approval.**

| Requirement (from the guide's summary of the CrazyGames docs) | Status |
| --- | --- |
| Initial download ≤ 50 MB (≤ 20 MB for the mobile homepage), ≤ 1,500 files | ✅ about 0.76 MB, 3 files |
| Gameplay starts immediately or within one click | ✅ loads straight into play beside Meadow Pool |
| No in-game fullscreen button, no external links, no cross-promotion, no store badges | ✅ grep sweep of `src/` and `index.html` found no URLs except the SDK, and no `requestFullscreen`/`window.open` |
| No browser dialogs (`alert`/`confirm`/`prompt`) | ✅ in-game confirmation panel only |
| Frame-rate-independent gameplay | ✅ fixed 1/60 s simulation step (unit-tested at 30 Hz vs 144 Hz) |
| Pause and mute when an ad plays; no ads during gameplay; no ads in Basic | ✅ in code and tests (Full build only, cosmetic, optional) |
| `gameplayStart`/`gameplayStop` only on real transitions | ✅ deduplicated; menus and ads only |
| Respect the platform mute setting | ✅ `muteAudio` OR-ed with local volume, ad and hidden flags |
| Progress through the SDK Data module, no parallel localStorage save | ✅ in CrazyGames builds |
| Keyboard input doesn't scroll the host page; Esc and browser shortcuts not used | ✅ |
| Mild content (PEGI 12 bound), English | ✅ |
| No console logging in normal play | ✅ no `console.log/info/debug` in `src/`; warnings only on SDK init failure |
| Runs smoothly on lower-end hardware | ⚠️ Auto quality detects software rendering and adapts at runtime. Measured only in a CPU-rendered headless Chromium; **real-device testing is still required** |

## Requires Developer Portal / owner action

- Review and accept the current developer agreement yourself. This project did **not** accept
  any terms.
- Run the Portal's QA/preview tool on the uploaded Basic build.
- Enable Progress Save; fill in the description, controls, and supported devices. Mobile
  support is implemented but **untested on real devices**.
- Covers (1920×1080, 800×1200, 800×800) and silent 15–20 s preview videos (16:9 and 2:3) must
  be captured from the final build on real hardware. None are included here.
- Confirm the name "Rift Fishing" is available.
