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
        // Three pages: the news digest (index.html), the Student Tools page
        // (students.html), and Fact Check (fact-check.html). Each is a
        // hand-written HTML shell that pulls in its own entry module from
        // src/.
        main: resolve(__dirname, 'index.html'),
        students: resolve(__dirname, 'students.html'),
        factcheck: resolve(__dirname, 'fact-check.html'),
      },
    },
  },
});
