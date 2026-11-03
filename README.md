# Media Saver

A Chrome extension that downloads media from social networks in one click. The work plan is in [ROADMAP.md](ROADMAP.md), Instagram notes are in [docs/instagram.md](docs/instagram.md).

## Features

A ⬇ button is embedded in the post's native action bar; the same actions are in the "Media Saver" submenu on right-click. The extensions' interface is in English.

| Site      | What it downloads                                                                                   |
| --------- | --------------------------------------------------------------------------------------------------- |
| Instagram | photos, carousels (current slide or "All N"), videos and Reels, stories, highlights, "HD" originals |
| X         | photos in original size, videos and GIFs                                                            |
| TikTok    | videos and photo posts                                                                              |
| LinkedIn  | photos and videos from posts                                                                        |

YouTube is a separate extension, **Media Saver for YouTube**, in this same repository (see below): it needs a helper on the computer and permissions the Web Store won't accept.

Files are saved to `Downloads/<site>/<author>/<id>_<n>.<ext>` (the template can be changed in the settings).

## How it works

- `entrypoints/<site>-page.content.ts`: a script in the page context (MAIN world). It intercepts the data the site receives anyway (XHR/fetch, embedded JSON) and passes it to the content script.
- `entrypoints/<site>.content.ts`: buttons on the page and choosing what to download. Shared parts are in `lib/content/` and `lib/ui/`.
- `entrypoints/background.ts` + `lib/background/`: downloading through `chrome.downloads`, the context menu, originals through a background tab, yt-dlp.
- `entrypoints/offscreen/`: muxing DASH video and audio (Instagram) and saving bytes downloaded by the page (TikTok).
- `lib/sites/<site>/`: parsing the site's data, covered by tests.

## Development

```bash
npm install
npm run dev      # build into .output/chrome-mv3-dev with hot reload
npm run build    # build into .output/chrome-mv3
npm run compile  # type check
npm test         # tests (vitest)
npm run lint
npm run format
```

### Loading the dev build (once)

1. Run `npm run dev` and keep it running.
2. In regular Chrome open `chrome://extensions` and turn on "Developer mode".
3. "Load unpacked" → the `.output/chrome-mv3-dev` folder.

After that, code changes are picked up automatically while `npm run dev` is running.

## Media Saver for YouTube

A separate extension: "Video" and "Thumbnail" buttons under the video and in Shorts, thumbnails from any feed on right-click. The code is in `apps/youtube/` plus the shared `lib/`, the config is `wxt.youtube.config.ts`.

```bash
npm run dev:youtube    # .output/youtube/chrome-mv3-dev, can run alongside npm run dev
npm run build:youtube  # .output/youtube/chrome-mv3
```

It is loaded the same way as the main one: "Load unpacked" → the build folder.

### The yt-dlp helper (once)

YouTube videos are downloaded by [yt-dlp](https://github.com/yt-dlp/yt-dlp) on the computer; the extension hands it the link through Native Messaging (`native-host/`). Thumbnails work without it.

```powershell
winget install yt-dlp.yt-dlp
winget install Gyan.FFmpeg
powershell -ExecutionPolicy Bypass -File native-host\install.ps1
```

`install.ps1` registers the helper for Chrome in the current user's registry (no admin rights needed) and records the exact paths to `node`, `yt-dlp` and `ffmpeg` (`host-run.bat`, `host-config.json`): Chrome starts the helper with its own PATH, which may predate the yt-dlp install. If you reinstalled or updated these programs through winget and the path changed, run `install.ps1` again. To remove the registration: `install.ps1 -Uninstall`.

Videos are saved to `Downloads\youtube\<channel>\<title> [id].mp4`. Quality is chosen in the right-click menu: "Media Saver for YouTube ▸ Video: …". If YouTube starts returning PO Token errors, update yt-dlp (`winget upgrade yt-dlp.yt-dlp`) and, if needed, install the [bgutil-ytdlp-pot-provider](https://github.com/yt-dlp/yt-dlp/wiki/PO-Token-Guide) plugin.

## Installing for everyday use

```bash
npm run pack
```

Builds both extensions into the permanent folders `release/media-saver` and `release/media-saver-youtube`. Once: remove the dev versions in `chrome://extensions` (they have the same id), turn on "Developer mode", "Load unpacked" → these folders. After that, each `npm run pack` only needs a ⟳ on the extension. Before updating, it's worth going through the [checklist](docs/checklist.md).

Icons are rendered from `icons/` (`icon.png` for Media Saver, `icon-youtube.png` for YouTube) with `npm run icons`.

## Publishing to the Chrome Web Store

`npm run zip:store` builds a Media Saver archive without the `key` field. The listing texts, permission justifications and the steps are in [docs/store.md](docs/store.md), the privacy policy is [docs/privacy.md](docs/privacy.md).

## License

[MIT](LICENSE)
