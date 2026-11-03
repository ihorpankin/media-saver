import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['.output/', '.wxt/', 'node_modules/', 'release/'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  // Хелпер yt-dlp работает в Node, а не в браузере
  {
    files: ['native-host/**/*.mjs'],
    languageOptions: { globals: { process: 'readonly', Buffer: 'readonly' } },
  },
  // Скрипты сборки (npm run pack, npm run icons) — тоже Node
  {
    files: ['scripts/**/*.mjs'],
    languageOptions: { globals: { console: 'readonly', process: 'readonly' } },
  },
);
