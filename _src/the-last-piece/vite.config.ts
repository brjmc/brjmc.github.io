import { defineConfig } from 'vite';

// base './' so the build works from any sub-path (e.g. brjmc.github.io/the-last-piece/).
export default defineConfig({
  base: './',
  // pre-bundle the addon with three so dev never discovers it late and loads two copies of three
  optimizeDeps: { include: ['three', 'three/addons/utils/BufferGeometryUtils.js'] },
  build: {
    target: 'es2020',
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 900,
  },
});
