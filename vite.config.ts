import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  // GitHub Pages serves the site from /<repo>/; the deploy workflow sets BASE_PATH to match.
  base: process.env.BASE_PATH || '/',
  plugins: [vue()],
  worker: { format: 'es' },
});
