import { defineConfig } from 'wxt';

// Отдельное расширение для YouTube: видео качает yt-dlp на компьютере через Native Messaging,
// а это и права nativeMessaging, и запрет в правилах Web Store. Поэтому YouTube живёт отдельно
// от Media Saver, но в том же репозитории и на том же общем коде из lib/.
//   npm run dev:youtube / build:youtube → .output/youtube/chrome-mv3(-dev)
export default defineConfig({
  entrypointsDir: 'apps/youtube',
  publicDir: 'apps/youtube/public',
  outDir: '.output/youtube',
  dev: { server: { port: 3001 } },
  manifest: {
    name: 'Media Saver for YouTube',
    description: 'Видео и превью с YouTube одним кликом (видео — через yt-dlp)',
    // Фиксирует id расширения: mbelopldolpphlmgglnhbpklcoopjhjj. Хелпер yt-dlp (native-host/)
    // пускает только этот id
    key: 'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEArWdCBY9U4oFI0YFw6KaAARCdNvlNN1oChsEZQ0kWm+VUZNofVNF0lRjpbaTYalqbV+llVEz5/xM90V7A1WezcAPuNW6I9673N07BLDQ/f4OdgFyJ3GlHZQevXNqygRAKFNsBfzBvo437lximiRC+TjQt1sLvzAkVrW+PRH4EBhODp8acA3C/g13bq1yWLpcNBjjhc6Die0lg1aSMR/FXmsS2auWnCinL8qGSy+AbyFVrbQn2wtwwgWgV+4rzrmkWSsIYLwsYy8lCbMlXw3P+CLJEZiZD6+t/u4j0IYYsezTTXOAN9fqDaNuLC/cI3T0W4m+1fX3aOeVk51RJKv4GywIDAQAB',
    // storage — качество видео; contextMenus — «Скачать превью» и качество по правому клику;
    // nativeMessaging — хелпер yt-dlp
    permissions: ['downloads', 'storage', 'contextMenus', 'nativeMessaging'],
    // i.ytimg.com — превью роликов (проверяем, есть ли maxresdefault)
    host_permissions: ['*://www.youtube.com/*', '*://i.ytimg.com/*'],
  },
  webExt: { disabled: true },
});
