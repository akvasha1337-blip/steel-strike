// Turns the demo build into a page body for embedding (no html/head/body wrapper, no manifest).
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
let html = readFileSync(resolve(here, '../dist-demo/index.html'), 'utf8');
html = html
  .replace(/<!doctype html>/i, '')
  .replace(/<\/?html[^>]*>/gi, '')
  .replace(/<\/?head>/gi, '')
  .replace(/<\/?body>/gi, '')
  .replace(/<meta charset[^>]*>/i, '')
  .replace(/<meta name="viewport"[^>]*>/i, '')
  .replace(/<link rel="manifest"[^>]*>/i, '')
  .replace(/<link rel="preconnect"[^>]*>/gi, '');
// Title first so it is found within the first 8 kB.
const title = html.match(/<title>.*?<\/title>/)[0];
html = title + '\n' + html.replace(title, '');
writeFileSync(resolve(here, '../dist-demo/steel-strike.html'), html.trim() + '\n');
console.log('dist-demo/steel-strike.html', (html.length / 1024).toFixed(0), 'kB');
