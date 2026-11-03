# Публикация Media Saver в Chrome Web Store

Тексты для формы магазина — копировать как есть. Расширение для YouTube в магазин не идёт: Native Messaging и скачивание видео с YouTube правила стора не пропускают.

## Порядок

1. `npm run zip:store` → `.output/media-saver-<версия>-chrome.zip` (сборка без поля `key`).
2. Пройти [чек-лист](checklist.md) на этой версии.
3. Опубликовать [политику конфиденциальности](privacy.md) по публичному адресу и вписать в неё контакт вместо `CONTACT_EMAIL`.
4. [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole) → новый элемент → загрузить zip, заполнить поля ниже.
5. После публикации магазин выдаст расширению свой id — он будет отличаться от id локальной сборки (`obnhohflfmafplbppiampibaklfnhjpf`), это нормально.

Обновление: поднять `version` в `package.json` (`npm version patch`), снова `npm run zip:store`, загрузить новый zip.

## Карточка

Все тексты для магазина — на английском, как и интерфейс расширения.

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

**Screenshots (1280×800, 1–5):** the button in the Instagram feed; a carousel with "All N" and "HD"; Reels; a post on X; the settings page.

**Small promo tile (440×280):** icon + "Media Saver".

## Вкладка Privacy

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

**Privacy policy:** link to the published `docs/privacy.md`.

## Риски проверки

- Правила стора запрещают помогать нарушать авторские права. Загрузчики Instagram и TikTok в магазине есть, но их иногда снимают по жалобам сайтов. Поэтому в описании прямо сказано: только то, что пользователь открыл сам, для личного использования.
- Скрипты в контексте страницы (MAIN world) читают ответы сайта. Это нормально, но в описании разрешений стоит отвечать спокойно и конкретно, как выше.
