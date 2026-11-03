// Архив Media Saver для Chrome Web Store: npm run zip:store
// Та же сборка, что и npm run build, но без поля key в манифесте — его Web Store не принимает.
// Результат — .output/media-saver-<версия>-chrome.zip.
import { execSync } from 'node:child_process';

execSync('npx wxt zip', { stdio: 'inherit', env: { ...process.env, MEDIA_SAVER_STORE: '1' } });
