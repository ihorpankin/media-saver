import { requestDownload, watchDom } from '@/lib/content/page';
import type {
  YoutubeProgressMessage,
  YoutubeThumbnailRequest,
  YoutubeVideoRequest,
} from '@/lib/core/messages';
import { videoIdFromUrl } from '@/lib/sites/youtube/thumbnail';
import { createInlineButton, setProgress } from '@/lib/ui/download-button';

// YouTube: под роликом, рядом с лайком и «Поделиться», кнопки «Видео» и «Превью».
// Видео качает yt-dlp на компьютере через хелпер (native-host/), превью — само расширение.
// В лентах и Shorts превью скачивается через контекстное меню (lib/background/context-menu.ts).

const ROW = 'ytd-watch-metadata #top-level-buttons-computed';

function currentVideoId(): string {
  const videoId = videoIdFromUrl(location.href);
  if (!videoId) throw new Error('не нашёл id ролика в адресе');
  return videoId;
}

async function downloadThumbnail() {
  // Папка — адрес канала (@handle), как у видео из yt-dlp: под роликом на его странице,
  // в Shorts — ссылка «@канал/shorts» поверх видео. Кириллические адреса приходят закодированными
  const handle = document
    .querySelector(
      'ytd-watch-metadata ytd-channel-name a[href^="/@"], yt-reel-player-overlay-view-model a[href^="/@"]',
    )
    ?.getAttribute('href')
    ?.match(/^\/(@[^/?]+)/)?.[1];
  const author = handle ? decodeURIComponent(handle) : undefined;
  const request: YoutubeThumbnailRequest = {
    type: 'youtube-thumbnail',
    videoId: currentVideoId(),
    author,
  };
  await requestDownload(request);
}

/** Ролик, который сейчас качается, и его кнопка — чтобы показывать на ней проценты. */
let active: { url: string; host: HTMLElement } | undefined;

async function downloadVideo(host: HTMLElement) {
  // Отдаём yt-dlp чистую ссылку без плейлиста и времени
  const url = `https://www.youtube.com/watch?v=${currentVideoId()}`;
  active = { url, host };
  const request: YoutubeVideoRequest = { type: 'youtube-video', url };
  try {
    await requestDownload(request);
  } finally {
    active = undefined;
  }
}

/** Кнопка в стиле YouTube: «таблетка» на фоне чипа, как у «Поделиться». */
function pill(child: HTMLElement): HTMLElement {
  const wrapper = document.createElement('div');
  wrapper.style.cssText =
    'display:flex;align-items:center;height:36px;margin-left:8px;padding:0 8px;border-radius:18px;' +
    'background:var(--yt-spec-badge-chip-background);color:var(--yt-spec-text-primary)';
  wrapper.append(child);
  return wrapper;
}

function createButtons(layout: 'row' | 'circle') {
  const video: HTMLElement = createInlineButton(layout, {
    title: 'Скачать видео через yt-dlp',
    label: 'Видео',
    onClick: () => downloadVideo(video),
  });
  const thumbnail = createInlineButton(layout, {
    title: 'Скачать превью в максимальном разрешении',
    label: 'Превью',
    onClick: downloadThumbnail,
  });
  return [video, thumbnail];
}

/** Страница ролика: «таблетки» в строке под видео. */
function scanWatch() {
  const row = document.querySelector(ROW);
  if (!row || row.querySelector('media-saver-button')) return;
  row.append(...createButtons('row').map(pill));
}

/**
 * Shorts: колонка справа «лайк, комментарии, поделиться, ремикс, звук». Ставим кнопки перед
 * «звуком» и берём цвета у соседней кнопки, чтобы попасть и в светлую, и в тёмную тему.
 */
function scanShorts() {
  if (!location.pathname.startsWith('/shorts/')) return;
  const bar = document.querySelector('reel-action-bar-view-model');
  if (!bar || bar.querySelector('media-saver-button')) return;
  const native = bar.querySelector('button');
  const style = native && getComputedStyle(native);
  for (const host of createButtons('circle')) {
    if (style) {
      host.style.color = style.color;
      host.style.setProperty('--media-saver-circle', style.backgroundColor);
    }
    const wrapper = document.createElement('div');
    wrapper.style.cssText = 'display:flex;justify-content:center;margin-top:16px';
    wrapper.append(host);
    const sound =
      bar.lastElementChild?.tagName === 'PIVOT-BUTTON-VIEW-MODEL' ? bar.lastElementChild : null;
    bar.insertBefore(wrapper, sound);
  }
}

function scan() {
  scanWatch();
  scanShorts();
}

export default defineContentScript({
  matches: ['*://www.youtube.com/*'],
  main() {
    browser.runtime.onMessage.addListener((message: YoutubeProgressMessage) => {
      if (message?.type === 'youtube-progress' && active?.url === message.url) {
        setProgress(active.host, message.percent);
      }
    });

    watchDom(scan);
  },
});
