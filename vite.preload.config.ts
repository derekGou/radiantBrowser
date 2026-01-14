import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  build: {
    target: 'esnext',
    lib: {
      entry: resolve(__dirname, 'src/preload.ts'), // ✅ source file here
      formats: ['cjs'],
      fileName: () => 'preload.js',               // this will be output filename
    },
    outDir: resolve(__dirname, '.vite/build'),
    emptyOutDir: true,
  },
});