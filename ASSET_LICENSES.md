# Asset and dependency licenses

## Game assets

The game ships **no third-party art or audio**. The only third-party asset is one font (below).
Everything else is created in code and written for this project:

| Asset | Source | License |
| --- | --- | --- |
| Island, pools, props, buildings, trees, rocks | Procedural Three.js primitives (`src/game/world.ts`) | Project-original |
| Angler and villager characters | Procedural primitives (`src/game/character.ts`) | Project-original |
| 18 pets (models and animation) | Procedural primitives (`src/game/petKit.ts`, `src/game/petModels.ts`), modelled after the owner-supplied pet redesign sheet. No image data from the sheet is shipped. | Project-original |
| 18 fish species and modifier looks | Procedural primitives (`src/game/fishModels.ts`) | Project-original |
| Water, sky, particle shaders | GLSL written for this project (`src/game/water.ts`, `src/game/effects.ts`) | Project-original |
| Sign textures, contact shadows, fish icons | Drawn at runtime with Canvas 2D or rendered from the procedural models | Project-original |
| Music and sound effects | Synthesized at runtime with Web Audio (`src/game/audio.ts`) | Project-original |
| UI font | **Fredoka** 600/700, latin subset (`src/assets/fonts/`, from the `@fontsource/fredoka` 5.3.0 package), inlined into the built CSS. Copyright 2016 The Fredoka Project Authors. The license text is in `src/assets/fonts/OFL-Fredoka.txt`, and a notice comment is kept in the shipped CSS. | SIL Open Font License 1.1 |
| UI icons | Inline SVG drawn for this project (`src/ui/icons.ts`) | Project-original |
| Clouds, shore foam | Procedural geometry (`src/game/scenery.ts`) | Project-original |
| Favicon | Inline SVG in `index.html` | Project-original |

No assets, names, screenshots or branding were taken from the reference recording ("Hole
Fishing" on Roblox). Species and rod names are working names, written for this project. **They
have not been cleared as trademarks.**

## Runtime dependency (shipped in the bundle)

| Package | Version | License |
| --- | --- | --- |
| three | 0.186.1 | MIT, © 2010–2026 three.js authors. The MIT notice is preserved in the bundle's license comment. |

`three/examples/jsm/utils/BufferGeometryUtils.js` (part of the same package, MIT) is used to
merge geometry.

## Platform script (not bundled)

| Script | Used in | Terms |
| --- | --- | --- |
| `https://sdk.crazygames.com/crazygames-sdk-v3.js` | `crazygames-basic` and `crazygames-full` builds only | CrazyGames developer terms (owner must review in the Developer Portal) |

## Development-only dependencies (not shipped)

| Package | Version | License |
| --- | --- | --- |
| vite | 6.4.4 | MIT |
| vite-node | 3.2.4 | MIT |
| vitest | 3.2.7 | MIT |
| typescript | 5.9.3 | Apache-2.0 |
| @types/three | 0.186.0 | MIT |
| playwright-core | 1.56.1 | Apache-2.0 |

Transitive dev dependencies come from npm under their own licenses. None of them reach the
production bundle.
