import { defineConfig } from 'wxt';

export default defineConfig({
  manifest: {
    name: 'Media Saver',
    description: 'Скачивание медиа из соцсетей одним кликом',
    // offscreen — скрытая страница для склейки видео и звука (см. lib/background/video.ts)
    permissions: ['downloads', 'offscreen'],
    host_permissions: ['*://*.instagram.com/*', '*://*.cdninstagram.com/*', '*://*.fbcdn.net/*'],
  },
  webExt: {
    // Автозапуск Chrome через web-ext на Windows падает (CDP Extensions.loadUnpacked),
    // поэтому расширение подключается вручную в обычный Chrome — см. README
    disabled: true,
  },
});
