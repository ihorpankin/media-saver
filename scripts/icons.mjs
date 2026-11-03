// Рисует PNG-иконки расширений из icons/: npm run icons
// SVG масштабируется как есть. У PNG обрезаются прозрачные поля: картинка вписывается в квадрат
// с небольшим отступом, иначе в 16×16 от неё почти ничего не остаётся.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { Resvg } from '@resvg/resvg-js';

const targets = [
  ['icons/icon.png', 'public/icon'],
  ['icons/icon-youtube.png', 'apps/youtube/public/icon'],
];

const PADDING = 0.04;

function pngToSvg(file) {
  const png = readFileSync(file);
  const width = png.readUInt32BE(16);
  const height = png.readUInt32BE(20);
  const image = `<image href="data:image/png;base64,${png.toString('base64')}" width="${width}" height="${height}"/>`;
  const wrap = (viewBox) =>
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}">${image}</svg>`;

  // Границы непрозрачной части.
  const { pixels } = new Resvg(wrap(`0 0 ${width} ${height}`)).render();
  let [x0, y0, x1, y1] = [width, height, -1, -1];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (pixels[(y * width + x) * 4 + 3] > 8) {
        x0 = Math.min(x0, x);
        x1 = Math.max(x1, x);
        y0 = Math.min(y0, y);
        y1 = Math.max(y1, y);
      }
    }
  }
  const content = Math.max(x1 - x0, y1 - y0) + 1;
  const side = Math.round(content * (1 + 2 * PADDING));
  const left = Math.round((x0 + x1 + 1 - side) / 2);
  const top = Math.round((y0 + y1 + 1 - side) / 2);
  return wrap(`${left} ${top} ${side} ${side}`);
}

for (const [source, outDir] of targets) {
  const svg = source.endsWith('.png') ? pngToSvg(source) : readFileSync(source);
  mkdirSync(outDir, { recursive: true });
  for (const size of [16, 32, 48, 128]) {
    const png = new Resvg(svg, { fitTo: { mode: 'width', value: size } }).render();
    writeFileSync(`${outDir}/${size}.png`, png.asPng());
  }
  console.log(`${source} → ${outDir}/{16,32,48,128}.png`);
}
