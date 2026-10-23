// Copies the single-file web app into the hub's LittleFS image folder, gzipped.
// Run after `npm run build`. Then: cd ../firmware && pio run -e hub_esp32 -t uploadfs
import { gzipSync } from 'node:zlib';
import { mkdirSync, readFileSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const src = resolve(here, '../dist/index.html');
const out = resolve(here, '../../firmware/data');
if (!existsSync(src)) {
  console.error('dist/index.html not found — run `npm run build` first.');
  process.exit(1);
}
mkdirSync(out, { recursive: true });
rmSync(resolve(out, 'index.html'), { force: true });
const gz = gzipSync(readFileSync(src), { level: 9 });
writeFileSync(resolve(out, 'index.html.gz'), gz);
const limit = 128 * 1024 - 16 * 1024; // LittleFS partition minus filesystem overhead
console.log(`firmware/data/index.html.gz: ${(gz.length / 1024).toFixed(1)} kB (limit ~${limit / 1024} kB)`);
if (gz.length > limit) {
  console.error('Too big for the hub partition.');
  process.exit(1);
}
