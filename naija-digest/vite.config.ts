import { defineConfig } from 'vite';
import { resolve } from 'node:path';

export default defineConfig({
  base: '/',
  server: {
    port: 5176,
    strictPort: true,
  },
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: {
        // Two pages: the news digest (index.html) and the Student Tools
        // page (students.html). Both are hand-written HTML shells that
        // pull in their own entry module from src/.
        main: resolve(__dirname, 'index.html'),
        students: resolve(__dirname, 'students.html'),
      },
    },
  },
});
