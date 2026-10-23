import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// One self-contained index.html: the same file is hosted on GitHub Pages,
// gzipped into the hub's LittleFS, and published as a demo page.
export default defineConfig({
  base: './',
  plugins: [preact(), viteSingleFile()],
  build: { target: 'es2020', outDir: 'dist', assetsInlineLimit: 100000000, cssCodeSplit: false },
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
} as any);
