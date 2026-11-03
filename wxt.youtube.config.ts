import { defineConfig } from 'wxt';

// A separate extension for YouTube: videos are downloaded by yt-dlp on the computer through Native Messaging,
// which means the nativeMessaging permission and a ban in the Web Store rules. So YouTube lives apart
// from Media Saver, but in the same repository and on the same shared code from lib/.
//   npm run dev:youtube / build:youtube → .output/youtube/chrome-mv3(-dev)
export default defineConfig({
  entrypointsDir: 'apps/youtube',
  publicDir: 'apps/youtube/public',
  outDir: '.output/youtube',
  dev: { server: { port: 3001 } },
  manifest: {
    name: 'Media Saver for YouTube',
    description: 'Download YouTube videos and thumbnails in one click (videos via yt-dlp)',
    // Pins the extension id: mbelopldolpphlmgglnhbpklcoopjhjj. The yt-dlp helper (native-host/)
    // lets only this id in
    key: 'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEArWdCBY9U4oFI0YFw6KaAARCdNvlNN1oChsEZQ0kWm+VUZNofVNF0lRjpbaTYalqbV+llVEz5/xM90V7A1WezcAPuNW6I9673N07BLDQ/f4OdgFyJ3GlHZQevXNqygRAKFNsBfzBvo437lximiRC+TjQt1sLvzAkVrW+PRH4EBhODp8acA3C/g13bq1yWLpcNBjjhc6Die0lg1aSMR/FXmsS2auWnCinL8qGSy+AbyFVrbQn2wtwwgWgV+4rzrmkWSsIYLwsYy8lCbMlXw3P+CLJEZiZD6+t/u4j0IYYsezTTXOAN9fqDaNuLC/cI3T0W4m+1fX3aOeVk51RJKv4GywIDAQAB',
    // storage: video quality; contextMenus: "Download thumbnail" and quality on right-click;
    // nativeMessaging: the yt-dlp helper
    permissions: ['downloads', 'storage', 'contextMenus', 'nativeMessaging'],
    // i.ytimg.com: video thumbnails (checking whether maxresdefault exists)
    host_permissions: ['*://www.youtube.com/*', '*://i.ytimg.com/*'],
  },
  webExt: { disabled: true },
});
