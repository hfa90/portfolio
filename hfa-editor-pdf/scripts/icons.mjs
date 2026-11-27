// Gera os PNGs do PWA a partir de icons/icon.svg (usa o Playwright instalado)
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const svg = readFileSync(new URL('../icons/icon.svg', import.meta.url), 'utf8');
const b = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
const p = await b.newPage();
for (const [name, size, pad] of [['icon-192', 192, 0], ['icon-512', 512, 0], ['maskable-512', 512, 0.12]]) {
  await p.setViewportSize({ width: size, height: size });
  // versão "maskable": fundo até a borda e desenho reduzido para a zona segura
  const k = 1 - pad * 2, t = 256 * (1 - k);
  const src = pad ? svg.replace('rx="112"', 'rx="0"').replace(/(<\/defs>\s*<rect[^>]*\/>)([\s\S]*)<\/svg>/, `$1<g transform="translate(${t} ${t}) scale(${k})">$2</g></svg>`) : svg;
  const body = src.replace('<svg ', `<svg width="${size}" height="${size}" `);
  await p.setContent(`<html><body style="margin:0;background:transparent">${body}</body></html>`);
  await p.screenshot({ path: fileURLToPath(new URL(`../icons/${name}.png`, import.meta.url)), omitBackground: true });
}
await b.close();
console.log('ícones gerados');
