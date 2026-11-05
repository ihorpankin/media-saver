# Publishing Media Saver to the Chrome Web Store

Texts for the store form, to copy as is. The YouTube extension doesn't go to the store: the store rules don't allow Native Messaging and downloading YouTube videos.

## Steps

1. `npm run zip:store` → `.output/media-saver-<version>-chrome.zip` (a build without the `key` field).
2. Go through the [checklist](checklist.md) on this version.
3. The privacy policy is [privacy.md](privacy.md); the store form links to it on GitHub: https://github.com/ihorpankin/media-saver/blob/main/docs/privacy.md. The store rejected a claude.ai page for this field, so keep a plain public page here.
4. [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole) → new item → upload the zip, fill in the fields below.
5. The store gives the extension its own id: `jpgpeggjkhhohchdghdhjllknpiegckp`. It differs from the local build's id (`obnhohflfmafplbppiampibaklfnhjpf`), that's expected.

Updating: bump `version` in `package.json` (`npm version patch`), run `npm run zip:store` again, upload the new zip.

## Listing

All store texts are in English, like the extension's interface.

**Name:** Media Saver

**Summary (up to 132 characters):**
Download photos and videos from Instagram, X, TikTok and LinkedIn in one click — the button sits right in the post's action bar.

**Category:** Tools

**Language:** English

**Description:**

> Media Saver adds a ⬇ button to a post's action bar, right next to Like and Share. One click and the file is in your Downloads folder.
>
> **Instagram:** photos, carousels (current slide or all at once), videos and Reels in the best available quality, stories and highlights. For photos, an "HD" button downloads the original when it is larger than the one shown in the feed.
> **X (Twitter):** photos in original size, videos and GIFs.
> **TikTok:** videos and photo posts.
> **LinkedIn:** photos and videos from posts.
>
> Files are organized into folders: `site/author/id`. The file name template, video quality and "Ask where to save" can be changed in the settings and in the right-click menu.
>
> The extension only downloads what you have opened and see on screen. No bulk downloads, no analytics, no data collection. Please respect creators: download for personal use and don't repost other people's content without permission.

**Screenshots (1280×800, 1–5):** `store-assets/1-instagram.png`, `store-assets/2-x.png` (posts by NASA, public domain).

**Small promo tile (440×280):** `store-assets/promo-440x280.png`.

## Privacy tab

**Single purpose:**
Download photos and videos that the user has opened on Instagram, X, TikTok and LinkedIn to the Downloads folder.

**Permission justifications:**

| Permission                                                                                                                   | Justification                                                                                                                                                                                          |
| ---------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `downloads`                                                                                                                  | Save the selected photo or video to the Downloads folder with a readable file name.                                                                                                                    |
| `offscreen`                                                                                                                  | Mux high-quality video and audio tracks (Instagram serves them separately) and save files fetched by the page (TikTok). Both need `URL.createObjectURL`, which is not available in the service worker. |
| `storage`                                                                                                                    | Store the user's settings: file name template, video quality, "Ask where to save".                                                                                                                     |
| `contextMenus`                                                                                                               | The "Media Saver ▸ Download" item in the right-click menu on photos and videos.                                                                                                                        |
| Host access to instagram.com, x.com, twitter.com, tiktok.com, linkedin.com                                                   | Show the download button on these sites and read the media data of the post the user opened.                                                                                                           |
| Host access to cdninstagram.com, fbcdn.net, pbs.twimg.com, video.twimg.com, tiktokcdn.com, tiktokcdn-us.com, media.licdn.com | Download the photo and video files from these sites' media servers.                                                                                                                                    |

**Remote code:** No. All code is bundled in the package; no external scripts are loaded.

**Data usage:** collects none of the listed data types. Tick all three certifications (not sold to third parties, not used for unrelated purposes, not used for creditworthiness).

**Privacy policy:** https://github.com/ihorpankin/media-saver/blob/main/docs/privacy.md

## Review risks

- The store rules forbid helping to infringe copyright. Instagram and TikTok downloaders exist in the store, but they are sometimes removed after complaints from the sites. So the description says plainly: only what the user opened, for personal use.
- Scripts in the page context (MAIN world) read the site's responses. That's fine, but the permission justifications should answer calmly and specifically, as above.
