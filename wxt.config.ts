import { defineConfig } from 'wxt';

export default defineConfig({
  manifest: {
    name: 'Media Saver',
    description: 'Download photos and videos from Instagram, X, TikTok and LinkedIn in one click',
    // The public key pins the extension id: obnhohflfmafplbppiampibaklfnhjpf.
    // Without it the id would depend on the folder, and moving the build would lose the settings.
    // YouTube is a separate extension with its own config: wxt.youtube.config.ts
    key: 'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAn8nye9WXE/kL5bLQbEq+YUT44bP2PSm5kXFTrtmmBV4w+naLT4xoOtt8CDpXW2y1K87E7mU/jxZBcNEz33CXn+XXhT7eWu+d66AXk1CHL8y+sbNgDCa1h7HfPzWC9woAFcNQt21t61fsoTZInPmvAZPJ6RuEKQH7QbjCgi8sclvkt1BtvzwxufnQyo47AgiqSuK4ExCgIYul9qHZ2lSL2RAuuhwjlqoteggjNV82OGx2zO05jg4WtJfVW3gTFDkirbecwV9m9P21oi3ooZtaajF0YU28qAsouh4fD2XodYX6/McgX1VdqKupQonL4alwb9Yhi+lDAqpGY9evzYnvXQIDAQAB',
    // offscreen: hidden page for muxing video and audio (see lib/background/video.ts)
    // storage: settings (lib/core/settings.ts)
    // contextMenus: the "Download" item on right-click on photos and videos
    permissions: ['downloads', 'offscreen', 'storage', 'contextMenus'],
    host_permissions: [
      '*://*.instagram.com/*',
      '*://*.cdninstagram.com/*',
      '*://*.fbcdn.net/*',
      '*://x.com/*',
      '*://twitter.com/*',
      // X photos and videos
      '*://pbs.twimg.com/*',
      '*://video.twimg.com/*',
      // TikTok: the site itself and videos (v16-webapp-prime.tiktok.com), images on tiktokcdn
      '*://*.tiktok.com/*',
      '*://*.tiktokcdn.com/*',
      '*://*.tiktokcdn-us.com/*',
      '*://www.linkedin.com/*',
      // LinkedIn photos
      '*://media.licdn.com/*',
    ],
  },
  hooks: {
    // The Web Store rejects a manifest with a key field: it assigns the id itself (npm run zip:store)
    'build:manifestGenerated': (_wxt, manifest) => {
      if (process.env.MEDIA_SAVER_STORE) delete manifest.key;
    },
  },
  webExt: {
    // Auto-launching Chrome through web-ext fails on Windows (CDP Extensions.loadUnpacked),
    // so the extension is loaded manually into regular Chrome, see README
    disabled: true,
  },
});
