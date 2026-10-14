import { defineConfig } from 'vite';

// base './' so the build works from any sub-path (e.g. brjmc.github.io/second-person/).
export default defineConfig({
  base: './',
  build: {
    target: 'es2020',
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 900,
  },
});
