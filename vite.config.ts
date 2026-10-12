import { defineConfig, type Plugin } from 'vite';

// Build modes:
//   (default)          -> standalone, localStorage save, no SDK
//   crazygames-basic   -> CrazyGames SDK (events + Data save), monetization OFF
//   crazygames-full    -> as basic, plus the optional rewarded cosmetic offer.
//                         Only ship this after CrazyGames invites the game to Full Launch.
const SDK_URL = 'https://sdk.crazygames.com/crazygames-sdk-v3.js';

function platformFromMode(mode: string): 'standalone' | 'crazygames-basic' | 'crazygames-full' {
  if (mode === 'crazygames-basic' || mode === 'crazygames-full') return mode;
  return 'standalone';
}

function injectSdk(platform: string): Plugin {
  return {
    name: 'rift-inject-crazygames-sdk',
    transformIndexHtml(html) {
      if (platform === 'standalone') return html;
      return html.replace('<!--PLATFORM_SDK-->', `<script src="${SDK_URL}"></script>`);
    },
  };
}

export default defineConfig(({ mode }) => {
  const platform = platformFromMode(mode);
  return {
    base: './',
    define: {
      __PLATFORM__: JSON.stringify(platform),
    },
    plugins: [injectSdk(platform)],
    build: {
      target: 'es2020',
      assetsInlineLimit: 0,
      chunkSizeWarningLimit: 900,
      sourcemap: false,
    },
  };
});
