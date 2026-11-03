# Media Saver: roadmap

A Chrome extension that downloads media from social networks in one click, with no extra features.

## Decisions

- **Stack:** TypeScript + [WXT](https://wxt.dev), Manifest V3.
- **Distribution:** at first for personal use only (manual install through developer mode). Publishing to the Chrome Web Store comes later: if needed, a separate build without what the store rules forbid (e.g. YouTube video). YouTube already lives in a separate extension, "Media Saver for YouTube" (`apps/youtube/`, `wxt.youtube.config.ts`); the main one has no `nativeMessaging`.
- **Architecture:** a shared core (UI button, downloading, file naming) and one extractor module per site.
- **Saving:** separate files, no ZIP, with the template `Downloads/<site>/<author>/<id>_<n>.<ext>`.
- **Instagram v1:** photos, carousels, videos/Reels, stories and highlights.
- **Instagram data source, the C + B + A combination:**
  - **C (main):** passively intercept `fetch`/`XHR` and the JSON embedded in the HTML. Zero extra requests and minimal ban risk.
  - **B (fallback):** a targeted API request, only when the cache has no data.
  - **A (last resort):** the image `src` from the DOM (the feed no longer has `srcset`), photos only.
- **Photo quality, two buttons:**
  - **"Download":** the best of the already loaded data, instant, no requests.
  - **"Download original":** appears only if `original_width` is larger than the best available candidate (feed photos are cut to 1080px). It opens `/p/<code>/` in an inactive tab, reads the embedded JSON with the full candidate list and closes the tab. GraphQL with `doc_id` isn't used, it's a fragile path.
  - The button shows the resolution: "1080 / original 3000".
- **Carousels:** the main button downloads the current slide, a small "All N" button next to it downloads all slides of the post. Data for all slides is already in the intercepted data, no need to swipe.
- **Video quality:** best quality by default through DASH (video and audio muxed with Mediabunny). If muxing fails, the progressive mp4 (usually 720p) is downloaded automatically.
- **Account safety:** the extension never opens or switches stories by itself (that leaves views); it only downloads what the user is already watching.

---

## Stage 0: Foundation

- [x] **0.1 Project skeleton.** WXT + TS, git, ESLint/Prettier, install check through developer mode.
- [x] **0.2 Extractor contract.** `MediaItem` types (url, image/video type, author, id, index) and `PageDataParser` (parsing intercepted page data). The shared `SiteExtractor` with a registry was removed: the sites are too different, each has its own content script, and the shared parts are in `lib/content/`.
- [x] **0.3 Download service (background).** Tested in real Chrome together with the button. `chrome.downloads`, name template, cleaning invalid characters, a queue limiting parallel downloads.
- [x] **0.4 UI button.** For testing it was temporarily attached to feed posts through the DOM (photos only). A ⬇ button on hover in Shadow DOM so site styles don't affect it. States: loading, done, error.
- [x] **0.5 Context menu.** A "Download original" item on media.
- [x] **0.6 Settings (minimum).** Folder template with a preview, "Save as…" on/off, video quality (DASH or compatible mp4).

## Stage 1: Instagram

- [x] **1.1 Study open source.** IG Helper (how requests, fields and markup work), the Instagram extractor of gallery-dl (endpoints, headers, pauses between requests), SocialSnag (MV3 architecture). Findings go into `docs/instagram.md`. No code is copied from GPL projects, only ideas.
- [x] **1.2 Research on live pages.** Method C confirmed: the transport is XHR, and the data is in the embedded JSON too. Highlights not checked. Check the findings of 1.1 against reality: which requests and embedded JSON arrive on a post, in the feed, on a profile, in Reels, stories and highlights. Update `docs/instagram.md`.
- [x] **1.3 Interceptor (C).** A script in `world: "MAIN"` at `document_start`: patching `fetch`/`XHR`, parsing the embedded `<script type="application/json">`, recursive search for objects with `image_versions2` and `video_versions`, a cache by shortcode and id. Passing data to the content script.
- [x] **1.4 Choosing media.** The best quality from `candidates` (area, then the shortest `stp`) and `video_versions`, parsing `carousel_media`, author, file extension, pk from the string `id`. Tests on saved JSON.
- [x] **1.4b DASH-quality video (required).** The progressive mp4 is limited to 720p, while DASH goes up to 1440p. Parsing `video_dash_manifest` and muxing video and audio with Mediabunny in an offscreen document.
- [x] **1.5 Fallback API client (B).** On a cache miss, one `/api/v1/media/{pk}/info/` request from the content script (pk from the shortcode, App ID from the page). At most once every 3 s, after a 429 or `/challenge/` a 10-minute pause. If that fails, the visible photo from the page (A).
- [x] **1.6 Post page and Reels** (`/p/…`, `/reel/…`): a current-slide button and an "All N" button.
- [x] **1.7 Feed.** Buttons on every post (MutationObserver, handling SPA navigation), matching the button to the data by the `/p/<shortcode>/` link.
- [x] **1.8 Profile grid.** A button on the preview downloads the whole post (also in "More from" and in search).
- [x] **1.9 Stories.** A button in the header before pause; the post is found by the pk from the URL, or if there isn't one, by the image file name. Highlights: the URL has no item pk, so photos are found by file name and videos by their position in the reel (progress bars) with a duration check.
- [x] **1.9a Buttons in Instagram's action bars.** Feed and post: the row under the media; Reels: the column on the right; stories: the header. Bars are found by structure, not by translated labels. Grid tiles get a button over the preview.
- [x] **1.9b "Download original".** An "HD <width>" button next to ⬇, only if `original_width` is larger than the available one. The background opens `/p/<code>/` in an inactive tab, the content script there hands over the post with the full list of sizes, the tab is closed (20 s timeout).
- [x] **1.10 Reliability.** Fallback A (photo from the DOM) after the API, the error text is shown at the bottom of the screen, not only in the tooltip.
- [x] **1.11 Manual testing checklist.** [docs/checklist.md](docs/checklist.md), for all sites.

## Stage 2: YouTube (separate extension, personal use only)

- [x] **2.1 Thumbnails** in maximum resolution (`maxresdefault` → `sddefault` → `hqdefault`). A button under the video next to Share; in feeds and Shorts, right-click a tile.
- [x] **2.2 Video research.** yt-dlp through Native Messaging was chosen: YouTube's web player uses SABR with PO tokens, unreliable from the browser. yt-dlp through Native Messaging (+ a helper installer for Windows) versus a pure browser approach. Decide.
- [ ] **2.3 Implementation.** Done: the `native-host/` helper (Node), the `install.ps1` installer, a "Video" button with percentages, quality from the settings. The helper was tested with real yt-dlp 2026.10.26 (video downloaded, H.264 + AAC). Tested from Chrome on a video and Shorts ("Video" and "Thumbnail" buttons in the Shorts column). The folder is the channel handle `@handle` for both videos and thumbnails. "Audio only" isn't needed.

## Stage 3: Other social networks

Each one is a separate extractor, the order will be decided later.

- [x] X / Twitter: photos in original size (`name=orig`), videos and GIFs (the best mp4). Intercepting GraphQL responses, a button in the tweet's action row, the context menu.
- [ ] Pinterest: pin originals
- [ ] Reddit: images, galleries, videos (audio comes separately)
- [x] TikTok: videos (the best, usually 1080p H.265, or H.264 in "compatible" mode) and photo posts. A button in the column to the right of the video, profile tiles, the context menu. Videos are downloaded by the page itself (the CDN needs the site's cookies and Referer), the extension saves the file through offscreen.
- [x] LinkedIn: photos from feed posts (by markup: the new feed has no post ids or JSON). A button in the action row after Send, the folder is the post author.
- [x] LinkedIn: videos, the best mp4 from the video.js player sources (H.264 + AAC, up to 720p, downloads without cookies). The sources are visible only to the page's JS, so a MAIN world script hands them over.

## Stage 4: Publishing (optional)

- [x] A store build without forbidden features: YouTube is a separate extension, `npm run zip:store` without `key`
- [x] Permission audit, justifications for the store form ([docs/store.md](docs/store.md))
- [x] A name without other brands, icons, screenshots (`store-assets/`)
- [x] Privacy policy ([docs/privacy.md](docs/privacy.md)), published at a public URL

---

## Reference projects

- [IG Helper](https://github.com/SN-Koarashi/ig-helper): an Instagram userscript, GPL-3.0 (reference only)
- [gallery-dl](https://github.com/mikf/gallery-dl): extractors for Instagram, X, Pinterest, Reddit and more, GPL-2.0 (reference only)
- [SocialSnag](https://github.com/jamditis/socialsnag): an MV3 extension for Instagram and X, MIT
- [mihaip/instagram-downloader](https://github.com/mihaip/instagram-downloader): an example with minimal permissions
- [yt-dlp](https://github.com/yt-dlp/yt-dlp): for stage 2 (YouTube)
