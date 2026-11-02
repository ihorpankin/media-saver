import { defineConfig } from 'wxt';

export default defineConfig({
  manifest: {
    name: 'Media Saver',
    description: 'Скачивание медиа из соцсетей одним кликом',
    permissions: ['downloads'],
    host_permissions: ['*://*.instagram.com/*', '*://*.cdninstagram.com/*', '*://*.fbcdn.net/*'],
  },
  webExt: {
    // Отдельный профиль Chrome для разработки; вход в Instagram в нём сохраняется между запусками
    chromiumProfile: '.chrome-profile',
    keepProfileChanges: true,
    startUrls: ['https://www.instagram.com/'],
  },
});
