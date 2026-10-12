// Inlines the built JS and CSS into one HTML file: node scripts/single-file.mjs <distDir> <out.html> [--fragment]
import fs from 'node:fs';
import path from 'node:path';
const [dist, out, flag] = process.argv.slice(2);
let html = fs.readFileSync(path.join(dist, 'index.html'), 'utf8');
const js = html.match(/<script type="module" crossorigin src="\.\/(assets\/[^"]+)"><\/script>/);
const css = html.match(/<link rel="stylesheet" crossorigin href="\.\/(assets\/[^"]+)">/);
const jsText = fs.readFileSync(path.join(dist, js[1]), 'utf8');
const cssText = fs.readFileSync(path.join(dist, css[1]), 'utf8');
html = html.replace(js[0], '').replace(css[0], () => `<style>${cssText}</style>`);
// Run the game after the body exists.
html = html.replace('</body>', () => `<script type="module">${jsText}</script>\n</body>`);
if (flag === '--fragment') {
  // Artifact pages are wrapped in their own document skeleton: keep title, styles, body content.
  const title = html.match(/<title>[\s\S]*?<\/title>/)[0];
  const styles = html.match(/<style>[\s\S]*?<\/style>/)[0];
  const body = html.match(/<body>([\s\S]*)<\/body>/)[1];
  html = `${title}\n${styles}\n<style>html,body{height:100%;background:#71ddf0;color-scheme:light}</style>\n${body}`;
}
fs.writeFileSync(out, html);
console.log(out, fs.statSync(out).size, 'bytes');
