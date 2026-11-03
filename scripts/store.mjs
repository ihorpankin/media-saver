// Media Saver archive for the Chrome Web Store: npm run zip:store
// The same build as npm run build, but without the key field in the manifest, which the Web Store rejects.
// Result: .output/media-saver-<version>-chrome.zip.
import { execSync } from 'node:child_process';

execSync('npx wxt zip', { stdio: 'inherit', env: { ...process.env, MEDIA_SAVER_STORE: '1' } });
