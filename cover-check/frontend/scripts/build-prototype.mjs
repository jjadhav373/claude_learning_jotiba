/**
 * Builds the clickable prototype as ONE self-contained HTML file (JS + CSS inlined, MockApi, no network
 * except Google Fonts). Output: dist-prototype/cover-check-prototype.html
 */
import { build } from 'esbuild';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const res = await build({
  entryPoints: [resolve(root, 'src/prototype.tsx')],
  bundle: true, minify: true, write: false, outdir: 'out', format: 'iife', target: 'es2020',
  jsx: 'automatic', legalComments: 'none',
  define: { 'process.env.NODE_ENV': '"production"', 'import.meta.env.VITE_API_URL': '""' },
  nodePaths: (process.env.NODE_PATH ?? '').split(':').filter(Boolean),
  logLevel: 'warning',
});
const js = res.outputFiles.find((f) => f.path.endsWith('.js')).text;
const css = res.outputFiles.find((f) => f.path.endsWith('.css'))?.text ?? '';
const html = `<!doctype html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#00875A"><title>Cover Check Prototype</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Hind:wght@400;500;600&family=Poppins:wght@600&display=swap" rel="stylesheet">
<style>${css}</style></head><body><div id="root"></div><script>${js.replace(/<\/script/gi, '<\\/script')}</script></body></html>`;
const out = resolve(root, 'dist-prototype/cover-check-prototype.html');
await mkdir(dirname(out), { recursive: true });
await writeFile(out, html);
console.log(`prototype → ${out} (${(html.length / 1024).toFixed(0)} KB)`);
