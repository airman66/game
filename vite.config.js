import { defineConfig } from 'vite';

// base: './' — обязательное требование: Яндекс Игры раздают билд из подпапки,
// все пути в index.html должны быть относительными.
export default defineConfig({
  base: './',
  build: {
    target: 'es2018',
    assetsInlineLimit: 4096,
    chunkSizeWarningLimit: 1500,
  },
});
