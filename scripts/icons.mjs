// Рисует PNG-иконки расширений из SVG в icons/: npm run icons
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { Resvg } from '@resvg/resvg-js';

const targets = [
  ['icons/icon.svg', 'public/icon'],
  ['icons/icon-youtube.svg', 'apps/youtube/public/icon'],
];

for (const [svg, outDir] of targets) {
  mkdirSync(outDir, { recursive: true });
  for (const size of [16, 32, 48, 128]) {
    const png = new Resvg(readFileSync(svg), { fitTo: { mode: 'width', value: size } }).render();
    writeFileSync(`${outDir}/${size}.png`, png.asPng());
  }
  console.log(`${svg} → ${outDir}/{16,32,48,128}.png`);
}
