// Writes docs/wiring-guide.html: the same illustrated guide as the app's Help screen, as one printable page.
import { build } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const tmp = resolve(here, '../node_modules/.cache/guide.mjs');
mkdirSync(dirname(tmp), { recursive: true });
await build({ entryPoints: [resolve(here, '../src/guide/guide.ts')], bundle: true, format: 'esm', platform: 'neutral', outfile: tmp, logLevel: 'error' });
const { guideHtml } = await import(pathToFileURL(tmp).href + `?t=${Date.now()}`);
const css = readFileSync(resolve(here, '../src/ui/styles.css'), 'utf8');
const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Steel Strike Wiring Guide</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Barlow:wght@400;500;600;700&family=Big+Shoulders+Display:wght@700;800&family=JetBrains+Mono:wght@500;700&display=swap" rel="stylesheet">
<style>
${css}
@media print {
  :root { color-scheme: light; }
  .guide figure { break-inside: avoid; }
  .guide .toc { display: none; }
  body { background: #fff; }
}
</style>
</head>
<body>
<main class="page">
<header class="pagehead"><h1>Steel Strike wiring guide</h1><p>Six wireless steel targets: ESP32-C3 nodes with piezo sensors and LEDs, an ESP32 hub at the shooting line, and the Steel Strike web app. Print this page or keep it open on a phone while you build.</p></header>
<div class="panel">${guideHtml()}</div>
</main>
</body>
</html>
`;
const out = resolve(here, '../../docs/wiring-guide.html');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, html);
console.log('wrote docs/wiring-guide.html');
