import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['.output/', '.wxt/', 'node_modules/', 'release/'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  // The yt-dlp helper runs in Node, not in the browser
  {
    files: ['native-host/**/*.mjs'],
    languageOptions: { globals: { process: 'readonly', Buffer: 'readonly' } },
  },
  // Build scripts (npm run pack, npm run icons) are Node too
  {
    files: ['scripts/**/*.mjs'],
    languageOptions: { globals: { console: 'readonly', process: 'readonly' } },
  },
);
