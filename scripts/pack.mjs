// Builds both extensions into the permanent release/ folders: npm run pack
// Chrome is pointed at these folders once ("Load unpacked"),
// after that each pack only needs a ⟳ on the extension in chrome://extensions.
import { execSync } from 'node:child_process';
import { cpSync, readFileSync, rmSync } from 'node:fs';

// The main extension goes last: its build also updates the types in .wxt/, which tsc checks
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
