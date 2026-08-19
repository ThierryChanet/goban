import { defineConfig } from 'vite';

export default defineConfig({
  root: 'src/client',
  publicDir: false,
  build: {
    outDir: '../../dist/client',
    emptyOutDir: true,
    target: 'es2022',
  },
  server: {
    port: 5173,
    host: true,
    proxy: {
      '/ws': {
        target: 'ws://localhost:8787',
        ws: true,
      },
      '/health': 'http://localhost:8787',
    },
  },
});
