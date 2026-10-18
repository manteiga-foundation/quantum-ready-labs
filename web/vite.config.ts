import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  root,
  plugins: [react()],
  server: {
    fs: { allow: [fileURLToPath(new URL('..', import.meta.url))] },
  },
  build: {
    target: 'es2022',
    outDir: '../dist/web',
    emptyOutDir: true,
    chunkSizeWarningLimit: 1500,
  },
});
