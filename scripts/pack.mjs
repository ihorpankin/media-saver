// Собирает оба расширения и кладёт в постоянные папки release/: npm run pack
// Chrome подключается к этим папкам один раз («Загрузить распакованное расширение»),
// дальше после каждого pack достаточно нажать ⟳ у расширения в chrome://extensions.
import { execSync } from 'node:child_process';
import { cpSync, readFileSync, rmSync } from 'node:fs';

// Основное расширение последним: сборка заодно обновляет типы в .wxt/, а их проверяет tsc
const builds = [
  [
    'wxt build -c wxt.youtube.config.ts',
    '.output/youtube/chrome-mv3',
    'release/media-saver-youtube',
  ],
  ['wxt build', '.output/chrome-mv3', 'release/media-saver'],
];

for (const [command, from, to] of builds) {
  execSync(`npx ${command}`, { stdio: 'inherit' });
  rmSync(to, { recursive: true, force: true });
  cpSync(from, to, { recursive: true });
  const { name, version } = JSON.parse(readFileSync(`${to}/manifest.json`, 'utf8'));
  console.log(`✔ ${name} ${version} → ${to}`);
}
