import { defineConfig } from 'wxt';

export default defineConfig({
  manifest: {
    name: 'Media Saver',
    description: 'Скачивание медиа из соцсетей одним кликом',
    // Публичный ключ фиксирует id расширения: obnhohflfmafplbppiampibaklfnhjpf.
    // Без него id зависел бы от папки, а хелпер yt-dlp (native-host/) пускает только этот id
    key: 'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAn8nye9WXE/kL5bLQbEq+YUT44bP2PSm5kXFTrtmmBV4w+naLT4xoOtt8CDpXW2y1K87E7mU/jxZBcNEz33CXn+XXhT7eWu+d66AXk1CHL8y+sbNgDCa1h7HfPzWC9woAFcNQt21t61fsoTZInPmvAZPJ6RuEKQH7QbjCgi8sclvkt1BtvzwxufnQyo47AgiqSuK4ExCgIYul9qHZ2lSL2RAuuhwjlqoteggjNV82OGx2zO05jg4WtJfVW3gTFDkirbecwV9m9P21oi3ooZtaajF0YU28qAsouh4fD2XodYX6/McgX1VdqKupQonL4alwb9Yhi+lDAqpGY9evzYnvXQIDAQAB',
    // offscreen — скрытая страница для склейки видео и звука (см. lib/background/video.ts)
    // storage — настройки (lib/core/settings.ts)
    // contextMenus — пункт «Скачать» по правому клику на фото и видео
    // nativeMessaging — связь с хелпером yt-dlp для видео с YouTube (native-host/)
    permissions: ['downloads', 'offscreen', 'storage', 'contextMenus', 'nativeMessaging'],
    host_permissions: [
      '*://*.instagram.com/*',
      '*://*.cdninstagram.com/*',
      '*://*.fbcdn.net/*',
      '*://www.youtube.com/*',
      // превью роликов YouTube
      '*://i.ytimg.com/*',
      '*://x.com/*',
      '*://twitter.com/*',
      // фото и видео X
      '*://pbs.twimg.com/*',
      '*://video.twimg.com/*',
      // TikTok: сам сайт и видео (v16-webapp-prime.tiktok.com), картинки на tiktokcdn
      '*://*.tiktok.com/*',
      '*://*.tiktokcdn.com/*',
      '*://*.tiktokcdn-us.com/*',
      '*://www.linkedin.com/*',
      // фото LinkedIn
      '*://media.licdn.com/*',
    ],
  },
  webExt: {
    // Автозапуск Chrome через web-ext на Windows падает (CDP Extensions.loadUnpacked),
    // поэтому расширение подключается вручную в обычный Chrome — см. README
    disabled: true,
  },
});
